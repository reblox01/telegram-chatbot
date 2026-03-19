const https = require('https');

// ── Config ──
const USE_SUPABASE = !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY);

// ── Limits ──
const LIMITS = {
  free: {
    messagesPerDay: 20,
    searchesPerDay: 5,
    remindersActive: 3,
  },
  premium: {
    messagesPerDay: -1, // unlimited
    searchesPerDay: -1,
    remindersActive: -1,
  }
};

// ── Telegram Stars Price (in XTR) ──
const PREMIUM_PRICE = 100; // 100 Telegram Stars (~$2)

// ── Supabase REST client ──
class SupabaseClient {
  constructor(url, key) {
    this.url = url.replace(/\/$/, '');
    this.key = key;
  }

  async request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.url}/rest/v1${path}`);
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          'apikey': this.key,
          'Authorization': `Bearer ${this.key}`,
          'Content-Type': 'application/json',
          'Prefer': method === 'POST' ? 'return=representation,resolution=merge-duplicates' : 'return=minimal',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 400) {
            return reject(new Error(`Supabase ${res.statusCode}: ${data}`));
          }
          try {
            resolve(data ? JSON.parse(data) : null);
          } catch {
            resolve(data);
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
}

// ── Premium Manager ──
class PremiumManager {
  constructor() {
    this.supabase = null;
    this.localUsage = {}; // fallback for no-Supabase
    this.localPremium = {}; // fallback for no-Supabase

    if (USE_SUPABASE) {
      this.supabase = new SupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
      console.log('[Premium] Using Supabase backend');
    } else {
      console.log('[Premium] Using local backend (no Supabase)');
    }
  }

  // Get today's date string
  today() {
    return new Date().toISOString().split('T')[0];
  }

  // Check if user is premium
  async isPremium(userId) {
    const key = String(userId);

    if (this.supabase) {
      try {
        const rows = await this.supabase.request('GET',
          `/bot_premium?chat_id=eq.${key}&select=is_premium,expires_at`);
        if (rows && rows.length > 0) {
          const user = rows[0];
          if (!user.is_premium) return false;
          if (user.expires_at && new Date(user.expires_at) < new Date()) return false;
          return true;
        }
        return false;
      } catch (err) {
        console.error('[Premium] isPremium error:', err.message);
        return false;
      }
    }

    return this.localPremium[key]?.is_premium || false;
  }

  // Get today's usage for a user
  async getUsage(userId) {
    const key = String(userId);
    const today = this.today();

    if (this.supabase) {
      try {
        const rows = await this.supabase.request('GET',
          `/bot_usage?chat_id=eq.${key}&date=eq.${today}&select=message_count,search_count,remind_count`);
        if (rows && rows.length > 0) return rows[0];
        return { message_count: 0, search_count: 0, remind_count: 0 };
      } catch (err) {
        console.error('[Premium] getUsage error:', err.message);
        return { message_count: 0, search_count: 0, remind_count: 0 };
      }
    }

    const userUsage = this.localUsage[key];
    if (userUsage && userUsage.date === today) {
      return userUsage;
    }
    return { message_count: 0, search_count: 0, remind_count: 0 };
  }

  // Increment usage counter
  async incrementUsage(userId, type = 'message') {
    const key = String(userId);
    const today = this.today();

    if (this.supabase) {
      try {
        const current = await this.getUsage(key);
        const update = { chat_id: key, date: today, updated_at: new Date().toISOString() };

        if (type === 'message') update.message_count = (current.message_count || 0) + 1;
        else if (type === 'search') update.search_count = (current.search_count || 0) + 1;
        else if (type === 'remind') update.remind_count = (current.remind_count || 0) + 1;

        // Also increment message count for non-message types
        if (type !== 'message') {
          update.message_count = (current.message_count || 0) + 1;
        }

        await this.supabase.request('POST', `/bot_usage?on_conflict=chat_id,date`, update);
      } catch (err) {
        console.error('[Premium] incrementUsage error:', err.message);
      }
    } else {
      if (!this.localUsage[key] || this.localUsage[key].date !== today) {
        this.localUsage[key] = { chat_id: key, date: today, message_count: 0, search_count: 0, remind_count: 0 };
      }
      if (type === 'message') this.localUsage[key].message_count++;
      else if (type === 'search') this.localUsage[key].search_count++;
      else if (type === 'remind') this.localUsage[key].remind_count++;
      if (type !== 'message') this.localUsage[key].message_count++;
    }
  }

  // Check if user can perform action (returns { allowed: bool, remaining: number })
  async canUse(userId, type = 'message') {
    const premium = await this.isPremium(userId);
    const limits = premium ? LIMITS.premium : LIMITS.free;
    const usage = await this.getUsage(userId);

    let limit, current;
    if (type === 'message') {
      limit = limits.messagesPerDay;
      current = usage.message_count || 0;
    } else if (type === 'search') {
      limit = limits.searchesPerDay;
      current = usage.search_count || 0;
    } else if (type === 'remind') {
      limit = limits.remindersActive;
      current = usage.remind_count || 0;
    }

    // -1 means unlimited
    if (limit === -1) return { allowed: true, remaining: -1, premium: true };

    const remaining = Math.max(0, limit - current);
    return { allowed: remaining > 0, remaining, premium, limit, current };
  }

  // Activate premium for a user
  async activatePremium(userId, durationDays = 30) {
    const key = String(userId);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    if (this.supabase) {
      try {
        await this.supabase.request('POST', `/bot_premium?on_conflict=chat_id`, {
          chat_id: key,
          is_premium: true,
          activated_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        });
        console.log(`[Premium] Activated for user ${key} until ${expiresAt.toISOString()}`);
        return true;
      } catch (err) {
        console.error('[Premium] activatePremium error:', err.message);
        return false;
      }
    }

    this.localPremium[key] = {
      is_premium: true,
      activated_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    };
    return true;
  }

  // Get premium status info
  async getPremiumInfo(userId) {
    const premium = await this.isPremium(userId);
    const usage = await this.getUsage(userId);
    const limits = premium ? LIMITS.premium : LIMITS.free;

    return {
      isPremium: premium,
      usage: {
        messages: usage.message_count || 0,
        searches: usage.search_count || 0,
        reminders: usage.remind_count || 0,
      },
      limits: {
        messages: limits.messagesPerDay,
        searches: limits.searchesPerDay,
        reminders: limits.remindersActive,
      },
    };
  }
}

module.exports = { PremiumManager, LIMITS, PREMIUM_PRICE };
