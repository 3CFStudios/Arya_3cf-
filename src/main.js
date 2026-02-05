// Touch-input detection keeps the custom cursor disabled on touch devices (mobile layout up to 1024px).
// Custom Cursor Setup
let cursorDot;
let cursorOutline;
let cursorMoveHandler;
let cursorDisabledForTouch = false;

const hasTouchInput = () => {
  return (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)
    || window.matchMedia('(pointer: coarse)').matches;
};

const initCursor = () => {
  if (cursorDisabledForTouch) {
    return false;
  }
  cursorDot = document.querySelector('.cursor-dot');
  cursorOutline = document.querySelector('.cursor-outline');

  if (!cursorDot || !cursorOutline) {
    document.body?.classList.remove('custom-cursor');
    document.body?.classList.add('no-custom-cursor');
    console.warn("Custom cursor elements not found in DOM");
    return false;
  }
  document.body?.classList.add('custom-cursor');
  document.body?.classList.remove('no-custom-cursor');
  return true;
};

const disableCustomCursor = () => {
  document.body?.classList.remove('custom-cursor');
  document.body?.classList.add('no-custom-cursor');
  document.querySelectorAll('.cursor-dot, .cursor-outline').forEach((el) => el.remove());
  if (cursorMoveHandler) {
    window.removeEventListener('mousemove', cursorMoveHandler);
  }
};

cursorMoveHandler = function (e) {
  if (!cursorDot || !cursorOutline) {
    if (!initCursor()) return;
  }

  const posX = e.clientX;
  const posY = e.clientY;

  cursorDot.style.opacity = '1';
  cursorDot.style.setProperty('--cursor-x', `${posX}px`);
  cursorDot.style.setProperty('--cursor-y', `${posY}px`);

  cursorOutline.style.opacity = '1';
  cursorOutline.style.setProperty('--cursor-x', `${posX}px`);
  cursorOutline.style.setProperty('--cursor-y', `${posY}px`);
  cursorOutline.animate({
    transform: `translate3d(${posX}px, ${posY}px, 0) translate(-50%, -50%)`
  }, { duration: 500, fill: "forwards" });
};

// Interactive Cursor Effects
const addCursorListeners = () => {
  if (!cursorDot || !cursorOutline) return;

  const interactives = document.querySelectorAll('a, button, .btn, input, textarea, [role="button"]');
  interactives.forEach(el => {
    // Prevent double listeners
    if (el.dataset.cursorBound) return;
    el.dataset.cursorBound = "true";

    el.addEventListener('mouseenter', () => {
      cursorOutline.style.width = '70px';
      cursorOutline.style.height = '70px';
      cursorOutline.style.backgroundColor = 'rgba(0, 243, 255, 0.1)';
      cursorOutline.style.borderColor = 'var(--color-primary)';
      cursorDot.style.setProperty('--cursor-scale', '1.5');
    });
    el.addEventListener('mouseleave', () => {
      cursorOutline.style.width = '40px';
      cursorOutline.style.height = '40px';
      cursorOutline.style.backgroundColor = 'transparent';
      cursorOutline.style.borderColor = 'var(--color-primary)';
      cursorDot.style.setProperty('--cursor-scale', '1');
    });
  });
};

// Start initialization when DOM is ready
const startCursorSystem = () => {
  if (hasTouchInput()) {
    cursorDisabledForTouch = true;
    disableCustomCursor();
    return;
  }

  if (initCursor()) {
    addCursorListeners();
    window.addEventListener('mousemove', cursorMoveHandler);

    const observer_cursor = new MutationObserver(() => {
      addCursorListeners();
    });

    if (document.body) {
      observer_cursor.observe(document.body, { childList: true, subtree: true });
    }
  }
};

// Scroll Animations Helper
const addScrollListeners = () => {
  const targets = document.querySelectorAll('section:not(.scroll-observed), .glass-card:not(.scroll-observed), h2:not(.scroll-observed), .btn:not(.scroll-observed)');
  targets.forEach(el => {
    el.classList.add('reveal');
    el.classList.add('scroll-observed'); // Prevent double observing
    observer.observe(el);
  });
};

// Canvas Background Animation
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');

let width, height;
let particles = [];
const particleCount = 60; // Adjust for density
const connectionDistance = 150;
const mouseDistance = 200;
let animationManager;

