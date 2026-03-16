const { parseTimeArg, sanitizeText, validateInput } = require('../utils');

// In-memory reminders (works for polling; for serverless use cron jobs)
const reminders = new Map();

async function remind(ctx) {
  const fullText = ctx.message.text.split(/\s+/).slice(1).join(' ').trim();
  
  if (!fullText) {
    return ctx.reply(
      '⏰ *Remind Command*\n\nUsage: `/remind [time] [message]`\n\n' +
      '*Time formats:*\n' +
      '• `30s` — 30 seconds\n' +
      '• `5m` — 5 minutes\n' +
      '• `1h` — 1 hour\n' +
      '• `2d` — 2 days\n\n' +
      '*Example:* `/remind 30m Check the oven`',
      { parse_mode: 'Markdown' }
    );
  }

  const parts = fullText.split(/\s+/);
  const timeStr = parts[0];
  const message = parts.slice(1).join(' ').trim();

  if (!validateInput(message, 500)) {
    return ctx.reply('⚠️ Please provide a reminder message after the time. Max 500 chars.');
  }

  const delayMs = parseTimeArg(timeStr);
  if (!delayMs) {
    return ctx.reply('❌ Invalid time format. Use: `30s`, `5m`, `1h`, or `2d`', { parse_mode: 'Markdown' });
  }

  if (delayMs < 5000) {
    return ctx.reply('⚠️ Minimum reminder time is 5 seconds.');
  }

  if (delayMs > 7 * 86400000) {
    return ctx.reply('⚠️ Maximum reminder time is 7 days.');
  }

  const sanitized = sanitizeText(message);
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  const reminderId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  await ctx.reply(
    `✅ Reminder set!\n⏰ In *${timeStr}*: ${escapeM(sanitized)}`,
    { parse_mode: 'Markdown' }
  );

  const timer = setTimeout(async () => {
    try {
      await ctx.telegram.sendMessage(
        chatId,
        `🔔 *Reminder:*\n${escapeM(sanitized)}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('[Remind] Failed to send:', err.message);
    }
    reminders.delete(reminderId);
  }, delayMs);

  reminders.set(reminderId, { timer, userId, chatId });
}

function escapeM(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

module.exports = { remind };
