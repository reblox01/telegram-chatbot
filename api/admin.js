const supabase = require('../src/memory')._supabase || null;

// ── Auth: Telegram Login Widget ──
async function telegramLoginAuth(req) {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) return null;

  // Check cookie first
  const cookies = req.headers.cookie || '';
  const sessionMatch = cookies.match(/admin_session=([^;]+)/);
  if (sessionMatch) {
    try {
      const session = JSON.parse(Buffer.from(sessionMatch[1], 'base64').toString());
      if (session.exp > Date.now() && String(session.id) === String(process.env.ADMIN_USER_ID)) {
        return session;
      }
    } catch {}
  }

  // Check Telegram Login Widget callback
  const hash = req.query?.hash;
  if (!hash) return null;

  const crypto = require('crypto');
  const params = { ...req.query };
  delete params.hash;

  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('\n');
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(sorted).digest('hex');

  if (hmac !== hash) return null;

  // Check auth_date is recent (within 24h)
  const authDate = parseInt(params.auth_date);
  if (Date.now() / 1000 - authDate > 86400) return null;

  // Verify this is the admin
  if (String(params.id) !== String(process.env.ADMIN_USER_ID)) return null;

  return {
    id: params.id,
    first_name: params.first_name,
    username: params.username,
    exp: Date.now() + 86400000, // 24h session
  };
}

// ── Supabase helpers ──
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

function supaHeaders() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
  };
}

async function supaQuery(table, params = '') {
  if (!SUPABASE_URL) throw new Error('SUPABASE_URL not set');
  const url = `${SUPABASE_URL}/rest/v1/${table}${params}`;
  const res = await fetch(url, { headers: supaHeaders() });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${res.status}: ${err}`);
  }
  return res.json();
}

async function supaUpsert(table, data) {
  if (!SUPABASE_URL) throw new Error('SUPABASE_URL not set');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: supaHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${res.status}: ${err}`);
  }
  return res.json();
}

