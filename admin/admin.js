const DEBUG = false;
let currentContent = {};
let baselineContent = {};
let adminRoot = null;

const logDebug = (...args) => {
    if (!DEBUG) return;
    console.log(...args);
};

const deepClone = (value) => {
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value);
        } catch (err) {
            // fall back to JSON clone
        }
    }
    return JSON.parse(JSON.stringify(value || {}));
};

const stableStringify = (value) => {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};

const isDirty = (baseline, current) => stableStringify(baseline) !== stableStringify(current);

const diffContent = (baseline, current) => {
    const patch = {};
    const baselineObj = baseline || {};
    const currentObj = current || {};
    const keys = new Set([...Object.keys(baselineObj), ...Object.keys(currentObj)]);

    keys.forEach((key) => {
        if (stableStringify(baselineObj[key]) !== stableStringify(currentObj[key])) {
            patch[key] = currentObj[key];
        }
    });

    return patch;
};

const readFormState = () => {
    const current = deepClone(currentContent || {});
    const getValue = (id) => {
        const el = document.getElementById(id);
        if (!el) return '';
        if (el.type === 'checkbox') return el.checked;
        return el.value ?? '';
    };
    const getList = (id) => getValue(id).split('\n').map((line) => line.trim()).filter(Boolean);

    current.hero = {
        ...(current.hero || {}),
        titlePrefix: getValue('hero-titlePrefix'),
        titleSuffix: getValue('hero-titleSuffix'),
        subtitle: getValue('hero-subtitle'),
        description: getValue('hero-description'),
        focusList: getList('hero-focusList')
    };

    current.about = {
        ...(current.about || {}),
        p1: getValue('about-p1'),
        p2: getValue('about-p2'),
        enjoyList: getList('about-enjoyList'),
        apartList: getList('about-apartList')
    };

    if (!Array.isArray(current.achievements)) current.achievements = [];
    if (!current.achievements[0]) current.achievements[0] = { items: [] };
    current.achievements[0].items = getList('achievements-items');

    current.contact = {
        ...(current.contact || {}),
        title: getValue('contact-title'),
        subtitle: getValue('contact-subtitle'),
        email: getValue('contact-email')
    };

    current.theme = {
        primary: getValue('theme-primary') || current.theme?.primary || '#00f3ff',
        secondary: getValue('theme-secondary') || current.theme?.secondary || '#bd00ff',
        bg: getValue('theme-bg') || current.theme?.bg || '#050505'
    };

    current.sitePassword = getValue('site-password');

    return current;
};

const updateDirtyState = () => {
    currentContent = readFormState();
    const dirty = isDirty(baselineContent, currentContent);
    const saveBtn = document.querySelector('.save-btn');
    if (saveBtn) {
        saveBtn.disabled = !dirty;
    }

    logDebug('DEBUG admin content baseline keys:', Object.keys(baselineContent || {}));
    logDebug('DEBUG admin content current keys:', Object.keys(currentContent || {}));
    logDebug('DEBUG admin content dirty:', dirty);

    return { currentContent, dirty };
};

const getSectionArray = (section) => {
    if (section === 'socials') {
        if (!currentContent.contact) currentContent.contact = {};
        if (!Array.isArray(currentContent.contact.socials)) currentContent.contact.socials = [];
        return currentContent.contact.socials;
    }
    if (!Array.isArray(currentContent[section])) currentContent[section] = [];
    return currentContent[section];
};

