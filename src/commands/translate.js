const axios = require('axios');
const { sanitizeText, validateInput, truncate } = require('../utils');

async function translate(ctx) {
  const fullText = ctx.message.text.split(/\s+/).slice(1).join(' ').trim();
  
  if (!fullText) {
    return ctx.reply(
      '🌐 *Translate Command*\n\nUsage: `/translate [lang] [text]`\n\n' +
      '*Examples:*\n' +
      '• `/translate en Hola mundo` — Spanish to English\n' +
      '• `/translate fr Good morning` — English to French\n' +
      '• `/translate ar Hello` — English to Arabic\n\n' +
      'Supported: en, es, fr, de, it, pt, ru, ar, ja, ko, zh, and more.',
      { parse_mode: 'Markdown' }
    );
  }

  const parts = fullText.split(/\s+/);
  const targetLang = parts[0]?.toLowerCase();
  const text = parts.slice(1).join(' ').trim();

  if (!validateInput(targetLang, 10) || !/^[a-z]{2}$/.test(targetLang)) {
    return ctx.reply('❌ Please provide a valid 2-letter language code (e.g., `en`, `fr`, `es`).', { parse_mode: 'Markdown' });
  }

  if (!validateInput(text, 2000)) {
    return ctx.reply('⚠️ Please provide text to translate. Max 2000 characters.');
  }

  const sanitized = sanitizeText(text);

  try {
    // Use MyMemory free translation API
    const response = await axios.get(
      `https://api.mymemory.translated.net/get`,
      {
        params: {
          q: sanitized,
          langpair: `auto|${targetLang}`,
        },
        timeout: 10000,
      }
    );

    const translated = response.data?.responseData?.translatedText;
    
    if (!translated || translated === sanitized) {
      return ctx.reply('⚠️ Translation failed or text is already in the target language.');
    }

    const confidence = response.data?.responseData?.match;
    const confidenceStr = confidence ? ` (${Math.round(confidence * 100)}% confidence)` : '';

    await ctx.reply(
      `🌐 *Translation (${targetLang}):*\n\n${escapeM(translated)}\n\n_Original: ${escapeM(truncated(sanitized, 100))}${confidenceStr}_`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('[Translate] Error:', err.message);
    await ctx.reply('❌ Translation service is temporarily unavailable. Please try again later.');
  }
}

function escapeM(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

function truncated(text, max) {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

module.exports = { translate };
