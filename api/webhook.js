const { Telegraf } = require('telegraf');
const Memory = require('../src/memory');
const { chat } = require('../src/chat');
const { PremiumManager } = require('../src/premium');
const { formatUptime, validateInput } = require('../src/utils');
const { weather } = require('../src/commands/weather');
const { search } = require('../src/commands/search');
const { remind } = require('../src/commands/remind');
const { translate } = require('../src/commands/translate');
const { wiki } = require('../src/commands/wiki');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('BOT_TOKEN is required');

const BOT_NAME = process.env.BOT_NAME || 'AI Bot';
const CREATOR = process.env.BOT_CREATOR || 'the developer';

const bot = new Telegraf(BOT_TOKEN);
const memory = new Memory();
const premium = new PremiumManager();
const startTime = Date.now();

// Rate limiting
const rateLimits = new Map();
const RATE_LIMIT = 60;
const RATE_WINDOW = 3600000;
const pendingCommands = new Map();

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

// ── Middleware ──
bot.use(async (ctx, next) => {
  if (ctx.from && !checkRateLimit(ctx.from.id)) {
    return ctx.reply('⏳ Rate limit reached. Please wait.');
  }
  return next();
});

bot.catch((err, ctx) => {
  console.error('[Webhook] Error:', err.message);
  ctx.reply('❌ Something went wrong.').catch(() => {});
});

// ── Commands ──
bot.start((ctx) => ctx.reply(
  `👋 *Hey! I'm ${BOT_NAME}!*\n\n` +
  `I was created by ${CREATOR} to be your helpful AI assistant.\n\n` +
  `💬 Just send me any message to chat!\n\n` +
  `📋 *Commands:*\n` +
  `/help — All commands\n` +
  `/premium — Upgrade to Premium ✨\n` +
  `/weather [city] — Weather\n` +
  `/search [query] — Web search\n` +
  `/remind [time] [msg] — Reminder\n` +
  `/translate [lang] [text] — Translate\n` +
  `/wiki [query] — Wikipedia lookup\n` +
  `/clear — Clear chat history\n` +
  `/model — AI model info\n` +
  `/status — Bot status\n\n` +
  `Let's go! 🚀`,
  { parse_mode: 'Markdown' }
));

bot.command('help', (ctx) => ctx.reply(
  `🤖 *${BOT_NAME} — Commands*\n\n` +
  `💬 Send any message to chat with me!\n\n` +
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

// ── Admin Command & Management ──
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const SUPABASE_URL_ADMIN = process.env.SUPABASE_URL;
const SUPABASE_KEY_ADMIN = process.env.SUPABASE_KEY;

function isAdmin(userId) {
  return ADMIN_USER_ID && String(userId) === String(ADMIN_USER_ID);
}

async function supaUpsert(table, data) {
  if (!SUPABASE_URL_ADMIN) throw new Error('SUPABASE_URL not set');
  const res = await fetch(`${SUPABASE_URL_ADMIN}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY_ADMIN,
      'Authorization': `Bearer ${SUPABASE_KEY_ADMIN}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
}

// ── /admin command ──
bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('🔒 Admin only.');

  const today = new Date().toISOString().split('T')[0];
  const usage = await fetch(`${SUPABASE_URL_ADMIN}/rest/v1/bot_usage?date=eq.${today}`, {
    headers: {
      'apikey': SUPABASE_KEY_ADMIN,
      'Authorization': `Bearer ${SUPABASE_KEY_ADMIN}`,
    },
  }).then(r => r.json()).catch(() => []);
  const premiumUsers = await fetch(`${SUPABASE_URL_ADMIN}/rest/v1/bot_premium?is_premium=eq.true`, {
    headers: {
      'apikey': SUPABASE_KEY_ADMIN,
      'Authorization': `Bearer ${SUPABASE_KEY_ADMIN}`,
    },
  }).then(r => r.json()).catch(() => []);
  const config = await premium.getAllConfig().catch(() => ({}));

  await ctx.reply(
    `⚡ *${BOT_NAME} Admin Panel*\n\n` +
    `📊 *Today:*\n` +
    `👥 Users: ${usage.length} | 💬 Msgs: ${usage.reduce((s, u) => s + (u.message_count || 0), 0)} | 🔍 Searches: ${usage.reduce((s, u) => s + (u.search_count || 0), 0)} | 💎 Premium: ${premiumUsers.length}\n\n` +
    `⚙️ *Config:*\n` +
    `🆓 Free: \`${config.free_model || 'step-3.5-flash:free'}\` (${config.free_limits?.messagesPerDay ?? 20} msgs / ${config.free_limits?.searchesPerDay ?? 5} searches / ${config.free_limits?.remindersActive ?? 3} reminds)\n` +
    `💎 Premium: \`${(config.premium_models || ['claude-3.5-sonnet'])[0]}\` (unlimited)\n` +
    `💰 Price: ${config.premium_price || 100} ⭐`,
    { parse_mode: 'Markdown' }
  );
});

// ── Admin Grant/Revoke Commands ──
bot.command('grant', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('🔒 Admin only.');

  const args = ctx.message.text.split(/\s+/).slice(1);
  if (args.length < 1) return ctx.reply('Usage: `/grant <chat_id> [days]`\nExample: `/grant 123456789 30`', { parse_mode: 'Markdown' });

  const chatId = args[0];
  const days = parseInt(args[1]) || 30;
  const expires = new Date(Date.now() + days * 86400000).toISOString();

  try {
    await supaUpsert('bot_premium', {
      chat_id: String(chatId),
      is_premium: true,
      activated_at: new Date().toISOString(),
      expires_at: expires,
      updated_at: new Date().toISOString(),
    });
    await ctx.reply(`✅ Premium granted to \`${chatId}\` for ${days} days.`, { parse_mode: 'Markdown' });
  } catch (err) {
    await ctx.reply('❌ Error: ' + err.message.substring(0, 200));
  }
});