const attachFormListeners = () => {
    if (!adminRoot) return;
    const handleFieldUpdate = (event) => {
        if (!event.target.matches('input,textarea,select')) return;
        const { section, index, field, list } = event.target.dataset;
        if (!section || field === undefined) return;
        const targetIndex = Number(index);
        if (Number.isNaN(targetIndex)) return;
        const collection = getSectionArray(section);
        if (!collection[targetIndex]) collection[targetIndex] = {};
        const value = list === 'true'
            ? event.target.value.split('\n').map((line) => line.trim()).filter(Boolean)
            : event.target.value;
        collection[targetIndex][field] = value;
        updateDirtyState();
    };
    adminRoot.addEventListener('click', (event) => {
        const btn = event.target.closest('button,[data-action]');
        if (!btn || !adminRoot.contains(btn)) return;
        const action = btn.dataset.action || btn.id;
        if (!action) return;
        if (['addProject', 'addSkill', 'addExperience', 'addSocial', 'removeItem'].includes(action)) {
            event.preventDefault();
        }
        if (btn.dataset.targetSection) {
            showSection(btn.dataset.targetSection);
        }
        switch (action) {
            case 'addProject':
                window.addProject(event);
                break;
            case 'addSkill':
                window.addSkill(event);
                break;
            case 'addExperience':
                window.addExperience(event);
                break;
            case 'addSocial':
                window.addSocial(event);
                break;
            case 'removeItem':
                window.removeItem(event);
                break;
            default:
                break;
        }
    });

    adminRoot.addEventListener('input', handleFieldUpdate);
    adminRoot.addEventListener('change', handleFieldUpdate);
};

async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        credentials: 'include',
        ...options,
        headers: {
            ...(options.headers || {}),
        },
    });

    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
        data = await res.json().catch(() => null);
    } else {
        const text = await res.text().catch(() => '');
        data = { success: false, error: text?.slice(0, 200) || 'Non-JSON response' };
    }

    if (!res.ok) {
        const msg = (data && (data.error || data.message)) ? (data.error || data.message) : `HTTP ${res.status}`;
        throw new Error(msg);
    }

    return data;
}

// --- INIT ---
async function initAdmin() {
    adminRoot = document.getElementById('admin-root') || document.querySelector('main');
    // Server guarantees auth now, so just load data
    attachFormListeners();
    loadData();
}

async function logout() {
    await apiFetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html'; // Redirect to login
}

// --- DATA LOADING & FORM ---

async function loadData() {
    currentContent = await apiFetch('/api/content');
    baselineContent = deepClone(currentContent || {});
    populateForms();
    updateDirtyState();
}

function populateForms() {
    try {
        // Hero
        if (currentContent.hero) {
            document.getElementById('hero-titlePrefix').value = currentContent.hero.titlePrefix || '';
            document.getElementById('hero-titleSuffix').value = currentContent.hero.titleSuffix || '';
            document.getElementById('hero-subtitle').value = currentContent.hero.subtitle || '';
            document.getElementById('hero-description').value = currentContent.hero.description || '';
            document.getElementById('hero-focusList').value = currentContent.hero.focusList ? currentContent.hero.focusList.join('\n') : '';
        }

        // About
        if (currentContent.about) {
            document.getElementById('about-p1').value = currentContent.about.p1 || '';
            document.getElementById('about-p2').value = currentContent.about.p2 || '';
            document.getElementById('about-enjoyList').value = currentContent.about.enjoyList ? currentContent.about.enjoyList.join('\n') : '';
            document.getElementById('about-apartList').value = currentContent.about.apartList ? currentContent.about.apartList.join('\n') : '';
        }

        // Achievements
        if (currentContent.achievements && currentContent.achievements.length > 0) {
            document.getElementById('achievements-items').value = currentContent.achievements[0].items.join('\n');
        }

        // Contact
        if (currentContent.contact) {
            document.getElementById('contact-title').value = currentContent.contact.title || '';
            document.getElementById('contact-subtitle').value = currentContent.contact.subtitle || '';
            document.getElementById('contact-email').value = currentContent.contact.email || '';

            // Theme & Security
            if (currentContent.theme) {
                const pColor = document.getElementById('theme-primary');
                const sColor = document.getElementById('theme-secondary');
                const bgColor = document.getElementById('theme-bg');
                if (pColor) pColor.value = currentContent.theme.primary;
                if (sColor) sColor.value = currentContent.theme.secondary;
                if (bgColor) bgColor.value = currentContent.theme.bg;
            }
            const passEl = document.getElementById('site-password');
            if (passEl) passEl.value = currentContent.sitePassword || '';
        }

        renderProjects();
        renderSkills();
        renderExperience();
        renderBlog();
        renderSocials();
        renderCustomSections();
        renderSectionOrder();
        renderUsers();
        updateDashboardStats();
    } catch (e) {
        console.error("Error populating forms:", e);
    }
}

