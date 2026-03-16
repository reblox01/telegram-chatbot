const { Telegraf } = require('telegraf');
const Memory = require('../src/memory');
const { chat, MODEL } = require('../src/chat');
const { formatUptime, validateInput } = require('../src/utils');
const { weather } = require('../src/commands/weather');
const { search } = require('../src/commands/search');
const { remind } = require('../src/commands/remind');
const { translate } = require('../src/commands/translate');
const { summarize } = require('../src/commands/summarize');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('BOT_TOKEN is required');

const bot = new Telegraf(BOT_TOKEN);
const memory = new Memory();
const startTime = Date.now();

// Rate limiting
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

// Middleware
bot.use(async (ctx, next) => {
  if (ctx.from && !checkRateLimit(ctx.from.id)) {
    return ctx.reply('⏳ Rate limit reached (20 messages/hour). Please wait.');
  }
  return next();
});

bot.catch((err, ctx) => {
  console.error(`[Webhook] Error:`, err.message);
  ctx.reply('❌ Something went wrong.').catch(() => {});
});

// Commands
bot.start((ctx) => ctx.reply(
  '👋 *Welcome to AI Chatbot!*\n\nSend me any message to chat!\n\n📋 /help — Commands\n🔧 /weather /search /remind /translate /summarize\n💬 /clear /model /status',
  { parse_mode: 'Markdown' }
));

bot.command('help', (ctx) => ctx.reply(
  '🤖 *Commands*\n\n💬 Send any message to chat!\n/weather [city]\n/search [query]\n/remind [time] [msg]\n/translate [lang] [text]\n/summarize [url]\n/clear\n/model\n/status',
  { parse_mode: 'Markdown' }
));

bot.command('clear', (ctx) => { memory.clear(ctx.from.id); ctx.reply('🧹 History cleared!'); });
bot.command('model', (ctx) => ctx.reply(`🧠 Model: \`${MODEL}\``, { parse_mode: 'Markdown' }));
bot.command('status', (ctx) => ctx.reply(
  `📊 *Status*\n🟢 Online\n⏱ ${formatUptime(startTime)}\n💬 Messages: ${memory.getMessageCount(ctx.from.id)}`,
  { parse_mode: 'Markdown' }
));

bot.command('weather', weather);
bot.command('search', search);
bot.command('remind', remind);
bot.command('translate', translate);
bot.command('summarize', summarize);

bot.on('text', async (ctx) => {
  const msg = ctx.message.text;
  if (!validateInput(msg, 4000)) return ctx.reply('⚠️ Message too long.');
  await ctx.replyWithChatAction('typing');
  const reply = await chat(ctx.from.id, msg, memory);
  await ctx.reply(reply);
});

// Vercel serverless handler
module.exports = async (req, res) => {
  if (req.method === 'GET') {
    res.status(200).json({ status: 'ok', uptime: formatUptime(startTime) });
    return;
  }
  
  try {
    await bot.handleUpdate(req.body);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Webhook] Handle error:', err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
};
