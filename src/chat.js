const axios = require('axios');
const dotenv = require('dotenv');
const { sanitizeText, validateInput, truncate } = require('./utils');

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';
const MAX_CONTEXT = 20;
const SYSTEM_PROMPT = `You are a friendly, helpful AI assistant in a Telegram chat. Be concise, clear, and warm. Use emojis naturally but don't overdo it. Keep responses under 2000 characters when possible. Be direct and helpful.`;

async function chat(userId, message, memory) {
  if (!validateInput(message, 4000)) {
    return '⚠️ Message too long or invalid. Please keep messages under 4000 characters.';
  }

  const history = memory.getMessages(userId, MAX_CONTEXT);
  
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: message }
  ];

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: MODEL,
        messages: messages,
        max_tokens: 1024,
        temperature: 0.7,
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/telegram-chatbot',
        },
        timeout: 30000,
      }
    );

    const reply = response.data?.choices?.[0]?.message?.content || 'Sorry, I couldn\'t generate a response.';
    
    // Store conversation
    memory.addMessage(userId, 'user', message);
    memory.addMessage(userId, 'assistant', reply);

    return truncate(reply, 4000);
  } catch (err) {
    console.error('[Chat] OpenRouter error:', err?.response?.data || err.message);
    
    if (err?.response?.status === 429) {
      return '⏳ Rate limited by AI provider. Please try again in a moment.';
    }
    if (err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT') {
      return '⏱️ AI response timed out. Please try again.';
    }
    return '❌ AI service is temporarily unavailable. Please try again later.';
  }
}

module.exports = { chat, MODEL };
