# 🤖 AI Telegram Chatbot

A full-featured, serverless AI-powered Telegram chatbot with conversation memory, web search, utilities, and customizable personality. Free to run.

## Features

- 💬 **AI Chat** — OpenRouter (multiple free models with auto-fallback)
- 🧠 **Conversation Memory** — Remembers last 20 messages per user
- 🔍 **Web Search** — Tavily API + DuckDuckGo fallback
- 🌤️ **Weather** — Real-time weather via wttr.in
- ⏰ **Reminders** — Set timed reminders
- 🌐 **Translation** — Multi-language via MyMemory API
- 📚 **Wikipedia** — Quick Wikipedia lookups with thumbnails
- 🛡️ **Rate Limiting** — 20 messages/user/hour
- 🔒 **Security** — Input validation, sanitization, env-only secrets

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/your-username/telegram-chatbot.git
cd telegram-chatbot
npm install
```

### 2. Get API Keys

| Key | Where | Free Tier |
|-----|-------|-----------|
| **Bot Token** | [@BotFather](https://t.me/BotFather) → `/newbot` | Free forever |
| **OpenRouter** | [openrouter.ai](https://openrouter.ai) → API Keys | 50+ free models |
| **Tavily** (optional) | [tavily.com](https://tavily.com) → API Key | 1000/month free |

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env` with your keys:

```env
BOT_TOKEN=your_bot_token_here
OPENROUTER_API_KEY=your_openrouter_key_here
TAVILY_API_KEY=your_tavily_key_here
BOT_NAME=My Bot
BOT_CREATOR=your name
```

### 4. Run

**Development (polling mode):**
```bash
npm run dev
```

**Production (Vercel serverless):**
```bash
npm i -g vercel
vercel --prod
```

Then set your webhook:
```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<your-vercel-url>.vercel.app/api/webhook"
```

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/help` | List all commands |
| `/clear` | Clear conversation history |
| `/model` | Show current AI model |
| `/status` | Bot status & uptime |
| `/weather [city]` | Weather lookup |
| `/search [query]` | Web search (Tavily + DDG) |
| `/wiki [query]` | Wikipedia lookup |
| `/remind [time] [msg]` | Set reminder (`30m`, `1h`, `2d`) |
| `/translate [lang] [text]` | Translate text |

## Architecture

```
telegram-chatbot/
├── api/
│   └── webhook.js          # Vercel serverless entry
├── src/
│   ├── bot.js              # Bot setup (polling mode)
│   ├── chat.js             # AI chat with model fallback
│   ├── memory.js           # JSON conversation memory
│   ├── utils.js            # Helpers (sanitize, validate, parse)
│   └── commands/
│       ├── weather.js      # wttr.in weather API
│       ├── search.js       # Tavily + DuckDuckGo search
│       ├── remind.js       # Timed reminders
│       ├── translate.js    # MyMemory translation
│       └── wiki.js         # Wikipedia REST API
├── data/
│   └── .gitkeep            # Memory storage (gitignored)
├── .env.example            # Config template (no secrets)
├── .gitignore
├── package.json
├── vercel.json             # Vercel deployment config
└── README.md
```

## Security

- ✅ All inputs validated and sanitized
- ✅ API keys stored in environment variables only
- ✅ Rate limiting (20 messages/user/hour)
- ✅ No secrets in code or git history
- ✅ Markdown escaping for Telegram API safety
- ✅ Graceful error handling

## AI Models

Default: `nvidia/nemotron-3-super-120b-a12b:free` with auto-fallback to `step-3.5-flash:free`.

Change in `src/chat.js` — any [OpenRouter model](https://openrouter.ai/models) works.

## Deploy Options

| Platform | How | Cost |
|----------|-----|------|
| **Vercel** | `vercel --prod` | Free (Hobby plan) |
| **Railway** | Connect GitHub repo | Free tier available |
| **Local** | `npm run dev` | Free |

## License

MIT
