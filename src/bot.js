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
const pendingCommands = new Map();

// ── Rate Limiting ──
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

// ── Admin Helpers ──
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const SUPABASE_URL_ADMIN = process.env.SUPABASE_URL;
const SUPABASE_KEY_ADMIN = process.env.SUPABASE_KEY;

function isAdmin(userId) {
  return ADMIN_USER_ID && String(userId) === String(ADMIN_USER_ID);
}

async function supaFetch(table, params = '') {
  if (!SUPABASE_URL_ADMIN) throw new Error('SUPABASE_URL not set');
  const res = await fetch(`${SUPABASE_URL_ADMIN}/rest/v1/${table}${params}`, {
    headers: { 'apikey': SUPABASE_KEY_ADMIN, 'Authorization': `Bearer ${SUPABASE_KEY_ADMIN}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function supaUpsert(table, data) {
  if (!SUPABASE_URL_ADMIN) throw new Error('SUPABASE_URL not set');
  const res = await fetch(`${SUPABASE_URL_ADMIN}/rest/v1/${table}`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY_ADMIN, 'Authorization': `Bearer ${SUPABASE_KEY_ADMIN}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
}

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
  const model = isPremium ? (config.premium_models?.[0] || 'Claude 3.5 Sonnet') : (config.free_model || 'Step 3.5 Flash');
  ctx.reply(`🧠 *${BOT_NAME}'s Brain*\n\nModel: \`${model}\` ${isPremium ? '+ 🧠 Thinking' : '(Free)'}\nStatus: ${isPremium ? '💎 Premium' : '🆓 Free'}`, { parse_mode: 'Markdown' });
});

bot.command('status', async (ctx) => {
  const msgCount = await memory.getMessageCount(ctx.from.id);
  const info = await premium.getPremiumInfo(ctx.from.id);
  const config = await premium.getAllConfig();
  const model = info.isPremium ? (config.premium_models?.[0] || 'Claude 3.5 Sonnet') : (config.free_model || 'Step 3.5 Flash');
  let usageText = '';
  if (!info.isPremium) usageText = `\n📊 *Today's Usage:*\n💬 Messages: ${info.usage.messages}/${info.limits.messages}\n🔍 Searches: ${info.usage.searches}/${info.limits.searches}`;
  ctx.reply(`📊 *${BOT_NAME} Status*\n\n🟢 Online\n⏱ Uptime: ${formatUptime(startTime)}\n💬 Total messages: ${msgCount}\n🧠 Model: ${model}\n💳 Plan: ${info.isPremium ? '💎 Premium' : '🆓 Free'}${usageText}`, { parse_mode: 'Markdown' });
});

// ── Premium Command ──
bot.command('premium', async (ctx) => {
  const info = await premium.getPremiumInfo(ctx.from.id);
  const config = await premium.getAllConfig();
  if (info.isPremium) return ctx.reply(`💎 *You're already Premium!*\n\n✅ Unlimited everything\n✅ Claude 3.5 Sonnet + 🧠 Thinking\n\nEnjoy! 🎉`, { parse_mode: 'Markdown' });
  await ctx.replyWithInvoice({
    title: `${BOT_NAME} Premium ✨`,
    description: 'Unlimited messages, Claude 3.5 Sonnet + thinking, unlimited search & reminders for 30 days!',
    payload: `premium_${ctx.from.id}_${Date.now()}`,
    currency: 'XTR',
    prices: [{ label: 'Premium 30 days', amount: config.premium_price }],
  });
});

bot.on('pre_checkout_query', async (ctx) => { await ctx.answerPreCheckoutQuery(true); });

bot.on('successful_payment', async (ctx) => {
  const userId = ctx.from.id;
  const payment = ctx.message.successful_payment;
  console.log(`[Premium] Payment from ${userId}: ${payment.total_amount} ${payment.currency}`);
  if (payment.currency === 'XTR') {
    const success = await premium.activatePremium(userId, 30);
    if (success) await ctx.reply(`🎉 *Premium Activated!*\n\n✅ Unlimited messages\n✅ Claude 3.5 Sonnet + 🧠 Thinking\n✅ 30 days\n\nThank you! 💎`, { parse_mode: 'Markdown' });
    else await ctx.reply('❌ Failed to activate premium. Contact support.');
  }
});

bot.command('weather', weather);
bot.command('search', async (ctx) => {
  const canSearch = await premium.canUse(ctx.from.id, 'search');
  if (!canSearch.allowed) return ctx.reply(`🔒 Search limit reached (${canSearch.current}/${canSearch.limit} today).\n\n✨ /premium for unlimited search!`, { parse_mode: 'Markdown' });
  await premium.incrementUsage(ctx.from.id, 'search');
  return search(ctx);
});
bot.command('remind', async (ctx) => {
  const canRemind = await premium.canUse(ctx.from.id, 'remind');
  if (!canRemind.allowed) return ctx.reply(`🔒 Reminder limit reached (${canRemind.current}/${canRemind.limit}).\n\n✨ /premium for unlimited reminders!`, { parse_mode: 'Markdown' });
  await premium.incrementUsage(ctx.from.id, 'remind');
  return remind(ctx);
});
bot.command('translate', translate);
bot.command('wiki', wiki);

// ── Admin Panel ──
async function buildAdminPanel() {
  const today = new Date().toISOString().split('T')[0];
  const usage = await supaFetch('bot_usage', `?date=eq.${today}`).catch(() => []);
  const premiumUsers = await supaFetch('bot_premium', '?is_premium=eq.true').catch(() => []);
  const config = await premium.getAllConfig().catch(() => ({}));

  const text =
    `⚡ *${BOT_NAME} Admin Panel*\n\n` +
    `📊 *Today:*\n` +
    `👥 Users: ${usage.length} | 💬 Msgs: ${usage.reduce((s, u) => s + (u.message_count || 0), 0)} | 🔍 Searches: ${usage.reduce((s, u) => s + (u.search_count || 0), 0)} | 💎 Premium: ${premiumUsers.length}\n\n` +
    `⚙️ *Config:*\n` +
    `🆓 Free: \`${config.free_model || 'step-3.5-flash:free'}\` (${config.free_limits?.messagesPerDay ?? 20} msgs / ${config.free_limits?.searchesPerDay ?? 5} searches / ${config.free_limits?.remindersActive ?? 3} reminds)\n` +
    `💎 Premium: \`${(config.premium_models || ['claude-3.5-sonnet'])[0]}\` (unlimited)\n` +
    `💰 Price: ${config.premium_price || 100} ⭐`;

  const keyboard = [
    [{ text: '📊 Refresh', callback_data: 'admin_refresh' }],
    [{ text: '🤖 Free Model', callback_data: 'admin_set_free_model' }, { text: '💎 Premium Model', callback_data: 'admin_set_premium_model' }],
    [{ text: '📨 Free Limits', callback_data: 'admin_set_free_limits' }, { text: '📨 Premium Limits', callback_data: 'admin_set_premium_limits' }],
    [{ text: '💰 Premium Price', callback_data: 'admin_set_price' }],
    [{ text: '✨ Grant Premium', callback_data: 'admin_grant' }, { text: '🔒 Revoke', callback_data: 'admin_revoke' }],
  ];
  return { text, keyboard };
}

bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('🔒 Admin only.');
  const { text, keyboard } = await buildAdminPanel();
  await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
});

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;
  if (!data.startsWith('admin_') && !data.startsWith('m_')) return; // skip non-admin callbacks
  if (!isAdmin(userId)) return ctx.answerCbQuery('🔒 Admin only.');

  if (data === 'admin_refresh') {
    const { text, keyboard } = await buildAdminPanel();
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
    return ctx.answerCbQuery('✅ Refreshed!');
  }

  const actions = {
    admin_set_free_model: { key: 'admin_set_free_model', msg: (c) => `🤖 *Set Free Model*\n\nCurrent: \`${c.free_model || 'step-3.5-flash:free'}\`\n\nSend new model slug:\nExample: \`stepfun/step-3.5-flash:free\`` },
    admin_set_premium_model: { key: 'admin_set_premium_model', msg: (c) => `💎 *Set Premium Model*\n\nCurrent: \`${(c.premium_models || []).join(', ')}\`\n\nSend new model(s):\nSingle: \`anthropic/claude-3.5-sonnet\`\nMultiple: \`anthropic/claude-3.5-sonnet, openai/gpt-4o-mini\`` },
    admin_set_free_limits: { key: 'admin_set_free_limits', msg: (c) => { const fl = c.free_limits || {}; return `📨 *Set Free Limits*\n\nCurrent: ${fl.messagesPerDay ?? 20} msgs / ${fl.searchesPerDay ?? 5} searches / ${fl.remindersActive ?? 3} reminds\n\nSend as \`msgs searches reminds\`:\nExample: \`20 5 3\``; } },
    admin_set_premium_limits: { key: 'admin_set_premium_limits', msg: (c) => { const pl = c.premium_limits || {}; return `📨 *Set Premium Limits*\n\nCurrent: ${pl.messagesPerDay ?? -1} msgs / ${pl.searchesPerDay ?? -1} searches / ${pl.remindersActive ?? -1} reminds (-1=unlimited)\n\nSend as \`msgs searches reminds\`:\nExample: \`-1 -1 -1\``; } },
    admin_set_price: { key: 'admin_set_price', msg: (c) => `💰 *Set Premium Price*\n\nCurrent: ${c.premium_price || 100} ⭐\n\nSend new price in Stars:\nExample: \`100\`` },
    admin_grant: { key: 'admin_grant', msg: () => `✨ *Grant Premium*\n\nSend as \`<chat_id> <days>\`:\nExample: \`1861463350 30\`` },
    admin_revoke: { key: 'admin_revoke', msg: () => `🔒 *Revoke Premium*\n\nSend the chat ID:\nExample: \`1861463350\`` },
  };

  if (actions[data]) {
    const config = await premium.getAllConfig().catch(() => ({}));
    pendingCommands.set(userId, { command: actions[data].key, ts: Date.now() });
    await ctx.answerCbQuery();
    return ctx.reply(actions[data].msg(config), { parse_mode: 'Markdown' });
  }
});

