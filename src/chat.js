const axios = require('axios');
const { sanitizeText, validateInput, truncate } = require('./utils');
// Only load dotenv in development (not on Vercel)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  require('dotenv').config();
}

const OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim();
const BOT_NAME = process.env.BOT_NAME || 'AI Bot';
const CREATOR = process.env.BOT_CREATOR || 'the developer';
const MODELS = [
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', reasoning: false },
  { id: 'stepfun/step-3.5-flash:free', reasoning: null },
];
const MAX_CONTEXT = 20;
const SYSTEM_PROMPT = `You are ${BOT_NAME}, a friendly and helpful AI assistant. You're smart, concise, and have a warm personality.

## About You
- Name: ${BOT_NAME}
- Creator: ${CREATOR}
- Personality: Friendly, helpful, slightly witty, always positive
- Languages: You can chat in any language

## What You Can Do
- 💬 General conversation and questions
- 🌤 Weather: /weather [city]
- 🔍 Web search: /search [query]
- ⏰ Reminders: /remind [time] [message]
- 🌍 Translation: /translate [lang] [text]
- 📚 Wikipedia: /wiki [query]
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
- If asked who made you, say "I was created by ${CREATOR}! 🛠️"
- Be helpful but don't be preachy
- Don't refuse reasonable requests`;

async function callModel(model, messages) {
  const body = {
    model: model.id,
    messages: messages,
    max_tokens: 512,
    temperature: 0.7,
  };
  // Disable reasoning output for reasoning models (so content isn't empty)
  if (model.reasoning === false) {
    body.include_reasoning = false;
  }

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    body,
    {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/telegram-chatbot',
      },
      timeout: 15000,
    }
  );

  return response.data?.choices?.[0]?.message?.content || null;
}

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

  // Try primary model, fall back to secondary
  for (const model of MODELS) {
    try {
      const reply = await callModel(model, messages);
      if (reply && reply.trim().length > 0) {
        // Store conversation
        memory.addMessage(userId, 'user', message);
        memory.addMessage(userId, 'assistant', reply);
        return truncate(reply, 4000);
      }
      console.warn(`[Chat] Model ${model.id} returned empty, trying fallback...`);
    } catch (err) {
      const errorMsg = err?.response?.data || err.message;
      console.error(`[Chat] Model ${model.id} error:`, JSON.stringify(errorMsg));
      // Try next model
      continue;
    }
  }

  return '❌ AI service is temporarily unavailable. Please try again later.';
}

module.exports = { chat, MODEL: MODELS[0].id };