class AnimationManager {
  constructor({ fps = 60 } = {}) {
    this.fps = fps;
    this.frameDuration = 1000 / fps;
    this.tasks = new Set();
    this.lastTime = 0;
    this.accumulator = 0;
    this.rafId = null;
    this.visibilityBound = false;
    this.loop = this.loop.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  addTask(task) {
    this.tasks.add(task);
  }

  removeTask(task) {
    this.tasks.delete(task);
  }

  start() {
    if (this.rafId) return;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
    if (!this.visibilityBound) {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityBound = true;
    }
  }

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.lastTime = 0;
    this.accumulator = 0;
  }

  handleVisibilityChange() {
    if (document.hidden) {
      this.stop();
    } else {
      this.start();
    }
  }

  loop(currentTime) {
    if (!this.lastTime) {
      this.lastTime = currentTime;
    }
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;
    this.accumulator += deltaTime;

    const maxAccumulated = this.frameDuration * 5;
    if (this.accumulator > maxAccumulated) {
      this.accumulator = maxAccumulated;
    }

    if (this.accumulator >= this.frameDuration) {
      const step = this.accumulator;
      this.accumulator = 0;
      this.tasks.forEach(task => task(step, currentTime));
    }

    this.rafId = requestAnimationFrame(this.loop);
  }
}

const getPreferredFps = () => {
  const isSmallScreen = window.matchMedia('(max-width: 768px)').matches;
  const cpuCores = navigator.hardwareConcurrency || 4;
  if (isSmallScreen || cpuCores < 4) {
    return 60;
  }
  return 120;
};

class Particle {
  constructor() {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.vx = (Math.random() - 0.5) * 0.03;
    this.vy = (Math.random() - 0.5) * 0.03;
    this.size = Math.random() * 2;
    this.color = 'rgba(0, 243, 255, 0.5)'; // Cyan
  }

  update(deltaTime) {
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;

    if (this.x < 0 || this.x > width) this.vx *= -1;
    if (this.y < 0 || this.y > height) this.vy *= -1;
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}

function initCanvas() {
  resizeCanvas();
  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
  }
  if (!animationManager) {
    animationManager = new AnimationManager({ fps: getPreferredFps() });
  }
  animationManager.addTask(animate);
  animationManager.start();
}

function resizeCanvas() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
}

function updateAnimationFps() {
  if (!animationManager) return;
  const nextFps = getPreferredFps();
  if (animationManager.fps !== nextFps) {
    animationManager.fps = nextFps;
    animationManager.frameDuration = 1000 / nextFps;
  }
}

function animate(deltaTime) {
  ctx.clearRect(0, 0, width, height);

  particles.forEach(p => {
    p.update(deltaTime);
    p.draw();
  });

  drawConnections();
}

function drawConnections() {
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < connectionDistance) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(0, 243, 255, ${1 - dist / connectionDistance})`;
        ctx.lineWidth = 0.5;
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.stroke();
      }
    }
  }
}

window.addEventListener('resize', () => {
  resizeCanvas();
  updateAnimationFps();
});

initCanvas();

// Scroll Animations (Expanded)
const observerOptions = {
  threshold: 0.1,
  rootMargin: "0px 0px -50px 0px" // Trigger slightly before element is fully in view
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('active');
      observer.unobserve(entry.target); // Only animate once
    }
  });
}, observerOptions);


// Cookie Banner Logic
const initCookieBanner = () => {
  const banner = document.getElementById('cookie-banner');
  const acceptBtn = document.getElementById('accept-cookies');

  if (!banner || !acceptBtn) return;

  // Check if already accepted
  const hasConsent = localStorage.getItem('cookieConsent') || localStorage.getItem('cookieConcent');
  if (!hasConsent) {
    setTimeout(() => {
      banner.classList.add('show');
    }, 2000);
  }

  acceptBtn.addEventListener('click', () => {
    localStorage.setItem('cookieConsent', 'true');
    banner.classList.remove('show');
  });
};

// Initialization logic
const initAll = () => {
  startCursorSystem();
  addScrollListeners();
  initCookieBanner();

  // Re-check for new elements when DOM changes (Ajax/Renderer)
  const observer_all = new MutationObserver(() => {
    addScrollListeners();
  });
  observer_all.observe(document.body, { childList: true, subtree: true });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}
