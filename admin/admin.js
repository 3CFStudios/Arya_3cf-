let contentData = {};
let blogManagerState = { editingId: null, posts: [] };
let blogStatsCount = 0;

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
async function init() {
    // Server guarantees auth now, so just load data
    await loadData();
    await loadBlogManager();
}

async function logout() {
    await apiFetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html'; // Redirect to login
}

// --- DATA LOADING & FORM ---

async function loadData() {
    contentData = await apiFetch('/api/content');
    populateForms();
}

function populateForms() {
    try {
        // Hero
        if (contentData.hero) {
            document.getElementById('hero-titlePrefix').value = contentData.hero.titlePrefix || '';
            document.getElementById('hero-titleSuffix').value = contentData.hero.titleSuffix || '';
            document.getElementById('hero-subtitle').value = contentData.hero.subtitle || '';
            document.getElementById('hero-description').value = contentData.hero.description || '';
            document.getElementById('hero-focusList').value = contentData.hero.focusList ? contentData.hero.focusList.join('\n') : '';
        }

        // About
        if (contentData.about) {
            document.getElementById('about-p1').value = contentData.about.p1 || '';
            document.getElementById('about-p2').value = contentData.about.p2 || '';
            document.getElementById('about-enjoyList').value = contentData.about.enjoyList ? contentData.about.enjoyList.join('\n') : '';
            document.getElementById('about-apartList').value = contentData.about.apartList ? contentData.about.apartList.join('\n') : '';
        }

        // Achievements
        if (contentData.achievements && contentData.achievements.length > 0) {
            document.getElementById('achievements-items').value = contentData.achievements[0].items.join('\n');
        }

        // Contact
        if (contentData.contact) {
            document.getElementById('contact-title').value = contentData.contact.title || '';
            document.getElementById('contact-subtitle').value = contentData.contact.subtitle || '';
            document.getElementById('contact-email').value = contentData.contact.email || '';

            // Theme & Security
            if (contentData.theme) {
                const pColor = document.getElementById('theme-primary');
                const sColor = document.getElementById('theme-secondary');
                const bgColor = document.getElementById('theme-bg');
                if (pColor) pColor.value = contentData.theme.primary;
                if (sColor) sColor.value = contentData.theme.secondary;
                if (bgColor) bgColor.value = contentData.theme.bg;
            }
            const passEl = document.getElementById('site-password');
            if (passEl) passEl.value = contentData.sitePassword || '';
        }

        renderProjects();
        renderSkills();
        renderExperience();
        refreshBlogStats();
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
    if (!contentData) return;

    const setStat = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    };

    setStat('stat-projects', contentData.projects?.length || 0);
    setStat('stat-blog', blogStatsCount);
    setStat('stat-skills', contentData.skills?.length || 0);
    setStat('stat-socials', contentData.contact?.socials?.length || 0);
    setStat('overview-projects', contentData.projects?.length || 0);
    setStat('overview-blog', blogStatsCount);

    // Add Total Views if stat card exists
    setStat('stat-views', contentData.analytics?.totalViews || 0);
}

/* --- Render Functions --- */

function renderProjects() {
    const container = document.getElementById('projects-list');
    if (!container) return;
    container.innerHTML = '';
    if (!contentData.projects || !Array.isArray(contentData.projects)) return;
    contentData.projects.forEach((proj, index) => {
        container.innerHTML += `
        <div class="item-list">
            <div class="item-header"><strong>Project ${index + 1}</strong> <span class="delete-btn" onclick="deleteItem('projects', ${index})">Delete</span></div>
            <div class="form-group"><label>Title</label><input type="text" onchange="updateArrayItem('projects', ${index}, 'title', this.value)" value="${proj.title}"></div>
            <div class="form-group"><label>Tag</label><input type="text" onchange="updateArrayItem('projects', ${index}, 'tag', this.value)" value="${proj.tag}"></div>
            <div class="form-group"><label>Description</label><textarea onchange="updateArrayItem('projects', ${index}, 'description', this.value)">${proj.description}</textarea></div>
            <div class="form-group"><label>Stack</label><input type="text" onchange="updateArrayItem('projects', ${index}, 'stack', this.value)" value="${proj.stack}"></div>
            
            <div class="form-group"><label>Features (One per line)</label><textarea onchange="updateArrayList('projects', ${index}, 'features', this.value)">${proj.features ? proj.features.join('\n') : ''}</textarea></div>
            <div class="form-group"><label>My Role (One per line)</label><textarea onchange="updateArrayList('projects', ${index}, 'role', this.value)">${proj.role ? proj.role.join('\n') : ''}</textarea></div>
        </div>`;
    });
}