bot.command('grant', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('🔒 Admin only.');
  const args = ctx.message.text.split(/\s+/).slice(1);
  if (args.length < 1) return ctx.reply('Usage: `/grant <chat_id> [days]`', { parse_mode: 'Markdown' });
  const days = parseInt(args[1]) || 30;
  const expires = new Date(Date.now() + days * 86400000).toISOString();
  try {
    await supaUpsert('bot_premium', { chat_id: String(args[0]), is_premium: true, activated_at: new Date().toISOString(), expires_at: expires, updated_at: new Date().toISOString() });
    await ctx.reply(`✅ Premium granted to \`${args[0]}\` for ${days} days.`, { parse_mode: 'Markdown' });
  } catch (err) { await ctx.reply('❌ Error: ' + err.message.substring(0, 200)); }
});

bot.command('revoke', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('🔒 Admin only.');
  const args = ctx.message.text.split(/\s+/).slice(1);
  if (args.length < 1) return ctx.reply('Usage: `/revoke <chat_id>`', { parse_mode: 'Markdown' });
  try {
    await supaUpsert('bot_premium', { chat_id: String(args[0]), is_premium: false, updated_at: new Date().toISOString() });
    await ctx.reply(`🔒 Premium revoked from \`${args[0]}\`.`, { parse_mode: 'Markdown' });
  } catch (err) { await ctx.reply('❌ Error: ' + err.message.substring(0, 200)); }
});