// --- USER MANAGEMENT ---

window.renderUsers = async function () {
    const container = document.getElementById('users-table-body');
    if (!container) {
        console.error("DEBUG: Row container 'users-table-body' not found!");
        return;
    }

    console.log("DEBUG: renderUsers() triggered. Fetching from /api/admin/users...");
    try {
        const data = await apiFetch('/api/admin/users');
        console.log("DEBUG: Parsed JSON data:", data);

        if (data.success && Array.isArray(data.users)) {
            console.log(`DEBUG: Found ${data.users.length} users to render.`);

            if (data.users.length === 0) {
                container.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; color:#888;">No users found in database.</td></tr>';
                return;
            }

            // Build a single HTML string for better performance
            let html = '';
            data.users.forEach((user) => {
                const name = user.name || 'Anonymous';
                const email = user.email || 'N/A';
                const isAdmin = user.isAdmin == 1 || user.isAdmin === true;
                const date = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A';
                const hash = user.password || 'N/A';
                const userId = user.id;

                html += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 1rem; color: #fff; font-weight: 500;">${name}</td>
                    <td style="padding: 1rem; color: rgba(255,255,255,0.6); font-size: 0.9rem;">${email}</td>
                    <td style="padding: 1rem;">
                        <span style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px; background: ${isAdmin ? 'rgba(0, 243, 255, 0.1)' : 'rgba(255,255,255,0.05)'}; color: ${isAdmin ? 'var(--color-primary)' : 'inherit'}; border: ${isAdmin ? '1px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.1)'};">
                            ${isAdmin ? 'Admin' : 'User'}
                        </span>
                    </td>
                    <td style="padding: 1rem; color: rgba(255,255,255,0.4); font-size: 0.85rem;">${date}</td>
                    <td style="padding: 1rem;">
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="quick-btn" style="padding: 0.4rem 0.6rem; font-size: 0.75rem; border-color: ${isAdmin ? '#ff4444' : 'var(--color-primary)'}; color: ${isAdmin ? '#ff4444' : 'var(--color-primary)'};" 
                                onclick="window.toggleUserRole('${userId}', ${isAdmin})">
                                ${isAdmin ? '🔴 Demote' : '💎 Make Admin'}
                            </button>
                            <button class="quick-btn" style="padding: 0.4rem 0.6rem; font-size: 0.75rem;" 
                                onclick="window.changeUserPassword('${userId}')">
                                🔑 Reset
                            </button>
                            <button class="quick-btn" style="padding: 0.4rem 0.6rem; font-size: 0.75rem; opacity: 0.5;" 
                                onclick="window.viewUserHash('${hash}')">
                                👁️ Hash
                            </button>
                        </div>
                    </td>
                </tr>`;
            });
            container.innerHTML = html;
            console.log("DEBUG: User list rendering complete.");
        } else {
            console.error("DEBUG: API returned data.success=false or missing users array", data);
            container.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem; color:#ff4444;">API Error: ${data.error || 'Unknown error'}</td></tr>`;
        }
    } catch (e) {
        console.error("DEBUG: Unexpected error in renderUsers:", e);
        container.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem; color:#ff4444;">Critical Error: ${e.message}</td></tr>`;
    }
};

window.toggleUserRole = async function (userId, isAdmin) {
    console.log("DEBUG: toggleUserRole clicked for user:", userId, "isAdmin:", isAdmin);
    const newStatus = isAdmin ? 0 : 1;
    const action = isAdmin ? "demote this admin back to user?" : "make this user an admin?";

    if (confirm(`Are you sure you want to ${action}`)) {
        try {
            const data = await apiFetch('/api/admin/users/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, updates: { isAdmin: newStatus } })
            });
            if (data.success) {
                console.log("DEBUG: Role updated successfully.");
                window.renderUsers();
            } else {
                alert("Error: " + data.error);
            }
        } catch (e) {
            console.error("Role update failed", e);
        }
    }
};

window.changeUserPassword = async function (userId) {
    const newPass = prompt("Enter NEW password for this user:");
    if (!newPass) return;

    if (confirm(`Overwrite password? This cannot be undone.`)) {
        try {
            const data = await apiFetch('/api/admin/users/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, updates: { password: newPass } })
            });
            if (data.success) {
                alert("Password updated successfully!");
                window.renderUsers();
            } else {
                alert("Error: " + data.error);
            }
        } catch (e) {
            console.error("Password update failed", e);
        }
    }
};