function renderSkills() {
    const container = document.getElementById('skills-list');
    if (!container) return;
    container.innerHTML = '';
    if (!contentData.skills || !Array.isArray(contentData.skills)) return;
    contentData.skills.forEach((skill, index) => {
        container.innerHTML += `
        <div class="item-list">
            <div class="item-header"><strong>Category ${index + 1}</strong> <span class="delete-btn" onclick="deleteItem('skills', ${index})">Delete</span></div>
            <div class="form-group"><label>Category Name</label><input type="text" onchange="updateArrayItem('skills', ${index}, 'category', this.value)" value="${skill.category}"></div>
            <div class="form-group"><label>Items (Use • to separate)</label><input type="text" onchange="updateArrayItem('skills', ${index}, 'items', this.value)" value="${skill.items}"></div>
        </div>`;
    });
}

function renderExperience() {
    const container = document.getElementById('experience-list');
    if (!container) return;
    container.innerHTML = '';
    if (!contentData.experience || !Array.isArray(contentData.experience)) return;
    contentData.experience.forEach((exp, index) => {
        container.innerHTML += `
        <div class="item-list">
             <div class="item-header"><strong>Role ${index + 1}</strong> </div>
            <div class="form-group"><label>Title</label><input type="text" onchange="updateArrayItem('experience', ${index}, 'title', this.value)" value="${exp.title}"></div>
            <div class="form-group"><label>Items (One per line)</label><textarea onchange="updateArrayList('experience', ${index}, 'items', this.value)">${exp.items.join('\n')}</textarea></div>
        </div>`;
    });
}

async function loadBlogManager() {
    try {
        const data = await apiFetch('/api/admin/blog');
        blogManagerState.posts = Array.isArray(data.items) ? data.items : [];
        blogStatsCount = data.total || blogManagerState.posts.length;
        renderBlogManager();
        updateDashboardStats();
    } catch (error) {
        console.error('Blog manager load failed', error);
    }
}

window.refreshBlogManager = async function () {
    await loadBlogManager();
};

function renderBlogManager() {
    const container = document.getElementById('blog-manager-list');
    if (!container) return;
    container.innerHTML = '';
    blogManagerState.posts.forEach((post) => {
        container.innerHTML += `
        <div class="item-list">
            <div class="item-header"><strong>${post.title}</strong> <span class="delete-btn" onclick="deleteBlogPost('${post._id}')">Delete</span></div>
            <div style="display:flex; gap:1rem; flex-wrap:wrap; font-size:0.85rem; color:#999;">
                <span>Status: ${post.status}</span>
                <span>Slug: ${post.slug}</span>
                <span>Updated: ${new Date(post.updatedAt || post.createdAt).toLocaleDateString()}</span>
            </div>
            <button class="quick-btn" style="margin-top:0.75rem;" onclick="editBlogPost('${post._id}')">✏️ Edit</button>
        </div>`;
    });
}

window.resetBlogForm = function () {
    blogManagerState.editingId = null;
    document.getElementById('blog-title').value = '';
    document.getElementById('blog-summary').value = '';
    document.getElementById('blog-content').value = '';
    document.getElementById('blog-tags').value = '';
    document.getElementById('blog-status').value = 'draft';
    document.getElementById('blog-image').value = '';
    document.getElementById('blog-image-url').value = '';
    document.getElementById('blog-video-url').value = '';
};

window.editBlogPost = function (id) {
    const post = blogManagerState.posts.find(item => item._id === id);
    if (!post) return;
    blogManagerState.editingId = id;
    document.getElementById('blog-title').value = post.title || '';
    document.getElementById('blog-summary').value = post.summary || '';
    document.getElementById('blog-content').value = post.content || '';
    document.getElementById('blog-tags').value = (post.tags || []).join(', ');
    document.getElementById('blog-status').value = post.status || 'draft';
    document.getElementById('blog-image-url').value = post.imageUrl || '';
    document.getElementById('blog-video-url').value = post.videoUrl || '';
};

