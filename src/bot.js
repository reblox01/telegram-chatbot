// Only load dotenv in development (not on Vercel)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  require('dotenv').config();
}
const { Telegraf } = require('telegraf');
const Memory = require('./memory');
const { chat } = require('./chat');
const { PremiumManager } = require('./premium');
const { formatUptime, validateInput } = require('./utils');
const { weather } = require('./commands/weather');
const { search } = require('./commands/search');
const { remind } = require('./commands/remind');
const { translate } = require('./commands/translate');
const { wiki } = require('./commands/wiki');

const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_NAME = process.env.BOT_NAME || 'AI Bot';

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN environment variable is required');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const memory = new Memory();
const premium = new PremiumManager();
const startTime = Date.now();

// ── Rate Limiting (legacy, keep for extra protection) ──
const rateLimits = new Map();
const RATE_LIMIT = 60;
const RATE_WINDOW = 3600000;

function checkRateLimit(userId) {
  const now = Date.now();
  const key = String(userId);
  const entry = rateLimits.get(key);
  if (!entry || now - entry.windowStart > RATE_WINDOW) {
    rateLimits.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

bot.use(async (ctx, next) => {
  if (ctx.from && !checkRateLimit(ctx.from.id)) {
    return ctx.reply('⏳ Rate limit reached. Please wait.');
  }
  return next();
});

bot.catch((err, ctx) => {
  console.error(`[Bot] Error:`, err.message);
  ctx.reply('❌ Something went wrong.').catch(() => {});
});

// ── Commands ──
bot.start((ctx) => ctx.reply(
  `👋 *Hey! I'm ${BOT_NAME}!*\n\n` +
  `Just send me any message to chat!\n\n` +
  `📋 *Commands:*\n` +
  `/help — All commands\n` +
  `/premium — Upgrade to Premium ✨\n` +
  `/weather [city] — Weather\n` +
  `/search [query] — Web search\n` +
  `/remind [time] [msg] — Reminder\n` +
  `/translate [lang] [text] — Translate\n` +
  `/wiki [query] — Wikipedia\n` +
  `/clear — Clear chat history\n` +
  `/model — AI model info\n` +
  `/status — Bot status`,
  { parse_mode: 'Markdown' }
));

bot.command('help', (ctx) => ctx.reply(
  `🤖 *${BOT_NAME} — Commands*\n\n` +
  `💬 Send any message to chat!\n\n` +
  `✨ /premium — Upgrade to Premium\n` +
  `🌤 /weather [city] — Weather\n` +
  `🔍 /search [query] — Web search\n` +
  `⏰ /remind [time] [msg] — Reminder\n` +
  `🌍 /translate [lang] [text] — Translate\n` +
  `📚 /wiki [query] — Wikipedia\n` +
  `🧹 /clear — Clear history\n` +
  `🧠 /model — AI model\n` +
  `📊 /status — Bot status`,
  { parse_mode: 'Markdown' }
));

bot.command('clear', async (ctx) => {
  await memory.clear(ctx.from.id);
  ctx.reply('🧹 History cleared! Ready for a fresh start!');
});

bot.command('model', async (ctx) => {
  const isPremium = await premium.isPremium(ctx.from.id);
  const config = await premium.getAllConfig();
  const model = isPremium
    ? (config.premium_models?.[0] || 'Claude 3.5 Sonnet')
    : (config.free_model || 'Step 3.5 Flash');
  const features = isPremium ? '+ 🧠 Thinking' : '(Free)';
  ctx.reply(
    `🧠 *${BOT_NAME}'s Brain*\n\n` +
    `Model: \`${model}\` ${features}\n` +
    `Status: ${isPremium ? '💎 Premium' : '🆓 Free'}`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('status', async (ctx) => {
  const msgCount = await memory.getMessageCount(ctx.from.id);
  const info = await premium.getPremiumInfo(ctx.from.id);
  const config = await premium.getAllConfig();
  const status = info.isPremium ? '💎 Premium' : '🆓 Free';
  const model = info.isPremium
    ? (config.premium_models?.[0] || 'Claude 3.5 Sonnet')
    : (config.free_model || 'Step 3.5 Flash');

  let usageText = '';
  if (!info.isPremium) {
    usageText = `\n📊 *Today's Usage:*\n` +
      `💬 Messages: ${info.usage.messages}/${info.limits.messages}\n` +
      `🔍 Searches: ${info.usage.searches}/${info.limits.searches}`;
  }

  ctx.reply(
    `📊 *${BOT_NAME} Status*\n\n` +
    `🟢 Online\n` +
    `⏱ Uptime: ${formatUptime(startTime)}\n` +
    `💬 Total messages: ${msgCount}\n` +
    `🧠 Model: ${model}\n` +
    `💳 Plan: ${status}${usageText}`,
    { parse_mode: 'Markdown' }
  );
});

// ── Premium Command ──
bot.command('premium', async (ctx) => {
  const info = await premium.getPremiumInfo(ctx.from.id);
  const config = await premium.getAllConfig();

  if (info.isPremium) {
    return ctx.reply(
      `💎 *You're already Premium!*\n\n` +
      `✅ Unlimited messages\n` +
      `✅ Claude 3.5 Sonnet + 🧠 Thinking\n` +
      `✅ Unlimited search & reminders\n\n` +
      `Your plan is active. Enjoy! 🎉`,
      { parse_mode: 'Markdown' }
    );
  }

  await ctx.replyWithInvoice({
    title: `${BOT_NAME} Premium ✨`,
    description: 'Unlock unlimited messages, Claude 3.5 Sonnet with thinking, and unlimited search & reminders for 30 days!',
    payload: `premium_${ctx.from.id}_${Date.now()}`,
    currency: 'XTR',
    prices: [{ label: 'Premium 30 days', amount: config.premium_price }],
  });
});

// ── Telegram Stars Payment Handlers ──
bot.on('pre_checkout_query', async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

bot.on('successful_payment', async (ctx) => {
  const userId = ctx.from.id;
  const payment = ctx.message.successful_payment;

  console.log(`[Premium] Payment received from ${userId}: ${payment.total_amount} ${payment.currency}`);

  if (payment.currency === 'XTR') {
    const success = await premium.activatePremium(userId, 30);
    if (success) {
      await ctx.reply(
        `🎉 *Premium Activated!*\n\n` +
        `✅ Unlimited messages\n` +
        `✅ Claude 3.5 Sonnet + 🧠 Thinking\n` +
        `✅ Unlimited search & reminders\n` +
        `✅ 30 days of premium\n\n` +
        `Thank you for supporting ${BOT_NAME}! 💎`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.reply('❌ Failed to activate premium. Please contact support.');
    }
  }
});

bot.command('weather', weather);
bot.command('search', async (ctx) => {
  const canSearch = await premium.canUse(ctx.from.id, 'search');
  if (!canSearch.allowed) {
    return ctx.reply(
      `🔒 Search limit reached (${canSearch.current}/${canSearch.limit} today).\n\n` +
      `✨ Upgrade to Premium for unlimited search!\n` +
      `Tap /premium to upgrade.`,
      { parse_mode: 'Markdown' }
    );
  }
  await premium.incrementUsage(ctx.from.id, 'search');
  return search(ctx);
});
bot.command('remind', async (ctx) => {
  const canRemind = await premium.canUse(ctx.from.id, 'remind');
  if (!canRemind.allowed) {
    return ctx.reply(
      `🔒 Reminder limit reached (${canRemind.current}/${canRemind.limit}).\n\n` +
      `✨ Upgrade to Premium for unlimited reminders!\n` +
      `Tap /premium to upgrade.`,
      { parse_mode: 'Markdown' }
    );
  }
  await premium.incrementUsage(ctx.from.id, 'remind');
  return remind(ctx);
});
bot.command('translate', translate);
bot.command('wiki', wiki);

// ── Default: AI Chat (with premium limits) ──
bot.on('text', async (ctx) => {
  const message = ctx.message.text;
  if (!validateInput(message, 4000)) {
    return ctx.reply('⚠️ Message too long. Please keep it under 4000 characters.');
  }

  const canChat = await premium.canUse(ctx.from.id, 'message');
  if (!canChat.allowed) {
    return ctx.reply(
      `🔒 Daily limit reached! (${canChat.current}/${canChat.limit} messages today)\n\n` +
      `✨ Upgrade to Premium for:\n` +
      `• Unlimited messages\n` +
      `• Claude 3.5 Sonnet + 🧠 Thinking\n` +
      `• Better, smarter responses\n\n` +
      `Tap /premium to upgrade!`,
      { parse_mode: 'Markdown' }
    );
  }

  const isPremium = await premium.isPremium(ctx.from.id);

  await ctx.replyWithChatAction('typing');
  const reply = await chat(ctx.from.id, message, memory, isPremium, premium);
  await premium.incrementUsage(ctx.from.id, 'message');
  await ctx.reply(reply);
});

// ── Start (Polling Mode) ──
console.log(`🚀 Starting ${BOT_NAME} in polling mode...`);
bot.launch()
  .then(() => console.log(`✅ ${BOT_NAME} is running!`))
  .catch(err => {
    console.error('❌ Failed to start:', err.message);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
