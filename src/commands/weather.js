const axios = require('axios');
const { sanitizeText, validateInput, truncate } = require('../utils');

async function weather(ctx) {
  const args = ctx.message.text.split(/\s+/).slice(1).join(' ').trim();
  
  if (!validateInput(args, 100)) {
    return ctx.reply('🏙️ Please provide a city name.\nExample: `/weather London`', { parse_mode: 'Markdown' });
  }

  const city = sanitizeText(args);
  
  try {
    const response = await axios.get(
      `https://wttr.in/${encodeURIComponent(city)}?format=4&lang=en`,
      { timeout: 10000, headers: { 'User-Agent': 'TelegramBot/1.0' } }
    );
    
    const data = response.data?.trim() || 'No data available';
    await ctx.reply(`🌤️ Weather for *${escapeM(city)}*\n\n${escapeM(data)}`, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[Weather] Error:', err.message);
    await ctx.reply('❌ Could not fetch weather data. Please check the city name and try again.');
  }
}

function escapeM(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

module.exports = { weather };