window.viewUserHash = function (hash) {
    alert("User Password Hash (Encrypted):\n\n" + hash + "\n\nNote: This is a hashed string and cannot be decrypted.");
};


function updateDashboardStats() {
    if (!currentContent) return;

    const setStat = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    };

    setStat('stat-projects', currentContent.projects?.length || 0);
    setStat('stat-blog', currentContent.blog?.length || 0);
    setStat('stat-skills', currentContent.skills?.length || 0);
    setStat('stat-socials', currentContent.contact?.socials?.length || 0);
    setStat('overview-projects', currentContent.projects?.length || 0);
    setStat('overview-blog', currentContent.blog?.length || 0);

    // Add Total Views if stat card exists
    setStat('stat-views', currentContent.analytics?.totalViews || 0);
}

/* --- Render Functions --- */

function renderProjects() {
    const container = document.getElementById('projects-list');
    if (!container) return;
    container.innerHTML = '';
    if (!currentContent.projects || !Array.isArray(currentContent.projects)) return;
    currentContent.projects.forEach((proj, index) => {
        container.innerHTML += `
        <div class="item-list">
            <div class="item-header">
                <strong>Project ${index + 1}</strong>
                <button type="button" class="delete-btn" data-action="removeItem" data-section="projects" data-index="${index}">Delete</button>
            </div>
            <div class="form-group"><label>Title</label><input type="text" data-section="projects" data-index="${index}" data-field="title" value="${proj.title || ''}"></div>
            <div class="form-group"><label>Tag</label><input type="text" data-section="projects" data-index="${index}" data-field="tag" value="${proj.tag || ''}"></div>
            <div class="form-group"><label>Description</label><textarea data-section="projects" data-index="${index}" data-field="description">${proj.description || ''}</textarea></div>
            <div class="form-group"><label>Stack</label><input type="text" data-section="projects" data-index="${index}" data-field="stack" value="${proj.stack || ''}"></div>
            
            <div class="form-group"><label>Features (One per line)</label><textarea data-section="projects" data-index="${index}" data-field="features" data-list="true">${proj.features ? proj.features.join('\n') : ''}</textarea></div>
            <div class="form-group"><label>My Role (One per line)</label><textarea data-section="projects" data-index="${index}" data-field="role" data-list="true">${proj.role ? proj.role.join('\n') : ''}</textarea></div>
        </div>`;
    });
}

function renderSkills() {
    const container = document.getElementById('skills-list');
    if (!container) return;
    container.innerHTML = '';
    if (!currentContent.skills || !Array.isArray(currentContent.skills)) return;
    currentContent.skills.forEach((skill, index) => {
        container.innerHTML += `
        <div class="item-list">
            <div class="item-header">
                <strong>Category ${index + 1}</strong>
                <button type="button" class="delete-btn" data-action="removeItem" data-section="skills" data-index="${index}">Delete</button>
            </div>
            <div class="form-group"><label>Category Name</label><input type="text" data-section="skills" data-index="${index}" data-field="category" value="${skill.category || ''}"></div>
            <div class="form-group"><label>Items (Use • to separate)</label><input type="text" data-section="skills" data-index="${index}" data-field="items" value="${skill.items || ''}"></div>
        </div>`;
    });
}

