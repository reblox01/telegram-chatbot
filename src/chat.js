const axios = require('axios');
const { sanitizeText, validateInput, truncate } = require('./utils');
// Only load dotenv in development (not on Vercel)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  require('dotenv').config();
}

const OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim();
const BOT_NAME = process.env.BOT_NAME || 'AI Bot';
const CREATOR = process.env.BOT_CREATOR || 'the developer';

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

## OUTPUT STYLE — IMPORTANT
Format EVERY response with clear structure and visual hierarchy:

1. **Start with a short summary** (1-2 sentences) that directly answers the question.

2. **Use sections with emojis** for different parts:
   - 📌 **Key Points** — main takeaways
   - 🔍 **Details** — deeper explanation
   - 💡 **Examples** — concrete instances
   - ⚠️ **Notes** — cautions or exceptions
   - 🎯 **Bottom Line** — final takeaway

3. **Formatting rules:**
   - **Bold:** use `**text**` (exactly TWO asterisks, never four)
   - *Italic:* use `*text*` (one asterisk)
   - \`code:\` use backticks
   - Bullet points (•) for lists
   - Separate sections with a blank line
   - Keep paragraphs short (1-3 sentences max)

4. **Never output a plain wall of text.** Break information into digestible chunks.

5. **Be friendly but professional** — use emojis sparingly to enhance readability, not as decoration.

## Rules
- Never make up information
- If asked who made you, say "I was created by ${CREATOR}! 🛠️"
- Be helpful but don't be preachy
- Don't refuse reasonable requests`;

async function callModel(modelId, messages, options = {}) {
  const body = {
    model: modelId,
    messages: messages,
    max_tokens: options.maxTokens || 512,
    temperature: options.temperature || 0.7,
  };

  if (options.reasoning) {
    body.reasoning = { effort: 'medium' };
    body.max_tokens = 1024;
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
      timeout: options.timeout || 15000,
    }
  );

  return response.data?.choices?.[0]?.message?.content || null;
}

async function chat(userId, message, memory, isPremium = false, premiumManager = null) {
  if (!validateInput(message, 4000)) {
    return '⚠️ Message too long or invalid. Please keep messages under 4000 characters.';
  }

  const history = await memory.getMessages(userId, MAX_CONTEXT);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: message }
  ];

  // Get models from config if premiumManager is available
  let models = [];
  if (premiumManager) {
    const config = await premiumManager.getAllConfig();
    if (isPremium) {
      const premiumModels = config.premium_models || [];
      models = premiumModels.map(id => ({
        id,
        options: { reasoning: id.includes('claude'), timeout: 30000, maxTokens: 1024 }
      }));
    } else {
      models = [{
        id: config.free_model || 'stepfun/step-3.5-flash:free',
        options: { reasoning: false, timeout: 15000, maxTokens: 512 }
      }];
    }
  } else {
    // Fallback models
    models = isPremium
      ? [{ id: 'anthropic/claude-3.5-sonnet', options: { reasoning: true, timeout: 30000, maxTokens: 1024 } }]
      : [{ id: 'stepfun/step-3.5-flash:free', options: { reasoning: false, timeout: 15000, maxTokens: 512 } }];
  }

  for (const model of models) {
    try {
      const reply = await callModel(model.id, messages, model.options);
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

module.exports = { chat };
