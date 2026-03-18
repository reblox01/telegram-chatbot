const { Telegraf } = require('telegraf');
const Memory = require('../src/memory');
const { chat, MODEL } = require('../src/chat');
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
const startTime = Date.now();

// Rate limiting
const rateLimits = new Map();
const RATE_LIMIT = 20;
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
    return ctx.reply('⏳ Rate limit reached (20 messages/hour). Please wait.');
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

// ── Commands with param prompting ──
function commandOrPrompt(cmd, handler) {
  bot.command(cmd, (ctx) => {
    const args = ctx.message.text.split(/\s+/).slice(1).join(' ').trim();
    if (!args) {
      pendingCommands.set(ctx.from.id, { command: cmd, ts: Date.now() });
      return ctx.reply(handler.prompt);
    }
    return handler.fn(ctx);
  });
}

commandOrPrompt('weather', {
  prompt: '🌤 Which city? Type the city name:',
  fn: weather,
});

commandOrPrompt('search', {
  prompt: '🔍 What do you want to search for?',
  fn: search,
});

commandOrPrompt('remind', {
  prompt: '⏰ Set a reminder. Format: `5m call mom` or `2h check laundry`',
  fn: remind,
});

commandOrPrompt('translate', {
  prompt: '🌍 What to translate? Format: `fr hello` (language text)',
  fn: translate,
});

commandOrPrompt('wiki', {
  prompt: '📚 What do you want to look up on Wikipedia?',
  fn: wiki,
});

// ── Handle text (pending commands + chat) ──
bot.on('text', async (ctx) => {
  const msg = ctx.message.text;
  if (!validateInput(msg, 4000)) return ctx.reply('⚠️ Message too long.');

  // Check for pending command
  const pending = pendingCommands.get(ctx.from.id);
  if (pending && Date.now() - pending.ts < 60000) {
    pendingCommands.delete(ctx.from.id);
    const fakeCtx = { ...ctx, message: { ...ctx.message, text: `/${pending.command} ${msg}` } };

    const handlers = { weather, search, remind, translate, wiki };
    if (handlers[pending.command]) return handlers[pending.command](fakeCtx);
  }

  await ctx.replyWithChatAction('typing');
  try {
    const reply = await chat(ctx.from.id, msg, memory);
    await ctx.reply(reply);
  } catch (e) {
    console.error('[Bot] Chat error:', e.message);
    await ctx.reply('❌ Error: ' + e.message.substring(0, 200));
  }
});

// ── Vercel serverless handler ──
module.exports = async (req, res) => {
  if (req.method === 'GET') {
    res.status(200).json({
      status: 'ok',
      uptime: formatUptime(startTime),
      model: MODEL,
      botName: BOT_NAME,
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
