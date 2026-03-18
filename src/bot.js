// Only load dotenv in development (not on Vercel)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  require('dotenv').config();
}
const { Telegraf } = require('telegraf');
const Memory = require('./memory');
const { chat, MODEL } = require('./chat');
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
const startTime = Date.now();

// ── Rate Limiting ──
const rateLimits = new Map();
const RATE_LIMIT = 20;
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
    return ctx.reply('⏳ Rate limit reached (20 messages/hour). Please wait.');
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

bot.command('model', (ctx) => ctx.reply(
  `🧠 *${BOT_NAME}'s Brain*\n\nModel: \`${MODEL}\``,
  { parse_mode: 'Markdown' }
));

bot.command('status', async (ctx) => {
  const msgCount = await memory.getMessageCount(ctx.from.id);
  ctx.reply(
    `📊 *${BOT_NAME} Status*\n\n` +
    `🟢 Online\n` +
    `⏱ Uptime: ${formatUptime(startTime)}\n` +
    `💬 Messages: ${msgCount}\n` +
    `🧠 Model: \`${MODEL}\``,
    { parse_mode: 'Markdown' }
  );
});

bot.command('weather', weather);
bot.command('search', search);
bot.command('remind', remind);
bot.command('translate', translate);
bot.command('wiki', wiki);

// ── Default: AI Chat ──
bot.on('text', async (ctx) => {
  const message = ctx.message.text;
  if (!validateInput(message, 4000)) {
    return ctx.reply('⚠️ Message too long. Please keep it under 4000 characters.');
  }
  await ctx.replyWithChatAction('typing');
  const reply = await chat(ctx.from.id, message, memory);
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
