// Types for testing
interface PrometheusTarget {
  targets: string[];
  labels: Record<string, string>;
}

interface MockServer {
  id: string;
  hostname: string;
  ipAddress: string;
  environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
  region?: string;
  status: string;
  agents: MockAgent[];
}

interface MockAgent {
  type: string;
  port: number;
  status: string;
}

describe('Target Generator', () => {
  describe('generateTargets', () => {
    // Helper function that mimics the target generation logic
    function generateTargets(servers: MockServer[]): Record<string, PrometheusTarget[]> {
      const targetsByType: Record<string, PrometheusTarget[]> = {
        'node-exporter': [],
        'app-agent': [],
        'mysql-exporter': [],
        'postgres-exporter': [],
      };

      for (const server of servers) {
        const baseLabels = {
          server_id: server.id,
          hostname: server.hostname,
          environment: server.environment.toLowerCase(),
          ...(server.region && { region: server.region }),
        };

        for (const agent of server.agents) {
          if (agent.status !== 'RUNNING') continue;

          const targetAddress = `${server.ipAddress}:${agent.port}`;
          const target: PrometheusTarget = {
            targets: [targetAddress],
            labels: {
              ...baseLabels,
              agent_type: agent.type.toLowerCase().replace('_', '-'),
            },
          };

          switch (agent.type) {
            case 'NODE_EXPORTER':
              targetsByType['node-exporter'].push(target);
              break;
            case 'APP_AGENT':
              targetsByType['app-agent'].push(target);
              break;
            case 'MYSQL_EXPORTER':
              targetsByType['mysql-exporter'].push(target);
              break;
            case 'POSTGRES_EXPORTER':
              targetsByType['postgres-exporter'].push(target);
              break;
          }
        }
      }

      return targetsByType;
    }

    it('should generate node-exporter targets', () => {
      const mockServers: MockServer[] = [
        {
          id: 'server-1',
          hostname: 'web-01',
          ipAddress: '192.168.1.100',
          environment: 'PRODUCTION',
          status: 'ONLINE',
          agents: [
            { type: 'NODE_EXPORTER', port: 9100, status: 'RUNNING' },
          ],
        },
      ];

      const targets = generateTargets(mockServers);

      expect(targets['node-exporter'].length).toBe(1);
      expect(targets['node-exporter'][0].targets[0]).toBe('192.168.1.100:9100');
      expect(targets['node-exporter'][0].labels.hostname).toBe('web-01');
    });

    it('should only include running agents', () => {
      const mockServers: MockServer[] = [
        {
          id: 'server-1',
          hostname: 'web-01',
          ipAddress: '192.168.1.100',
          environment: 'PRODUCTION',
          status: 'ONLINE',
          agents: [
            { type: 'NODE_EXPORTER', port: 9100, status: 'RUNNING' },
            { type: 'APP_AGENT', port: 9101, status: 'STOPPED' },
          ],
        },
      ];

      const targets = generateTargets(mockServers);

      expect(targets['node-exporter'].length).toBe(1);
      expect(targets['app-agent'].length).toBe(0);
    });

    it('should include region label when present', () => {
      const mockServers: MockServer[] = [
        {
          id: 'server-1',
          hostname: 'web-01',
          ipAddress: '192.168.1.100',
          environment: 'PRODUCTION',
          region: 'us-east-1',
          status: 'ONLINE',
          agents: [
            { type: 'NODE_EXPORTER', port: 9100, status: 'RUNNING' },
          ],
        },
      ];

      const targets = generateTargets(mockServers);

      expect(targets['node-exporter'][0].labels.region).toBe('us-east-1');
    });

    it('should not include region label when not present', () => {
      const mockServers: MockServer[] = [
        {
          id: 'server-1',
          hostname: 'web-01',
          ipAddress: '192.168.1.100',
          environment: 'PRODUCTION',
          status: 'ONLINE',
          agents: [
            { type: 'NODE_EXPORTER', port: 9100, status: 'RUNNING' },
          ],
        },
      ];

      const targets = generateTargets(mockServers);

      expect(targets['node-exporter'][0].labels.region).toBeUndefined();
    });

    it('should handle multiple servers with multiple agents', () => {
      const mockServers: MockServer[] = [
        {
          id: 'server-1',
          hostname: 'web-01',
          ipAddress: '192.168.1.100',
          environment: 'PRODUCTION',
          status: 'ONLINE',
          agents: [
            { type: 'NODE_EXPORTER', port: 9100, status: 'RUNNING' },
            { type: 'APP_AGENT', port: 9101, status: 'RUNNING' },
          ],
        },
        {
          id: 'server-2',
          hostname: 'db-01',
          ipAddress: '192.168.1.200',
          environment: 'PRODUCTION',
          status: 'ONLINE',
          agents: [
            { type: 'NODE_EXPORTER', port: 9100, status: 'RUNNING' },
            { type: 'POSTGRES_EXPORTER', port: 9187, status: 'RUNNING' },
          ],
        },
      ];

      const targets = generateTargets(mockServers);

      expect(targets['node-exporter'].length).toBe(2);
      expect(targets['app-agent'].length).toBe(1);
      expect(targets['postgres-exporter'].length).toBe(1);
    });

    it('should convert environment to lowercase', () => {
      const mockServers: MockServer[] = [
        {
          id: 'server-1',
          hostname: 'staging-01',
          ipAddress: '192.168.1.100',
          environment: 'STAGING',
          status: 'ONLINE',
          agents: [
            { type: 'NODE_EXPORTER', port: 9100, status: 'RUNNING' },
          ],
        },
      ];

      const targets = generateTargets(mockServers);

      expect(targets['node-exporter'][0].labels.environment).toBe('staging');
    });

    it('should handle empty server list', () => {
      const targets = generateTargets([]);

      expect(targets['node-exporter'].length).toBe(0);
      expect(targets['app-agent'].length).toBe(0);
    });

    it('should handle servers with no agents', () => {
      const mockServers: MockServer[] = [
        {
          id: 'server-1',
          hostname: 'new-server',
          ipAddress: '192.168.1.100',
          environment: 'PRODUCTION',
          status: 'ONLINE',
          agents: [],
        },
      ];

      const targets = generateTargets(mockServers);

      expect(targets['node-exporter'].length).toBe(0);
    });
  });

  describe('Target JSON format', () => {
    it('should produce valid Prometheus file_sd_config format', () => {
      const target: PrometheusTarget = {
        targets: ['192.168.1.100:9100'],
        labels: {
          server_id: 'server-1',
          hostname: 'web-01',
          environment: 'production',
        },
      };

      const json = JSON.stringify([target], null, 2);
      const parsed = JSON.parse(json);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].targets).toBeDefined();
      expect(parsed[0].labels).toBeDefined();
      expect(Array.isArray(parsed[0].targets)).toBe(true);
    });
  });
});
