export const defaultContent = {
  site: {
    title: 'ARYA | Builder. Tech Nerd. Systems Enjoyer.',
    seo: {
      description: 'Portfolio and experiments by Arya.',
      keywords: ['portfolio', 'developer', 'systems'],
      ogImage: ''
    }
  },
  nav: [
    { label: 'Home', href: '#home' },
    { label: 'About', href: '#about' },
    { label: 'Projects', href: '#projects' },
    { label: 'Skills', href: '#skills' },
    { label: 'Blog', href: '#blog' }
  ],
  hero: {
    headline: 'Arya',
    subheadline: 'Builder. Tech Nerd. Systems Enjoyer.',
    description: 'Building useful systems with clean UX.',
    ctaText: 'View Projects',
    ctaHref: '#projects',
    image: '',
    focusList: ['Product systems', 'Performance', 'Automation']
  },
  sections: {
    about: {
      title: 'About Me',
      p1: '',
      p2: '',
      enjoyList: [],
      apartList: []
    },
    projects: [],
    skills: [],
    experience: [],
    achievements: [],
    blog: []
  },
  footer: {
    email: 'www.vlarya.com@gmail.com',
    phone: '',
    address: '',
    copyright: '© Arya — Built with curiosity and too much caffeine..',
    socials: [
      { name: 'Email', link: 'mailto:www.vlarya.com@gmail.com' }
    ]
  },
  theme: {
    primary: '#00f3ff',
    secondary: '#bd00ff',
    bg: '#050505'
  },
  analytics: {
    totalViews: 0
  }
};

const deepMerge = (base, incoming) => {
  if (incoming === undefined) return base;
  if (Array.isArray(incoming)) return incoming;
  if (incoming && typeof incoming === 'object') {
    const result = { ...(base && typeof base === 'object' ? base : {}) };
    Object.keys(incoming).forEach((key) => {
      result[key] = deepMerge(result[key], incoming[key]);
    });
    return result;
  }
  return incoming;
};

export const normalizeContent = (raw) => {
  const legacy = raw || {};
  const fromLegacy = {
    site: legacy.site || undefined,
    nav: legacy.nav || undefined,
    hero: legacy.hero
      ? {
          headline: `${legacy.hero.titlePrefix || ''}${legacy.hero.titleSuffix || ''}`.trim() || legacy.hero.headline,
          subheadline: legacy.hero.subtitle,
          description: legacy.hero.description,
          ctaText: legacy.hero.ctaText,
          ctaHref: legacy.hero.ctaHref,
          image: legacy.hero.image,
          focusList: legacy.hero.focusList
        }
      : undefined,
    sections: {
      about: legacy.about,
      projects: legacy.projects,
      skills: legacy.skills,
      experience: legacy.experience,
      achievements: legacy.achievements,
      blog: legacy.blog
    },
    footer: legacy.footer || (legacy.contact ? {
      email: legacy.contact.email,
      phone: legacy.contact.phone,
      address: legacy.contact.address,
      socials: legacy.contact.socials
    } : undefined),
    theme: legacy.theme,
    analytics: legacy.analytics
  };

  return deepMerge(defaultContent, deepMerge(fromLegacy, legacy));
};
