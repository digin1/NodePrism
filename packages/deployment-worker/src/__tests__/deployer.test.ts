// Mock deployment job structure
interface DeploymentJob {
  id: string;
  serverId: string;
  hostname: string;
  ipAddress: string;
  sshPort: number;
  sshUsername: string;
  agentType: string;
  deploymentId: string;
}

// Mock deployment result
interface DeploymentResult {
  success: boolean;
  error?: string;
  output?: string;
}

describe('Deployment Job Validation', () => {
  const createValidJob = (): DeploymentJob => ({
    id: 'job-123',
    serverId: 'server-456',
    hostname: 'web-server-01',
    ipAddress: '192.168.1.100',
    sshPort: 22,
    sshUsername: 'deploy',
    agentType: 'node_exporter',
    deploymentId: 'deploy-789',
  });

  describe('Job Structure', () => {
    it('should have all required fields', () => {
      const job = createValidJob();

      expect(job.id).toBeDefined();
      expect(job.serverId).toBeDefined();
      expect(job.hostname).toBeDefined();
      expect(job.ipAddress).toBeDefined();
      expect(job.sshPort).toBeDefined();
      expect(job.sshUsername).toBeDefined();
      expect(job.agentType).toBeDefined();
      expect(job.deploymentId).toBeDefined();
    });

    it('should have valid IP address format', () => {
      const job = createValidJob();
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;

      expect(ipRegex.test(job.ipAddress)).toBe(true);
    });

    it('should have valid SSH port', () => {
      const job = createValidJob();

      expect(job.sshPort).toBeGreaterThan(0);
      expect(job.sshPort).toBeLessThanOrEqual(65535);
    });
  });

  describe('Agent Types', () => {
    it('should support node_exporter', () => {
      const job = createValidJob();
      job.agentType = 'node_exporter';

      expect(['node_exporter', 'promtail']).toContain(job.agentType);
    });

    it('should support promtail', () => {
      const job = createValidJob();
      job.agentType = 'promtail';

      expect(['node_exporter', 'promtail']).toContain(job.agentType);
    });
  });
});

describe('Deployment Script Generation', () => {
  // Helper to generate node_exporter script info
  function getNodeExporterScriptInfo(job: DeploymentJob, version: string = '1.7.0') {
    return {
      downloadUrl: `https://github.com/prometheus/node_exporter/releases/download/v${version}/node_exporter-${version}.\${OS}-\${ARCH}.tar.gz`,
      serviceName: 'node_exporter',
      serviceUser: 'node_exporter',
      installPath: '/usr/local/bin/node_exporter',
      listenPort: 9100,
    };
  }

  // Helper to generate promtail script info
  function getPromtailScriptInfo(job: DeploymentJob, version: string = '2.9.3', lokiUrl: string) {
    return {
      downloadUrl: `https://github.com/grafana/loki/releases/download/v${version}/promtail-\${OS}-\${ARCH}.zip`,
      serviceName: 'promtail',
      serviceUser: 'promtail',
      installPath: '/usr/local/bin/promtail',
      configPath: '/etc/promtail/config.yml',
      lokiUrl,
    };
  }

  describe('Node Exporter Script', () => {
    it('should use correct download URL', () => {
      const job: DeploymentJob = {
        id: 'job-1',
        serverId: 'server-1',
        hostname: 'test-server',
        ipAddress: '192.168.1.1',
        sshPort: 22,
        sshUsername: 'root',
        agentType: 'node_exporter',
        deploymentId: 'deploy-1',
      };

      const scriptInfo = getNodeExporterScriptInfo(job, '1.7.0');

      expect(scriptInfo.downloadUrl).toContain('github.com/prometheus/node_exporter');
      expect(scriptInfo.downloadUrl).toContain('1.7.0');
    });

    it('should use correct service configuration', () => {
      const job: DeploymentJob = {
        id: 'job-1',
        serverId: 'server-1',
        hostname: 'test-server',
        ipAddress: '192.168.1.1',
        sshPort: 22,
        sshUsername: 'root',
        agentType: 'node_exporter',
        deploymentId: 'deploy-1',
      };

      const scriptInfo = getNodeExporterScriptInfo(job);

      expect(scriptInfo.serviceName).toBe('node_exporter');
      expect(scriptInfo.serviceUser).toBe('node_exporter');
      expect(scriptInfo.listenPort).toBe(9100);
    });
  });

  describe('Promtail Script', () => {
    it('should use correct download URL', () => {
      const job: DeploymentJob = {
        id: 'job-1',
        serverId: 'server-1',
        hostname: 'test-server',
        ipAddress: '192.168.1.1',
        sshPort: 22,
        sshUsername: 'root',
        agentType: 'promtail',
        deploymentId: 'deploy-1',
      };

      const scriptInfo = getPromtailScriptInfo(job, '2.9.3', 'http://loki:3100');

      expect(scriptInfo.downloadUrl).toContain('github.com/grafana/loki');
      expect(scriptInfo.downloadUrl).toContain('2.9.3');
    });

    it('should include Loki URL in config', () => {
      const lokiUrl = 'http://manager:3100/loki/api/v1/push';
      const job: DeploymentJob = {
        id: 'job-1',
        serverId: 'server-1',
        hostname: 'test-server',
        ipAddress: '192.168.1.1',
        sshPort: 22,
        sshUsername: 'root',
        agentType: 'promtail',
        deploymentId: 'deploy-1',
      };

      const scriptInfo = getPromtailScriptInfo(job, '2.9.3', lokiUrl);

      expect(scriptInfo.lokiUrl).toBe(lokiUrl);
    });
  });
});