// ── Handle text: admin pending → chat ──
bot.on('text', async (ctx) => {
  const message = ctx.message.text;
  if (!validateInput(message, 4000)) return ctx.reply('⚠️ Message too long.');

  // Pending admin actions
  const pending = pendingCommands.get(ctx.from.id);
  if (pending && Date.now() - pending.ts < 120000 && isAdmin(ctx.from.id)) {
    const action = pending.command;
    pendingCommands.delete(ctx.from.id);

    if (action === 'admin_set_free_model') {
      try { await supaUpsert('bot_config', { key: 'free_model', value: message.trim(), updated_at: new Date().toISOString() }); return ctx.reply(`✅ Free model: \`${message.trim()}\``, { parse_mode: 'Markdown' }); }
      catch (e) { return ctx.reply('❌ Error: ' + e.message.substring(0, 200)); }
    }
    if (action === 'admin_set_premium_model') {
      const models = message.trim().split(',').map(s => s.trim()).filter(Boolean);
      try { await supaUpsert('bot_config', { key: 'premium_models', value: models, updated_at: new Date().toISOString() }); return ctx.reply(`✅ Premium models: \`${models.join('\`, \`')}\``, { parse_mode: 'Markdown' }); }
      catch (e) { return ctx.reply('❌ Error: ' + e.message.substring(0, 200)); }
    }
    if (action === 'admin_set_free_limits') {
      const parts = message.trim().split(/\s+/);
      if (parts.length !== 3) return ctx.reply('❌ Format: `msgs searches reminds`', { parse_mode: 'Markdown' });
      const limits = { messagesPerDay: parseInt(parts[0]), searchesPerDay: parseInt(parts[1]), remindersActive: parseInt(parts[2]) };
      try { await supaUpsert('bot_config', { key: 'free_limits', value: limits, updated_at: new Date().toISOString() }); return ctx.reply(`✅ Free limits: ${limits.messagesPerDay} msgs / ${limits.searchesPerDay} searches / ${limits.remindersActive} reminds`); }
      catch (e) { return ctx.reply('❌ Error: ' + e.message.substring(0, 200)); }
    }
    if (action === 'admin_set_premium_limits') {
      const parts = message.trim().split(/\s+/);
      if (parts.length !== 3) return ctx.reply('❌ Format: `msgs searches reminds`', { parse_mode: 'Markdown' });
      const limits = { messagesPerDay: parseInt(parts[0]), searchesPerDay: parseInt(parts[1]), remindersActive: parseInt(parts[2]) };
      try { await supaUpsert('bot_config', { key: 'premium_limits', value: limits, updated_at: new Date().toISOString() }); return ctx.reply(`✅ Premium limits: ${limits.messagesPerDay} msgs / ${limits.searchesPerDay} searches / ${limits.remindersActive} reminds`); }
      catch (e) { return ctx.reply('❌ Error: ' + e.message.substring(0, 200)); }
    }
    if (action === 'admin_set_price') {
      const price = parseInt(message.trim());
      if (isNaN(price) || price < 1) return ctx.reply('❌ Send a number (min 1).');
      try { await supaUpsert('bot_config', { key: 'premium_price', value: price, updated_at: new Date().toISOString() }); return ctx.reply(`✅ Premium price: ${price} ⭐`); }
      catch (e) { return ctx.reply('❌ Error: ' + e.message.substring(0, 200)); }
    }
    if (action === 'admin_grant') {
      const parts = message.trim().split(/\s+/);
      const days = parseInt(parts[1]) || 30;
      const expires = new Date(Date.now() + days * 86400000).toISOString();
      try { await supaUpsert('bot_premium', { chat_id: String(parts[0]), is_premium: true, activated_at: new Date().toISOString(), expires_at: expires, updated_at: new Date().toISOString() }); return ctx.reply(`✅ Premium granted to \`${parts[0]}\` for ${days} days.`, { parse_mode: 'Markdown' }); }
      catch (e) { return ctx.reply('❌ Error: ' + e.message.substring(0, 200)); }
    }
    if (action === 'admin_revoke') {
      const chatId = message.trim().split(/\s+/)[0];
      try { await supaUpsert('bot_premium', { chat_id: String(chatId), is_premium: false, updated_at: new Date().toISOString() }); return ctx.reply(`🔒 Premium revoked from \`${chatId}\`.`, { parse_mode: 'Markdown' }); }
      catch (e) { return ctx.reply('❌ Error: ' + e.message.substring(0, 200)); }
    }
  }

  // Regular chat
  const canChat = await premium.canUse(ctx.from.id, 'message');
  if (!canChat.allowed) {
    return ctx.reply(
      `🔒 Daily limit reached! (${canChat.current}/${canChat.limit} messages today)\n\n` +
      `✨ Upgrade to Premium:\n• Unlimited messages\n• Claude 3.5 Sonnet + 🧠 Thinking\n• Better responses\n\n` +
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
