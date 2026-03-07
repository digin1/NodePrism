/**
 * NodePrism Documentation Generator
 *
 * Automatically generates documentation from source code:
 * - API endpoints from route files
 * - Database schema from Prisma
 * - Environment variables from .env.example
 * - Services from service files
 * - Frontend pages from Next.js app directory
 *
 * Run: pnpm docs:generate
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT_DIR = path.resolve(__dirname, '../..');
const DOCS_DIR = path.resolve(ROOT_DIR, 'docs-site/docs');

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Docusaurus frontmatter for auto-generated pages
const FRONTMATTER: Record<string, string> = {
  'api/endpoints.md': '---\nsidebar_position: 2\ntitle: API Endpoints\n---\n\n',
  'api/overview.md': '---\nsidebar_position: 1\ntitle: API Overview\n---\n\n',
  'database/schema.md': '---\nsidebar_position: 2\ntitle: Database Schema\n---\n\n',
  'database/overview.md': '---\nsidebar_position: 1\ntitle: Database Overview\n---\n\n',
  'deployment/environment.md': '---\nsidebar_position: 2\ntitle: Environment Variables\n---\n\n',
  'deployment/guide.md': '---\nsidebar_position: 1\ntitle: Deployment Guide\n---\n\n',
  'services/overview.md': '---\nsidebar_position: 1\ntitle: Services\n---\n\n',
  'frontend/overview.md': '---\nsidebar_position: 1\ntitle: Frontend\n---\n\n',
  'architecture/overview.md': '---\nsidebar_position: 1\ntitle: Architecture Overview\n---\n\n',
  'monitoring/overview.md': '---\nsidebar_position: 1\ntitle: Monitoring\n---\n\n',
};

function writeDoc(filePath: string, content: string): void {
  const fullPath = path.join(DOCS_DIR, filePath);
  ensureDir(path.dirname(fullPath));
  const frontmatter = FRONTMATTER[filePath] || '';
  fs.writeFileSync(fullPath, frontmatter + content);
  console.log(`  Generated: ${filePath}`);
}

function readFile(filePath: string): string {
  const fullPath = path.join(ROOT_DIR, filePath);
  if (!fs.existsSync(fullPath)) {
    return '';
  }
  return fs.readFileSync(fullPath, 'utf-8');
}

function getFiles(dir: string, ext: string): string[] {
  const fullDir = path.join(ROOT_DIR, dir);
  if (!fs.existsSync(fullDir)) {
    return [];
  }
  return fs.readdirSync(fullDir)
    .filter(f => f.endsWith(ext))
    .map(f => path.join(dir, f));
}

function getTimestamp(): string {
  return new Date().toISOString().split('T')[0];
}

// ============================================================================
// API DOCUMENTATION GENERATOR
// ============================================================================

interface RouteInfo {
  method: string;
  path: string;
  middleware: string[];
  description: string;
}

function parseRouteFile(filePath: string): RouteInfo[] {
  const content = readFile(filePath);
  const routes: RouteInfo[] = [];

  // Match router.METHOD('path', ...) patterns
  const routeRegex = /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  let match;

  while ((match = routeRegex.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2];

    // Check for middleware
    const middleware: string[] = [];
    if (content.includes('requireAuth') && !filePath.includes('auth.ts')) {
      middleware.push('requireAuth');
    }

    // Extract description from comments above route
    const beforeRoute = content.substring(0, match.index);
    const commentMatch = beforeRoute.match(/\/\/\s*(.+)\s*$/m);
    const description = commentMatch ? commentMatch[1].trim() : '';

    routes.push({ method, path: routePath, middleware, description });
  }

  return routes;
}

function generateApiDocs(): void {
  console.log('\n📚 Generating API Documentation...');

  const routeFiles = getFiles('packages/api/src/routes', '.ts');
  const allRoutes: Record<string, RouteInfo[]> = {};

  for (const file of routeFiles) {
    const fileName = path.basename(file, '.ts');
    if (fileName === 'index') continue;

    const routes = parseRouteFile(file);
    if (routes.length > 0) {
      allRoutes[fileName] = routes;
    }
  }

  // Generate endpoints.md
  let content = `# API Endpoints


## Base URL

\`\`\`
http://localhost:4000/api
\`\`\`

## Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

\`\`\`
Authorization: Bearer <token>
\`\`\`

---

`;

  for (const [routeName, routes] of Object.entries(allRoutes)) {
    const basePath = routeName === 'auth' ? '/auth' : `/${routeName}`;
    content += `## ${routeName.charAt(0).toUpperCase() + routeName.slice(1)}\n\n`;
    content += `Base path: \`/api${basePath}\`\n\n`;

    content += '| Method | Endpoint | Auth | Description |\n';
    content += '|--------|----------|------|-------------|\n';

    for (const route of routes) {
      const fullPath = route.path === '/' ? basePath : `${basePath}${route.path}`;
      const auth = route.middleware.includes('requireAuth') ? '✓' : '-';
      content += `| ${route.method} | \`${fullPath}\` | ${auth} | ${route.description || '-'} |\n`;
    }

    content += '\n';
  }

  // Add WebSocket documentation
  content += `## WebSocket Events

Connect to \`http://localhost:4000\` with Socket.IO client.

### Server Events (Emitted by Server)

| Event | Description | Payload |
|-------|-------------|---------|
| \`server:created\` | New server added | Server object |
| \`server:updated\` | Server modified | Server object |
| \`server:deleted\` | Server removed | { id: string } |
| \`agent:registered\` | Agent came online | Agent object |
| \`agent:unregistered\` | Agent went offline | { agentId: string } |
| \`metrics:update\` | Real-time metrics | { serverId, metrics } |
| \`event:new\` | Monitoring event | EventLog object |
| \`deployment:started\` | Deployment initiated | Deployment object |

### Client Events (Subscribe)

| Event | Description |
|-------|-------------|
| \`subscribe:server\` | Subscribe to server updates |
| \`unsubscribe:server\` | Unsubscribe from server |
`;

  writeDoc('api/endpoints.md', content);

  // Generate API README
  const apiReadme = `# API Documentation


The NodePrism API is a RESTful service that provides:

- Server management
- Agent registration and monitoring
- Metrics collection and querying
- Alert management
- Event logging

## Quick Links

- [API Endpoints](./endpoints.md) - All available endpoints
- [WebSocket Events](./endpoints.md#websocket-events) - Real-time updates

## Base URL

- Development: \`http://localhost:4000/api\`
- Production: \`https://your-domain.com/api\`

## Response Format

All responses follow this structure:

\`\`\`json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
\`\`\`

Error responses:

\`\`\`json
{
  "success": false,
  "error": "Error message",
  "details": [ ... ]
}
\`\`\`
`;

  writeDoc('api/overview.md', apiReadme);
}

// ============================================================================
// DATABASE DOCUMENTATION GENERATOR
// ============================================================================

interface PrismaModel {
  name: string;
  fields: Array<{
    name: string;
    type: string;
    isRequired: boolean;
    isUnique: boolean;
    isId: boolean;
    default?: string;
    relation?: string;
  }>;
  indexes: string[];
}

function parsePrismaSchema(): PrismaModel[] {
  const content = readFile('packages/api/prisma/schema.prisma');
  const models: PrismaModel[] = [];

  // Match model definitions
  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
  let match;

  while ((match = modelRegex.exec(content)) !== null) {
    const modelName = match[1];
    const modelBody = match[2];

    const fields: PrismaModel['fields'] = [];
    const indexes: string[] = [];

    // Parse fields
    const lines = modelBody.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));

    for (const line of lines) {
      // Skip @@index, @@map, @@unique directives
      if (line.startsWith('@@')) {
        if (line.startsWith('@@index')) {
          indexes.push(line);
        }
        continue;
      }

      // Parse field: name Type modifiers
      const fieldMatch = line.match(/^(\w+)\s+(\w+)(\[\])?\s*(\?)?(.*)$/);
      if (fieldMatch) {
        const [, name, type, isArray, isOptional, rest] = fieldMatch;

        fields.push({
          name,
          type: type + (isArray || ''),
          isRequired: !isOptional,
          isUnique: rest.includes('@unique'),
          isId: rest.includes('@id'),
          default: rest.match(/@default\(([^)]+)\)/)?.[1],
          relation: rest.match(/@relation\(([^)]+)\)/)?.[1],
        });
      }
    }

    models.push({ name: modelName, fields, indexes });
  }

  return models;
}

function parseEnums(): Record<string, string[]> {
  const content = readFile('packages/api/prisma/schema.prisma');
  const enums: Record<string, string[]> = {};

  const enumRegex = /enum\s+(\w+)\s*\{([^}]+)\}/g;
  let match;

  while ((match = enumRegex.exec(content)) !== null) {
    const enumName = match[1];
    const values = match[2]
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('//'));
    enums[enumName] = values;
  }

  return enums;
}

function generateDatabaseDocs(): void {
  console.log('\n📊 Generating Database Documentation...');

  const models = parsePrismaSchema();
  const enums = parseEnums();

  let content = `# Database Schema


NodePrism uses PostgreSQL with Prisma ORM.

## Entity Relationship Overview

\`\`\`
Server (1) ──── (*) Agent
   │
   ├──── (*) Deployment
   ├──── (*) Alert
   ├──── (*) AnomalyEvent
   ├──── (*) MetricHistory
   └──── (*) EventLog

User (1) ──── (*) AuditLog

AlertRule ──── Alert
AlertTemplate ──── NotificationChannel
\`\`\`

---

## Models

`;

  for (const model of models) {
    content += `### ${model.name}\n\n`;
    content += '| Field | Type | Required | Constraints |\n';
    content += '|-------|------|----------|-------------|\n';

    for (const field of model.fields) {
      const constraints: string[] = [];
      if (field.isId) constraints.push('Primary Key');
      if (field.isUnique) constraints.push('Unique');
      if (field.default) constraints.push(`Default: ${field.default}`);
      if (field.relation) constraints.push(`Relation`);

      content += `| ${field.name} | ${field.type} | ${field.isRequired ? '✓' : '-'} | ${constraints.join(', ') || '-'} |\n`;
    }

    if (model.indexes.length > 0) {
      content += '\n**Indexes:**\n';
      for (const idx of model.indexes) {
        content += `- \`${idx}\`\n`;
      }
    }

    content += '\n---\n\n';
  }

  // Add enums section
  content += `## Enums\n\n`;

  for (const [enumName, values] of Object.entries(enums)) {
    content += `### ${enumName}\n\n`;
    content += '| Value | Description |\n';
    content += '|-------|-------------|\n';

    for (const value of values) {
      content += `| \`${value}\` | - |\n`;
    }

    content += '\n';
  }

  writeDoc('database/schema.md', content);

  // Generate database README
  const dbReadme = `# Database Documentation


## Overview

NodePrism uses PostgreSQL as its primary database with Prisma as the ORM.

## Quick Links

- [Schema Reference](./schema.md) - All models and fields

## Connection

\`\`\`
DATABASE_URL=postgresql://user:password@localhost:5432/nodeprism
\`\`\`

## Migrations

\`\`\`bash
# Generate migration after schema changes
pnpm prisma migrate dev --name <migration_name>

# Apply migrations in production
pnpm prisma migrate deploy

# Reset database (development only)
pnpm prisma migrate reset
\`\`\`

## Key Models

| Model | Purpose |
|-------|---------|
| Server | Monitored server instances |
| Agent | Monitoring agents (node_exporter, etc.) |
| Alert | Active and historical alerts |
| MetricHistory | Time-series metric storage |
| EventLog | System events and audit trail |
| User | Authentication and authorization |
`;

  writeDoc('database/overview.md', dbReadme);
}

// ============================================================================
// ENVIRONMENT DOCUMENTATION GENERATOR
// ============================================================================

interface EnvVar {
  name: string;
  value: string;
  section: string;
  description: string;
}

function parseEnvExample(): EnvVar[] {
  const content = readFile('.env.example') || readFile('.env');
  const vars: EnvVar[] = [];
  let currentSection = 'General';

  const lines = content.split('\n');

  for (const line of lines) {
    // Section header
    if (line.startsWith('# ===')) {
      const sectionMatch = line.match(/# =+ (.+) =+/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim();
      }
      continue;
    }

    // Variable
    const varMatch = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (varMatch) {
      const [, name, value] = varMatch;

      // Get description from comment above
      const idx = lines.indexOf(line);
      let description = '';
      if (idx > 0 && lines[idx - 1].startsWith('#') && !lines[idx - 1].startsWith('# ===')) {
        description = lines[idx - 1].replace(/^#\s*/, '');
      }

      vars.push({ name, value, section: currentSection, description });
    }
  }

  return vars;
}