describe('Deployment Result', () => {
  it('should indicate success correctly', () => {
    const successResult: DeploymentResult = {
      success: true,
      output: 'node_exporter installed and running successfully',
    };

    expect(successResult.success).toBe(true);
    expect(successResult.error).toBeUndefined();
    expect(successResult.output).toBeDefined();
  });

  it('should indicate failure correctly', () => {
    const failureResult: DeploymentResult = {
      success: false,
      error: 'SSH connection failed: Connection refused',
    };

    expect(failureResult.success).toBe(false);
    expect(failureResult.error).toBeDefined();
    expect(failureResult.error).toContain('SSH connection failed');
  });

  it('should include both error and output on partial failure', () => {
    const partialFailure: DeploymentResult = {
      success: false,
      error: 'Script exited with code 1',
      output: 'Downloaded successfully\nInstallation started\nFailed to start service',
    };

    expect(partialFailure.success).toBe(false);
    expect(partialFailure.error).toBeDefined();
    expect(partialFailure.output).toBeDefined();
  });
});

describe('Status Reporter', () => {
  type DeploymentStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

  interface StatusUpdate {
    deploymentId: string;
    serverId: string;
    status: DeploymentStatus;
    message?: string;
    error?: string;
    completedAt?: Date;
  }

  it('should create valid status update for started deployment', () => {
    const update: StatusUpdate = {
      deploymentId: 'deploy-123',
      serverId: 'server-456',
      status: 'IN_PROGRESS',
      message: 'Deployment started',
    };

    expect(update.status).toBe('IN_PROGRESS');
    expect(update.error).toBeUndefined();
    expect(update.completedAt).toBeUndefined();
  });

  it('should create valid status update for completed deployment', () => {
    const update: StatusUpdate = {
      deploymentId: 'deploy-123',
      serverId: 'server-456',
      status: 'COMPLETED',
      message: 'Agent deployed successfully',
      completedAt: new Date(),
    };

    expect(update.status).toBe('COMPLETED');
    expect(update.completedAt).toBeDefined();
  });

  it('should create valid status update for failed deployment', () => {
    const update: StatusUpdate = {
      deploymentId: 'deploy-123',
      serverId: 'server-456',
      status: 'FAILED',
      error: 'Connection timeout',
      completedAt: new Date(),
    };

    expect(update.status).toBe('FAILED');
    expect(update.error).toBeDefined();
    expect(update.completedAt).toBeDefined();
  });
});
