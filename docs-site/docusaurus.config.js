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
        content: 'server monitoring, KVM monitoring, OpenVZ monitoring, Virtuozzo monitoring, cPanel monitoring, Docker monitoring, LXC monitoring, Prometheus, Grafana, alerting, anomaly detection, infrastructure monitoring, open source, self-hosted, VPS monitoring, dedicated server monitoring, LiteSpeed monitoring, Exim monitoring, libvirt, Datadog alternative, Netdata alternative, Zabbix alternative',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'description',
        content: 'NodePrism is an open-source infrastructure monitoring platform. Monitor KVM, OpenVZ, Virtuozzo, Docker, and LXC containers. Track cPanel, LiteSpeed, Exim, MySQL, PostgreSQL, MongoDB, Nginx, and Apache with Prometheus and Grafana dashboards.',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'alternate',
        type: 'text/plain',
        href: '/NodePrism/llms.txt',
        title: 'LLMs.txt - AI-readable project summary',
      },
    },
    {
      tagName: 'script',
      attributes: {
        type: 'application/ld+json',
      },
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'NodePrism',
        applicationCategory: 'DeveloperApplication',
        applicationSubCategory: 'Infrastructure Monitoring',
        operatingSystem: 'Linux',
        description: 'Open-source server monitoring platform for KVM, OpenVZ, Virtuozzo, Docker, LXC containers, and cPanel hosting. Self-hosted alternative to Datadog and Netdata with Prometheus, Grafana, intelligent alerting, and ML anomaly detection.',
        url: 'https://github.com/digin1/NodePrism',
        downloadUrl: 'https://github.com/digin1/NodePrism/releases',
        softwareVersion: '1.0.0',
        license: 'https://opensource.org/licenses/MIT',
        isAccessibleForFree: true,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
        featureList: [
          'KVM/libvirt virtual machine monitoring',
          'OpenVZ container monitoring',
          'Virtuozzo VPS monitoring',
          'Docker container monitoring',
          'LXC container monitoring',
          'cPanel/WHM hosting panel monitoring',
          'LiteSpeed web server monitoring',
          'Exim mail server monitoring',
          'MySQL/PostgreSQL/MongoDB/Redis database monitoring',
          'Nginx/Apache web server monitoring',
          'Prometheus metrics collection',
          'Grafana dashboards (14 pre-built)',
          'ML anomaly detection (K-means clustering)',
          'Intelligent alerting with 6 notification channels',
          'Slack interactive notifications',
          'Incident management',
          'Uptime monitoring (HTTP/HTTPS/TCP/ICMP/DNS)',
          'Daily infrastructure reports',
          'Log aggregation via Loki',
          'One-line deployment script',
        ],
        programmingLanguage: 'TypeScript',
        runtimePlatform: 'Node.js',
        codeRepository: 'https://github.com/digin1/NodePrism',
      }),
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
