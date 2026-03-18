const axios = require('axios');
const { sanitizeText, validateInput, truncate } = require('../utils');

async function search(ctx) {
  const query = ctx.message.text.split(/\s+/).slice(1).join(' ').trim();

  if (!validateInput(query, 200)) {
    return ctx.reply('🔍 Please provide a search query.\nExample: `/search what is solana blockchain`', { parse_mode: 'Markdown' });
  }

  const sanitized = sanitizeText(query);

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

    // If DDG returned nothing useful, try to use AI
    if (!result) {
      const aiResult = await aiSearch(query);
      return await ctx.reply(aiResult, { parse_mode: 'Markdown', disable_web_page_preview: true });
    }

    await ctx.reply(result, { parse_mode: 'Markdown', disable_web_page_preview: true });
  } catch (err) {
    console.error('[Search] DDG Error:', err.message);
    // Fallback to AI search
    try {
      const aiResult = await aiSearch(query);
      await ctx.reply(aiResult, { parse_mode: 'Markdown', disable_web_page_preview: true });
    } catch (aiErr) {
      await ctx.reply('❌ Search is temporarily unavailable. Try searching on [DuckDuckGo](https://duckduckgo.com/?q=' + encodeURIComponent(sanitized) + ') directly.', { parse_mode: 'Markdown' });
    }
  }
}

// AI-powered search fallback
async function aiSearch(query) {
  const OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim();
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: 'stepfun/step-3.5-flash:free',
      messages: [
        { role: 'system', content: 'You are a helpful search assistant. Answer the user\'s query concisely with factual information. If you don\'t know, say so. Include key facts. Keep it under 1500 characters.' },
        { role: 'user', content: query }
      ],
      max_tokens: 400,
      temperature: 0.3,
    },
    {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 12000,
    }
  );

  const reply = response.data?.choices?.[0]?.message?.content || 'No results found.';
  return `🔍 *AI Search: ${query}*\n\n${reply}`;
}

module.exports = { search };
