/*
Source-of-truth content schema used by src/renderer.js + content.json:
{
  hero: { titlePrefix, titleSuffix, subtitle, description, focusList: string[], buttons: [{text,link}] },
  about: { title?, p1, p2, enjoyList: string[], apartList: string[] },
  projects: [{ title, description, tags?: string[], link?: string, image?: string, featured?: boolean, tag?, stack?, features?: string[], role?: string[] }],
  skills: [{ category, items }],
  experience: [{ title, subtitle?, role?, company?, dates?, items: string[], link? }],
  achievements: [{ title, year?, date?, description?, link?, items?: string[] }],
  blog: [{ title, date?, summary, excerpt?, slug?, link?, image?, cover?, video?, content?, published? }],
  contact: { title, subtitle, email, phone?, socials: [{name,link}], formEndpoint? },
  customSections: [{ id, title, content, style, type?, enabled? }],
  sectionOrder: string[],
  theme: { primary, secondary, bg }
}
*/

let currentContent = {};
let baselineContent = {};
let saveTimer;
let saving = false;

const byId = (id) => document.getElementById(id);
const clone = (v) => JSON.parse(JSON.stringify(v || {}));
const toLines = (arr) => Array.isArray(arr) ? arr.join('\n') : '';
const fromLines = (value) => (value || '').split('\n').map((line) => line.trim()).filter(Boolean);

function showToast(message, isError = false) {
  const toast = byId('toast');
  toast.hidden = false;
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 2200);
}

function setStatus(text) {
  byId('save-status').textContent = text;
}

function isDirty() {
  return JSON.stringify(currentContent) !== JSON.stringify(baselineContent);
}

function updateDirtyStatus() {
  setStatus(isDirty() ? 'Unsaved changes' : 'Saved');
  byId('save-btn').disabled = saving || !isDirty();
}