function generateEnvDocs(): void {
  console.log('\n🔧 Generating Environment Documentation...');

  const vars = parseEnvExample();

  let content = `# Environment Variables


## Configuration

Copy \`.env.example\` to \`.env\` and configure:

\`\`\`bash
cp .env.example .env
\`\`\`

---

`;

  // Group by section
  const sections: Record<string, EnvVar[]> = {};
  for (const v of vars) {
    if (!sections[v.section]) {
      sections[v.section] = [];
    }
    sections[v.section].push(v);
  }

  for (const [section, sectionVars] of Object.entries(sections)) {
    content += `## ${section}\n\n`;
    content += '| Variable | Default | Description |\n';
    content += '|----------|---------|-------------|\n';

    for (const v of sectionVars) {
      const displayValue = v.value.length > 30 ? v.value.substring(0, 30) + '...' : v.value;
      const safeValue = displayValue.replace(/\|/g, '\\|');
      content += `| \`${v.name}\` | \`${safeValue || '-'}\` | ${v.description || '-'} |\n`;
    }

    content += '\n';
  }

  writeDoc('deployment/environment.md', content);
}

// ============================================================================
// SERVICES DOCUMENTATION GENERATOR
// ============================================================================

function generateServicesDocs(): void {
  console.log('\n⚙️ Generating Services Documentation...');

  const services = [
    {
      name: 'MetricCollector',
      file: 'metricCollector.ts',
      description: 'Collects metrics from Prometheus and stores in database',
      functions: ['startMetricCollector', 'stopMetricCollector', 'collectAllMetrics', 'getAggregatedMetrics', 'getBandwidthSummary'],
    },
    {
      name: 'EventLogger',
      file: 'eventLogger.ts',
      description: 'Centralized event logging with real-time Socket.IO distribution',
      functions: ['logEvent', 'logServerStatusChange', 'logAgentStatusChange', 'logDeployment', 'logThresholdAlert'],
    },
    {
      name: 'TargetGenerator',
      file: 'targetGenerator.ts',
      description: 'Generates Prometheus target files for service discovery',
      functions: ['generateTargetFiles', 'generateTargetFileForType', 'reloadPrometheus'],
    },
    {
      name: 'HeartbeatCleanup',
      file: 'heartbeatCleanup.ts',
      description: 'Monitors agent heartbeats and cleans up stale data',
      functions: ['startHeartbeatCleanup', 'stopHeartbeatCleanup'],
    },
    {
      name: 'AlertTemplateService',
      file: 'alertTemplateService.ts',
      description: 'Advanced alert template management with hysteresis support',
      functions: ['evaluateTemplate', 'matchTemplate', 'processAlerts'],
    },
    {
      name: 'AutoDiscoveryService',
      file: 'autoDiscoveryService.ts',
      description: 'Automatically discovers running services on target servers',
      functions: ['discoverServices', 'generateTargetConfigs'],
    },
  ];

  let content = `# Services


## Overview

NodePrism services handle background processing, data collection, and system coordination.

| Service | Purpose |
|---------|---------|
`;

  for (const svc of services) {
    content += `| [${svc.name}](#${svc.name.toLowerCase()}) | ${svc.description} |\n`;
  }

  content += '\n---\n\n';

  for (const svc of services) {
    content += `## ${svc.name}\n\n`;
    content += `**File:** \`packages/api/src/services/${svc.file}\`\n\n`;
    content += `${svc.description}\n\n`;
    content += '**Key Functions:**\n\n';

    for (const fn of svc.functions) {
      content += `- \`${fn}()\`\n`;
    }

    content += '\n---\n\n';
  }

  writeDoc('services/overview.md', content);
}