async function supaDelete(table, params) {
  if (!SUPABASE_URL) throw new Error('SUPABASE_URL not set');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method: 'DELETE',
    headers: supaHeaders(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${res.status}: ${err}`);
  }
}

// ── Dashboard HTML ──
function dashboardHTML(user) {
  const botName = process.env.BOT_NAME || 'AI Bot';
  const botUsername = process.env.BOT_USERNAME || 'bot';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${botName} Admin</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0d1117; color: #c9d1d9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; }
    .header { background: #161b22; border-bottom: 1px solid #30363d; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 18px; color: #58a6ff; }
    .header .user { font-size: 13px; color: #8b949e; }
    .container { max-width: 960px; margin: 0 auto; padding: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; }
    .card h3 { font-size: 13px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .card .value { font-size: 32px; font-weight: 700; color: #58a6ff; }
    .card .value.green { color: #3fb950; }
    .card .value.purple { color: #bc8cff; }
    .card .value.orange { color: #f0883e; }
    .section { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 24px; margin-bottom: 24px; }
    .section h2 { font-size: 16px; color: #f0f6fc; margin-bottom: 16px; border-bottom: 1px solid #30363d; padding-bottom: 12px; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 13px; color: #8b949e; margin-bottom: 6px; }
    .form-group input, .form-group select { width: 100%; padding: 8px 12px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; font-size: 14px; }
    .form-group input:focus { outline: none; border-color: #58a6ff; }
    .btn { padding: 8px 16px; border-radius: 6px; border: 1px solid #30363d; background: #21262d; color: #c9d1d9; cursor: pointer; font-size: 13px; transition: all 0.2s; }
    .btn:hover { background: #30363d; }
    .btn-primary { background: #238636; border-color: #238636; color: #fff; }
    .btn-primary:hover { background: #2ea043; }
    .btn-danger { background: #da3633; border-color: #da3633; color: #fff; }
    .btn-danger:hover { background: #f85149; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; }
    .row > * { flex: 1; min-width: 140px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #21262d; font-size: 13px; }
    th { color: #8b949e; font-weight: 600; }
    .badge { padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
    .badge-premium { background: #bc8cff22; color: #bc8cff; }
    .badge-free { background: #8b949e22; color: #8b949e; }
    .toast { position: fixed; bottom: 20px; right: 20px; padding: 12px 20px; border-radius: 8px; font-size: 14px; z-index: 1000; animation: slideIn 0.3s; }
    .toast-success { background: #238636; color: #fff; }
    .toast-error { background: #da3633; color: #fff; }
    @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .tabs { display: flex; gap: 4px; margin-bottom: 24px; }
    .tab { padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; color: #8b949e; background: transparent; border: none; }
    .tab.active { background: #21262d; color: #f0f6fc; }
    .tab:hover { background: #21262d; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .search-box { padding: 8px 12px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; font-size: 14px; width: 100%; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>⚡ ${botName} Admin</h1>
    <div class="user">👤 ${user.first_name || 'Admin'} ${user.username ? '@' + user.username : ''}</div>
  </div>

  <div class="container">
    <!-- Stats -->
    <div class="grid" id="stats">
      <div class="card"><h3>👥 Users Today</h3><div class="value" id="stat-users">-</div></div>
      <div class="card"><h3>💬 Messages</h3><div class="value green" id="stat-messages">-</div></div>
      <div class="card"><h3>🔍 Searches</h3><div class="value orange" id="stat-searches">-</div></div>
      <div class="card"><h3>💎 Premium</h3><div class="value purple" id="stat-premium">-</div></div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab active" onclick="switchTab('config')">⚙️ Config</button>
      <button class="tab" onclick="switchTab('users')">👥 Users</button>
      <button class="tab" onclick="switchTab('premium')">💎 Premium</button>
    </div>

    <!-- Config Tab -->
    <div class="tab-content active" id="tab-config">
      <div class="section">
        <h2>📊 Free Limits</h2>
        <div class="row">
          <div class="form-group">
            <label>Messages / day</label>
            <input type="number" id="cfg-free-msgs" min="-1">
          </div>
          <div class="form-group">
            <label>Searches / day</label>
            <input type="number" id="cfg-free-searches" min="-1">
          </div>
          <div class="form-group">
            <label>Active reminders</label>
            <input type="number" id="cfg-free-reminds" min="-1">
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveConfig('free_limits')">💾 Save Free Limits</button>
      </div>

      <div class="section">
        <h2>💎 Premium Limits</h2>
        <div class="row">
          <div class="form-group">
            <label>Messages / day (-1 = unlimited)</label>
            <input type="number" id="cfg-prem-msgs" min="-1">
          </div>
          <div class="form-group">
            <label>Searches / day</label>
            <input type="number" id="cfg-prem-searches" min="-1">
          </div>
          <div class="form-group">
            <label>Active reminders</label>
            <input type="number" id="cfg-prem-reminds" min="-1">
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveConfig('premium_limits')">💾 Save Premium Limits</button>
      </div>

      <div class="section">
        <h2>🤖 Models & Pricing</h2>
        <div class="form-group">
          <label>Free Model</label>
          <input type="text" id="cfg-free-model">
        </div>
        <div class="form-group">
          <label>Premium Models (comma-separated, first = primary)</label>
          <input type="text" id="cfg-prem-models">
        </div>
        <div class="form-group">
          <label>Premium Price (Telegram Stars)</label>
          <input type="number" id="cfg-prem-price" min="1">
        </div>
        <button class="btn btn-primary" onclick="saveAllConfig()">💾 Save All Settings</button>
      </div>
    </div>

    <!-- Users Tab -->
    <div class="tab-content" id="tab-users">
      <div class="section">
        <h2>👥 Usage Today</h2>
        <input type="text" class="search-box" placeholder="Search by chat ID..." oninput="filterUsers(this.value)">
        <table>
          <thead><tr><th>Chat ID</th><th>Messages</th><th>Searches</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="users-table"></tbody>
        </table>
      </div>
    </div>

    <!-- Premium Tab -->
    <div class="tab-content" id="tab-premium">
      <div class="section">
        <h2>💎 Premium Users</h2>
        <div class="row" style="margin-bottom:16px">
          <div class="form-group">
            <label>Grant Premium to Chat ID</label>
            <input type="text" id="grant-id" placeholder="e.g. 1861463350">
          </div>
          <div class="form-group">
            <label>Duration (days)</label>
            <input type="number" id="grant-days" value="30" min="1">
          </div>
        </div>
        <button class="btn btn-primary" onclick="grantPremium()">✨ Grant Premium</button>
        <hr style="border-color:#30363d;margin:20px 0">
        <table>
          <thead><tr><th>Chat ID</th><th>Activated</th><th>Expires</th><th>Actions</th></tr></thead>
          <tbody id="premium-table"></tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    const API = '/admin/api';

    async function api(action, data = {}) {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data }),
      });
      return res.json();
    }

    function toast(msg, type = 'success') {
      const t = document.createElement('div');
      t.className = 'toast toast-' + type;
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 3000);
    }

    function switchTab(name) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.querySelector('.tab-content#tab-' + name).classList.add('active');
      event.target.classList.add('active');
      if (name === 'users') loadUsers();
      if (name === 'premium') loadPremium();
    }

    // ── Load Stats ──
    async function loadStats() {
      const d = await api('stats');
      if (!d.ok) return;
      document.getElementById('stat-users').textContent = d.stats.users_today;
      document.getElementById('stat-messages').textContent = d.stats.messages_today;
      document.getElementById('stat-searches').textContent = d.stats.searches_today;
      document.getElementById('stat-premium').textContent = d.stats.premium_count;
    }

    // ── Load Config ──
    async function loadConfig() {
      const d = await api('get_config');
      if (!d.ok) return;
      const c = d.config;
      document.getElementById('cfg-free-msgs').value = c.free_limits?.messagesPerDay ?? 20;
      document.getElementById('cfg-free-searches').value = c.free_limits?.searchesPerDay ?? 5;
      document.getElementById('cfg-free-reminds').value = c.free_limits?.remindersActive ?? 3;
      document.getElementById('cfg-prem-msgs').value = c.premium_limits?.messagesPerDay ?? -1;
      document.getElementById('cfg-prem-searches').value = c.premium_limits?.searchesPerDay ?? -1;
      document.getElementById('cfg-prem-reminds').value = c.premium_limits?.remindersActive ?? -1;
      document.getElementById('cfg-free-model').value = c.free_model || 'stepfun/step-3.5-flash:free';
      document.getElementById('cfg-prem-models').value = (c.premium_models || []).join(', ');
      document.getElementById('cfg-prem-price').value = c.premium_price || 100;
    }

    // ── Save Config ──
    async function saveConfig(key) {
      let value;
      if (key === 'free_limits') {
        value = {
          messagesPerDay: parseInt(document.getElementById('cfg-free-msgs').value),
          searchesPerDay: parseInt(document.getElementById('cfg-free-searches').value),
          remindersActive: parseInt(document.getElementById('cfg-free-reminds').value),
        };
      } else if (key === 'premium_limits') {
        value = {
          messagesPerDay: parseInt(document.getElementById('cfg-prem-msgs').value),
          searchesPerDay: parseInt(document.getElementById('cfg-prem-searches').value),
          remindersActive: parseInt(document.getElementById('cfg-prem-reminds').value),
        };
      }
      const d = await api('set_config', { key, value });
      toast(d.ok ? 'Saved!' : d.error, d.ok ? 'success' : 'error');
    }

    async function saveAllConfig() {
      const configs = [
        { key: 'free_limits', value: {
          messagesPerDay: parseInt(document.getElementById('cfg-free-msgs').value),
          searchesPerDay: parseInt(document.getElementById('cfg-free-searches').value),
          remindersActive: parseInt(document.getElementById('cfg-free-reminds').value),
        }},
        { key: 'premium_limits', value: {
          messagesPerDay: parseInt(document.getElementById('cfg-prem-msgs').value),
          searchesPerDay: parseInt(document.getElementById('cfg-prem-searches').value),
          remindersActive: parseInt(document.getElementById('cfg-prem-reminds').value),
        }},
        { key: 'free_model', value: document.getElementById('cfg-free-model').value },
        { key: 'premium_models', value: document.getElementById('cfg-prem-models').value.split(',').map(s => s.trim()).filter(Boolean) },
        { key: 'premium_price', value: parseInt(document.getElementById('cfg-prem-price').value) },
      ];
      for (const c of configs) {
        const d = await api('set_config', c);
        if (!d.ok) { toast(d.error, 'error'); return; }
      }
      toast('All settings saved!');
    }

    // ── Users ──
    let allUsers = [];
    async function loadUsers() {
      const d = await api('get_users');
      if (!d.ok) return;
      allUsers = d.users;
      renderUsers(allUsers);
    }

    function filterUsers(q) {
      renderUsers(allUsers.filter(u => u.chat_id.includes(q)));
    }

    function renderUsers(users) {
      const tbody = document.getElementById('users-table');
      tbody.innerHTML = users.map(u =>
        '<tr><td>' + u.chat_id + '</td><td>' + u.message_count + '</td><td>' + u.search_count +
        '</td><td>' + (u.is_premium ? '<span class="badge badge-premium">Premium</span>' : '<span class="badge badge-free">Free</span>') +
        '</td><td><button class="btn" onclick="resetUsage(\\'' + u.chat_id + '\\')">Reset</button></td></tr>'
      ).join('') || '<tr><td colspan="5" style="text-align:center;color:#8b949e">No users yet</td></tr>';
    }

    async function resetUsage(chatId) {
      if (!confirm('Reset usage for ' + chatId + '?')) return;
      const d = await api('reset_usage', { chat_id: chatId });
      toast(d.ok ? 'Reset!' : d.error, d.ok ? 'success' : 'error');
      if (d.ok) loadUsers();
    }

    // ── Premium ──
    let allPremium = [];
    async function loadPremium() {
      const d = await api('get_premium_users');
      if (!d.ok) return;
      allPremium = d.users;
      const tbody = document.getElementById('premium-table');
      tbody.innerHTML = allPremium.map(u =>
        '<tr><td>' + u.chat_id + '</td><td>' + new Date(u.activated_at).toLocaleDateString() +
        '</td><td>' + (u.expires_at ? new Date(u.expires_at).toLocaleDateString() : 'Never') +
        '</td><td><button class="btn btn-danger" onclick="revokePremium(\\'' + u.chat_id + '\\')">Revoke</button></td></tr>'
      ).join('') || '<tr><td colspan="4" style="text-align:center;color:#8b949e">No premium users</td></tr>';
    }

    async function grantPremium() {
      const chatId = document.getElementById('grant-id').value.trim();
      const days = parseInt(document.getElementById('grant-days').value) || 30;
      if (!chatId) return toast('Enter a chat ID', 'error');
      const d = await api('grant_premium', { chat_id: chatId, days });
      toast(d.ok ? 'Premium granted!' : d.error, d.ok ? 'success' : 'error');
      if (d.ok) { loadPremium(); loadStats(); }
    }

    async function revokePremium(chatId) {
      if (!confirm('Revoke premium for ' + chatId + '?')) return;
      const d = await api('revoke_premium', { chat_id: chatId });
      toast(d.ok ? 'Revoked!' : d.error, d.ok ? 'success' : 'error');
      if (d.ok) { loadPremium(); loadStats(); }
    }

    // ── Init ──
    loadStats();
    loadConfig();
    setInterval(loadStats, 30000);
  </script>
</body>
</html>`;
}

// ── Telegram Login Page ──
function loginPageHTML(botUsername) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Admin Login</title>
  <style>
    body { background: #0d1117; color: #c9d1d9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .login-box { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 40px; text-align: center; max-width: 400px; }
    .login-box h1 { font-size: 24px; color: #58a6ff; margin-bottom: 8px; }
    .login-box p { color: #8b949e; margin-bottom: 24px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>⚡ Admin Login</h1>
    <p>Sign in with your Telegram account to access the dashboard.</p>
    <script async src="https://telegram.org/js/telegram-widget.js?22"
      data-telegram-login="${botUsername}"
      data-size="large"
      data-onauth="onTelegramAuth(user)"
      data-request-access="write">
    </script>
    <script>
      function onTelegramAuth(user) {
        // Redirect with Telegram login params — server validates hash
        const params = new URLSearchParams(user);
        window.location.href = '/admin?' + params.toString();
      }
    </script>
  </div>
</body>
</html>`;
}

// ── API Handler ──
async function handleAPI(req, res) {
  const body = req.body;
  const action = body?.action;

  try {
    switch (action) {
      case 'stats': {
        const today = new Date().toISOString().split('T')[0];
        const usage = await supaQuery('bot_usage', `?date=eq.${today}`);
        const premium = await supaQuery('bot_premium', '?is_premium=eq.true');
        res.json({
          ok: true,
          stats: {
            users_today: usage.length,
            messages_today: usage.reduce((s, u) => s + (u.message_count || 0), 0),
            searches_today: usage.reduce((s, u) => s + (u.search_count || 0), 0),
            premium_count: premium.length,
          }
        });
        break;
      }

      case 'get_config': {
        const configs = await supaQuery('bot_config');
        const config = {};
        for (const c of configs) {
          config[c.key] = c.value;
        }
        res.json({ ok: true, config });
        break;
      }

      case 'set_config': {
        const { key, value } = body;
        if (!key) return res.json({ ok: false, error: 'Missing key' });
        await supaUpsert('bot_config', { key, value, updated_at: new Date().toISOString() });
        res.json({ ok: true });
        break;
      }

      case 'get_users': {
        const today = new Date().toISOString().split('T')[0];
        const usage = await supaQuery('bot_usage', `?date=eq.${today}&order=chat_id`);
        const premium = await supaQuery('bot_premium');
        const premMap = {};
        premium.forEach(p => premMap[p.chat_id] = p);
        const users = usage.map(u => ({
          ...u,
          is_premium: !!premMap[u.chat_id]?.is_premium,
        }));
        res.json({ ok: true, users });
        break;
      }

      case 'reset_usage': {
        const today = new Date().toISOString().split('T')[0];
        await supaDelete('bot_usage', `?chat_id=eq.${body.chat_id}&date=eq.${today}`);
        res.json({ ok: true });
        break;
      }

      case 'grant_premium': {
        const { chat_id, days } = body;
        if (!chat_id) return res.json({ ok: false, error: 'Missing chat_id' });
        const expires = new Date(Date.now() + (days || 30) * 86400000).toISOString();
        await supaUpsert('bot_premium', {
          chat_id: String(chat_id),
          is_premium: true,
          activated_at: new Date().toISOString(),
          expires_at: expires,
          updated_at: new Date().toISOString(),
        });
        res.json({ ok: true });
        break;
      }

      case 'revoke_premium': {
        await supaUpsert('bot_premium', {
          chat_id: String(body.chat_id),
          is_premium: false,
          updated_at: new Date().toISOString(),
        });
        res.json({ ok: true });
        break;
      }

      case 'get_premium_users': {
        const users = await supaQuery('bot_premium', '?is_premium=eq.true&order=activated_at.desc');
        res.json({ ok: true, users });
        break;
      }

      default:
        res.json({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    console.error('[Admin API]', err.message);
    res.json({ ok: false, error: err.message });
  }
}

// ── Main Handler ──
module.exports = async (req, res) => {
  const botUsername = process.env.BOT_USERNAME || 'bot';

  // Handle API calls
  if (req.method === 'POST') {
    // Check auth via cookie
    const user = await telegramLoginAuth(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    return handleAPI(req, res);
  }

  // Handle Telegram Login Widget callback
  if (req.query?.hash) {
    const user = await telegramLoginAuth(req);
    if (user) {
      const session = Buffer.from(JSON.stringify(user)).toString('base64');
      res.writeHead(302, {
        'Location': '/admin',
        'Set-Cookie': `admin_session=${session}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax`,
      });
      return res.end();
    }
  }

  // Check if already authenticated
  const user = await telegramLoginAuth(req);
  if (user) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(dashboardHTML(user));
  }

  // Show login page
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(loginPageHTML(botUsername));
};
