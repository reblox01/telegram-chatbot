const fs = require('fs');
const path = require('path');

// ── Configuration ──
const USE_SUPABASE = !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY);
const MAX_CONTEXT = 20; // max message pairs to remember
const MAX_MSG_LENGTH = 4000;

// ── Local Storage ──
const DATA_DIR = path.join(__dirname, '..', 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');

function localLoad() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[Memory] Failed to load:', err.message);
  }
  return {};
}

function localSave(store) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error('[Memory] Failed to save:', err.message);
  }
}

// ── Memory Class ──
class Memory {
  constructor() {
    this.store = {};
    this.supabase = null;
    this.backend = USE_SUPABASE ? 'supabase' : 'local';

    if (USE_SUPABASE) {
      const { SupabaseStore } = require('./supabase');
      this.supabase = new SupabaseStore(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
      console.log('[Memory] Using Supabase backend');
    } else {
      this.store = localLoad();
      console.log('[Memory] Using local file backend');
    }
  }

  // Ensure user exists in store
  ensureUser(userId) {
    const key = String(userId);
    if (!this.store[key]) {
      this.store[key] = { messages: [], created: Date.now() };
    }
    return key;
  }

  async addMessage(userId, role, content) {
    const key = String(userId);
    const message = {
      role,
      content: String(content).slice(0, MAX_MSG_LENGTH),
      ts: Date.now(),
    };

    if (this.backend === 'supabase') {
      // Get current messages, append, save back
      const current = await this.supabase.get(key);
      current.push(message);
      // Keep last MAX_CONTEXT * 2 messages
      const trimmed = current.slice(-MAX_CONTEXT * 2);
      await this.supabase.save(key, trimmed);
    } else {
      this.ensureUser(key);
      this.store[key].messages.push(message);
      if (this.store[key].messages.length > MAX_CONTEXT * 2) {
        this.store[key].messages = this.store[key].messages.slice(-MAX_CONTEXT * 2);
      }
      localSave(this.store);
    }
  }

  async getMessages(userId, maxPairs = MAX_CONTEXT) {
    const key = String(userId);

    if (this.backend === 'supabase') {
      const msgs = await this.supabase.get(key);
      return msgs.slice(-maxPairs * 2).map(m => ({ role: m.role, content: m.content }));
    } else {
      if (!this.store[key]) return [];
      const msgs = this.store[key].messages;
      return msgs.slice(-maxPairs * 2).map(m => ({ role: m.role, content: m.content }));
    }
  }

  async clear(userId) {
    const key = String(userId);

    if (this.backend === 'supabase') {
      await this.supabase.clear(key);
    } else {
      if (this.store[key]) {
        this.store[key].messages = [];
        localSave(this.store);
      }
    }
  }

  async getMessageCount(userId) {
    const key = String(userId);

    if (this.backend === 'supabase') {
      const msgs = await this.supabase.get(key);
      return msgs.length;
    } else {
      return this.store[key]?.messages?.length || 0;
    }
  }
}

module.exports = Memory;