// ============================================================================
// FRONTEND DOCUMENTATION GENERATOR
// ============================================================================

function getFrontendPages(): Array<{ path: string; file: string }> {
  const pages: Array<{ path: string; file: string }> = [];
  const appDir = path.join(ROOT_DIR, 'packages/web/app');

  function scanDir(dir: string, routePath: string): void {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        let newPath = routePath;

        // Handle route groups (parentheses)
        if (!entry.name.startsWith('(')) {
          newPath = `${routePath}/${entry.name}`;
        }

        // Handle dynamic routes
        if (entry.name.startsWith('[') && entry.name.endsWith(']')) {
          newPath = `${routePath}/:${entry.name.slice(1, -1)}`;
        }

        scanDir(path.join(dir, entry.name), newPath);
      } else if (entry.name === 'page.tsx') {
        pages.push({
          path: routePath || '/',
          file: path.relative(appDir, path.join(dir, entry.name)),
        });
      }
    }
  }

  scanDir(appDir, '');
  return pages;
}

function generateFrontendDocs(): void {
  console.log('\n🖥️ Generating Frontend Documentation...');

  const pages = getFrontendPages();

  let content = `# Frontend Pages


## Technology Stack

- **Framework:** Next.js 14 (App Router)
- **UI Library:** React 18
- **Styling:** Tailwind CSS + shadcn/ui
- **State Management:** Zustand + React Query
- **Real-time:** Socket.IO Client

## Pages

| Route | File | Description |
|-------|------|-------------|
`;

  const descriptions: Record<string, string> = {
    '/': 'Home page / redirect',
    '/login': 'User authentication',
    '/register': 'User registration',
    '/dashboard': 'Main dashboard with overview',
    '/servers': 'Server list and management',
    '/servers/new': 'Add new server',
    '/servers/:id': 'Server details and metrics',
    '/alerts': 'Active alerts list',
    '/alerts/rules': 'Alert rules management',
    '/metrics': 'Metrics explorer (PromQL)',
    '/logs': 'Log aggregation view',
    '/settings': 'System settings',
  };

  for (const page of pages) {
    content += `| \`${page.path}\` | \`${page.file}\` | ${descriptions[page.path] || '-'} |\n`;
  }

  content += `

## Key Components

| Component | Purpose |
|-----------|---------|
| \`MetricsCharts\` | Real-time metric visualization |
| \`ServerCard\` | Server status overview |
| \`AlertsTable\` | Alert list with filtering |
| \`EnhancedMetricsChart\` | Interactive Recharts graphs |
| \`Sidebar\` | Navigation menu |
`;

  writeDoc('frontend/overview.md', content);
}