window.submitBlogPost = async function () {
    const formData = new FormData();
    formData.append('title', document.getElementById('blog-title').value.trim());
    formData.append('summary', document.getElementById('blog-summary').value.trim());
    formData.append('content', document.getElementById('blog-content').value.trim());
    formData.append('tags', document.getElementById('blog-tags').value.trim());
    formData.append('status', document.getElementById('blog-status').value);
    formData.append('imageUrl', document.getElementById('blog-image-url').value.trim());
    formData.append('videoUrl', document.getElementById('blog-video-url').value.trim());

    const imageFile = document.getElementById('blog-image').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    }

    const endpoint = blogManagerState.editingId
        ? `/api/admin/blog/${blogManagerState.editingId}`
        : '/api/admin/blog';
    const method = blogManagerState.editingId ? 'PATCH' : 'POST';

    const res = await fetch(endpoint, {
        method,
        credentials: 'include',
        body: formData
    });
    const data = await res.json();
    if (!data.success) {
        alert(data.error || 'Failed to save blog post');
        return;
    }
    resetBlogForm();
    await loadBlogManager();
};

window.deleteBlogPost = async function (id) {
    if (!confirm('Delete this blog post?')) return;
    const res = await fetch(`/api/admin/blog/${id}`, {
        method: 'DELETE',
        credentials: 'include'
    });
    const data = await res.json();
    if (!data.success) {
        alert(data.error || 'Failed to delete post');
        return;
    }
    await loadBlogManager();
};

function refreshBlogStats() {
    blogStatsCount = blogManagerState.posts.length;
}

function renderSocials() {
    const container = document.getElementById('socials-list');
    if (!container) return;
    container.innerHTML = '';
    if (!contentData.contact || !contentData.contact.socials || !Array.isArray(contentData.contact.socials)) return;
    contentData.contact.socials.forEach((social, index) => {
        container.innerHTML += `
        <div class="item-list">
            <div class="item-header"><strong>${social.name}</strong> <span class="delete-btn" onclick="deleteSocial(${index})">Delete</span></div>
            <div class="form-group"><label>Platform Name</label><input type="text" onchange="updateSocialName(${index}, this.value)" value="${social.name}"></div>
            <div class="form-group"><label>Link URL</label><input type="text" onchange="updateSocialLink(${index}, this.value)" value="${social.link}"></div>
        </div>`;
    });
}


/* --- Logic Helpers --- */

window.updateArrayItem = (section, index, key, value) => {
    contentData[section][index][key] = value;
};

// For splitting textarea lines into array
window.updateArrayList = (section, index, key, value) => {
    contentData[section][index][key] = value.split('\n').filter(line => line.trim() !== '');
};

window.updateSocialLink = (index, value) => {
    contentData.contact.socials[index].link = value;
};

window.deleteItem = (section, index) => {
    if (confirm('Are you sure?')) {
        contentData[section].splice(index, 1);
        populateForms();
    }
};

window.addProject = () => {
    contentData.projects.push({
        title: "New Project", tag: "Tech", description: "Desc", stack: "Stack", role: [], features: []
    });
    renderProjects();
};

window.addBlogPost = () => {
    showSection('blogManager');
};

window.addSkill = () => {
    contentData.skills.push({ category: "New Category", items: "Skill 1 • Skill 2" });
    renderSkills();
    updateDashboardStats();
};

window.addExperience = () => {
    contentData.experience.push({ title: "New Role", subtitle: "", items: ["Responsibility 1"] });
    renderExperience();
};

window.addSocial = () => {
    contentData.contact.socials.push({ name: "New Platform", link: "https://" });
    renderSocials();
    updateDashboardStats();
};

window.updateSocialName = (index, value) => {
    contentData.contact.socials[index].name = value;
};

window.deleteSocial = (index) => {
    if (confirm('Delete this social link?')) {
        contentData.contact.socials.splice(index, 1);
        renderSocials();
        updateDashboardStats();
    }
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
    } else if (sectionId === 'blogManager') {
        refreshBlogManager();
        stopLogPolling();
    } else if (sectionId === 'server') {
        startLogPolling();
    } else {
        stopLogPolling();
    }
};