function renderExperience() {
    const container = document.getElementById('experience-list');
    if (!container) return;
    container.innerHTML = '';
    if (!currentContent.experience || !Array.isArray(currentContent.experience)) return;
    currentContent.experience.forEach((exp, index) => {
        container.innerHTML += `
        <div class="item-list">
             <div class="item-header">
                <strong>Role ${index + 1}</strong>
                <button type="button" class="delete-btn" data-action="removeItem" data-section="experience" data-index="${index}">Delete</button>
             </div>
            <div class="form-group"><label>Title</label><input type="text" data-section="experience" data-index="${index}" data-field="title" value="${exp.title || ''}"></div>
            <div class="form-group"><label>Items (One per line)</label><textarea data-section="experience" data-index="${index}" data-field="items" data-list="true">${exp.items ? exp.items.join('\n') : ''}</textarea></div>
        </div>`;
    });
}

function renderBlog() {
    const container = document.getElementById('blog-list');
    if (!container) return;
    container.innerHTML = '';
    if (!currentContent.blog || !Array.isArray(currentContent.blog)) return;
    currentContent.blog.forEach((post, index) => {
        container.innerHTML += `
        <div class="item-list">
            <div class="item-header"><strong>Post ${index + 1}</strong> <span class="delete-btn" onclick="deleteItem('blog', ${index})">Delete</span></div>
            <div class="form-group"><label>Title</label><input type="text" onchange="updateArrayItem('blog', ${index}, 'title', this.value)" value="${post.title}"></div>
            <div class="form-group"><label>Summary</label><textarea onchange="updateArrayItem('blog', ${index}, 'summary', this.value)">${post.summary}</textarea></div>
            <div class="form-group"><label>Full Content (Expanded)</label><textarea onchange="updateArrayItem('blog', ${index}, 'content', this.value)" style="min-height: 150px;">${post.content || ''}</textarea></div>
            <div class="form-group"><label>🖼️ Image URL (Optional)</label><input type="text" onchange="updateArrayItem('blog', ${index}, 'image', this.value)" value="${post.image || ''}" placeholder="https://example.com/image.jpg"></div>
            <div class="form-group"><label>🎬 Video URL (Optional - YouTube/Vimeo embed)</label><input type="text" onchange="updateArrayItem('blog', ${index}, 'video', this.value)" value="${post.video || ''}" placeholder="https://www.youtube.com/embed/..."></div>
        </div>`;
    });
}

function renderSocials() {
    const container = document.getElementById('socials-list');
    if (!container) return;
    container.innerHTML = '';
    if (!currentContent.contact || !currentContent.contact.socials || !Array.isArray(currentContent.contact.socials)) return;
    currentContent.contact.socials.forEach((social, index) => {
        container.innerHTML += `
        <div class="item-list">
            <div class="item-header">
                <strong>${social.name || 'Social Link'}</strong>
                <button type="button" class="delete-btn" data-action="removeItem" data-section="socials" data-index="${index}">Delete</button>
            </div>
            <div class="form-group"><label>Platform Name</label><input type="text" data-section="socials" data-index="${index}" data-field="name" value="${social.name || ''}"></div>
            <div class="form-group"><label>Link URL</label><input type="text" data-section="socials" data-index="${index}" data-field="link" value="${social.link || ''}"></div>
        </div>`;
    });
}


/* --- Logic Helpers --- */

window.updateArrayItem = (section, index, key, value) => {
    currentContent[section][index][key] = value;
    updateDirtyState();
};

// For splitting textarea lines into array
window.updateArrayList = (section, index, key, value) => {
    currentContent[section][index][key] = value.split('\n').filter(line => line.trim() !== '');
    updateDirtyState();
};

window.updateSocialLink = (index, value) => {
    currentContent.contact.socials[index].link = value;
    updateDirtyState();
};

