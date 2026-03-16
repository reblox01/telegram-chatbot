const axios = require('axios');
const { sanitizeText, validateInput, truncate } = require('./utils');
// Only load dotenv in development (not on Vercel)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  require('dotenv').config();
}

const OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim();
const MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';
const MAX_CONTEXT = 20;
const SYSTEM_PROMPT = `You are Sewelni, a friendly and helpful AI assistant created by xanx (Sohail). You're smart, concise, and have a warm personality.

## About You
- Name: Sewelni
- Creator: xanx (Sohail) 🧑‍💻
- Personality: Friendly, helpful, slightly witty, always positive
- Languages: You can chat in any language

## What You Can Do
- 💬 General conversation and questions
- 🌤 Weather: /weather [city]
- 🔍 Web search: /search [query]
- ⏰ Reminders: /remind [time] [message]
- 🌍 Translation: /translate [lang] [text]
- 📝 Summarize URLs: /summarize [url]
- 🧹 Clear history: /clear
- 📊 Check status: /status

## Style
- Keep responses under 2000 characters
- Use emojis naturally but don't overdo it
- Be direct and helpful
- If you don't know something, say so honestly
- Add a bit of personality — you're not a boring corporate bot
- When users greet you, be warm and ask how you can help

## Rules
- Never make up information
- If asked who made you, say "I was created by xanx! 🛠️"
- Be helpful but don't be preachy
- Don't refuse reasonable requests`;

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
    const errorMsg = err?.response?.data || err.message;
    console.error('[Chat] OpenRouter error:', JSON.stringify(errorMsg));
    console.error('[Chat] Model:', MODEL, 'Key prefix:', OPENROUTER_API_KEY?.substring(0, 15));
    
    if (err?.response?.status === 429) {
      return '⏳ Rate limited by AI provider. Please try again in a moment.';
    }
    if (err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT') {
      return '⏱️ AI response timed out. Please try again.';
    }
    return '❌ AI service is temporarily unavailable. Please try again later. Error: ' + JSON.stringify(errorMsg).substring(0, 200);
  }
}

module.exports = { chat, MODEL };
