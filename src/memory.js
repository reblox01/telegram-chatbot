const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');

class Memory {
  constructor() {
    this.store = {};
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(MEMORY_FILE)) {
        this.store = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
      }
    } catch (err) {
      console.error('[Memory] Failed to load:', err.message);
      this.store = {};
    }
  }

  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(MEMORY_FILE, JSON.stringify(this.store, null, 2));
    } catch (err) {
      console.error('[Memory] Failed to save:', err.message);
    }
  }

  ensureUser(userId) {
    const key = String(userId);
    if (!this.store[key]) {
      this.store[key] = { messages: [], created: Date.now() };
    }
    return key;
  }

  addMessage(userId, role, content) {
    const key = this.ensureUser(userId);
    this.store[key].messages.push({ role, content: String(content).slice(0, 4000), ts: Date.now() });
    
    // Keep last 40 messages (20 exchanges)
    if (this.store[key].messages.length > 40) {
      this.store[key].messages = this.store[key].messages.slice(-40);
    }
    
    this.save();
  }

  getMessages(userId, maxPairs = 20) {
    const key = String(userId);
    if (!this.store[key]) return [];
    
    const msgs = this.store[key].messages;
    return msgs.slice(-maxPairs * 2).map(m => ({ role: m.role, content: m.content }));
  }

  clear(userId) {
    const key = String(userId);
    if (this.store[key]) {
      this.store[key].messages = [];
      this.save();
    }
  }

  getMessageCount(userId) {
    const key = String(userId);
    return this.store[key]?.messages?.length || 0;
  }

  setPendingCommand(userId, command) {
    const key = this.ensureUser(userId);
    this.store[key].pendingCommand = command;
    this.save();
  }

  getPendingCommand(userId) {
    const key = String(userId);
    return this.store[key]?.pendingCommand || null;
  }

  clearPendingCommand(userId) {
    const key = String(userId);
    if (this.store[key]) {
      delete this.store[key].pendingCommand;
      this.save();
    }
  }
}

module.exports = Memory;