// ============================================================================
// ARCHITECTURE DOCUMENTATION
// ============================================================================

function generateArchitectureDocs(): void {
  console.log('\n🏗️ Generating Architecture Documentation...');

  const content = `# Architecture Overview


## System Architecture

\`\`\`mermaid
flowchart TB
    subgraph Manager["NodePrism Manager"]
        Web["Next.js Web UI\n:3000"]
        API["Express API\n:4000"]
        Workers["Workers\n(RabbitMQ)"]
        DB[(PostgreSQL)]

        subgraph Monitoring["Monitoring Stack"]
            Prometheus["Prometheus\n:9090"]
            Grafana["Grafana\n:3030"]
            Loki["Loki\n:3100"]
            AlertMgr["AlertManager\n:9093"]
        end
    end

    subgraph Servers["Monitored Servers"]
        S1["Server 1\nnode_exporter :9100"]
        S2["Server 2\nnode_exporter :9100"]
        SN["Server N\nnode_exporter :9100"]
    end

    Web --> API
    API --> Workers
    API --> DB
    API --> Prometheus

    Prometheus --> S1
    Prometheus --> S2
    Prometheus --> SN
    Prometheus --> AlertMgr
    AlertMgr --> API
\`\`\`

## Package Structure

| Package | Port | Purpose |
|---------|------|---------|
| \`@nodeprism/web\` | 3000 | Next.js management UI |
| \`@nodeprism/api\` | 4000 | Express REST API + WebSocket |
| \`@nodeprism/deployment-worker\` | - | SSH agent deployment |
| \`@nodeprism/config-sync\` | - | Configuration synchronization |
| \`@nodeprism/anomaly-detector\` | - | ML anomaly detection |
| \`@nodeprism/agent-app\` | 9101 | Custom app monitoring agent |
| \`@nodeprism/shared\` | - | Shared types and utilities |

## Data Flow

### 1. Metrics Collection

\`\`\`mermaid
flowchart LR
    NE[node_exporter] --> P[Prometheus]
    P --> MC[MetricCollector]
    MC --> DB[(PostgreSQL)]
    MC --> WS[Socket.IO]
    WS --> UI[Web UI]
    P --> G[Grafana]
\`\`\`

### 2. Agent Registration

\`\`\`mermaid
flowchart LR
    RS[Remote Server] --> |POST /api/agents/register| API[API]
    API --> DB[(Database)]
    DB --> TG[TargetGenerator]
    TG --> TJ[targets.json]
    TJ --> P[Prometheus]
\`\`\`

### 3. Alert Processing

\`\`\`mermaid
flowchart LR
    P[Prometheus] --> AM[AlertManager]
    AM --> |Webhook| API[API]
    API --> DB[(Database)]
    API --> WS[Socket.IO]
    WS --> UI[Web UI]
\`\`\`

## Technology Stack

| Category | Technology |
|----------|------------|
| Language | TypeScript 5.3+ |
| Runtime | Node.js 20+ |
| Package Manager | PNPM 8+ |
| Build | Turborepo |
| Database | PostgreSQL 15 |
| Cache | Redis 7 |
| Queue | RabbitMQ 3.13 |
| Monitoring | Prometheus, Grafana, Loki |

## Ports Reference

| Service | Port |
|---------|------|
| Web UI | 3000 |
| API | 4000 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| RabbitMQ | 5672 |
| RabbitMQ Management | 15672 |
| Prometheus | 9090 |
| Grafana | 3030 |
| Loki | 3100 |
| AlertManager | 9093 |
| Node Exporter | 9100 |
`;

  writeDoc('architecture/overview.md', content);
}

