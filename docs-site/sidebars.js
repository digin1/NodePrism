/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    'intro',
    'getting-started',
    {
      type: 'doc',
      id: 'architecture/overview',
      label: 'Architecture',
    },
    {
      type: 'category',
      label: 'API Reference',
      link: { type: 'doc', id: 'api/overview' },
      items: ['api/endpoints'],
    },
    {
      type: 'category',
      label: 'Database',
      link: { type: 'doc', id: 'database/overview' },
      items: ['database/schema'],
    },
    {
      type: 'doc',
      id: 'services/overview',
      label: 'Services',
    },
    {
      type: 'doc',
      id: 'frontend/overview',
      label: 'Frontend',
    },
    {
      type: 'doc',
      id: 'monitoring/overview',
      label: 'Monitoring',
    },
    {
      type: 'category',
      label: 'Deployment',
      link: { type: 'doc', id: 'deployment/guide' },
      items: ['deployment/environment'],
    },
    {
      type: 'doc',
      id: 'agents/overview',
      label: 'Agent Scripts',
    },
  ],
};

module.exports = sidebars;
