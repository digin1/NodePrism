import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

export interface DiscoveredService {
  type: 'mysql' | 'postgresql' | 'mongodb' | 'nginx' | 'apache' | 'redis';
  host: string;
  port: number;
  name?: string;
  version?: string;
}

export interface ServiceCheck {
  type: string;
  port: number;
  checkFunction: (host: string, port: number) => Promise<boolean>;
  versionProbe?: (host: string, port: number) => Promise<string | undefined>;
}

// Default scan targets; can be overridden via DISCOVERY_TARGETS env var
// Format: "host1:port1,port2;host2:port3,port4" or just "host1;host2" for default ports
const DEFAULT_PORTS = [3306, 5432, 27017, 6379, 80, 8080];

function parseScanTargets(): Array<{ host: string; ports: number[] }> {
  const envTargets = process.env.DISCOVERY_TARGETS;
  if (!envTargets) {
    return [{ host: '127.0.0.1', ports: DEFAULT_PORTS }];
  }

  return envTargets.split(';').map(entry => {
    const [host, portStr] = entry.trim().split(':');
    const ports = portStr
      ? portStr.split(',').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p))
      : DEFAULT_PORTS;
    return { host: host.trim(), ports };
  });
}

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';
const PROMETHEUS_TARGETS_DIR = process.env.PROMETHEUS_TARGETS_DIR || '/etc/prometheus/targets';
const DISCOVERY_INTERVAL_MINUTES = parseInt(process.env.DISCOVERY_INTERVAL_MINUTES || '60', 10);

let discoveryInterval: NodeJS.Timeout | null = null;

/**
 * Auto-Discovery Service
 * Scans hosts for known services, probes versions via TCP banners, and
 * writes Prometheus file_sd target configs.
 */
export class AutoDiscoveryService {
  private readonly serviceChecks: ServiceCheck[] = [
    { type: 'mysql', port: 3306, checkFunction: this.checkTCP.bind(this), versionProbe: this.probeMySQLVersion.bind(this) },
    { type: 'postgresql', port: 5432, checkFunction: this.checkTCP.bind(this), versionProbe: this.probePostgreSQLVersion.bind(this) },
    { type: 'mongodb', port: 27017, checkFunction: this.checkTCP.bind(this), versionProbe: this.probeMongoDBVersion.bind(this) },
    { type: 'redis', port: 6379, checkFunction: this.checkTCP.bind(this), versionProbe: this.probeRedisVersion.bind(this) },
    { type: 'nginx', port: 80, checkFunction: this.checkHTTPServer.bind(this, 'nginx') },
    { type: 'apache', port: 80, checkFunction: this.checkHTTPServer.bind(this, 'Apache') },
  ];

  private static readonly EXPORTER_PORTS: Record<string, number> = {
    mysql: 9104,
    postgresql: 9187,
    mongodb: 9216,
    redis: 9121,
    nginx: 9113,
    apache: 9117,
  };

  /**
   * Scan configured targets for running services.
   */
  async discoverServices(): Promise<DiscoveredService[]> {
    const discovered: DiscoveredService[] = [];
    const scanTargets = parseScanTargets();

    for (const target of scanTargets) {
      for (const port of target.ports) {
        for (const check of this.serviceChecks) {
          if (check.port !== port) continue;
          try {
            const isRunning = await check.checkFunction(target.host, port);
            if (!isRunning) continue;

            const service: DiscoveredService = {
              type: check.type as DiscoveredService['type'],
              host: target.host,
              port,
            };

            if (check.versionProbe) {
              service.version = await check.versionProbe(target.host, port).catch(() => undefined);
            }

            discovered.push(service);
            logger.info(`Discovered ${check.type} at ${target.host}:${port}`, { version: service.version });
          } catch {
            // Check failed, continue
          }
        }
      }
    }

    return discovered;
  }

