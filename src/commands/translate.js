const axios = require('axios');
const { sanitizeText, validateInput, truncate } = require('../utils');

// Common language names to codes
const LANG_ALIASES = {
  english: 'en', spanish: 'es', french: 'fr', german: 'de', italian: 'it',
  portuguese: 'pt', russian: 'ru', arabic: 'ar', japanese: 'ja', korean: 'ko',
  chinese: 'zh', hindi: 'hi', turkish: 'tr', dutch: 'nl', polish: 'pl',
  swedish: 'sv', norwegian: 'no', danish: 'da', finnish: 'fi', greek: 'el',
  hebrew: 'he', thai: 'th', vietnamese: 'vi', indonesian: 'id', malay: 'ms',
  ukrainian: 'uk', czech: 'cs', romanian: 'ro', hungarian: 'hu', dakh: 'ar',
  darija: 'ar', moroccan: 'ar',
};

function resolveLang(input) {
  if (!input) return null;
  const lower = input.toLowerCase();
  if (LANG_ALIASES[lower]) return LANG_ALIASES[lower];
  if (/^[a-z]{2}$/.test(lower)) return lower;
  return null;
}

async function translate(ctx) {
  const fullText = ctx.message.text.split(/\s+/).slice(1).join(' ').trim();

  if (!fullText) {
    return ctx.reply(
      '🌐 *Translate Command*\n\nUsage: `/translate [lang] [text]`\n\n' +
      '*Examples:*\n' +
      '• `/translate en Hola mundo` — Spanish to English\n' +
      '• `/translate fr Good morning` — English to French\n' +
      '• `/translate ar دارجة مغربية` — Darija to Arabic\n\n' +
      'Supported: en, es, fr, de, it, pt, ru, ar, ja, ko, zh, + language names',
      { parse_mode: 'Markdown' }
    );
  }

  const parts = fullText.split(/\s+/);
  const targetLang = resolveLang(parts[0]);
  const text = parts.slice(1).join(' ').trim();

  if (!targetLang) {
    return ctx.reply('❌ Invalid language. Use 2-letter code (e.g., `en`, `fr`) or full name (e.g., `english`, `french`).', { parse_mode: 'Markdown' });
  }

  if (!text) {
    return ctx.reply('⚠️ Please provide text to translate after the language code.\nExample: `/translate en Hola mundo`', { parse_mode: 'Markdown' });
  }

  if (!validateInput(text, 2000)) {
    return ctx.reply('⚠️ Text too long. Max 2000 characters.');
  }

  const sanitized = sanitizeText(text);

  try {
    // MyMemory requires a real source language — use 'autodetect' via en pair
    // First try with auto-detection by sending as-is with a guessed pair
    const response = await axios.get(
      `https://api.mymemory.translated.net/get`,
      {
        params: {
          q: sanitized,
          langpair: `autodetect|${targetLang}`,
        },
        timeout: 10000,
      }
    );

    const responseData = response.data?.responseData;
    const translated = responseData?.translatedText;

    if (!translated || translated === sanitized || response.data?.responseStatus === 403) {
      // Fallback: try assuming source is English
      const fallback = await axios.get(
        `https://api.mymemory.translated.net/get`,
        {
          params: {
            q: sanitized,
            langpair: `en|${targetLang}`,
          },
          timeout: 10000,
        }
      );
      const fbTranslated = fallback.data?.responseData?.translatedText;
      if (fbTranslated && fbTranslated !== sanitized) {
        return await ctx.reply(
          `🌐 *Translation → ${targetLang}:*\n\n${escapeM(fbTranslated)}\n\n_Original: ${escapeM(truncate(sanitized, 100))}_`,
          { parse_mode: 'Markdown' }
        );
      }
      return ctx.reply('⚠️ Translation failed. Text may already be in the target language, or the language pair is not supported.');
    }

    await ctx.reply(
      `🌐 *Translation → ${targetLang}:*\n\n${escapeM(translated)}\n\n_Original: ${escapeM(truncate(sanitized, 100))}_`,
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

module.exports = { translate };
