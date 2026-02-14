const SESSION_KEY = 'admin_ui_settings';

function setStatus(id, message, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? '#ff8f8f' : '';
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : { success: false, error: await response.text() };

  if (!response.ok || body.success === false) {
    throw new Error(body.error || body.message || `HTTP ${response.status}`);
  }

  return body;
}

function showApp(isAuthenticated) {
  document.getElementById('login-view').classList.toggle('hidden', isAuthenticated);
  document.getElementById('app-view').classList.toggle('hidden', !isAuthenticated);
}

function activateTab(tabName) {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.tab === tabName);
  });

  document.querySelectorAll('.panel').forEach((panel) => {
    const isActive = panel.id === `panel-${tabName}`;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });

  setStatus('overview-status', `Switched to ${tabName}.`);
}

function loadLocalSettings() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    document.getElementById('site-title').value = saved.siteTitle || '';
    document.getElementById('maintenance').checked = !!saved.maintenance;
  } catch {
    localStorage.removeItem(SESSION_KEY);
  }
}

function bindHandlers() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  });

  document.getElementById('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const masterKey = document.getElementById('masterKey').value.trim();

    if (!email || !password || !masterKey) {
      setStatus('login-message', 'All fields are required.', true);
      return;
    }

    try {
      const data = await apiFetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, masterKey, type: 'admin' }),
      });

      if (data.role !== 'admin') {
        throw new Error('Admin access denied.');
      }

      setStatus('login-message', 'Login successful.');
      showApp(true);
      await refreshUsers();
    } catch (error) {
      setStatus('login-message', error.message, true);
    }
  });

  document.getElementById('demo-login-btn').addEventListener('click', () => {
    showApp(true);
    setStatus('overview-status', 'Demo session active. TODO: use real backend auth in production.');
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
      await apiFetch('/api/logout', { method: 'POST' });
    } catch {
      // ignore and still reset local UI
    }
    showApp(false);
    setStatus('login-message', 'Logged out.');
  });

  document.getElementById('refresh-users-btn').addEventListener('click', refreshUsers);

  document.getElementById('settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const payload = {
      siteTitle: document.getElementById('site-title').value.trim(),
      maintenance: document.getElementById('maintenance').checked,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    setStatus('settings-status', 'Settings saved locally. TODO: connect real backend endpoint.');
  });
}

async function refreshUsers() {
  const list = document.getElementById('users-list');
  list.innerHTML = '';
  setStatus('users-status', 'Loading users...');

  try {
    const data = await apiFetch('/api/admin/users');
    const users = Array.isArray(data.users) ? data.users : [];

    if (!users.length) {
      setStatus('users-status', 'No users found.');
      return;
    }

    users.forEach((user) => {
      const li = document.createElement('li');
      li.textContent = `${user.name || 'Unnamed'} (${user.email || 'no email'})`;
      list.appendChild(li);
    });

    setStatus('users-status', `Loaded ${users.length} users.`);
  } catch (error) {
    setStatus('users-status', error.message, true);
  }
}

async function init() {
  bindHandlers();
  loadLocalSettings();
  activateTab('overview');

  try {
    await apiFetch('/api/admin/session');
    showApp(true);
    await refreshUsers();
  } catch {
    showApp(false);
  }
}

document.addEventListener('DOMContentLoaded', init);
