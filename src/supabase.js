// Supabase REST API client (no npm dependency needed)
// Uses the PostgREST endpoint that Supabase provides

const https = require('https');

class SupabaseStore {
  constructor(url, key) {
    this.url = url.replace(/\/$/, '');
    this.key = key;
    this.table = 'bot_memory';
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
          'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal',
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

  async get(chatId) {
    try {
      const rows = await this.request('GET', `/${this.table}?chat_id=eq.${chatId}&select=messages`);
      if (rows && rows.length > 0) return rows[0].messages || [];
      return [];
    } catch (err) {
      console.error('[Supabase] get error:', err.message);
      return [];
    }
  }

  async save(chatId, messages) {
    try {
      // Upsert: insert or update
      await this.request('POST', `/${this.table}?on_conflict=chat_id`, {
        chat_id: String(chatId),
        messages: messages,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Supabase] save error:', err.message);
    }
  }

  async clear(chatId) {
    try {
      await this.request('PATCH', `/${this.table}?chat_id=eq.${chatId}`, {
        messages: [],
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Supabase] clear error:', err.message);
    }
  }
}

module.exports = { SupabaseStore };
