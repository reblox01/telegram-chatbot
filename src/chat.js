const axios = require('axios');
const { sanitizeText, validateInput, truncate } = require('./utils');
// Only load dotenv in development (not on Vercel)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  require('dotenv').config();
}

const BOT_NAME = process.env.BOT_NAME || 'AI Bot';
const CREATOR = process.env.BOT_CREATOR || 'the developer';
const MAX_CONTEXT = 20;

// ── Provider Detection ──
// Priority: Groq (no daily cap, fast) > Gemini (no daily cap) > OpenRouter (50/day free)
const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim();

function getProvider() {
  if (GROQ_API_KEY) {
    return {
      name: 'Groq',
      apiKey: GROQ_API_KEY,
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      models: [
        { id: 'llama-3.3-70b-versatile' },
        { id: 'llama-3.1-8b-instant' },
      ],
    };
  }
  if (GEMINI_API_KEY) {
    return {
      name: 'Gemini',
      apiKey: GEMINI_API_KEY,
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      models: [
        { id: 'gemini-2.0-flash' },
        { id: 'gemini-1.5-flash' },
      ],
    };
  }
  if (OPENROUTER_API_KEY) {
    return {
      name: 'OpenRouter',
      apiKey: OPENROUTER_API_KEY,
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      models: [
        { id: 'nvidia/nemotron-3-super-120b-a12b:free' },
        { id: 'stepfun/step-3.5-flash:free' },
      ],
      extraHeaders: { 'HTTP-Referer': 'https://github.com/telegram-chatbot' },
    };
  }
  return null;
}

const provider = getProvider();
const ACTIVE_MODEL = provider ? provider.models[0].id : 'none';

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

async function callModel(endpoint, apiKey, model, messages, extraHeaders = {}) {
  const body = {
    model: model.id,
    messages: messages,
    max_tokens: 512,
    temperature: 0.7,
  };

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  const response = await axios.post(endpoint, body, {
    headers,
    timeout: 15000,
  });

  return response.data?.choices?.[0]?.message?.content || null;
}

async function chat(userId, message, memory) {
  if (!validateInput(message, 4000)) {
    return '⚠️ Message too long or invalid. Please keep messages under 4000 characters.';
  }

  if (!provider) {
    console.error('[Chat] No API key configured! Set GROQ_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY.');
    return '❌ Bot is not configured. Please contact the administrator.';
  }

  const history = await memory.getMessages(userId, MAX_CONTEXT);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: message }
  ];

  // Try each model in the provider's list
  for (const model of provider.models) {
    try {
      const reply = await callModel(
        provider.endpoint,
        provider.apiKey,
        model,
        messages,
        provider.extraHeaders || {}
      );
      if (reply && reply.trim().length > 0) {
        await memory.addMessage(userId, 'user', message);
        await memory.addMessage(userId, 'assistant', reply);
        return truncate(reply, 4000);
      }
      console.warn(`[Chat] Model ${model.id} returned empty, trying fallback...`);
    } catch (err) {
      const errorMsg = err?.response?.data || err.message;
      console.error(`[Chat] Model ${model.id} error:`, JSON.stringify(errorMsg));
      continue;
    }
  }

  return '❌ AI service is temporarily unavailable. Please try again later.';
}

module.exports = { chat, MODEL: ACTIVE_MODEL, PROVIDER: provider?.name || 'none' };