  /**
   * Write Prometheus file_sd JSON target files and reload Prometheus.
   */
  async writeTargetFiles(services: DiscoveredService[]): Promise<void> {
    // Group by service type
    const byType: Record<string, DiscoveredService[]> = {};
    for (const svc of services) {
      (byType[svc.type] ||= []).push(svc);
    }

    // Ensure target directory exists
    try {
      if (!fs.existsSync(PROMETHEUS_TARGETS_DIR)) {
        fs.mkdirSync(PROMETHEUS_TARGETS_DIR, { recursive: true });
      }
    } catch (err) {
      logger.warn('Cannot create Prometheus targets directory', { dir: PROMETHEUS_TARGETS_DIR, error: err });
      return;
    }

    for (const [type, svcs] of Object.entries(byType)) {
      const exporterPort = AutoDiscoveryService.EXPORTER_PORTS[type] || 9100;
      const targets = svcs.map(svc => ({
        targets: [`${svc.host}:${exporterPort}`],
        labels: {
          __meta_service_type: type,
          __meta_service_host: svc.host,
          __meta_service_port: String(svc.port),
          ...(svc.version && { __meta_service_version: svc.version }),
          __meta_discovered_at: new Date().toISOString(),
        },
      }));

      const filePath = path.join(PROMETHEUS_TARGETS_DIR, `discovered_${type}.json`);
      try {
        fs.writeFileSync(filePath, JSON.stringify(targets, null, 2));
        logger.info(`Wrote ${targets.length} ${type} targets to ${filePath}`);
      } catch (err) {
        logger.warn(`Failed to write target file ${filePath}`, { error: err });
      }
    }

    // Reload Prometheus via API
    try {
      await axios.post(`${PROMETHEUS_URL}/-/reload`, null, { timeout: 5000 });
      logger.info('Prometheus configuration reloaded');
    } catch (err) {
      logger.warn('Failed to reload Prometheus (may need --web.enable-lifecycle flag)', { error: err });
    }
  }

  /**
   * Store discovered services as system events in the DB.
   */
  async storeDiscoveryResults(services: DiscoveredService[]): Promise<void> {
    for (const svc of services) {
      try {
        await prisma.eventLog.create({
          data: {
            type: 'SYSTEM_STARTUP',
            source: 'auto-discovery',
            title: `Service discovered: ${svc.type}`,
            message: `Discovered ${svc.type} at ${svc.host}:${svc.port}${svc.version ? ' (v' + svc.version + ')' : ''}`,
            metadata: {
              serviceType: svc.type,
              host: svc.host,
              port: svc.port,
              version: svc.version || null,
            },
          },
        });
      } catch {
        // Ignore duplicate or failed events
      }
    }
  }

  /**
   * Full discovery cycle: scan, write targets, store results.
   */
  async runDiscoveryAndUpdate(): Promise<DiscoveredService[]> {
    try {
      logger.info('Starting service auto-discovery...');
      const discovered = await this.discoverServices();

      if (discovered.length > 0) {
        await this.writeTargetFiles(discovered);
        await this.storeDiscoveryResults(discovered);
      }

      logger.info(`Auto-discovery complete: found ${discovered.length} services`);
      return discovered;
    } catch (error) {
      logger.error('Auto-discovery failed', { error });
      return [];
    }
  }

  // ─── TCP check ──────────────────────────────────────────────────────

