const axios = require('axios');
const { sanitizeText, validateInput, truncate, escapeMarkdown: escapeM } = require('../utils');

async function wiki(ctx) {
  const query = ctx.message.text.split(/\s+/).slice(1).join(' ').trim();

  if (!query || !validateInput(query, 200)) {
    return ctx.reply(
      '📚 *Wikipedia Lookup*\n\nUsage: `/wiki [query]`\n\n' +
      'Examples:\n' +
      '• `/wiki solana`\n' +
      '• `/wiki blockchain`\n' +
      '• `/wiki elon musk`',
      { parse_mode: 'Markdown' }
    );
  }

  const sanitized = sanitizeText(query);

  try {
    // Search for the article
    const searchRes = await axios.get(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(sanitized)}`,
      { timeout: 8000, headers: { 'User-Agent': 'TelegramBot/1.0' } }
    );

    const data = searchRes.data;

    if (!data || !data.extract) {
      return ctx.reply(
        `📚 No Wikipedia article found for *${escapeM(truncate(sanitized, 50))}*.\n\nTry a different search term.`,
        { parse_mode: 'Markdown' }
      );
    }

    const title = data.title || sanitized;
    const summary = data.extract || '';
    const url = data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(sanitized)}`;
    const thumbnail = data.thumbnail?.source;

    let reply = `📚 *${escapeM(title)}*\n\n${escapeM(truncate(summary, 2500))}`;
    reply += `\n\n🔗 [Read on Wikipedia](${url})`;

    // Telegram max message length
    if (reply.length > 4000) {
      reply = reply.slice(0, 3990) + '...';
    }

    if (thumbnail) {
      await ctx.replyWithPhoto(thumbnail, {
        caption: reply,
        parse_mode: 'Markdown',
      });
    } else {
      await ctx.reply(reply, { parse_mode: 'Markdown', disable_web_page_preview: true });
    }
  } catch (err) {
    console.error('[Wiki] Error:', err.message);
    if (err.response?.status === 404) {
      await ctx.reply(
        `📚 No article found for *${escapeM(truncate(sanitized, 50))}*.\n\nTry different keywords or check spelling.`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.reply(
        `🔗 Search Wikipedia directly: [${escapeM(truncate(sanitized, 30))}](https://en.wikipedia.org/wiki/Special:Search/${encodeURIComponent(sanitized)})`,
        { parse_mode: 'Markdown' }
      );
    }
  }
}

module.exports = { wiki };
