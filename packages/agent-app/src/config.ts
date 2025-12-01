import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as os from 'os';

export interface AgentConfig {
  manager: {
    url: string;
    apiKey?: string;
  };
  agent: {
    type: 'NODE_EXPORTER' | 'APP_AGENT';
    port: number;
    hostname?: string;
    version: string;
  };
  heartbeat: {
    intervalMs: number;
  };
  metrics: {
    enabled: boolean;
  };
}

const DEFAULT_CONFIG: AgentConfig = {
  manager: {
    url: process.env.MANAGER_URL || 'http://localhost:4000',
    apiKey: process.env.MANAGER_API_KEY,
  },
  agent: {
    type: 'APP_AGENT',
    port: parseInt(process.env.AGENT_PORT || '9101', 10),
    hostname: process.env.HOSTNAME || os.hostname(),
    version: '1.0.0',
  },
  heartbeat: {
    intervalMs: parseInt(process.env.HEARTBEAT_INTERVAL || '30000', 10),
  },
  metrics: {
    enabled: true,
  },
};

export function loadConfig(): AgentConfig {
  // Try to load from config file
  const configPaths = [
    process.env.AGENT_CONFIG_PATH,
    '/etc/nodeprism-agent/config.yaml',
    '/etc/nodeprism-agent/config.yml',
    path.join(process.cwd(), 'agent-config.yaml'),
    path.join(process.cwd(), 'agent-config.yml'),
  ].filter(Boolean) as string[];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const fileContents = fs.readFileSync(configPath, 'utf8');
        const fileConfig = yaml.load(fileContents) as Partial<AgentConfig>;
        console.log(`Loaded config from ${configPath}`);
        return mergeConfig(DEFAULT_CONFIG, fileConfig);
      } catch (err) {
        console.error(`Failed to load config from ${configPath}:`, err);
      }
    }
  }

  console.log('Using default configuration (set MANAGER_URL environment variable)');
  return DEFAULT_CONFIG;
}

function mergeConfig(defaults: AgentConfig, overrides: Partial<AgentConfig>): AgentConfig {
  return {
    manager: { ...defaults.manager, ...overrides.manager },
    agent: { ...defaults.agent, ...overrides.agent },
    heartbeat: { ...defaults.heartbeat, ...overrides.heartbeat },
    metrics: { ...defaults.metrics, ...overrides.metrics },
  };
}

export function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    const netInterface = interfaces[name];
    if (!netInterface) continue;

    for (const iface of netInterface) {
      // Skip internal and non-IPv4 addresses
      if (iface.internal || iface.family !== 'IPv4') continue;
      return iface.address;
    }
  }

  return '127.0.0.1';
}