window.deleteItem = (section, index) => {
    if (confirm('Are you sure?')) {
        currentContent[section].splice(index, 1);
        populateForms();
        updateDirtyState();
    }
};

window.addProject = (event) => {
    if (event) event.preventDefault();
    if (!Array.isArray(currentContent.projects)) currentContent.projects = [];
    currentContent.projects.push({
        title: "New Project",
        tag: "Tech",
        description: "Desc",
        stack: "Stack",
        role: [],
        features: []
    });
    renderProjects();
    updateDirtyState();
};

window.addBlogPost = () => {
    currentContent.blog.push({ title: "New Post", summary: "Summary here...", content: "Full content here..." });
    renderBlog();
    updateDashboardStats();
    updateDirtyState();
};

window.addSkill = (event) => {
    if (event) event.preventDefault();
    if (!Array.isArray(currentContent.skills)) currentContent.skills = [];
    currentContent.skills.push({ category: "New Category", items: "Skill 1 • Skill 2" });
    renderSkills();
    updateDashboardStats();
    updateDirtyState();
};

window.addExperience = (event) => {
    if (event) event.preventDefault();
    if (!Array.isArray(currentContent.experience)) currentContent.experience = [];
    currentContent.experience.push({ title: "New Role", subtitle: "", items: ["Responsibility 1"] });
    renderExperience();
    updateDirtyState();
};

window.addSocial = (event) => {
    if (event) event.preventDefault();
    logDebug('DEBUG admin addSocial called');
    if (!currentContent.contact) currentContent.contact = {};
    if (!Array.isArray(currentContent.contact.socials)) currentContent.contact.socials = [];
    currentContent.contact.socials.push({ name: "New Platform", link: "https://" });
    logDebug('DEBUG admin socials length after push:', currentContent.contact.socials.length);
    renderSocials();
    updateDashboardStats();
    updateDirtyState();
};

window.updateSocialName = (index, value) => {
    currentContent.contact.socials[index].name = value;
    updateDirtyState();
};

window.deleteSocial = (index) => {
    if (confirm('Delete this social link?')) {
        currentContent.contact.socials.splice(index, 1);
        renderSocials();
        updateDashboardStats();
        updateDirtyState();
    }
};

window.removeItem = (event) => {
    if (event) event.preventDefault();
    const btn = event?.target?.closest('[data-action="removeItem"]');
    if (!btn) return;
    const section = btn.dataset.section;
    const index = Number(btn.dataset.index);
    if (!section || Number.isNaN(index)) return;
    if (!confirm('Are you sure?')) return;
    const collection = getSectionArray(section);
    collection.splice(index, 1);
    if (section === 'projects') renderProjects();
    if (section === 'skills') renderSkills();
    if (section === 'experience') renderExperience();
    if (section === 'socials') {
        renderSocials();
        updateDashboardStats();
    }
    updateDirtyState();
};

window.showSection = (sectionId) => {
    document.querySelectorAll('.section-editor').forEach(el => el.classList.remove('active'));
    const targetSection = document.getElementById(sectionId + '-section') || document.getElementById(sectionId);
    if (targetSection) targetSection.classList.add('active');

    // Handle sidebar active state robustly
    document.querySelectorAll('aside button').forEach(el => el.classList.remove('active'));

    // Find the button even if a child (span/icon) was clicked
    let btn = event ? (event.currentTarget || event.target) : null;
    if (btn && btn.tagName !== 'BUTTON') {
        btn = btn.closest('button');
    }
    if (btn) btn.classList.add('active');

    document.getElementById('page-title').innerText = sectionId.charAt(0).toUpperCase() + sectionId.slice(1);

    // Context-specific actions
    if (sectionId === 'users') {
        window.renderUsers();
        stopLogPolling();
    } else if (sectionId === 'server') {
        startLogPolling();
    } else {
        stopLogPolling();
    }
};