// ============================================================================
// DEPLOYMENT DOCUMENTATION
// ============================================================================

function generateDeploymentDocs(): void {
  console.log('\n🚀 Generating Deployment Documentation...');

  const content = `# Deployment Guide


## Quick Start

### Prerequisites

- Node.js 20+
- PNPM 8+
- Docker & Docker Compose
- PostgreSQL 15 (or use Docker)

### 1. Clone and Install

\`\`\`bash
git clone https://github.com/your-org/NodePrism.git
cd NodePrism
pnpm install
\`\`\`

### 2. Configure Environment

\`\`\`bash
cp .env.example .env
# Edit .env with your settings
\`\`\`

See [Environment Variables](./environment.md) for all options.

### 3. Start Infrastructure

\`\`\`bash
cd infrastructure/docker
docker-compose up -d
\`\`\`

### 4. Initialize Database

\`\`\`bash
pnpm prisma migrate deploy
pnpm prisma db seed
\`\`\`

### 5. Start Development

\`\`\`bash
pnpm run dev
\`\`\`

## Production Deployment

### Build

\`\`\`bash
pnpm run build
\`\`\`

### Start

\`\`\`bash
pnpm run start
\`\`\`

## Docker Deployment

\`\`\`bash
docker-compose -f docker-compose.prod.yml up -d
\`\`\`

## Adding Monitored Servers

### Option 1: With SSH Access (Automated)

1. Add server in UI (Servers → Add New)
2. Click "Deploy Agent"
3. Agent is automatically installed via SSH

### Option 2: Without SSH Access (Manual)

For each exporter, install on the remote server, then register with NodePrism.

---

#### Node Exporter (System Metrics)

**Port:** 9100 | **Metrics:** CPU, memory, disk, network, load

\`\`\`bash
# Download and install
wget https://github.com/prometheus/node_exporter/releases/download/v1.7.0/node_exporter-1.7.0.linux-amd64.tar.gz
tar xvfz node_exporter-*.tar.gz
sudo mv node_exporter-*/node_exporter /usr/local/bin/
sudo useradd -rs /bin/false node_exporter

# Create systemd service
sudo tee /etc/systemd/system/node_exporter.service <<EOF
[Unit]
Description=Prometheus Node Exporter
After=network.target

[Service]
User=node_exporter
ExecStart=/usr/local/bin/node_exporter --web.listen-address=:9100
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now node_exporter

# Verify
curl http://localhost:9100/metrics | head
\`\`\`

**Register with NodePrism:**
\`\`\`bash
curl -X POST http://MANAGER_IP:4000/api/agents/register \\
  -H "Content-Type: application/json" \\
  -d '{"hostname": "my-server", "ipAddress": "SERVER_IP", "agentType": "NODE_EXPORTER", "port": 9100}'
\`\`\`

---

#### MySQL Exporter

**Port:** 9104 | **Metrics:** queries, connections, replication, InnoDB

\`\`\`bash
# Download and install
wget https://github.com/prometheus/mysqld_exporter/releases/download/v0.15.1/mysqld_exporter-0.15.1.linux-amd64.tar.gz
tar xvfz mysqld_exporter-*.tar.gz
sudo mv mysqld_exporter-*/mysqld_exporter /usr/local/bin/
sudo useradd -rs /bin/false mysqld_exporter

# Create MySQL user for exporter
mysql -u root -p <<EOF
CREATE USER 'exporter'@'localhost' IDENTIFIED BY 'your_password';
GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO 'exporter'@'localhost';
FLUSH PRIVILEGES;
EOF

# Create credentials file
sudo tee /etc/.mysqld_exporter.cnf <<EOF
[client]
user=exporter
password=your_password
EOF
sudo chmod 600 /etc/.mysqld_exporter.cnf

# Create systemd service
sudo tee /etc/systemd/system/mysqld_exporter.service <<EOF
[Unit]
Description=Prometheus MySQL Exporter
After=network.target mysql.service

[Service]
User=mysqld_exporter
ExecStart=/usr/local/bin/mysqld_exporter --config.my-cnf=/etc/.mysqld_exporter.cnf --web.listen-address=:9104
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now mysqld_exporter
\`\`\`

**Register with NodePrism:**
\`\`\`bash
curl -X POST http://MANAGER_IP:4000/api/agents/register \\
  -H "Content-Type: application/json" \\
  -d '{"hostname": "my-server", "ipAddress": "SERVER_IP", "agentType": "MYSQL_EXPORTER", "port": 9104}'
\`\`\`

---

#### PostgreSQL Exporter

**Port:** 9187 | **Metrics:** connections, queries, locks, replication

\`\`\`bash
# Download and install
wget https://github.com/prometheus-community/postgres_exporter/releases/download/v0.15.0/postgres_exporter-0.15.0.linux-amd64.tar.gz
tar xvfz postgres_exporter-*.tar.gz
sudo mv postgres_exporter-*/postgres_exporter /usr/local/bin/
sudo useradd -rs /bin/false postgres_exporter

# Create PostgreSQL user for exporter
sudo -u postgres psql <<EOF
CREATE USER exporter WITH PASSWORD 'your_password';
GRANT pg_monitor TO exporter;
EOF

# Create systemd service
sudo tee /etc/systemd/system/postgres_exporter.service <<EOF
[Unit]
Description=Prometheus PostgreSQL Exporter
After=network.target postgresql.service

[Service]
User=postgres_exporter
Environment="DATA_SOURCE_NAME=postgresql://exporter:your_password@localhost:5432/postgres?sslmode=disable"
ExecStart=/usr/local/bin/postgres_exporter --web.listen-address=:9187
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now postgres_exporter
\`\`\`

**Register with NodePrism:**
\`\`\`bash
curl -X POST http://MANAGER_IP:4000/api/agents/register \\
  -H "Content-Type: application/json" \\
  -d '{"hostname": "my-server", "ipAddress": "SERVER_IP", "agentType": "POSTGRES_EXPORTER", "port": 9187}'
\`\`\`

---

#### MongoDB Exporter

**Port:** 9216 | **Metrics:** connections, operations, replication, storage

\`\`\`bash
# Download and install
wget https://github.com/percona/mongodb_exporter/releases/download/v0.40.0/mongodb_exporter-0.40.0.linux-amd64.tar.gz
tar xvfz mongodb_exporter-*.tar.gz
sudo mv mongodb_exporter-*/mongodb_exporter /usr/local/bin/
sudo useradd -rs /bin/false mongodb_exporter

# Create MongoDB user for exporter (in mongo shell)
# use admin
# db.createUser({user: "exporter", pwd: "your_password", roles: [{role: "clusterMonitor", db: "admin"}, {role: "read", db: "local"}]})

# Create systemd service
sudo tee /etc/systemd/system/mongodb_exporter.service <<EOF
[Unit]
Description=Prometheus MongoDB Exporter
After=network.target mongod.service

[Service]
User=mongodb_exporter
Environment="MONGODB_URI=mongodb://exporter:your_password@localhost:27017/admin"
ExecStart=/usr/local/bin/mongodb_exporter --web.listen-address=:9216
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now mongodb_exporter
\`\`\`

**Register with NodePrism:**
\`\`\`bash
curl -X POST http://MANAGER_IP:4000/api/agents/register \\
  -H "Content-Type: application/json" \\
  -d '{"hostname": "my-server", "ipAddress": "SERVER_IP", "agentType": "MONGODB_EXPORTER", "port": 9216}'
\`\`\`

---

#### Nginx Exporter

**Port:** 9113 | **Metrics:** connections, requests, response codes

\`\`\`bash
# Enable Nginx stub_status module (add to nginx.conf)
# server {
#     listen 127.0.0.1:8080;
#     location /nginx_status {
#         stub_status on;
#         allow 127.0.0.1;
#         deny all;
#     }
# }
sudo nginx -t && sudo systemctl reload nginx

# Download and install exporter
wget https://github.com/nginxinc/nginx-prometheus-exporter/releases/download/v1.1.0/nginx-prometheus-exporter_1.1.0_linux_amd64.tar.gz
tar xvfz nginx-prometheus-exporter_*.tar.gz
sudo mv nginx-prometheus-exporter /usr/local/bin/
sudo useradd -rs /bin/false nginx_exporter

# Create systemd service
sudo tee /etc/systemd/system/nginx_exporter.service <<EOF
[Unit]
Description=Prometheus Nginx Exporter
After=network.target nginx.service

[Service]
User=nginx_exporter
ExecStart=/usr/local/bin/nginx-prometheus-exporter -nginx.scrape-uri=http://127.0.0.1:8080/nginx_status -web.listen-address=:9113
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now nginx_exporter
\`\`\`

**Register with NodePrism:**
\`\`\`bash
curl -X POST http://MANAGER_IP:4000/api/agents/register \\
  -H "Content-Type: application/json" \\
  -d '{"hostname": "my-server", "ipAddress": "SERVER_IP", "agentType": "NGINX_EXPORTER", "port": 9113}'
\`\`\`

---

#### Apache Exporter

**Port:** 9117 | **Metrics:** requests, workers, scoreboard, bytes

\`\`\`bash
# Enable Apache mod_status (add to apache config)
# <Location "/server-status">
#     SetHandler server-status
#     Require local
# </Location>
sudo a2enmod status
sudo systemctl reload apache2

# Download and install exporter
wget https://github.com/Lusitaniae/apache_exporter/releases/download/v1.0.3/apache_exporter-1.0.3.linux-amd64.tar.gz
tar xvfz apache_exporter-*.tar.gz
sudo mv apache_exporter-*/apache_exporter /usr/local/bin/
sudo useradd -rs /bin/false apache_exporter

# Create systemd service
sudo tee /etc/systemd/system/apache_exporter.service <<EOF
[Unit]
Description=Prometheus Apache Exporter
After=network.target apache2.service

[Service]
User=apache_exporter
ExecStart=/usr/local/bin/apache_exporter --scrape_uri=http://127.0.0.1/server-status?auto --web.listen-address=:9117
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now apache_exporter
\`\`\`

**Register with NodePrism:**
\`\`\`bash
curl -X POST http://MANAGER_IP:4000/api/agents/register \\
  -H "Content-Type: application/json" \\
  -d '{"hostname": "my-server", "ipAddress": "SERVER_IP", "agentType": "APACHE_EXPORTER", "port": 9117}'
\`\`\`

---

#### Promtail (Log Shipping)

**Port:** 9080 | **Purpose:** Ships logs to Loki

\`\`\`bash
# Download and install
wget https://github.com/grafana/loki/releases/download/v2.9.4/promtail-linux-amd64.zip
unzip promtail-linux-amd64.zip
sudo mv promtail-linux-amd64 /usr/local/bin/promtail
sudo useradd -rs /bin/false promtail
sudo usermod -aG adm promtail  # For log access

# Create config
sudo mkdir -p /etc/promtail
sudo tee /etc/promtail/config.yml <<EOF
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /var/lib/promtail/positions.yaml

clients:
  - url: http://MANAGER_IP:3100/loki/api/v1/push

scrape_configs:
  - job_name: system
    static_configs:
      - targets:
          - localhost
        labels:
          job: varlogs
          host: \$(hostname)
          __path__: /var/log/*.log
  - job_name: syslog
    static_configs:
      - targets:
          - localhost
        labels:
          job: syslog
          host: \$(hostname)
          __path__: /var/log/syslog
EOF

sudo mkdir -p /var/lib/promtail
sudo chown promtail:promtail /var/lib/promtail

# Create systemd service
sudo tee /etc/systemd/system/promtail.service <<EOF
[Unit]
Description=Promtail Log Agent
After=network.target

[Service]
User=promtail
ExecStart=/usr/local/bin/promtail -config.file=/etc/promtail/config.yml
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now promtail
\`\`\`

**Register with NodePrism:**
\`\`\`bash
curl -X POST http://MANAGER_IP:4000/api/agents/register \\
  -H "Content-Type: application/json" \\
  -d '{"hostname": "my-server", "ipAddress": "SERVER_IP", "agentType": "PROMTAIL", "port": 9080}'
\`\`\`

---

### Firewall Configuration

Ensure the manager can reach the exporter ports:

\`\`\`bash
# UFW (Ubuntu)
sudo ufw allow from MANAGER_IP to any port 9100  # node_exporter
sudo ufw allow from MANAGER_IP to any port 9104  # mysqld_exporter
sudo ufw allow from MANAGER_IP to any port 9187  # postgres_exporter
sudo ufw allow from MANAGER_IP to any port 9216  # mongodb_exporter
sudo ufw allow from MANAGER_IP to any port 9113  # nginx_exporter
sudo ufw allow from MANAGER_IP to any port 9117  # apache_exporter

# firewalld (CentOS/RHEL)
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="MANAGER_IP" port port="9100" protocol="tcp" accept'
sudo firewall-cmd --reload
\`\`\`

## Troubleshooting

### Ports in Use

\`\`\`bash
# Kill processes on NodePrism ports
lsof -ti:3000,4000,4001,4002,4003 | xargs kill -9
\`\`\`

### Database Connection

\`\`\`bash
# Check PostgreSQL
docker exec -it nodeprism-postgres psql -U nodeprism -d nodeprism
\`\`\`

### Prometheus Targets

\`\`\`bash
# Check targets
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets'
\`\`\`
`;

  writeDoc('deployment/guide.md', content);
}

