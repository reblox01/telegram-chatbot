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
git clone https://github.com/reblox01/telegram-chatbot.git
cd telegram-chatbot
npm install
```

### 2. Get API Keys

| Key | Where | Free Tier | Required |
|-----|-------|-----------|----------|
| **Bot Token** | [@BotFather](https://t.me/BotFather) → `/newbot` | Free forever | ✅ Yes |
| **OpenRouter** | [openrouter.ai](https://openrouter.ai) → API Keys | 50+ free models | ✅ Yes |
| **Tavily** (optional) | [tavily.com](https://tavily.com) → API Key | 1000/month free | ❌ No |
| **Supabase** (optional) | [supabase.com](https://supabase.com) → New Project | 500MB free | ❌ No (local file fallback) |

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
| `/weather [city] | Weather lookup |
| `/search [query]` | Web search (Tavily + DDG) |
| `/wiki [query]` | Wikipedia lookup |
| `/remind [time] [msg]` | Set reminder (`30m`, `1h`, `2d`) |
| `/translate [lang] [text]` | Translate text |

## Memory: Local vs Hosted Database

The bot remembers conversations so users can have ongoing chats. But **where** that memory is stored matters.

### Option A: Local File (default)

When no `SUPABASE_URL` is set, the bot stores conversations in `data/memory.json` on disk.

| Pros | Cons |
|------|------|
| Zero setup — works out of the box | **Lost on cold starts** (Vercel, Railway) |
| Free — no external service needed | Memory resets every time the serverless function restarts |
| Great for local development | Only works on persistent servers (VPS, local) |

**Good for:** Testing locally, running on a VPS, or if you don't care about memory persistence.

### Option B: Supabase (recommended for production)

When `SUPABASE_URL` and `SUPABASE_KEY` are set, conversations are stored in a PostgreSQL database via Supabase.

| Pros | Cons |
|------|------|
| **Persistent** — survives restarts, deploys, cold starts | 5 min setup (free signup + SQL) |
| Works on Vercel, Railway, anywhere | Tied to Supabase's free tier (500MB, very generous) |
| 500MB free — enough for thousands of users | |
| PostgreSQL — battle-tested, won't disappear | |

**Good for:** Production deployments, Vercel, any serverless platform, or when you want memory to actually work.

### Setting Up Supabase (5 minutes)

1. **Create account** at [supabase.com](https://supabase.com) (free, no credit card)
2. **Create a new project** — pick any name, any region
3. **Run the SQL setup:**
   - Go to **SQL Editor** in the dashboard
   - Click **New Query**
   - Paste the contents of [`supabase-setup.sql`](./supabase-setup.sql)
   - Click **Run**
4. **Get your credentials:**
   - Go to **Settings → API**
   - Copy **Project URL** (looks like `https://xxxxx.supabase.co`)
   - Copy **anon/public** key (starts with `eyJ...`)
5. **Add to `.env`:**
   ```env
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5...
   ```

Done. The bot will automatically detect Supabase and use it instead of local files.

**If you skip this:** The bot still works, but conversation memory resets on every serverless cold start (usually every few minutes on Vercel).

## Architecture

```
telegram-chatbot/
├── api/
│   └── webhook.js          # Vercel serverless entry
├── src/
│   ├── bot.js              # Bot setup (polling mode)
│   ├── chat.js             # AI chat with model fallback
│   ├── memory.js           # Memory: local file OR Supabase
│   ├── supabase.js         # Supabase REST client (zero dependencies)
│   ├── utils.js            # Helpers (sanitize, validate, parse)
│   └── commands/
│       ├── weather.js      # wttr.in weather API
│       ├── search.js       # Tavily + DuckDuckGo search
│       ├── remind.js       # Timed reminders
│       ├── translate.js    # MyMemory translation
│       └── wiki.js         # Wikipedia REST API
├── data/
│   └── memory.json         # Local memory (gitignored)
├── supabase-setup.sql      # SQL to create Supabase tables
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
| **VPS** | `npm run dev` + pm2 | Depends on provider |

## License

MIT