function setSavingState(isSaving) {
  saving = isSaving;
  byId('save-btn').disabled = isSaving || !isDirty();
  byId('reset-btn').disabled = isSaving;
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

function ensureDefaults() {
  currentContent.hero ||= { titlePrefix: '', titleSuffix: '', subtitle: '', description: '', focusList: [], buttons: [] };
  currentContent.about ||= { title: 'About Me', p1: '', p2: '', enjoyList: [], apartList: [] };
  currentContent.projects ||= [];
  currentContent.skills ||= [];
  currentContent.experience ||= [];
  currentContent.achievements ||= [];
  currentContent.blog ||= [];
  currentContent.contact ||= { title: "Let's Talk", subtitle: '', email: '', phone: '', socials: [] };
  currentContent.customSections ||= [];
  currentContent.sectionOrder ||= ['hero', 'about', 'projects', 'skills', 'experience', 'blog', 'contact'];
  currentContent.theme ||= { primary: '#00f3ff', secondary: '#bd00ff', bg: '#050505' };
}

function bindTopLevelInputs() {
  const bind = (id, setter) => {
    const el = byId(id);
    el?.addEventListener('input', () => {
      setter(el.value);
      updateDirtyStatus();
    });
  };

  bind('hero-titlePrefix', (v) => { currentContent.hero.titlePrefix = v; });
  bind('hero-titleSuffix', (v) => { currentContent.hero.titleSuffix = v; });
  bind('hero-subtitle', (v) => { currentContent.hero.subtitle = v; });
  bind('hero-description', (v) => { currentContent.hero.description = v; });

  bind('about-p1', (v) => { currentContent.about.p1 = v; });
  bind('about-p2', (v) => { currentContent.about.p2 = v; });
  bind('about-enjoyList', (v) => { currentContent.about.enjoyList = fromLines(v); });
  bind('about-apartList', (v) => { currentContent.about.apartList = fromLines(v); });

  bind('contact-title', (v) => { currentContent.contact.title = v; });
  bind('contact-subtitle', (v) => { currentContent.contact.subtitle = v; });
  bind('contact-email', (v) => { currentContent.contact.email = v; });
  bind('contact-phone', (v) => { currentContent.contact.phone = v; });

  bind('theme-primary', (v) => { currentContent.theme.primary = v; });
  bind('theme-secondary', (v) => { currentContent.theme.secondary = v; });
  bind('theme-bg', (v) => { currentContent.theme.bg = v; });
}

function renderSimpleList(containerId, list, fields, section, onChange = null) {
  const container = byId(containerId);
  container.innerHTML = '';
  list.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <div class="item-head">
        <strong>${section} ${index + 1}</strong>
        <div class="item-actions">
          <button data-action="up" data-section="${section}" data-index="${index}" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button data-action="down" data-section="${section}" data-index="${index}" ${index === list.length - 1 ? 'disabled' : ''}>↓</button>
          <button data-action="delete" data-section="${section}" data-index="${index}" class="secondary">Delete</button>
        </div>
      </div>`;

    fields.forEach((field) => {
      const id = `${section}-${field.key}-${index}`;
      const label = document.createElement('label');
      const input = field.type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
      if (field.type !== 'textarea') input.type = field.type || 'text';
      if (field.placeholder) input.placeholder = field.placeholder;
      const val = item[field.key];
      input.value = field.list ? toLines(val) : (val ?? '');
      input.id = id;
      input.addEventListener('input', () => {
        item[field.key] = field.list ? fromLines(input.value) : (field.type === 'checkbox' ? input.checked : input.value);
        if (onChange) onChange(item, field.key, input.value);
        updateDirtyStatus();
      });
      label.textContent = field.label;
      label.appendChild(input);
      div.appendChild(label);
    });

    container.appendChild(div);
  });
}

function renderHeroEditors() {
  renderSimpleList('hero-focus-list-editor', currentContent.hero.focusList.map((value) => ({ value })), [{ key: 'value', label: 'Focus item' }], 'focus', (item) => {
    currentContent.hero.focusList = Array.from(byId('hero-focus-list-editor').querySelectorAll('input')).map((el) => el.value).filter(Boolean);
  });

  renderSimpleList('hero-buttons-editor', currentContent.hero.buttons, [
    { key: 'text', label: 'Button Text' },
    { key: 'link', label: 'Button Link' }
  ], 'heroButton');
}

function renderAllLists() {
  renderHeroEditors();
  renderSimpleList('projects-editor', currentContent.projects, [
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'tag', label: 'Tag' },
    { key: 'stack', label: 'Stack' },
    { key: 'features', label: 'Features (one per line)', type: 'textarea', list: true },
    { key: 'role', label: 'Role Bullets (one per line)', type: 'textarea', list: true },
    { key: 'link', label: 'Link' },
    { key: 'image', label: 'Image URL' }
  ], 'projects');

  renderSimpleList('skills-editor', currentContent.skills, [
    { key: 'category', label: 'Category' },
    { key: 'items', label: 'Items (use • separator)' }
  ], 'skills');

  renderSimpleList('experience-editor', currentContent.experience, [
    { key: 'title', label: 'Role / Title' },
    { key: 'company', label: 'Company' },
    { key: 'dates', label: 'Dates' },
    { key: 'subtitle', label: 'Subtitle' },
    { key: 'items', label: 'Description bullets (one per line)', type: 'textarea', list: true },
    { key: 'link', label: 'Link' }
  ], 'experience');

  renderSimpleList('achievements-editor', currentContent.achievements, [
    { key: 'title', label: 'Title' },
    { key: 'year', label: 'Year / Date' },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'items', label: 'List items (one per line)', type: 'textarea', list: true },
    { key: 'link', label: 'Link' }
  ], 'achievements');

  renderSimpleList('blog-editor', currentContent.blog, [
    { key: 'title', label: 'Title' },
    { key: 'date', label: 'Date' },
    { key: 'summary', label: 'Excerpt / Summary', type: 'textarea' },
    { key: 'slug', label: 'Slug' },
    { key: 'link', label: 'Link' },
    { key: 'image', label: 'Cover URL' },
    { key: 'video', label: 'Video URL' },
    { key: 'content', label: 'Full content', type: 'textarea' }
  ], 'blog');

  renderSimpleList('socials-editor', currentContent.contact.socials, [
    { key: 'name', label: 'Platform Name' },
    { key: 'link', label: 'Link URL' }
  ], 'socials');

  renderSimpleList('custom-sections-editor', currentContent.customSections, [
    { key: 'id', label: 'Section ID' },
    { key: 'title', label: 'Title' },
    { key: 'content', label: 'Content', type: 'textarea' },
    { key: 'style', label: 'Style (card/full/highlight)' },
    { key: 'type', label: 'Type (text/cards/gallery)' },
    { key: 'enabled', label: 'Enabled (true/false)' }
  ], 'customSections');

  renderLayoutEditor();
}

function renderLayoutEditor() {
  const editor = byId('layout-editor');
  editor.innerHTML = '';
  const available = ['hero', 'about', 'projects', 'skills', 'experience', 'blog', 'contact', ...currentContent.customSections.map((c) => c.id)];
  available.forEach((sectionId) => {
    const enabled = currentContent.sectionOrder.includes(sectionId);
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = `
      <div class="item-head">
        <strong>${sectionId}</strong>
        <div class="item-actions">
          <button data-layout-toggle="${sectionId}" type="button">${enabled ? 'Disable' : 'Enable'}</button>
          <button data-layout-up="${sectionId}" type="button">↑</button>
          <button data-layout-down="${sectionId}" type="button">↓</button>
        </div>
      </div>`;
    editor.appendChild(row);
  });
}

function moveItem(list, index, dir) {
  const target = index + dir;
  if (target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
}

function handleDynamicActions(event) {
  const btn = event.target.closest('button');
  if (!btn) return;

  const section = btn.dataset.section;
  const index = Number(btn.dataset.index);
  const action = btn.dataset.action;
  if (section && Number.isInteger(index) && action) {
    const list = section === 'focus' ? currentContent.hero.focusList : section === 'heroButton' ? currentContent.hero.buttons : section === 'socials' ? currentContent.contact.socials : currentContent[section];
    if (!Array.isArray(list)) return;
    if (action === 'delete' && confirm('Delete this item?')) list.splice(index, 1);
    if (action === 'up') moveItem(list, index, -1);
    if (action === 'down') moveItem(list, index, 1);
    renderAllLists();
    updateDirtyStatus();
    return;
  }

  const layoutToggle = btn.dataset.layoutToggle;
  if (layoutToggle) {
    const i = currentContent.sectionOrder.indexOf(layoutToggle);
    if (i >= 0) currentContent.sectionOrder.splice(i, 1);
    else currentContent.sectionOrder.push(layoutToggle);
    renderLayoutEditor();
    updateDirtyStatus();
  }

  const layoutUp = btn.dataset.layoutUp;
  const layoutDown = btn.dataset.layoutDown;
  if (layoutUp || layoutDown) {
    const id = layoutUp || layoutDown;
    const i = currentContent.sectionOrder.indexOf(id);
    if (i < 0) return;
    moveItem(currentContent.sectionOrder, i, layoutUp ? -1 : 1);
    renderLayoutEditor();
    updateDirtyStatus();
  }
}

function hydrateForm() {
  ensureDefaults();
  byId('hero-titlePrefix').value = currentContent.hero.titlePrefix || '';
  byId('hero-titleSuffix').value = currentContent.hero.titleSuffix || '';
  byId('hero-subtitle').value = currentContent.hero.subtitle || '';
  byId('hero-description').value = currentContent.hero.description || '';

  byId('about-p1').value = currentContent.about.p1 || '';
  byId('about-p2').value = currentContent.about.p2 || '';
  byId('about-enjoyList').value = toLines(currentContent.about.enjoyList);
  byId('about-apartList').value = toLines(currentContent.about.apartList);

  byId('contact-title').value = currentContent.contact.title || '';
  byId('contact-subtitle').value = currentContent.contact.subtitle || '';
  byId('contact-email').value = currentContent.contact.email || '';
  byId('contact-phone').value = currentContent.contact.phone || '';

  byId('theme-primary').value = currentContent.theme.primary || '#00f3ff';
  byId('theme-secondary').value = currentContent.theme.secondary || '#bd00ff';
  byId('theme-bg').value = currentContent.theme.bg || '#050505';

  renderAllLists();
  updateDirtyStatus();
}

async function loadContent() {
  const data = await apiFetch('/api/content');
  currentContent = clone(data);
  baselineContent = clone(data);
  hydrateForm();
  setStatus('Saved');
}

function validateContact() {
  const email = currentContent.contact.email || '';
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('Contact email format is invalid.');
  }
  currentContent.contact.socials.forEach((social) => {
    if (social.link && !/^https?:\/\//.test(social.link) && !social.link.startsWith('mailto:') && !social.link.startsWith('#')) {
      throw new Error(`Social link must be URL/mailto/hash: ${social.link}`);
    }
  });
}

async function saveContent() {
  if (!isDirty()) {
    showToast('No changes to save.');
    return;
  }

  validateContact();
  setSavingState(true);
  setStatus('Saving…');
  try {
    const serverContent = await apiFetch('/api/content', {
      method: 'PATCH',
      body: JSON.stringify(currentContent)
    });
    currentContent = clone(serverContent);
    baselineContent = clone(serverContent);
    hydrateForm();
    showToast('Saved successfully.');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(refreshPreview, 250);
  } catch (error) {
    showToast(`Save failed: ${error.message}`, true);
    setStatus('Save failed');
  } finally {
    setSavingState(false);
    updateDirtyStatus();
  }
}

function resetUnsaved() {
  currentContent = clone(baselineContent);
  hydrateForm();
  showToast('Unsaved changes reset.');
}

function refreshPreview() {
  const frame = byId('preview-frame');
  frame.src = '/?ts=' + Date.now();
}

async function logout() {
  await apiFetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html?tab=admin';
}

function bindButtons() {
  byId('save-btn').addEventListener('click', saveContent);
  byId('reset-btn').addEventListener('click', resetUnsaved);
  byId('refresh-preview-btn').addEventListener('click', refreshPreview);
  byId('logout-btn').addEventListener('click', logout);

  byId('add-focus-btn').addEventListener('click', () => { currentContent.hero.focusList.push('New focus'); renderAllLists(); updateDirtyStatus(); });
  byId('add-hero-button-btn').addEventListener('click', () => { currentContent.hero.buttons.push({ text: 'New Button', link: '#home' }); renderAllLists(); updateDirtyStatus(); });
  byId('add-project-btn').addEventListener('click', () => { currentContent.projects.push({ title: 'New Project', description: '', tag: '', stack: '', features: [], role: [], link: '', image: '' }); renderAllLists(); updateDirtyStatus(); });
  byId('add-skill-btn').addEventListener('click', () => { currentContent.skills.push({ category: 'New Category', items: '' }); renderAllLists(); updateDirtyStatus(); });
  byId('add-experience-btn').addEventListener('click', () => { currentContent.experience.push({ title: 'New Role', company: '', dates: '', subtitle: '', items: [], link: '' }); renderAllLists(); updateDirtyStatus(); });
  byId('add-achievement-btn').addEventListener('click', () => { currentContent.achievements.push({ title: 'New Achievement', year: '', description: '', items: [], link: '' }); renderAllLists(); updateDirtyStatus(); });
  byId('add-blog-btn').addEventListener('click', () => { currentContent.blog.push({ title: 'New Post', date: '', summary: '', slug: '', link: '', image: '', video: '', content: '' }); renderAllLists(); updateDirtyStatus(); });
  byId('add-social-btn').addEventListener('click', () => { currentContent.contact.socials.push({ name: 'Platform', link: 'https://' }); renderAllLists(); updateDirtyStatus(); });
  byId('add-custom-section-btn').addEventListener('click', () => {
    const id = `custom-${Date.now()}`;
    currentContent.customSections.push({ id, title: 'New Section', content: '', style: 'card', type: 'text', enabled: true });
    currentContent.sectionOrder.push(id);
    renderAllLists();
    updateDirtyStatus();
  });

  document.body.addEventListener('click', handleDynamicActions);
}

function bindNavigation() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach((item) => item.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.target;
      document.querySelectorAll('.panel').forEach((panel) => panel.classList.remove('active'));
      byId(`panel-${target}`).classList.add('active');
    });
  });
}

async function init() {
  bindNavigation();
  bindButtons();
  bindTopLevelInputs();
  try {
    await loadContent();
  } catch (error) {
    setStatus('Failed to load content');
    showToast(`Load failed: ${error.message}`, true);
  }
}

document.addEventListener('DOMContentLoaded', init);
