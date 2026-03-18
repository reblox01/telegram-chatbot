const axios = require('axios');
const { sanitizeText, validateInput, truncate } = require('../utils');

// Only load dotenv in development
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  require('dotenv').config();
}

const TAVILY_API_KEY = (process.env.TAVILY_API_KEY || '').trim();

async function search(ctx) {
  const query = ctx.message.text.split(/\s+/).slice(1).join(' ').trim();

  if (!query || !validateInput(query, 200)) {
    return ctx.reply(
      '🔍 *Search Command*\n\nUsage: `/search [query]`\n\n' +
      'Examples:\n' +
      '• `/search solana blockchain`\n' +
      '• `/search what is PEPE coin`\n' +
      '• `/search latest crypto news today`',
      { parse_mode: 'Markdown' }
    );
  }

  const sanitized = sanitizeText(query);
  const ddgUrl = `https://duckduckgo.com/?q=${encodeURIComponent(sanitized)}`;

  // Try Tavily first (real search results)
  if (TAVILY_API_KEY) {
    try {
      const response = await axios.post(
        'https://api.tavily.com/search',
        {
          api_key: TAVILY_API_KEY,
          query: sanitized,
          max_results: 5,
          topic: 'general',
          search_depth: 'basic',
        },
        { timeout: 10000, headers: { 'Content-Type': 'application/json' } }
      );

      const results = response.data?.results;

      if (results && results.length > 0) {
        let output = `🔍 *${escapeM(truncate(sanitized, 60))}* — ${results.length} results\n\n`;

        for (const r of results) {
          const title = escapeM(truncate(r.title || 'Untitled', 80));
          const url = r.url || '';
          const snippet = r.content ? escapeM(truncate(r.content, 200)) : '';
          output += `• [${title}](${url})\n`;
          if (snippet) output += `  ${snippet}\n`;
          output += '\n';
        }

        output += `🔗 [Full results on DuckDuckGo](${ddgUrl})`;

        await ctx.reply(output, { parse_mode: 'Markdown', disable_web_page_preview: true });
        return;
      }
    } catch (err) {
      console.error('[Search] Tavily error:', err.message);
      // Fall through to DDG
    }
  }

  // Fallback: DuckDuckGo instant answers
  try {
    const response = await axios.get(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(sanitized)}&format=json&no_html=1&skip_disambig=1`,
      { timeout: 8000, headers: { 'User-Agent': 'TelegramBot/1.0' } }
    );

    const data = response.data;
    let result = '';

    if (data.AbstractText && data.AbstractText.length > 20) {
      result = `📖 *${data.Heading}*\n\n${data.AbstractText}`;
      if (data.AbstractURL) result += `\n\n🔗 ${data.AbstractURL}`;
    } else if (data.Answer) {
      result = `💡 ${data.Answer}`;
    } else if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      const topics = data.RelatedTopics.filter(t => t.Text).slice(0, 5);
      if (topics.length > 0) {
        result = '🔍 *Results:*\n\n' + topics.map((t, i) =>
          `${i + 1}. ${escapeM(truncate(t.Text, 150))}\n   🔗 ${t.FirstURL}`
        ).join('\n\n');
      }
    }

    if (result) {
      await ctx.reply(result, { parse_mode: 'Markdown', disable_web_page_preview: true });
    } else {
      await ctx.reply(
        `🔍 No results for *${escapeM(truncate(sanitized, 50))}*.\n\n🔗 [Search on DuckDuckGo](${ddgUrl})`,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );
    }
  } catch (err) {
    console.error('[Search] DDG Error:', err.message);
    await ctx.reply(
      `🔍 Search unavailable.\n\n🔗 [Search on DuckDuckGo](${ddgUrl})`,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
  }
}

function escapeM(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

module.exports = { search };