  private async checkTCP(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);
      socket.connect(port, host, () => { socket.destroy(); resolve(true); });
      socket.on('error', () => resolve(false));
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
    });
  }

  // ─── HTTP Server header check ──────────────────────────────────────

  private async checkHTTPServer(serverName: string, host: string, port: number): Promise<boolean> {
    try {
      const resp = await axios.get(`http://${host}:${port}/`, {
        timeout: 3000,
        validateStatus: () => true, // accept any status
      });
      const server = resp.headers['server'] || '';
      return server.toLowerCase().includes(serverName.toLowerCase());
    } catch {
      return false;
    }
  }

  // ─── Version probes (TCP banner parsing) ────────────────────────────

  /**
   * Read a TCP banner: connect, optionally send data, read first response bytes.
   */
  private readBanner(host: string, port: number, sendData?: Buffer): Promise<Buffer | null> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);

      let received = Buffer.alloc(0);

      socket.connect(port, host, () => {
        if (sendData) socket.write(sendData);
      });

      socket.on('data', (data) => {
        received = Buffer.concat([received, data]);
        // Got enough data, close
        if (received.length > 0) {
          socket.destroy();
          resolve(received);
        }
      });

      socket.on('error', () => resolve(null));
      socket.on('timeout', () => { socket.destroy(); resolve(received.length > 0 ? received : null); });
      socket.on('close', () => { if (received.length > 0) resolve(received); });
    });
  }

  private async probeMySQLVersion(host: string, port: number): Promise<string | undefined> {
    // MySQL sends a greeting packet with version string after connection
    const banner = await this.readBanner(host, port);
    if (!banner || banner.length < 10) return undefined;
    // MySQL greeting: 4-byte header, then protocol version byte, then null-terminated version string
    try {
      const start = 5; // skip 4-byte length + protocol version
      const end = banner.indexOf(0, start);
      if (end > start) {
        return banner.subarray(start, end).toString('utf-8');
      }
    } catch { /* parse failed */ }
    return undefined;
  }

  private async probePostgreSQLVersion(host: string, port: number): Promise<string | undefined> {
    // PostgreSQL requires a startup message; send a simple query after SSL negotiation
    // Simpler: try a SSLRequest and read the single-byte response
    // For version, we'd need full auth; just detect presence
    const banner = await this.readBanner(host, port, Buffer.from([
      0, 0, 0, 8, // length=8
      0x04, 0xd2, 0x16, 0x2f, // SSLRequest magic
    ]));
    if (banner && banner.length >= 1) {
      // Response 'N' means no SSL, 'S' means SSL — either way, it's PostgreSQL
      const ch = String.fromCharCode(banner[0]);
      if (ch === 'N' || ch === 'S') return 'detected';
    }
    return undefined;
  }

  private async probeMongoDBVersion(host: string, port: number): Promise<string | undefined> {
    // MongoDB: send an isMaster command via the legacy OP_QUERY protocol
    // Too complex for a simple probe — just confirm TCP connectivity
    const banner = await this.readBanner(host, port);
    return banner ? 'detected' : undefined;
  }

  private async probeRedisVersion(host: string, port: number): Promise<string | undefined> {
    // Redis: send INFO server and parse redis_version
    const banner = await this.readBanner(host, port, Buffer.from('INFO server\r\n'));
    if (!banner) return undefined;
    const text = banner.toString('utf-8');
    const match = text.match(/redis_version:(\S+)/);
    return match ? match[1] : (text.includes('redis') ? 'detected' : undefined);
  }
}

// ─── Scheduled runner ─────────────────────────────────────────────────

export function startAutoDiscovery(): void {
  if (discoveryInterval) return;

  const service = new AutoDiscoveryService();

  // Run initial discovery after a short delay (let other services start first)
  setTimeout(() => {
    service.runDiscoveryAndUpdate().catch(err => {
      logger.error('Initial auto-discovery failed', { error: err });
    });
  }, 30000); // 30 seconds after startup

  // Schedule periodic discovery
  discoveryInterval = setInterval(() => {
    service.runDiscoveryAndUpdate().catch(err => {
      logger.error('Periodic auto-discovery failed', { error: err });
    });
  }, DISCOVERY_INTERVAL_MINUTES * 60 * 1000);

  logger.info(`Auto-discovery scheduled every ${DISCOVERY_INTERVAL_MINUTES} minutes`);
}

export function stopAutoDiscovery(): void {
  if (discoveryInterval) {
    clearInterval(discoveryInterval);
    discoveryInterval = null;
    logger.info('Auto-discovery stopped');
  }
}
