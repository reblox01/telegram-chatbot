# 🤖 AI Telegram Chatbot

A full-featured AI-powered Telegram chatbot with conversation memory, utility commands, and more.

## Features

- 💬 **AI Chat** — Powered by OpenRouter (DeepSeek R1 free tier)
- 🧠 **Conversation Memory** — Remembers last 20 messages per user
- 🌤️ **Weather** — Real-time weather via wttr.in
- 🔍 **Search** — Web search via DuckDuckGo
- ⏰ **Reminders** — Set timed reminders
- 🌐 **Translate** — Multi-language translation
- 📄 **Summarize** — Extract and summarize webpages
- 🛡️ **Rate Limiting** — 20 messages/user/hour
- 🔒 **OWASP Security** — Input validation, sanitization, env vars

## Quick Start

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd telegram-chatbot
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```
BOT_TOKEN=your_telegram_bot_token_here
OPENROUTER_API_KEY=your_openrouter_api_key_here
NODE_ENV=development
```

**Get your keys:**
- **Bot Token:** Message [@BotFather](https://t.me/BotFather) on Telegram → `/newbot`
- **OpenRouter Key:** Sign up at [openrouter.ai](https://openrouter.ai) → API Keys

### 3. Run Locally (Polling)

```bash
npm run dev
```

Your bot is now running! Open Telegram and send `/start` to your bot.

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message & instructions |
| `/help` | List all commands |
| `/clear` | Clear conversation history |
| `/model` | Show current AI model |
| `/status` | Bot status & uptime |
| `/weather [city]` | Weather lookup |
| `/search [query]` | Quick web search |
| `/remind [time] [msg]` | Set a reminder (e.g., `30m`, `1h`, `2d`) |
| `/translate [lang] [text]` | Translate text (e.g., `/translate fr hello`) |
| `/summarize [url]` | Summarize a webpage |

## Deploy to Vercel (Serverless)

### 1. Install Vercel CLI

```bash
npm i -g vercel
```

### 2. Deploy

```bash
vercel --prod
```

### 3. Set Environment Variables

In your Vercel dashboard → Settings → Environment Variables:
- `BOT_TOKEN` — Your Telegram bot token
- `OPENROUTER_API_KEY` — Your OpenRouter API key

### 4. Set Webhook

After deployment, set your bot's webhook URL:

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<your-vercel-url>.vercel.app/api/webhook"
```

Verify it's working:
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

## Deploy to Railway

1. Create a new project on [Railway](https://railway.app)
2. Connect your GitHub repo
3. Set environment variables: `BOT_TOKEN`, `OPENROUTER_API_KEY`
4. Set start command: `node src/bot.js`
5. Set webhook URL to your Railway domain

## Architecture

```
telegram-chatbot/
├── api/
│   └── webhook.js        # Vercel serverless function
├── src/
│   ├── bot.js            # Bot setup + commands (polling mode)
│   ├── chat.js           # AI chat logic + OpenRouter API
│   ├── memory.js         # Conversation memory (JSON storage)
│   ├── commands/
│   │   ├── weather.js    # Weather via wttr.in
│   │   ├── search.js     # Web search via DuckDuckGo
│   │   ├── remind.js     # Reminder system
│   │   ├── translate.js  # Translation via MyMemory API
│   │   └── summarize.js  # Webpage summarizer
│   └── utils.js          # Helpers (sanitize, validate, parse)
├── data/
│   └── memory.json       # Conversation storage (gitignored)
├── package.json
├── vercel.json           # Vercel deployment config
├── .env.example          # Template (no secrets)
├── .gitignore
└── README.md
```

## Security

- ✅ All inputs validated and sanitized
- ✅ Bot token stored in environment variables
- ✅ Rate limiting (20 messages/user/hour)
- ✅ Error handling with graceful failures
- ✅ No secrets in code or git
- ✅ Markdown escaping for Telegram API

## AI Models

Default model: `deepseek/deepseek-r1:free` (free tier on OpenRouter)

Other free models to try:
- `qwen/qwen-2.5-72b-instruct:free`
- `google/gemma-2-9b-it:free`

Change the `MODEL` constant in `src/chat.js`.

## License

MIT
