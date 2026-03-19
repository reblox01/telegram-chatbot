const axios = require('axios');
const { sanitizeText, validateInput, truncate, escapeMarkdown: escapeM } = require('../utils');

const WIKI_API = 'https://en.wikipedia.org/api/rest_v1';
const WIKI_SEARCH = 'https://en.wikipedia.org/w/api.php';
const USER_AGENT = 'TelegramBot/1.0';

async function wiki(ctx) {
  const query = ctx.message.text.split(/\s+/).slice(1).join(' ').trim();

  if (!query || !validateInput(query, 200)) {
    return ctx.reply('❌ Please include a search query.\nExample: `/wiki solana`', { parse_mode: 'Markdown' });
  }

  const sanitized = sanitizeText(query);

  try {
    // Step 1: Search for the article (handles typos and partial names)
    const searchRes = await axios.get(WIKI_SEARCH, {
      params: {
        action: 'query',
        list: 'search',
        srsearch: sanitized,
        srlimit: 1,
        format: 'json',
      },
      timeout: 8000,
      headers: { 'User-Agent': USER_AGENT },
    });

    const results = searchRes.data?.query?.search;
    if (!results || results.length === 0) {
      return ctx.reply(
        `📚 No Wikipedia article found for *${escapeM(truncate(sanitized, 50))}*.\n\nTry a different search term.`,
        { parse_mode: 'Markdown' }
      );
    }

    // Step 2: Get the summary of the best match
    const pageTitle = results[0].title;
    const summaryRes = await axios.get(
      `${WIKI_API}/page/summary/${encodeURIComponent(pageTitle)}`,
      { timeout: 8000, headers: { 'User-Agent': USER_AGENT } }
    );

    const data = summaryRes.data;
    if (!data || !data.extract) {
      return ctx.reply(
        `📚 Found *${escapeM(truncate(pageTitle, 50))}* but no summary available.\n\n🔗 [Read on Wikipedia](https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle)})`,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );
    }

    const title = data.title || pageTitle;
    const summary = data.extract || '';
    const url = data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`;
    const thumbnail = data.thumbnail?.source;

    let reply = `📚 *${escapeM(title)}*\n\n${escapeM(truncate(summary, 2500))}`;
    reply += `\n\n🔗 [Read on Wikipedia](${url})`;

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
    await ctx.reply('❌ Wikipedia is temporarily unavailable. Please try again later.');
  }
}

module.exports = { wiki };
