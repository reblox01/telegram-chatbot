const axios = require('axios');
const cheerio = require('cheerio');
const { sanitizeText, validateInput, truncate } = require('../utils');

async function summarize(ctx) {
  const url = ctx.message.text.split(/\s+/).slice(1).join(' ').trim();

  if (!url) {
    return ctx.reply(
      '📄 *Summarize Command*\n\nUsage: `/summarize [url]`\n\n' +
      'Fetches a webpage and provides a brief summary.\n\n' +
      '*Example:* `/summarize https://example.com/article`',
      { parse_mode: 'Markdown' }
    );
  }

  // Basic URL validation
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return ctx.reply('❌ Only HTTP(S) URLs are supported.');
    }
  } catch {
    return ctx.reply('❌ Please provide a valid URL starting with `http://` or `https://`', { parse_mode: 'Markdown' });
  }

  try {
    // Fetch the page (8s timeout to stay within Vercel limits)
    const response = await axios.get(url, {
      timeout: 8000,
      maxRedirects: 3,
      maxContentLength: 200000, // 200KB max
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TelegramBot/1.0)',
        'Accept': 'text/html',
        'Accept-Encoding': 'identity', // no gzip to save processing time
      },
    });

    const $ = cheerio.load(response.data);

    // Remove noise
    $('script, style, nav, footer, header, iframe, noscript, svg, [class*="ad"], [id*="ad"], [class*="cookie"], [class*="banner"]').remove();

    const title = $('title').text().trim() || $('h1').first().text().trim() || 'No title';
    const metaDesc = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';

    // Get main content — try semantic selectors first
    let content = '';
    const selectors = ['article', 'main', '[role="main"]', '.post-content', '.article-body', '.entry-content', '#content', '.content'];

    for (const sel of selectors) {
      const el = $(sel).first();
      if (el.length && el.text().trim().length > 100) {
        content = el.text().trim();
        break;
      }
    }

    // Fallback: body text
    if (!content) {
      content = $('body').text().trim();
    }

    // Clean whitespace
    content = content.replace(/\s+/g, ' ').trim();

    if (content.length < 50) {
      return ctx.reply('❌ Page has very little text content. Try a different URL.');
    }

    // Truncate for Telegram (max 3500 chars to leave room for title + desc)
    if (content.length > 3500) {
      content = content.slice(0, 3500) + '...';
    }

    // Build response
    let summary = `📄 *${escapeM(truncate(title, 200))}*\n`;
    if (metaDesc) summary += `\n_${escapeM(truncate(metaDesc, 300))}_\n`;
    summary += `\n${escapeM(truncate(content, 3000))}`;
    summary += `\n\n🔗 [Original](${url})`;

    // Telegram max message length is 4096
    if (summary.length > 4000) {
      summary = summary.slice(0, 3990) + '...';
    }

    await ctx.reply(summary, { parse_mode: 'Markdown', disable_web_page_preview: true });
  } catch (err) {
    console.error('[Summarize] Error:', err.message, err.code || '');
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      await ctx.reply('❌ Could not reach the website. Please check the URL.');
    } else if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      await ctx.reply('⏱️ Page took too long to load. Try a simpler URL or different site.');
    } else if (err.response?.status === 403 || err.response?.status === 401) {
      await ctx.reply('❌ Website blocked the request (anti-bot protection). Try a different URL.');
    } else if (err.response?.status === 404) {
      await ctx.reply('❌ Page not found (404). Please check the URL.');
    } else {
      await ctx.reply(`❌ Failed to summarize: ${err.message || 'Unknown error'}`);
    }
  }
}

function escapeM(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

module.exports = { summarize };
