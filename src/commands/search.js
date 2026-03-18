const axios = require('axios');
const { sanitizeText, validateInput, truncate } = require('../utils');

async function search(ctx) {
  const query = ctx.message.text.split(/\s+/).slice(1).join(' ').trim();

  if (!query || !validateInput(query, 200)) {
    return ctx.reply(
      '🔍 *Search Command*\n\nUsage: `/search [query]`\n\nExample: `/search what is solana blockchain`',
      { parse_mode: 'Markdown' }
    );
  }

  const sanitized = sanitizeText(query);
  const ddgUrl = `https://duckduckgo.com/?q=${encodeURIComponent(sanitized)}`;

  try {
    // Use DuckDuckGo instant answer API
    const response = await axios.get(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(sanitized)}&format=json&no_html=1&skip_disambig=1`,
      { timeout: 8000, headers: { 'User-Agent': 'SewelniBot/1.0' } }
    );

    let result = '';
    const data = response.data;

    if (data.AbstractText && data.AbstractText.length > 20) {
      result = `📖 *${data.Heading}*\n\n${data.AbstractText}`;
      if (data.AbstractURL) result += `\n\n🔗 ${data.AbstractURL}`;
    } else if (data.Answer) {
      result = `💡 ${data.Answer}`;
    } else if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      const topics = data.RelatedTopics.filter(t => t.Text).slice(0, 5);
      if (topics.length > 0) {
        result = '🔍 *Results:*\n\n' + topics.map((t, i) =>
          `${i + 1}. ${truncate(t.Text, 150)}\n   🔗 ${t.FirstURL}`
        ).join('\n\n');
      }
    }

    if (result) {
      await ctx.reply(result, { parse_mode: 'Markdown', disable_web_page_preview: true });
    } else {
      // No DDG results — just say so, no AI editorializing
      await ctx.reply(
        `🔍 No results found for *${escapeM(truncate(sanitized, 50))}*.\n\n` +
        `Try searching directly:\n🔗 [DuckDuckGo](${ddgUrl})`,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );
    }
  } catch (err) {
    console.error('[Search] DDG Error:', err.message);
    await ctx.reply(
      `🔍 Search unavailable right now.\n\n` +
      `Try searching directly:\n🔗 [DuckDuckGo](${ddgUrl})`,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
  }
}

function escapeM(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

module.exports = { search };