window.saveContent = async () => {
    const getValue = (id) => {
        const el = document.getElementById(id);
        return el ? el.value : '';
    };

    const getList = (id) => {
        const val = getValue(id);
        return val.split('\n').filter(x => x.trim());
    };

    // Hero
    if (contentData.hero) {
        contentData.hero.titlePrefix = getValue('hero-titlePrefix');
        contentData.hero.titleSuffix = getValue('hero-titleSuffix');
        contentData.hero.subtitle = getValue('hero-subtitle');
        contentData.hero.description = getValue('hero-description');
        contentData.hero.focusList = getList('hero-focusList');
    }

    // About
    if (contentData.about) {
        contentData.about.p1 = getValue('about-p1');
        contentData.about.p2 = getValue('about-p2');
        contentData.about.enjoyList = getList('about-enjoyList');
        contentData.about.apartList = getList('about-apartList');
    }

    // Achievements
    if (contentData.achievements && contentData.achievements.length > 0) {
        contentData.achievements[0].items = getList('achievements-items');
    }

    // Contact
    if (contentData.contact) {
        contentData.contact.title = getValue('contact-title');
        contentData.contact.subtitle = getValue('contact-subtitle');
        contentData.contact.email = getValue('contact-email');
    }

    // Theme & Security
    contentData.theme = {
        primary: getValue('theme-primary') || contentData.theme?.primary || '#00f3ff',
        secondary: getValue('theme-secondary') || contentData.theme?.secondary || '#bd00ff',
        bg: getValue('theme-bg') || contentData.theme?.bg || '#050505'
    };
    contentData.sitePassword = getValue('site-password');

    try {
        const result = await apiFetch('/api/content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(contentData)
        });

        if (result.success) {
            alert('Saved successfully!');
            // Refresh dashboard stats after save
            updateDashboardStats();
        } else {
            alert('Error: ' + (result.error || 'Save failed'));
        }
    } catch (e) {
        console.error("Save error:", e);
        alert('Network error. Check console for details.');
    }
};

/* --- Custom Sections --- */

function renderCustomSections() {
    if (!contentData.customSections) contentData.customSections = [];
    const container = document.getElementById('custom-sections-list');
    container.innerHTML = '';

    contentData.customSections.forEach((section, index) => {
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
    if (!contentData.customSections) contentData.customSections = [];
    const id = 'custom-' + Date.now();
    contentData.customSections.push({
        id: id,
        title: 'New Section',
        content: 'Your content here...',
        style: 'card'
    });
    // Also add to section order
    if (!contentData.sectionOrder) contentData.sectionOrder = ["hero", "about", "projects", "skills", "experience", "blog", "contact"];
    contentData.sectionOrder.push(id);
    renderCustomSections();
    renderSectionOrder();
};

window.updateCustomSection = (index, key, value) => {
    contentData.customSections[index][key] = value;
};

window.deleteCustomSection = (index) => {
    if (confirm('Delete this custom section?')) {
        const id = contentData.customSections[index].id;
        contentData.customSections.splice(index, 1);
        // Remove from section order
        const orderIndex = contentData.sectionOrder.indexOf(id);
        if (orderIndex > -1) contentData.sectionOrder.splice(orderIndex, 1);
        renderCustomSections();
        renderSectionOrder();
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
    if (!contentData.sectionOrder) {
        contentData.sectionOrder = ["hero", "about", "projects", "skills", "experience", "blog", "contact"];
    }
    const container = document.getElementById('section-order-list');
    container.innerHTML = '';

    contentData.sectionOrder.forEach((sectionId, index) => {
        const isCustom = sectionId.startsWith('custom-');
        const customSection = isCustom ? contentData.customSections.find(s => s.id === sectionId) : null;
        const label = isCustom ? `✨ ${customSection?.title || sectionId}` : (sectionLabels[sectionId] || sectionId);

        container.innerHTML += `
        <div class="item-list" style="display: flex; align-items: center; justify-content: space-between; padding: 0.8rem 1rem;">
            <span style="font-size: 0.9rem;">${label}</span>
            <div style="display: flex; gap: 0.5rem;">
                <button class="quick-btn" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="moveSectionUp(${index})" ${index === 0 ? 'disabled style="opacity: 0.3;"' : ''}>⬆️</button>
                <button class="quick-btn" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="moveSectionDown(${index})" ${index === contentData.sectionOrder.length - 1 ? 'disabled style="opacity: 0.3;"' : ''}>⬇️</button>
            </div>
        </div>`;
    });
}

window.moveSectionUp = (index) => {
    if (index <= 0) return;
    const temp = contentData.sectionOrder[index];
    contentData.sectionOrder[index] = contentData.sectionOrder[index - 1];
    contentData.sectionOrder[index - 1] = temp;
    renderSectionOrder();
};

window.moveSectionDown = (index) => {
    if (index >= contentData.sectionOrder.length - 1) return;
    const temp = contentData.sectionOrder[index];
    contentData.sectionOrder[index] = contentData.sectionOrder[index + 1];
    contentData.sectionOrder[index + 1] = temp;
    renderSectionOrder();
};

window.exportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(contentData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "arya_website_backup_" + new Date().toISOString().split('T')[0] + ".json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};

window.resetAnalytics = () => {
    if (confirm('Are you sure you want to reset the view counter to 0?')) {
        if (!contentData.analytics) contentData.analytics = { totalViews: 0 };
        contentData.analytics.totalViews = 0;
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

init();