window.saveContent = async () => {
    try {
        currentContent = readFormState();
        const patch = diffContent(baselineContent, currentContent);

        logDebug('DEBUG admin content patch keys:', Object.keys(patch));

        if (Object.keys(patch).length === 0) {
            alert('No changes to be made.');
            return;
        }

        const serverContent = await apiFetch('/api/content', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch)
        });

        alert('Saved successfully!');
        currentContent = deepClone(serverContent || {});
        baselineContent = deepClone(serverContent || {});
        populateForms();
        updateDirtyState();
    } catch (e) {
        console.error("Save error:", e);
        alert('Network error. Check console for details.');
    }
};

/* --- Custom Sections --- */

function renderCustomSections() {
    if (!currentContent.customSections) currentContent.customSections = [];
    const container = document.getElementById('custom-sections-list');
    container.innerHTML = '';

    currentContent.customSections.forEach((section, index) => {
        container.innerHTML += `
        <div class="item-list">
            <div class="item-header">
                <strong>Custom Section ${index + 1}</strong> 
                <span class="delete-btn" onclick="deleteCustomSection(${index})">Delete</span>
            </div>
            <div class="form-group">
                <label>Section ID (used for ordering)</label>
                <input type="text" value="${section.id}" onchange="updateCustomSection(${index}, 'id', this.value)" placeholder="my-section">
            </div>
            <div class="form-group">
                <label>Title</label>
                <input type="text" value="${section.title}" onchange="updateCustomSection(${index}, 'title', this.value)">
            </div>
            <div class="form-group">
                <label>Content (HTML Supported)</label>
                <textarea style="min-height: 120px;" onchange="updateCustomSection(${index}, 'content', this.value)">${section.content}</textarea>
            </div>
            <div class="form-group">
                <label>Style</label>
                <select onchange="updateCustomSection(${index}, 'style', this.value)">
                    <option value="card" ${section.style === 'card' ? 'selected' : ''}>Glass Card</option>
                    <option value="full" ${section.style === 'full' ? 'selected' : ''}>Full Width</option>
                    <option value="highlight" ${section.style === 'highlight' ? 'selected' : ''}>Highlighted Box</option>
                </select>
            </div>
        </div>`;
    });
}

window.addCustomSection = () => {
    if (!currentContent.customSections) currentContent.customSections = [];
    const id = 'custom-' + Date.now();
    currentContent.customSections.push({
        id: id,
        title: 'New Section',
        content: 'Your content here...',
        style: 'card'
    });
    // Also add to section order
    if (!currentContent.sectionOrder) currentContent.sectionOrder = ["hero", "about", "projects", "skills", "experience", "blog", "contact"];
    currentContent.sectionOrder.push(id);
    renderCustomSections();
    renderSectionOrder();
    updateDirtyState();
};

window.updateCustomSection = (index, key, value) => {
    currentContent.customSections[index][key] = value;
    updateDirtyState();
};

window.deleteCustomSection = (index) => {
    if (confirm('Delete this custom section?')) {
        const id = currentContent.customSections[index].id;
        currentContent.customSections.splice(index, 1);
        // Remove from section order
        const orderIndex = currentContent.sectionOrder.indexOf(id);
        if (orderIndex > -1) currentContent.sectionOrder.splice(orderIndex, 1);
        renderCustomSections();
        renderSectionOrder();
        updateDirtyState();
    }
};

/* --- Section Order / Page Layout --- */

const sectionLabels = {
    'hero': '🏠 Hero',
    'about': '👤 About',
    'projects': '🚀 Projects',
    'skills': '🛠️ Skills',
    'experience': '💼 Experience',
    'blog': '📝 Blog',
    'contact': '📬 Contact'
};