// ============================================================================
// MONITORING DOCUMENTATION
// ============================================================================

function generateMonitoringDocs(): void {
  console.log('\n📈 Generating Monitoring Documentation...');

  const content = `# Monitoring


## Overview

NodePrism uses a Prometheus-based monitoring stack:

| Component | Purpose | Port |
|-----------|---------|------|
| Prometheus | Metrics collection & storage | 9090 |
| Grafana | Visualization & dashboards | 3030 |
| Loki | Log aggregation | 3100 |
| AlertManager | Alert routing | 9093 |

## Agent Types

| Agent | Port | Metrics |
|-------|------|---------|
| \`NODE_EXPORTER\` | 9100 | CPU, memory, disk, network |
| \`MYSQL_EXPORTER\` | 9104 | MySQL server metrics |
| \`POSTGRES_EXPORTER\` | 9187 | PostgreSQL metrics |
| \`MONGODB_EXPORTER\` | 9216 | MongoDB metrics |
| \`NGINX_EXPORTER\` | 9113 | Nginx metrics |
| \`APACHE_EXPORTER\` | 9117 | Apache metrics |
| \`PROMTAIL\` | 9080 | Log shipping to Loki |
| \`APP_AGENT\` | 9101 | Custom application metrics |

## Collected Metrics

### System Metrics (node_exporter)

| Metric | Description |
|--------|-------------|
| \`node_cpu_seconds_total\` | CPU time spent in each mode |
| \`node_memory_MemAvailable_bytes\` | Available memory |
| \`node_memory_MemTotal_bytes\` | Total memory |
| \`node_filesystem_avail_bytes\` | Available disk space |
| \`node_filesystem_size_bytes\` | Total disk size |
| \`node_load1\` | 1-minute load average |
| \`node_load5\` | 5-minute load average |
| \`node_load15\` | 15-minute load average |
| \`node_network_receive_bytes_total\` | Network bytes received |
| \`node_network_transmit_bytes_total\` | Network bytes sent |

## Alert Rules

Default alert rules in \`infrastructure/docker/prometheus/alerts.yml\`:

| Alert | Condition | Severity |
|-------|-----------|----------|
| \`InstanceDown\` | \`up == 0\` for 5m | Critical |
| \`HighCPUUsage\` | CPU > 80% for 2m | Warning |
| \`HighLoadAverage\` | load1 > 10 for 2m | Warning |
| \`CriticalLoadAverage\` | load1 > 50 for 1m | Critical |
| \`HighMemoryUsage\` | Memory > 80% for 2m | Warning |
| \`LowDiskSpace\` | Disk > 80% for 2m | Warning |
| \`CriticalDiskSpace\` | Disk > 95% for 2m | Critical |

## Prometheus Queries

### CPU Usage
\`\`\`promql
100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
\`\`\`

### Memory Usage
\`\`\`promql
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100
\`\`\`

### Disk Usage
\`\`\`promql
(1 - (node_filesystem_avail_bytes / node_filesystem_size_bytes)) * 100
\`\`\`

### Network Throughput
\`\`\`promql
irate(node_network_receive_bytes_total[5m])
irate(node_network_transmit_bytes_total[5m])
\`\`\`

## Grafana Dashboards

Access Grafana at \`http://localhost:3030\`

Default credentials:
- Username: \`admin\`
- Password: \`admin123\`
`;

  writeDoc('monitoring/overview.md', content);
}

