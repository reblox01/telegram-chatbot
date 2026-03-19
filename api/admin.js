const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

// ── Supabase helper ──
function supabaseReq(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1${path}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'return=representation,resolution=merge-duplicates' : 'return=minimal',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`Supabase ${res.statusCode}: ${data}`));
        try { resolve(data ? JSON.parse(data) : null); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Auth check ──
function isAdmin(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  // Accept admin user ID as token, or ADMIN_USER_ID from env
  if (!ADMIN_USER_ID) return true; // no admin set = open (dev mode)
  return token === ADMIN_USER_ID;
}

// ── API handlers ──
async function handleAPI(req, res) {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { method } = req;
  const { action } = req.body || {};

  try {
    // GET config
    if (method === 'POST' && action === 'getConfig') {
      const keys = ['free_limits', 'premium_limits', 'premium_price', 'free_model', 'premium_models'];
      const config = {};
      for (const key of keys) {
        try {
          const rows = await supabaseReq('GET', `/bot_config?key=eq.${key}&select=value`);
          if (rows && rows.length > 0) config[key] = rows[0].value;
        } catch (e) {
          console.error(`Config get ${key}:`, e.message);
        }
      }
      return res.json({ ok: true, config });
    }

    // SET config
    if (method === 'POST' && action === 'setConfig') {
      const { key, value } = req.body;
      if (!key) return res.status(400).json({ error: 'Missing key' });

      await supabaseReq('POST', `/bot_config?on_conflict=key`, {
        key,
        value,
        updated_at: new Date().toISOString(),
      });
      return res.json({ ok: true });
    }

    // GET stats
    if (method === 'POST' && action === 'getStats') {
      const today = new Date().toISOString().split('T')[0];

      // Count total users today
      const usageRows = await supabaseReq('GET',
        `/bot_usage?date=eq.${today}&select=chat_id,message_count,search_count`);

      // Count premium users
      const premiumRows = await supabaseReq('GET',
        `/bot_premium?is_premium=eq.true&select=chat_id,expires_at`);

      const activePremium = premiumRows ? premiumRows.filter(p =>
        !p.expires_at || new Date(p.expires_at) > new Date()
      ).length : 0;

      const totalUsersToday = usageRows ? usageRows.length : 0;
      const totalMessages = usageRows ? usageRows.reduce((s, r) => s + (r.message_count || 0), 0) : 0;
      const totalSearches = usageRows ? usageRows.reduce((s, r) => s + (r.search_count || 0), 0) : 0;

      return res.json({
        ok: true,
        stats: {
          usersToday: totalUsersToday,
          messagesToday: totalMessages,
          searchesToday: totalSearches,
          premiumUsers: activePremium,
          date: today,
        }
      });
    }

    // SET premium for user
    if (method === 'POST' && action === 'setPremium') {
      const { chatId, isPremium, days } = req.body;
      if (!chatId) return res.status(400).json({ error: 'Missing chatId' });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (days || 30));

      await supabaseReq('POST', `/bot_premium?on_conflict=chat_id`, {
        chat_id: String(chatId),
        is_premium: isPremium !== false,
        is_premium: isPremium !== false,
        activated_at: new Date().toISOString(),
        expires_at: isPremium !== false ? expiresAt.toISOString() : null,
        updated_at: new Date().toISOString(),
      });
      return res.json({ ok: true });
    }

    // RESET usage for user
    if (method === 'POST' && action === 'resetUsage') {
      const { chatId } = req.body;
      if (!chatId) return res.status(400).json({ error: 'Missing chatId' });
      const today = new Date().toISOString().split('T')[0];

      await supabaseReq('POST', `/bot_usage?on_conflict=chat_id,date`, {
        chat_id: String(chatId),
        date: today,
        message_count: 0,
        search_count: 0,
        remind_count: 0,
        updated_at: new Date().toISOString(),
      });
      return res.json({ ok: true });
    }

    // GET premium users list
    if (method === 'POST' && action === 'getPremiumUsers') {
      const rows = await supabaseReq('GET',
        `/bot_premium?select=chat_id,is_premium,activated_at,expires_at&order=activated_at.desc&limit=50`);
      return res.json({ ok: true, users: rows || [] });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('[Admin] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ── Main handler ──
module.exports = async (req, res) => {
  // API calls
  if (req.method === 'POST') {
    return handleAPI(req, res);
  }

  // Serve admin HTML
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html');
    return res.send(ADMIN_HTML);
  }

  res.status(405).json({ error: 'Method not allowed' });
};

// ── Admin HTML ──
const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🤖 Bot Admin Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0a0a0f;
    color: #e0e0e0;
    min-height: 100vh;
  }
  .header {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    padding: 24px 32px;
    border-bottom: 1px solid #2a2a4a;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .header h1 { font-size: 24px; color: #fff; }
  .header h1 span { color: #7c3aed; }
  .auth-bar {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .auth-bar input {
    background: #1a1a2e;
    border: 1px solid #3a3a5a;
    color: #fff;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 14px;
    width: 200px;
  }
  .auth-bar button {
    background: #7c3aed;
    color: #fff;
    border: none;
    padding: 8px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
  }
  .auth-bar button:hover { background: #6d28d9; }
  .auth-bar .status {
    font-size: 12px;
    color: #888;
    margin-left: 8px;
  }
  .auth-bar .status.connected { color: #22c55e; }

  .container { max-width: 1200px; margin: 0 auto; padding: 24px; }

  /* Stats Cards */
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }
  .stat-card {
    background: linear-gradient(135deg, #1a1a2e 0%, #1e1e3a 100%);
    border: 1px solid #2a2a4a;
    border-radius: 12px;
    padding: 20px;
    text-align: center;
  }
  .stat-card .value {
    font-size: 32px;
    font-weight: 700;
    color: #7c3aed;
    margin-bottom: 4px;
  }
  .stat-card .label {
    font-size: 13px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  /* Cards */
  .card {
    background: linear-gradient(135deg, #1a1a2e 0%, #1e1e3a 100%);
    border: 1px solid #2a2a4a;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
  }
  .card h2 {
    font-size: 18px;
    margin-bottom: 20px;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .card h2 .badge {
    font-size: 11px;
    background: #7c3aed;
    color: #fff;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 500;
  }

  /* Form */
  .form-group {
    margin-bottom: 16px;
  }
  .form-group label {
    display: block;
    font-size: 13px;
    color: #aaa;
    margin-bottom: 6px;
    font-weight: 500;
  }
  .form-group .hint {
    font-size: 11px;
    color: #666;
    margin-top: 2px;
  }
  .row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
  }
  input[type="number"], input[type="text"], select {
    width: 100%;
    background: #0d0d1a;
    border: 1px solid #3a3a5a;
    color: #fff;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 14px;
    transition: border-color 0.2s;
  }
  input:focus, select:focus {
    outline: none;
    border-color: #7c3aed;
  }
  input[type="number"] { text-align: center; font-size: 18px; font-weight: 600; }

  .btn {
    background: #7c3aed;
    color: #fff;
    border: none;
    padding: 10px 24px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.2s;
  }
  .btn:hover { background: #6d28d9; transform: translateY(-1px); }
  .btn-green { background: #22c55e; }
  .btn-green:hover { background: #16a34a; }
  .btn-red { background: #ef4444; }
  .btn-red:hover { background: #dc2626; }
  .btn-sm { padding: 6px 14px; font-size: 12px; }

  .toast {
    position: fixed;
    top: 20px;
    right: 20px;
    background: #22c55e;
    color: #fff;
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: 600;
    transform: translateX(120%);
    transition: transform 0.3s;
    z-index: 1000;
  }
  .toast.show { transform: translateX(0); }
  .toast.error { background: #ef4444; }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  @media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } }

  .model-tag {
    display: inline-block;
    background: #1a1a2e;
    border: 1px solid #3a3a5a;
    padding: 4px 12px;
    border-radius: 16px;
    font-size: 12px;
    margin: 4px;
    color: #a78bfa;
  }

  .section-divider {
    border: none;
    border-top: 1px solid #2a2a4a;
    margin: 24px 0;
  }

  .table-wrap { overflow-x: auto; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th, td {
    padding: 10px 12px;
    text-align: left;
    border-bottom: 1px solid #2a2a4a;
  }
  th { color: #888; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 1px; }
  td { color: #ccc; }
  tr:hover td { background: rgba(124, 58, 237, 0.05); }
</style>
</head>
<body>

<div class="header">
  <h1>🤖 Bot <span>Admin</span> Dashboard</h1>
  <div class="auth-bar">
    <input type="password" id="adminToken" placeholder="Admin User ID">
    <button onclick="saveToken()">Connect</button>
    <span class="status" id="authStatus">Not connected</span>
  </div>
</div>

<div class="container">

  <!-- Stats -->
  <div class="stats" id="stats">
    <div class="stat-card">
      <div class="value" id="statUsers">--</div>
      <div class="label">Users Today</div>
    </div>
    <div class="stat-card">
      <div class="value" id="statMessages">--</div>
      <div class="label">Messages Today</div>
    </div>
    <div class="stat-card">
      <div class="value" id="statSearches">--</div>
      <div class="label">Searches Today</div>
    </div>
    <div class="stat-card">
      <div class="value" id="statPremium">--</div>
      <div class="label">Premium Users</div>
    </div>
  </div>

  <div class="grid-2">

    <!-- Free Tier -->
    <div class="card">
      <h2>🆓 Free Tier Limits</h2>
      <div class="form-group">
        <label>Messages per day</label>
        <input type="number" id="freeMessages" min="1" max="1000" value="20">
        <div class="hint">Max messages a free user can send per day</div>
      </div>
      <div class="form-group">
        <label>Searches per day</label>
        <input type="number" id="freeSearches" min="0" max="100" value="5">
        <div class="hint">Max search queries per day</div>
      </div>
      <div class="form-group">
        <label>Active reminders</label>
        <input type="number" id="freeReminders" min="0" max="50" value="3">
        <div class="hint">Max active reminders at once</div>
      </div>
      <div class="form-group">
        <label>AI Model</label>
        <select id="freeModel">
          <option value="stepfun/step-3.5-flash:free">Step 3.5 Flash (Free)</option>
          <option value="arcee-ai/trinity-large-preview:free">Arcee Trinity (Free)</option>
          <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
          <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
        </select>
        <div class="hint">Model used for free tier users</div>
      </div>
      <button class="btn" onclick="saveFreeLimits()">💾 Save Free Limits</button>
    </div>

    <!-- Premium Tier -->
    <div class="card">
      <h2>💎 Premium Tier <span class="badge">PAID</span></h2>
      <div class="form-group">
        <label>Messages per day (-1 = unlimited)</label>
        <input type="number" id="premiumMessages" min="-1" max="10000" value="-1">
        <div class="hint">Set to -1 for unlimited</div>
      </div>
      <div class="form-group">
        <label>Searches per day</label>
        <input type="number" id="premiumSearches" min="-1" max="1000" value="-1">
      </div>
      <div class="form-group">
        <label>Active reminders</label>
        <input type="number" id="premiumReminders" min="-1" max="100" value="-1">
      </div>
      <div class="form-group">
        <label>Premium Price (Telegram Stars)</label>
        <input type="number" id="premiumPrice" min="1" max="10000" value="100">
        <div class="hint">100 Stars ≈ $2. Price per month.</div>
      </div>
      <div class="form-group">
        <label>AI Models (comma-separated)</label>
        <input type="text" id="premiumModels" value="anthropic/claude-3.5-sonnet,openai/gpt-4o-mini">
        <div class="hint">First = primary, rest = fallbacks</div>
      </div>
      <button class="btn btn-green" onclick="savePremiumLimits()">💾 Save Premium Settings</button>
    </div>

  </div>

  <hr class="section-divider">

  <!-- User Management -->
  <div class="card">
    <h2>👤 User Management</h2>
    <div class="row" style="margin-bottom: 16px;">
      <div class="form-group">
        <label>User ID (Telegram)</label>
        <input type="text" id="manageUserId" placeholder="e.g. 1861463350">
      </div>
      <div class="form-group">
        <label>Premium Duration (days)</label>
        <input type="number" id="premiumDays" value="30" min="1" max="365">
      </div>
    </div>
    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
      <button class="btn btn-green" onclick="grantPremium()">✨ Grant Premium</button>
      <button class="btn btn-red" onclick="revokePremium()">❌ Revoke Premium</button>
      <button class="btn" onclick="resetUsage()">🔄 Reset Usage</button>
    </div>
  </div>

  <!-- Premium Users List -->
  <div class="card">
    <h2>💎 Premium Users <button class="btn btn-sm" onclick="loadPremiumUsers()" style="margin-left: auto;">Refresh</button></h2>
    <div class="table-wrap">
      <table id="premiumTable">
        <thead>
          <tr><th>User ID</th><th>Activated</th><th>Expires</th><th>Actions</th></tr>
        </thead>
        <tbody id="premiumTableBody">
          <tr><td colspan="4" style="color: #666;">Click Refresh to load</td></tr>
        </tbody>
      </table>
    </div>
  </div>

</div>

<div class="toast" id="toast"></div>

<script>
  let ADMIN_TOKEN = localStorage.getItem('adminToken') || '';

  function saveToken() {
    ADMIN_TOKEN = document.getElementById('adminToken').value;
    localStorage.setItem('adminToken', ADMIN_TOKEN);
    document.getElementById('authStatus').className = 'status connected';
    document.getElementById('authStatus').textContent = '✓ Connected';
    loadAll();
  }

  if (ADMIN_TOKEN) {
    document.getElementById('adminToken').value = ADMIN_TOKEN;
    document.getElementById('authStatus').className = 'status connected';
    document.getElementById('authStatus').textContent = '✓ Connected';
  }

  async function api(action, data = {}) {
    const res = await fetch('/admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ADMIN_TOKEN,
      },
      body: JSON.stringify({ action, ...data }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'API error');
    return json;
  }

  function toast(msg, isError = false) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => el.className = 'toast', 3000);
  }

  async function loadConfig() {
    try {
      const { config } = await api('getConfig');
      if (config.free_limits) {
        document.getElementById('freeMessages').value = config.free_limits.messagesPerDay ?? 20;
        document.getElementById('freeSearches').value = config.free_limits.searchesPerDay ?? 5;
        document.getElementById('freeReminders').value = config.free_limits.remindersActive ?? 3;
      }
      if (config.premium_limits) {
        document.getElementById('premiumMessages').value = config.premium_limits.messagesPerDay ?? -1;
        document.getElementById('premiumSearches').value = config.premium_limits.searchesPerDay ?? -1;
        document.getElementById('premiumReminders').value = config.premium_limits.remindersActive ?? -1;
      }
      if (config.premium_price !== undefined) {
        document.getElementById('premiumPrice').value = config.premium_price;
      }
      if (config.free_model) {
        document.getElementById('freeModel').value = config.free_model;
      }
      if (config.premium_models) {
        document.getElementById('premiumModels').value = Array.isArray(config.premium_models)
          ? config.premium_models.join(',') : config.premium_models;
      }
    } catch (e) {
      toast('Failed to load config: ' + e.message, true);
    }
  }

  async function loadStats() {
    try {
      const { stats } = await api('getStats');
      document.getElementById('statUsers').textContent = stats.usersToday;
      document.getElementById('statMessages').textContent = stats.messagesToday;
      document.getElementById('statSearches').textContent = stats.searchesToday;
      document.getElementById('statPremium').textContent = stats.premiumUsers;
    } catch (e) {
      console.error('Stats error:', e);
    }
  }

  async function saveFreeLimits() {
    try {
      await api('setConfig', { key: 'free_limits', value: {
        messagesPerDay: parseInt(document.getElementById('freeMessages').value),
        searchesPerDay: parseInt(document.getElementById('freeSearches').value),
        remindersActive: parseInt(document.getElementById('freeReminders').value),
      }});
      await api('setConfig', { key: 'free_model', value: document.getElementById('freeModel').value });
      toast('✅ Free limits saved!');
    } catch (e) { toast('Error: ' + e.message, true); }
  }

  async function savePremiumLimits() {
    try {
      await api('setConfig', { key: 'premium_limits', value: {
        messagesPerDay: parseInt(document.getElementById('premiumMessages').value),
        searchesPerDay: parseInt(document.getElementById('premiumSearches').value),
        remindersActive: parseInt(document.getElementById('premiumReminders').value),
      }});
      await api('setConfig', { key: 'premium_price', value: parseInt(document.getElementById('premiumPrice').value) });
      const models = document.getElementById('premiumModels').value.split(',').map(s => s.trim()).filter(Boolean);
      await api('setConfig', { key: 'premium_models', value: models });
      toast('✅ Premium settings saved!');
    } catch (e) { toast('Error: ' + e.message, true); }
  }

  async function grantPremium() {
    const userId = document.getElementById('manageUserId').value;
    if (!userId) return toast('Enter a User ID', true);
    try {
      await api('setPremium', { chatId: userId, isPremium: true, days: parseInt(document.getElementById('premiumDays').value) });
      toast('✅ Premium granted to ' + userId);
      loadPremiumUsers();
    } catch (e) { toast('Error: ' + e.message, true); }
  }

  async function revokePremium() {
    const userId = document.getElementById('manageUserId').value;
    if (!userId) return toast('Enter a User ID', true);
    try {
      await api('setPremium', { chatId: userId, isPremium: false });
      toast('✅ Premium revoked for ' + userId);
      loadPremiumUsers();
    } catch (e) { toast('Error: ' + e.message, true); }
  }

  async function resetUsage() {
    const userId = document.getElementById('manageUserId').value;
    if (!userId) return toast('Enter a User ID', true);
    try {
      await api('resetUsage', { chatId: userId });
      toast('✅ Usage reset for ' + userId);
      loadStats();
    } catch (e) { toast('Error: ' + e.message, true); }
  }

  async function loadPremiumUsers() {
    try {
      const { users } = await api('getPremiumUsers');
      const tbody = document.getElementById('premiumTableBody');
      if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="color:#666;">No premium users yet</td></tr>';
        return;
      }
      tbody.innerHTML = users.map(u => {
        const expired = u.expires_at && new Date(u.expires_at) < new Date();
        const expDate = u.expires_at ? new Date(u.expires_at).toLocaleDateString() : 'Never';
        return '<tr>' +
          '<td style="font-weight:600;color:#a78bfa;">' + u.chat_id + '</td>' +
          '<td>' + new Date(u.activated_at).toLocaleDateString() + '</td>' +
          '<td style="color:' + (expired ? '#ef4444' : '#22c55e') + '">' + expDate + '</td>' +
          '<td><button class="btn btn-red btn-sm" onclick="revokePremiumById(\\'' + u.chat_id + '\\')">Revoke</button></td>' +
          '</tr>';
      }).join('');
    } catch (e) { toast('Error: ' + e.message, true); }
  }

  async function revokePremiumById(chatId) {
    try {
      await api('setPremium', { chatId, isPremium: false });
      toast('✅ Premium revoked for ' + chatId);
      loadPremiumUsers();
    } catch (e) { toast('Error: ' + e.message, true); }
  }

  async function loadAll() {
    await Promise.all([loadConfig(), loadStats(), loadPremiumUsers()]);
  }

  // Auto-load on page load
  if (ADMIN_TOKEN) loadAll();
</script>

</body>
</html>`;
