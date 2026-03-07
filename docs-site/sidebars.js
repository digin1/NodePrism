/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    'intro',
    'getting-started',
    {
      type: 'category',
      label: 'Architecture',
      items: ['architecture/overview'],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: ['api/overview', 'api/endpoints'],
    },
    {
      type: 'category',
      label: 'Database',
      items: ['database/overview', 'database/schema'],
    },
    {
      type: 'category',
      label: 'Services',
      items: ['services/overview'],
    },
    {
      type: 'category',
      label: 'Frontend',
      items: ['frontend/overview'],
    },
    {
      type: 'category',
      label: 'Monitoring',
      items: ['monitoring/overview'],
    },
    {
      type: 'category',
      label: 'Deployment',
      items: ['deployment/guide', 'deployment/environment'],
    },
    {
      type: 'category',
      label: 'Agent Scripts',
      items: ['agents/overview'],
    },
  ],
};

module.exports = sidebars;
