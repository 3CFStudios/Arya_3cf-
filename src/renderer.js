// Mobile navigation now targets large phones/tablets up to 1024px and touch devices for consistent layouts.
// Fetch and populate content
async function loadContent() {
    try {
        const response = await fetch('/api/content');
        const data = await response.json();

        // Hero
        const heroTitle = document.querySelector('.hero-title');
        const fullTitle = `${data.hero.titlePrefix || ''}${data.hero.titleSuffix || ''}`;

        // Update Text - Simplified for better alignment with glitch
        heroTitle.innerHTML = `${data.hero.titlePrefix || ''}${data.hero.titleSuffix || ''}`;
        heroTitle.style.opacity = '1';
        heroTitle.style.visibility = 'visible';

        // Add Glitch Effect Dynamically
        heroTitle.classList.add('glitch');
        heroTitle.setAttribute('data-text', fullTitle); // Required for glitch CSS

        document.querySelector('.hero h2').innerText = data.hero.subtitle;
        document.querySelector('#hero-desc').innerText = data.hero.description;

        const focusList = document.querySelector('#hero-focus-list');

        const heroActions = document.querySelector('.hero-actions');
        if (heroActions && Array.isArray(data.hero.buttons) && data.hero.buttons.length) {
            heroActions.innerHTML = data.hero.buttons.map((btn) => `
                <a href="${btn.link || '#'}" class="action-card">
                  <span class="action-accent"></span>
                  <span class="action-content">
                    <span class="action-title">${btn.text || 'Learn More'}</span>
                    <span class="action-subtitle">Quick action</span>
                  </span>
                </a>`).join('');
        }

        focusList.innerHTML = '';
        data.hero.focusList.forEach(item => {
            focusList.innerHTML += `<li style="margin-bottom: 0.5rem;">➢ ${item}</li>`;
        });

        // About
        document.querySelector('#about-p1').innerText = data.about.p1;
        document.querySelector('#about-p2').innerHTML = data.about.p2.replace('how things work under the hood', '<strong>how things work under the hood</strong>');

        const enjoyList = document.querySelector('#about-enjoy-list');
        enjoyList.innerHTML = '';
        data.about.enjoyList.forEach(item => enjoyList.innerHTML += `<li style="margin-bottom: 0.5rem;">• ${item}</li>`);

        const apartList = document.querySelector('#about-apart-list');
        apartList.innerHTML = '';
        data.about.apartList.forEach(item => apartList.innerHTML += `<li style="margin-bottom: 0.5rem;">• ${item}</li>`);

        // Projects
        const projectsContainer = document.querySelector('#projects-container');
        projectsContainer.innerHTML = '';
        if (data.projects && Array.isArray(data.projects)) {
            data.projects.forEach((project, index) => {
                let featuresHtml = '';
                if (project.features && project.features.length > 0) {
                    featuresHtml = `
                 <div>
                    <h4 style="font-size: 0.9rem; color: var(--color-secondary); margin-bottom: 0.5rem;">FEATURES</h4>
                    <ul style="font-size: 0.9rem; line-height: 1.6; color: #ddd; padding-left: 1.2rem;">
                        ${project.features.map(f => `<li>${f}</li>`).join('')}
                    </ul>
                 </div>`;
                }

                let roleHtml = '';
                if (project.role && project.role.length > 0) {
                    roleHtml = `
                 <div>
                    <h4 style="font-size: 0.9rem; color: var(--color-secondary); margin-bottom: 0.5rem;">MY ROLE</h4>
                     <ul style="font-size: 0.9rem; line-height: 1.6; color: #ddd; padding-left: 1.2rem;">
                        ${project.role.map(r => `<li>${r}</li>`).join('')}
                    </ul>
                 </div>`;
                }

                const card = `
            <div class="glass-card" style="transition-delay: ${index * 0.12}s">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap;">
                <h3>${project.title}</h3>
                <span style="font-size: 0.8rem; border: 1px solid var(--color-primary); padding: 0.2rem 0.5rem; border-radius: 4px; color: var(--color-primary);">${project.tag}</span>
              </div>
              <p style="margin: 1rem 0; color: #aaa; font-style: italic;">${project.description}</p>
              
              <div class="project-details-grid">
                 ${featuresHtml}
                 ${roleHtml}
              </div>
              
              <div style="margin-top: 1.5rem; border-top: 1px solid var(--color-glass-border); padding-top: 1rem;">
                 <p style="font-size: 0.8rem;"><strong>Stack:</strong> ${project.stack}</p>
              </div>
            </div>`;
                projectsContainer.innerHTML += card;
            });
        }

        // Skills
        const skillsContainer = document.querySelector('#skills-container');
        skillsContainer.innerHTML = '';
        if (data.skills && Array.isArray(data.skills)) {
            data.skills.forEach((skill, index) => {
                skillsContainer.innerHTML += `
            <div class="glass-card" style="text-align: center; transition-delay: ${index * 0.12}s">
                <h3 style="font-size: 1.2rem; color: var(--color-primary); margin-bottom: 1rem;">${skill.category}</h3>
                <p>${skill.items}</p>
            </div>`;
            });
        }

        // Blog
        const blogContainer = document.querySelector('#blog-container');
        blogContainer.innerHTML = '';
        if (data.blog && Array.isArray(data.blog)) {
            data.blog.forEach((post, index) => {
                const content = post.content || 'Content coming soon...';

                // Optional media (only show if URL provided)
                let imageHtml = '';
                let videoHtml = '';

                if (post.image && post.image.trim() !== '') {
                    imageHtml = `<img src="${post.image}" alt="${post.title}" style="width: 100%; border-radius: 8px; margin-top: 1rem; max-height: 300px; object-fit: cover;">`;
                }

                if (post.video && post.video.trim() !== '') {
                    const getEmbedUrl = (url) => {
                        if (url.includes('youtube.com/watch?v=')) {
                            return url.replace('watch?v=', 'embed/');
                        }
                        if (url.includes('youtu.be/')) {
                            return url.replace('youtu.be/', 'youtube.com/embed/');
                        }
                        if (url.includes('vimeo.com/')) {
                            return url.replace('vimeo.com/', 'player.vimeo.com/video/');
                        }
                        return url;
                    };

                    const embedUrl = getEmbedUrl(post.video);
                    videoHtml = `<div style="margin-top: 1rem; position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px;">
                    <iframe src="${embedUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;" allowfullscreen></iframe>
                </div>`;
                }

                blogContainer.innerHTML += `
            <div class="glass-card" style="transition-delay: ${index * 0.12}s">
                <h3>${post.title}</h3>
                <p style="margin-top: 1rem; color: #aaa;">${post.summary}</p>
                ${imageHtml}
                ${videoHtml}
                <div id="blog-content-${index}" style="display: none; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--color-glass-border); color: #ddd; line-height: 1.6;">
                    ${content}
                </div>
                <button class="btn" onclick="toggleBlog(${index})" style="margin-top: 1.5rem; padding: 0.5rem 1.5rem; font-size: 0.7rem;">Read More</button>
            </div>`;
            });
        }

        // Helper for Blog Toggle
        window.toggleBlog = (index) => {
            const el = document.getElementById(`blog-content-${index}`);
            if (el.style.display === 'none') {
                el.style.display = 'block';
                event.target.innerText = 'Read Less';
            } else {
                el.style.display = 'none';
                event.target.innerText = 'Read More';
            }
        };

        // Experience
        const expContainer = document.querySelector('#experience-list');
        if (expContainer && data.experience && data.experience[0]) {
            expContainer.innerHTML = '';
            data.experience[0].items.forEach(item => {
                expContainer.innerHTML += `<li>${item}</li>`;
            });
            const roleTitle = document.querySelector('#experience-title');
            if (roleTitle) roleTitle.innerText = data.experience[0].title;
        }

        // Achievements
        const achContainer = document.querySelector('#achievements-list');
        if (achContainer && data.achievements && data.achievements[0]) {
            achContainer.innerHTML = '';
            data.achievements[0].items.forEach(item => {
                achContainer.innerHTML += `<li style="margin-bottom: 1rem;">${item}</li>`;
            });
        }

        // Contact
        document.querySelector('#contact h2').innerText = data.contact.title;
        document.querySelector('#contact p').innerText = data.contact.subtitle;
        document.querySelector('#contact a.btn').innerText = data.contact.email;
        document.querySelector('#contact a.btn').href = `https://mail.google.com/mail/?view=cm&to=${data.contact.email}`;
        document.querySelector('#contact a.btn').target = '_blank';

        // Socials
        const socialsContainer = document.querySelector('#socials-container');
        socialsContainer.innerHTML = '';

        data.contact.socials.forEach(social => {
            socialsContainer.innerHTML += `
            <a href="${social.link}" 
               style="color: var(--color-primary); text-decoration: none; padding: 0.5rem 1rem; border: 1px solid var(--color-glass-border); border-radius: 20px; transition: 0.3s; background: rgba(255,255,255,0.05);">
               ${social.name}
            </a>`;
        });

        const footerText = document.querySelector('footer p');
        if (footerText) footerText.textContent = data.footer?.copyright || footerText.textContent;

        // Apply Theme
        if (data.theme) {
            document.documentElement.style.setProperty('--color-primary', data.theme.primary);
            document.documentElement.style.setProperty('--color-secondary', data.theme.secondary);
            document.documentElement.style.setProperty('--color-bg', data.theme.bg);
        }

        // Custom Sections - Render and insert based on section order
        if (data.customSections && data.customSections.length > 0) {
            // Remove old custom sections first
            document.querySelectorAll('.custom-section').forEach(el => el.remove());

            data.customSections.forEach(section => {
                let styleClass = 'glass-card';
                let wrapperStyle = '';

                if (section.style === 'full') {
                    styleClass = '';
                    wrapperStyle = 'background: rgba(255,255,255,0.02); padding: 3rem 2rem;';
                } else if (section.style === 'highlight') {
                    styleClass = '';
                    wrapperStyle = 'background: linear-gradient(135deg, rgba(0, 243, 255, 0.1), rgba(189, 0, 255, 0.1)); padding: 2rem; border-radius: 12px; border: 1px solid rgba(0, 243, 255, 0.3);';
                }

                const sectionHtml = `
                <section id="${section.id}" class="container custom-section" style="padding: 4rem 0; ${wrapperStyle}">
                    <div class="${styleClass}">
                        <h2 style="margin-bottom: 2rem; text-align: center;">${section.title}</h2>
                        <div style="line-height: 1.8; color: #ccc;">${section.content}</div>
                    </div>
                </section>`;

                // Find where to insert based on sectionOrder
                if (data.sectionOrder) {
                    const orderIndex = data.sectionOrder.indexOf(section.id);
                    if (orderIndex > -1 && orderIndex < data.sectionOrder.length - 1) {
                        const nextSectionId = data.sectionOrder[orderIndex + 1];
                        const nextSection = document.getElementById(nextSectionId);
                        if (nextSection) {
                            nextSection.insertAdjacentHTML('beforebegin', sectionHtml);
                            return;
                        }
                    }
                }
                // Default: insert before contact
                const contactSection = document.getElementById('contact');
                if (contactSection) {
                    contactSection.insertAdjacentHTML('beforebegin', sectionHtml);
                }
            });
        }

    } catch (error) {
        console.error('Error loading content:', error);
        console.warn('Falling back to static markup content due to API failure.');
    }

    // Mobile Menu Toggle
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');
    const mobileNavQuery = window.matchMedia('(max-width: 1024px), (pointer: coarse)');

    const closeMenu = () => {
        if (!hamburger || !navLinks) return;
        hamburger.classList.remove('active');
        navLinks.classList.remove('active');
        navLinks.style.visibility = 'hidden';
        navLinks.style.pointerEvents = 'none';
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.setAttribute('aria-label', 'Open navigation menu');
        navLinks.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('nav-open');
    };

    const openMenu = () => {
        if (!hamburger || !navLinks) return;
        hamburger.classList.add('active');
        navLinks.classList.add('active');
        navLinks.style.visibility = 'visible';
        navLinks.style.pointerEvents = 'auto';
        hamburger.setAttribute('aria-expanded', 'true');
        hamburger.setAttribute('aria-label', 'Close navigation menu');
        navLinks.setAttribute('aria-hidden', 'false');
        document.body.classList.add('nav-open');
        const firstLink = navLinks.querySelector('a');
        firstLink?.focus();
    };

    if (hamburger && navLinks) {
        navLinks.setAttribute('aria-hidden', mobileNavQuery.matches ? 'true' : 'false');
        hamburger.addEventListener('click', () => {
            if (navLinks.classList.contains('active')) {
                closeMenu();
            } else {
                openMenu();
            }
        });

        // Close menu when link is clicked
        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', () => {
                closeMenu();
            });
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && navLinks.classList.contains('active')) {
                closeMenu();
            }
        });
    }

    const mobileAccountToggle = document.querySelector('.mobile-account-toggle');
    const mobileAccountMenu = document.querySelector('.mobile-account-menu');

    if (mobileAccountToggle && mobileAccountMenu) {
        mobileAccountToggle.addEventListener('click', () => {
            const isOpen = mobileAccountMenu.classList.toggle('open');
            mobileAccountToggle.setAttribute('aria-expanded', String(isOpen));
        });

        mobileAccountMenu.querySelectorAll('a, button').forEach((item) => {
            item.addEventListener('click', () => {
                mobileAccountMenu.classList.remove('open');
                mobileAccountToggle.setAttribute('aria-expanded', 'false');
            });
        });

        document.addEventListener('click', (event) => {
            if (!mobileAccountMenu.contains(event.target) && !mobileAccountToggle.contains(event.target)) {
                mobileAccountMenu.classList.remove('open');
                mobileAccountToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }
}

// Check Auth and Update Nav
async function checkLoginStatus() {
    try {
        const res = await fetch('/api/auth-status');
        const data = await res.json();

        const mobileLogin = document.querySelector('.mobile-login');
        const mobileAccountLink = document.querySelector('.mobile-account-link');
        const mobileLogout = document.querySelector('.mobile-logout');

        if (data.name) {
            // User is logged in
            const navList = document.querySelector('.nav-links');
            const loginBtn = navList.querySelector('.nav-login');

            if (loginBtn) {
                loginBtn.href = "/account.html";
                loginBtn.innerHTML = `Account`;
                loginBtn.style.borderColor = 'var(--color-secondary)';
                loginBtn.style.color = 'var(--color-secondary) !important';
                loginBtn.classList.add('logged-in'); // Additional class if needed

                if (!navList.querySelector('.nav-logout')) {
                    const logoutItem = document.createElement('li');
                    const logoutLink = document.createElement('a');
                    logoutLink.href = '#';
                    logoutLink.innerText = 'Logout';
                    logoutLink.classList.add('nav-logout');
                    logoutLink.addEventListener('click', async (e) => {
                        e.preventDefault();
                        await fetch('/api/logout', { method: 'POST' });
                        window.location.reload();
                    });
                    logoutItem.appendChild(logoutLink);
                    navList.appendChild(logoutItem);
                }
            }

            if (mobileLogin && mobileAccountLink && mobileLogout) {
                mobileLogin.style.display = 'none';
                mobileAccountLink.style.display = 'block';
                mobileLogout.style.display = 'block';

                if (!mobileLogout.dataset.bound) {
                    mobileLogout.dataset.bound = 'true';
                    mobileLogout.addEventListener('click', async () => {
                        await fetch('/api/logout', { method: 'POST' });
                        window.location.reload();
                    });
                }
            }
        } else if (mobileLogin && mobileAccountLink && mobileLogout) {
            mobileLogin.style.display = 'block';
            mobileAccountLink.style.display = 'none';
            mobileLogout.style.display = 'none';
        }
    } catch (e) {
        console.error("Auth check failed", e);
    }
}

// Ensure loadContent is called
loadContent();
checkLoginStatus();
