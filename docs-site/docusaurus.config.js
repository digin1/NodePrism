// @ts-check
const { themes } = require('prism-react-renderer');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'NodePrism — Open-Source Server Monitoring Platform',
  tagline: 'Monitor servers, KVM, OpenVZ, Virtuozzo, Docker, LXC containers, and cPanel hosting with Prometheus, Grafana, and intelligent alerting',
  favicon: 'img/favicon.ico',
  url: 'https://digin1.github.io',
  baseUrl: '/NodePrism/',
  organizationName: 'digin1',
  projectName: 'NodePrism',
  trailingSlash: false,
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  headTags: [
    {
      tagName: 'meta',
      attributes: {
        name: 'keywords',
        content: 'server monitoring, KVM monitoring, OpenVZ monitoring, Virtuozzo monitoring, cPanel monitoring, Docker monitoring, LXC monitoring, Prometheus, Grafana, alerting, anomaly detection, infrastructure monitoring, open source, self-hosted, VPS monitoring, dedicated server monitoring, LiteSpeed monitoring, Exim monitoring, libvirt',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'description',
        content: 'NodePrism is an open-source infrastructure monitoring platform. Monitor KVM, OpenVZ, Virtuozzo, Docker, and LXC containers. Track cPanel, LiteSpeed, Exim, MySQL, PostgreSQL, MongoDB, Nginx, and Apache with Prometheus and Grafana dashboards.',
      },
    },
  ],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    format: 'md',
    mermaid: true,
  },

  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.js',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        defaultMode: 'dark',
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'NodePrism',
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'docs',
            position: 'left',
            label: 'Documentation',
          },
          {
            href: 'https://github.com/digin1/NodePrism',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      metadata: [
        { name: 'og:title', content: 'NodePrism — Open-Source Server Monitoring Platform' },
        { name: 'og:description', content: 'Monitor KVM, OpenVZ, Virtuozzo, Docker, LXC containers and cPanel hosting. Prometheus + Grafana dashboards, intelligent alerting, anomaly detection.' },
        { name: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: 'NodePrism — Open-Source Server Monitoring' },
        { name: 'twitter:description', content: 'Self-hosted infrastructure monitoring for KVM, OpenVZ, Virtuozzo, Docker, cPanel. Prometheus, Grafana, alerting, anomaly detection.' },
      ],
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              { label: 'Getting Started', to: '/getting-started' },
              { label: 'Architecture', to: '/architecture/overview' },
              { label: 'Agent Scripts', to: '/agents/overview' },
            ],
          },
          {
            title: 'Community',
            items: [
              { label: 'GitHub', href: 'https://github.com/digin1/NodePrism' },
              { label: 'Issues', href: 'https://github.com/digin1/NodePrism/issues' },
            ],
          },
        ],
        copyright: `Copyright ${new Date().getFullYear()} NodePrism. Open-source server monitoring for KVM, OpenVZ, Virtuozzo, Docker, LXC, and cPanel.`,
      },
      prism: {
        theme: themes.github,
        darkTheme: themes.dracula,
        additionalLanguages: ['bash', 'json', 'yaml', 'sql', 'promql'],
      },
      mermaid: {
        theme: { light: 'neutral', dark: 'dark' },
      },
    }),
};

module.exports = config;