function renderSectionOrder() {
    if (!currentContent.sectionOrder) {
        currentContent.sectionOrder = ["hero", "about", "projects", "skills", "experience", "blog", "contact"];
    }
    const container = document.getElementById('section-order-list');
    container.innerHTML = '';

    currentContent.sectionOrder.forEach((sectionId, index) => {
        const isCustom = sectionId.startsWith('custom-');
        const customSection = isCustom ? currentContent.customSections.find(s => s.id === sectionId) : null;
        const label = isCustom ? `✨ ${customSection?.title || sectionId}` : (sectionLabels[sectionId] || sectionId);

        container.innerHTML += `
        <div class="item-list" style="display: flex; align-items: center; justify-content: space-between; padding: 0.8rem 1rem;">
            <span style="font-size: 0.9rem;">${label}</span>
            <div style="display: flex; gap: 0.5rem;">
                <button class="quick-btn" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="moveSectionUp(${index})" ${index === 0 ? 'disabled style="opacity: 0.3;"' : ''}>⬆️</button>
                <button class="quick-btn" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="moveSectionDown(${index})" ${index === currentContent.sectionOrder.length - 1 ? 'disabled style="opacity: 0.3;"' : ''}>⬇️</button>
            </div>
        </div>`;
    });
}

window.moveSectionUp = (index) => {
    if (index <= 0) return;
    const temp = currentContent.sectionOrder[index];
    currentContent.sectionOrder[index] = currentContent.sectionOrder[index - 1];
    currentContent.sectionOrder[index - 1] = temp;
    renderSectionOrder();
    updateDirtyState();
};

window.moveSectionDown = (index) => {
    if (index >= currentContent.sectionOrder.length - 1) return;
    const temp = currentContent.sectionOrder[index];
    currentContent.sectionOrder[index] = currentContent.sectionOrder[index + 1];
    currentContent.sectionOrder[index + 1] = temp;
    renderSectionOrder();
    updateDirtyState();
};

window.exportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentContent, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "arya_website_backup_" + new Date().toISOString().split('T')[0] + ".json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};

window.resetAnalytics = () => {
    if (confirm('Are you sure you want to reset the view counter to 0?')) {
        if (!currentContent.analytics) currentContent.analytics = { totalViews: 0 };
        currentContent.analytics.totalViews = 0;
        updateDashboardStats();
        saveContent();
    }
};

// --- SERVER CONSOLE & LOGS ---

let logPollingInterval;

window.fetchLogs = async function () {
    const container = document.getElementById('server-logs');
    if (!container) return;

    try {
        const data = await apiFetch('/api/admin/logs');

        if (data.success && Array.isArray(data.logs)) {
            const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;

            container.innerHTML = data.logs.map(log => {
                const timeMatch = log.match(/^\[(.*?)\]/);
                const time = timeMatch ? timeMatch[1] : '';
                const message = log.replace(/^\[.*?\]\s*/, '');

                let cssClass = 'log-info';
                if (log.includes('[ERROR]')) cssClass = 'log-error';

                return `<div><span class="log-time">[${time}]</span><span class="${cssClass}">${message}</span></div>`;
            }).join('') || '<div style="color:#666;">No logs available.</div>';

            if (wasAtBottom) container.scrollTop = container.scrollHeight;
        }
    } catch (e) {
        console.error("Log fetch failed", e);
    }
};

window.handleConsoleSubmit = async function (event) {
    event.preventDefault();
    const input = document.getElementById('console-input');
    const command = input.value.trim().toLowerCase();
    if (!command) return;

    input.value = '';
    await window.sendConsoleCommand(command);
};

window.sendConsoleCommand = async function (command) {
    try {
        const data = await apiFetch('/api/admin/console', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        if (data.success) {
            window.fetchLogs();
        } else {
            alert("Console Error: " + data.error);
        }
    } catch (e) {
        console.error("Console command failed", e);
    }
};

function startLogPolling() {
    if (logPollingInterval) clearInterval(logPollingInterval);
    window.fetchLogs();
    logPollingInterval = setInterval(window.fetchLogs, 2000);
}

function stopLogPolling() {
    if (logPollingInterval) {
        clearInterval(logPollingInterval);
        logPollingInterval = null;
    }
}

document.addEventListener('DOMContentLoaded', initAdmin);
