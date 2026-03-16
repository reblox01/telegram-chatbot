require('dotenv').config();
const { Telegraf } = require('telegraf');
const Memory = require('./memory');
const { chat, MODEL } = require('./chat');
const { formatUptime, validateInput, sanitizeText } = require('./utils');
const { weather } = require('./commands/weather');
const { search } = require('./commands/search');
const { remind } = require('./commands/remind');
const { translate } = require('./commands/translate');
const { summarize } = require('./commands/summarize');

// ── Config ──
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN environment variable is required');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const memory = new Memory();
const startTime = Date.now();

// ── Rate Limiting ──
const rateLimits = new Map(); // userId -> { count, windowStart }
const RATE_LIMIT = 20; // messages per window
const RATE_WINDOW = 3600000; // 1 hour in ms

function checkRateLimit(userId) {
  const now = Date.now();
  const key = String(userId);
  const entry = rateLimits.get(key);

  if (!entry || now - entry.windowStart > RATE_WINDOW) {
    rateLimits.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

// ── Middleware: Rate Limit ──
bot.use(async (ctx, next) => {
  if (ctx.from) {
    if (!checkRateLimit(ctx.from.id)) {
      return ctx.reply('⏳ Rate limit reached (20 messages/hour). Please wait before sending more messages.');
    }
  }
  return next();
});

// ── Error Handler ──
bot.catch((err, ctx) => {
  console.error(`[Bot] Error for ${ctx.updateType}:`, err.message);
  ctx.reply('❌ Something went wrong. Please try again.').catch(() => {});
});

// ── Commands ──

bot.start((ctx) => {
  ctx.reply(
    `👋 *Welcome to AI Chatbot!*\n\n` +
    `I'm your friendly AI assistant powered by AI. Just send me a message and I'll respond!\n\n` +
    `📋 *Commands:*\n` +
    `/help — List all commands\n` +
    `/clear — Clear chat history\n` +
    `/model — Show AI model\n` +
    `/status — Bot status\n\n` +
    `🔧 *Features:*\n` +
    `/weather [city] — Weather lookup\n` +
    `/search [query] — Web search\n` +
    `/remind [time] [msg] — Set reminder\n` +
    `/translate [lang] [text] — Translate\n` +
    `/summarize [url] — Summarize webpage\n\n` +
    `💬 Just type anything to start chatting!`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('help', (ctx) => {
  ctx.reply(
    `🤖 *AI Chatbot Commands*\n\n` +
    `*Chat:*\n` +
    `Just send any message to chat!\n\n` +
    `*Utilities:*\n` +
    `/weather [city] — Get weather info\n` +
    `/search [query] — Quick web search\n` +
    `/remind [30m|1h|2d] [msg] — Set reminder\n` +
    `/translate [en|fr|es...] [text] — Translate text\n` +
    `/summarize [url] — Summarize a webpage\n\n` +
    `*Bot:*\n` +
    `/clear — Clear conversation history\n` +
    `/model — Show current AI model\n` +
    `/status — Bot uptime and status\n` +
    `/help — This message`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('clear', (ctx) => {
  memory.clear(ctx.from.id);
  ctx.reply('🧹 Conversation history cleared! Starting fresh.');
});

bot.command('model', (ctx) => {
  ctx.reply(`🧠 *AI Model:* \`${MODEL}\`\n\nPowered by OpenRouter API`, { parse_mode: 'Markdown' });
});

bot.command('status', (ctx) => {
  const msgCount = memory.getMessageCount(ctx.from.id);
  ctx.reply(
    `📊 *Bot Status*\n\n` +
    `🟢 Online\n` +
    `⏱ Uptime: ${formatUptime(startTime)}\n` +
    `💬 Your messages: ${msgCount}\n` +
    `🧠 Model: \`${MODEL}\`\n` +
    `📡 Mode: Polling (dev)`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('weather', weather);
bot.command('search', search);
bot.command('remind', remind);
bot.command('translate', translate);
bot.command('summarize', summarize);

// ── Default: AI Chat ──
bot.on('text', async (ctx) => {
  const message = ctx.message.text;
  
  if (!validateInput(message, 4000)) {
    return ctx.reply('⚠️ Message too long. Please keep it under 4000 characters.');
  }

  // Show typing indicator
  await ctx.replyWithChatAction('typing');
  
  const reply = await chat(ctx.from.id, message, memory);
  await ctx.reply(reply);
});

// ── Start Polling (Dev Mode) ──
console.log('🚀 Starting bot in polling mode...');
bot.launch()
  .then(() => console.log('✅ Bot is running! Send /start to your bot on Telegram.'))
  .catch(err => {
    console.error('❌ Failed to start bot:', err.message);
    process.exit(1);
  });

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
