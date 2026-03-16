const axios = require('axios');
const { sanitizeText, validateInput, truncate } = require('../utils');

async function search(ctx) {
  const query = ctx.message.text.split(/\s+/).slice(1).join(' ').trim();
  
  if (!validateInput(query, 200)) {
    return ctx.reply('🔍 Please provide a search query.\nExample: `/search best pizza recipes`', { parse_mode: 'Markdown' });
  }

  const sanitized = sanitizeText(query);
  
  try {
    // Use DuckDuckGo instant answer API (free, no key)
    const response = await axios.get(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(sanitized)}&format=json&no_html=1&skip_disambig=1`,
      { timeout: 10000, headers: { 'User-Agent': 'TelegramBot/1.0' } }
    );

    let result = '';
    const data = response.data;
    
    if (data.AbstractText) {
      result = `📖 *${data.Heading}*\n\n${data.AbstractText}`;
      if (data.AbstractURL) result += `\n\n🔗 ${data.AbstractURL}`;
    } else if (data.Answer) {
      result = `💡 ${data.Answer}`;
    } else if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      const topics = data.RelatedTopics.slice(0, 3);
      result = '🔍 *Search Results:*\n\n' + topics.map((t, i) => 
        `${i + 1}. ${t.Text ? truncate(t.Text, 200) : t.FirstURL}`
      ).join('\n');
    } else {
      result = `🔍 No instant results for "${sanitized}". Try searching on [DuckDuckGo](https://duckduckgo.com/?q=${encodeURIComponent(sanitized)}) directly.`;
    }

    await ctx.reply(result, { parse_mode: 'Markdown', disable_web_page_preview: true });
  } catch (err) {
    console.error('[Search] Error:', err.message);
    await ctx.reply('❌ Search service is temporarily unavailable. Please try again later.');
  }
}

module.exports = { search };