// ============================================================================
// MAIN INDEX
// ============================================================================

function generateIndex(): void {
  console.log('\n📋 Generating Documentation Index...');

  const content = `# NodePrism Documentation


NodePrism is a server monitoring and management platform.

## Quick Links

| Section | Description |
|---------|-------------|
| [Architecture](./architecture/overview.md) | System design and data flow |
| [API Reference](./api/endpoints.md) | REST API endpoints |
| [Database Schema](./database/schema.md) | Data models and relations |
| [Services](./services/README.md) | Background services |
| [Frontend](./frontend/README.md) | Web UI pages |
| [Deployment](./deployment/README.md) | Installation guide |
| [Environment](./deployment/environment.md) | Configuration variables |
| [Monitoring](./monitoring/README.md) | Prometheus & agents |

## Getting Started

1. Clone the repository
2. Copy \`.env.example\` to \`.env\`
3. Start infrastructure: \`docker-compose up -d\`
4. Install dependencies: \`pnpm install\`
5. Run migrations: \`pnpm prisma migrate deploy\`
6. Start development: \`pnpm run dev\`

## Regenerating Documentation

\`\`\`bash
pnpm docs:generate
\`\`\`

Documentation is auto-generated from source code. Run this command after making changes.
`;

  // Skip writing README.md - intro.md is maintained manually for Docusaurus
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('🔄 NodePrism Documentation Generator\n');
  console.log(`Root: ${ROOT_DIR}`);
  console.log(`Docs: ${DOCS_DIR}`);

  generateIndex();
  generateApiDocs();
  generateDatabaseDocs();
  generateEnvDocs();
  generateServicesDocs();
  generateFrontendDocs();
  generateArchitectureDocs();
  generateDeploymentDocs();
  generateMonitoringDocs();

  console.log('\n✅ Documentation generation complete!');
}

main().catch(console.error);
