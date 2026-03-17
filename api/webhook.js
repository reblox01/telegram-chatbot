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

// Pending commands (waiting for user input)
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
  '👋 *Hey! I\'m Sewelni!*\n\nI was created by xanx 🧑‍💻 to be your helpful AI assistant.\n\n💬 Just send me any message to chat!\n\n📋 *Commands:*\n/help — All commands\n/weather [city] — Weather\n/search [query] — Web search\n/remind [time] [msg] — Reminder\n/translate [lang] [text] — Translate\n/summarize [url] — Summarize webpage\n/clear — Clear chat history\n/model — AI model info\n/status — Bot status\n\nLet\'s go! 🚀',
  { parse_mode: 'Markdown' }
));

bot.command('help', (ctx) => ctx.reply(
  '🤖 *Sewelni — Commands*\n\n💬 Send any message to chat with me!\n\n🌤 /weather [city]\n🔍 /search [query]\n⏰ /remind [time] [msg]\n🌍 /translate [lang] [text]\n📝 /summarize [url]\n🧹 /clear\n🧠 /model\n📊 /status\n\nCreated by xanx 🧑‍💻',
  { parse_mode: 'Markdown' }
));

bot.command('clear', (ctx) => { memory.clear(ctx.from.id); ctx.reply('🧹 History cleared! Ready for a fresh start!'); });
bot.command('model', (ctx) => ctx.reply(`🧠 *Sewelni's Brain*\n\nModel: \`${MODEL}\`\nCreator: xanx 🧑‍💻`, { parse_mode: 'Markdown' }));
bot.command('status', (ctx) => ctx.reply(
  `📊 *Sewelni Status*\n\n🟢 Online\n⏱ Uptime: ${formatUptime(startTime)}\n💬 Messages: ${memory.getMessageCount(ctx.from.id)}\n🧠 Model: \`${MODEL}\`\n\nMade with ❤️ by xanx`,
  { parse_mode: 'Markdown' }
));

// Commands with parameter prompting
bot.command('weather', (ctx) => {
  const args = ctx.message.text.split(/\s+/).slice(1).join(' ').trim();
  if (!args) {
    pendingCommands.set(ctx.from.id, { command: 'weather', ts: Date.now() });
    return ctx.reply('🌤 Which city? Type the city name:');
  }
  return weather(ctx);
});

bot.command('search', (ctx) => {
  const args = ctx.message.text.split(/\s+/).slice(1).join(' ').trim();
  if (!args) {
    pendingCommands.set(ctx.from.id, { command: 'search', ts: Date.now() });
    return ctx.reply('🔍 What do you want to search for?');
  }
  return search(ctx);
});

bot.command('remind', (ctx) => {
  const args = ctx.message.text.split(/\s+/).slice(1).join(' ').trim();
  if (!args) {
    pendingCommands.set(ctx.from.id, { command: 'remind', ts: Date.now() });
    return ctx.reply('⏰ Set a reminder. Format: `5m call mom` or `2h check laundry`', { parse_mode: 'Markdown' });
  }
  return remind(ctx);
});

bot.command('translate', (ctx) => {
  const args = ctx.message.text.split(/\s+/).slice(1).join(' ').trim();
  if (!args) {
    pendingCommands.set(ctx.from.id, { command: 'translate', ts: Date.now() });
    return ctx.reply('🌍 What to translate? Format: `fr hello` (language text)', { parse_mode: 'Markdown' });
  }
  return translate(ctx);
});

bot.command('summarize', (ctx) => {
  const args = ctx.message.text.split(/\s+/).slice(1).join(' ').trim();
  if (!args) {
    pendingCommands.set(ctx.from.id, { command: 'summarize', ts: Date.now() });
    return ctx.reply('📝 Send me a URL to summarize:');
  }
  return summarize(ctx);
});

bot.on('text', async (ctx) => {
  const msg = ctx.message.text;
  if (!validateInput(msg, 4000)) return ctx.reply('⚠️ Message too long.');
  
  // Check for pending command
  const pending = pendingCommands.get(ctx.from.id);
  if (pending && Date.now() - pending.ts < 60000) { // 60s timeout
    pendingCommands.delete(ctx.from.id);
    
    // Create fake context with the command + user input
    const fakeCtx = { ...ctx, message: { ...ctx.message, text: `/${pending.command} ${msg}` } };
    
    switch(pending.command) {
      case 'weather': return weather(fakeCtx);
      case 'search': return search(fakeCtx);
      case 'remind': return remind(fakeCtx);
      case 'translate': return translate(fakeCtx);
      case 'summarize': return summarize(fakeCtx);
    }
  }
  
  await ctx.replyWithChatAction('typing');
  try {
    const reply = await chat(ctx.from.id, msg, memory);
    await ctx.reply(reply);
  } catch(e) {
    console.error('[Bot] Chat error:', e.message);
    await ctx.reply('❌ Error: ' + e.message.substring(0, 200));
  }
});

// Vercel serverless handler
module.exports = async (req, res) => {
  // Debug endpoint (GET)
  if (req.method === 'GET') {
    const key = process.env.OPENROUTER_API_KEY || 'NOT_SET';
    res.status(200).json({ 
      status: 'ok', 
      uptime: formatUptime(startTime),
      model: MODEL,
      keySet: key !== 'NOT_SET',
      keyPrefix: key.substring(0, 20),
      vercel: !!process.env.VERCEL,
      nodeEnv: process.env.NODE_ENV
    });
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
