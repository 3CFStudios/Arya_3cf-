import { defaultContent, normalizeContent } from '/src/contentDefaults.js';

let adminToken = sessionStorage.getItem('admin_token') || '';
let draftData = normalizeContent(defaultContent);

const byId = (id) => document.getElementById(id);

function setStatus(message, isError = false) {
  const el = byId('status');
  el.textContent = message;
  el.style.color = isError ? '#ff9b9b' : '#b5c2df';
}

function setBusy(isBusy) {
  document.querySelectorAll('button').forEach((btn) => {
    btn.disabled = isBusy;
  });
}

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;

  const res = await fetch(path, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    throw new Error(body.error?.fieldErrors ? JSON.stringify(body.error.fieldErrors) : body.error || body.message || `HTTP ${res.status}`);
  }
  return body;
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.querySelectorAll('.panel').forEach((panel) => {
        const show = panel.id === `panel-${target}`;
        panel.hidden = !show;
        panel.classList.toggle('active', show);
      });
    });
  });
}

function formToDraft() {
  draftData = normalizeContent({
    ...draftData,
    site: {
      ...draftData.site,
      title: byId('site-title').value,
      seo: {
        ...draftData.site.seo,
        description: byId('seo-description').value
      }
    },
    hero: {
      ...draftData.hero,
      headline: byId('hero-headline').value,
      subheadline: byId('hero-subheadline').value,
      ctaText: byId('hero-cta-text').value,
      ctaHref: byId('hero-cta-href').value
    },
    footer: {
      ...draftData.footer,
      email: byId('footer-email').value
    }
  });
  byId('content-json').value = JSON.stringify(draftData, null, 2);
}

function draftToForm() {
  const data = normalizeContent(draftData);
  byId('site-title').value = data.site.title || '';
  byId('seo-description').value = data.site.seo.description || '';
  byId('hero-headline').value = data.hero.headline || '';
  byId('hero-subheadline').value = data.hero.subheadline || '';
  byId('hero-cta-text').value = data.hero.ctaText || '';
  byId('hero-cta-href').value = data.hero.ctaHref || '';
  byId('footer-email').value = data.footer.email || '';
  byId('content-json').value = JSON.stringify(data, null, 2);
}

async function loadDraft() {
  setBusy(true);
  try {
    const draft = await apiFetch('/api/site/draft');
    draftData = normalizeContent(draft.data);
    draftToForm();
    setStatus(`Draft loaded (version ${draft.version}).`);
  } catch (error) {
    setStatus(`Failed to load draft: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

async function saveDraft() {
  formToDraft();
  setBusy(true);
  try {
    const result = await apiFetch('/api/site/draft', { method: 'PUT', body: JSON.stringify(draftData) });
    setStatus(`Draft saved (version ${result.version}).`);
  } catch (error) {
    setStatus(`Save failed: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

async function publishDraft() {
  setBusy(true);
  try {
    const result = await apiFetch('/api/site/publish', { method: 'POST' });
    setStatus(`Published successfully (version ${result.version}).`);
    await refreshHistory();
  } catch (error) {
    setStatus(`Publish failed: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

async function refreshHistory() {
  setBusy(true);
  try {
    const data = await apiFetch('/api/site/history');
    const list = byId('history-list');
    list.innerHTML = '';
    data.history.forEach((item) => {
      const li = document.createElement('li');
      const date = new Date(item.updatedAt).toLocaleString();
      li.innerHTML = `v${item.version} - ${date} <button data-version="${item.version}" type="button">Rollback</button>`;
      list.appendChild(li);
    });

    list.querySelectorAll('button[data-version]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        setBusy(true);
        try {
          const version = btn.dataset.version;
          await apiFetch(`/api/site/rollback/${version}`, { method: 'POST' });
          setStatus(`Rolled back to version ${version}.`);
          await refreshHistory();
          await loadDraft();
        } catch (error) {
          setStatus(`Rollback failed: ${error.message}`, true);
        } finally {
          setBusy(false);
        }
      });
    });

    setStatus(`History loaded (${data.history.length} versions).`);
  } catch (error) {
    setStatus(`History failed: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

function bindActions() {
  byId('connect-btn').addEventListener('click', async () => {
    adminToken = byId('admin-token').value.trim();
    if (!adminToken) {
      setStatus('Enter ADMIN_TOKEN.', true);
      return;
    }
    sessionStorage.setItem('admin_token', adminToken);
    await loadDraft();
  });

  byId('logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem('admin_token');
    adminToken = '';
    byId('admin-token').value = '';
    setStatus('Token cleared.');
  });

  byId('save-draft-btn').addEventListener('click', saveDraft);
  byId('publish-btn').addEventListener('click', publishDraft);
  byId('preview-btn').addEventListener('click', () => {
    if (!adminToken) {
      setStatus('Connect token before preview.', true);
      return;
    }
    formToDraft();
    const url = `/?mode=draft&token=${encodeURIComponent(adminToken)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  byId('apply-json-btn').addEventListener('click', () => {
    try {
      draftData = normalizeContent(JSON.parse(byId('content-json').value));
      draftToForm();
      setStatus('JSON applied to form.');
    } catch (error) {
      setStatus(`Invalid JSON: ${error.message}`, true);
    }
  });

  byId('refresh-history-btn').addEventListener('click', refreshHistory);

  ['site-title', 'seo-description', 'hero-headline', 'hero-subheadline', 'hero-cta-text', 'hero-cta-href', 'footer-email'].forEach((id) => {
    byId(id).addEventListener('input', formToDraft);
  });
}

function init() {
  bindTabs();
  bindActions();
  byId('admin-token').value = adminToken;
  draftToForm();
  if (adminToken) {
    loadDraft();
    refreshHistory();
  }
}

document.addEventListener('DOMContentLoaded', init);
