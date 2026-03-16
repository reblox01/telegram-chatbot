const axios = require('axios');
const cheerio = require('cheerio');
const { sanitizeText, validateInput, truncate } = require('../utils');

async function summarize(ctx) {
  const url = ctx.message.text.split(/\s+/).slice(1).join(' ').trim();
  
  if (!url) {
    return ctx.reply(
      '📄 *Summarize Command*\n\nUsage: `/summarize [url]`\n\n' +
      'Fetches a webpage and provides a brief summary of its content.\n\n' +
      '*Example:* `/summarize https://example.com/article`',
      { parse_mode: 'Markdown' }
    );
  }

  // Basic URL validation
  try {
    new URL(url);
  } catch {
    return ctx.reply('❌ Please provide a valid URL starting with `http://` or `https://`', { parse_mode: 'Markdown' });
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return ctx.reply('❌ Only HTTP(S) URLs are supported.');
  }

  try {
    const response = await axios.get(url, {
      timeout: 15000,
      maxRedirects: 5,
      maxContentLength: 500000, // 500KB max
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TelegramBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    const $ = cheerio.load(response.data);
    
    // Remove script, style, nav, footer, header, ads
    $('script, style, nav, footer, header, iframe, noscript, svg, [class*="ad"], [id*="ad"]').remove();
    
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'No title';
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    
    // Get main content
    let content = '';
    const contentSelectors = ['article', 'main', '[role="main"]', '.content', '.post-content', '.article-body', '#content'];
    
    for (const sel of contentSelectors) {
      const el = $(sel).first();
      if (el.length && el.text().trim().length > 100) {
        content = el.text().trim();
        break;
      }
    }
    
    if (!content) {
      content = $('body').text().trim();
    }

    // Clean and truncate
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (content.length > 3000) {
      content = content.slice(0, 3000) + '...';
    }

    let summary = `📄 *${escapeM(truncate(title, 200))}*\n`;
    if (metaDesc) summary += `\n${escapeM(truncate(metaDesc, 300))}\n`;
    summary += `\n${escapeM(truncate(content, 2000))}`;

    await ctx.reply(summary, { parse_mode: 'Markdown', disable_web_page_preview: true });
  } catch (err) {
    console.error('[Summarize] Error:', err.message);
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      await ctx.reply('❌ Could not reach the website. Please check the URL.');
    } else if (err.response?.status === 403 || err.response?.status === 401) {
      await ctx.reply('❌ Website blocked the request. Try a different URL.');
    } else {
      await ctx.reply('❌ Failed to fetch or parse the webpage. Please try again later.');
    }
  }
}

function escapeM(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

module.exports = { summarize };