bot.command('revoke', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('🔒 Admin only.');

  const args = ctx.message.text.split(/\s+/).slice(1);
  if (args.length < 1) return ctx.reply('Usage: `/revoke <chat_id>`', { parse_mode: 'Markdown' });

  try {
    await supaUpsert('bot_premium', {
      chat_id: String(args[0]),
      is_premium: false,
      updated_at: new Date().toISOString(),
    });
    await ctx.reply(`🔒 Premium revoked from \`${args[0]}\`.`, { parse_mode: 'Markdown' });
  } catch (err) {
    await ctx.reply('❌ Error: ' + err.message.substring(0, 200));
  }
});

// ── Commands with limits ──
function commandOrPrompt(cmd, handler) {
  bot.command(cmd, async (ctx) => {
    if (cmd === 'search') {
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
    }
    if (cmd === 'remind') {
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
    }

    const args = ctx.message.text.split(/\s+/).slice(1).join(' ').trim();
    if (!args) {
      pendingCommands.set(ctx.from.id, { command: cmd, ts: Date.now() });
      return ctx.reply(handler.prompt);
    }
    return handler.fn(ctx);
  });
}

commandOrPrompt('weather', { prompt: '🌤 Which city? Type the city name:', fn: weather });
commandOrPrompt('search', { prompt: '🔍 What do you want to search for?', fn: search });
commandOrPrompt('remind', { prompt: '⏰ Set a reminder. Format: `5m call mom` or `2h check laundry`', fn: remind });
commandOrPrompt('translate', { prompt: '🌍 What to translate? Format: `fr hello` (language text)', fn: translate });
commandOrPrompt('wiki', { prompt: '📚 What do you want to look up on Wikipedia?', fn: wiki });

// ── Handle text (pending commands + chat) ──
bot.on('text', async (ctx) => {
  const msg = ctx.message.text;
  if (!validateInput(msg, 4000)) return ctx.reply('⚠️ Message too long.');

  // Check for pending command (non-admin only)
  const pending = pendingCommands.get(ctx.from.id);
  if (pending && Date.now() - pending.ts < 60000 && !pending.command.startsWith('admin_')) {
    pendingCommands.delete(ctx.from.id);
    const fakeCtx = { ...ctx, message: { ...ctx.message, text: `/${pending.command} ${msg}` } };

    if (pending.command === 'search') {
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
    }
    if (pending.command === 'remind') {
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
    }

    const handlers = { weather, search, remind, translate, wiki };
    if (handlers[pending.command]) return handlers[pending.command](fakeCtx);
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
  try {
    const reply = await chat(ctx.from.id, msg, memory, isPremium, premium);
    await premium.incrementUsage(ctx.from.id, 'message');
    await ctx.reply(reply, { parse_mode: 'Markdown' });
  } catch (e) {
    console.error('[Bot] Chat error:', e.message);
    await ctx.reply('❌ Error: ' + e.message.substring(0, 200));
  }
});

// ── Vercel serverless handler ──
module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const config = await premium.getAllConfig().catch(() => ({}));
    res.status(200).json({
      status: 'ok',
      uptime: formatUptime(startTime),
      botName: BOT_NAME,
      premium: true,
      vercel: !!process.env.VERCEL,
    });
    return;
  }

  try {
    await bot.handleUpdate(req.body);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Webhook] Handle error:', err.message);
    res.status(200).json({ ok: false });
  }
};