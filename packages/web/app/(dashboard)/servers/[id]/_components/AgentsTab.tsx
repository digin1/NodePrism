'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { agentApi } from '@/lib/api';
import { Server, AGENT_TYPES } from './types';

interface AgentsTabProps {
  serverData: Server;
  serverId: string;
}

export function AgentsTab({ serverData, serverId }: AgentsTabProps) {
  const queryClient = useQueryClient();

  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [agentType, setAgentType] = useState('NODE_EXPORTER');
  const [agentPort, setAgentPort] = useState(9100);
  const [agentVersion, setAgentVersion] = useState('');
  const [registerError, setRegisterError] = useState('');

  const registerAgentMutation = useMutation({
    mutationFn: (data: { agentType: string; port: number; version?: string }) =>
      agentApi.register({
        hostname: serverData.hostname,
        ipAddress: serverData.ipAddress,
        agentType: data.agentType,
        port: data.port,
        version: data.version,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', serverId] });
      setShowRegisterForm(false);
      setRegisterError('');
      setAgentVersion('');
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      setRegisterError(error.response?.data?.error || error.message || 'Failed to register agent');
    },
  });

  const unregisterAgentMutation = useMutation({
    mutationFn: (agentId: string) => agentApi.unregister(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', serverId] });
    },
  });

  const handleRegisterAgent = (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');
    registerAgentMutation.mutate({
      agentType,
      port: agentPort,
      version: agentVersion || undefined,
    });
  };

  const handleAgentTypeChange = (type: string) => {
    setAgentType(type);
    const agentConfig = AGENT_TYPES.find((t) => t.value === type);
    if (agentConfig) {
      setAgentPort(agentConfig.defaultPort);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Installed Agents</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowRegisterForm(!showRegisterForm)}
          >
            {showRegisterForm ? 'Cancel' : 'Register Agent'}
          </Button>
        </CardHeader>
        <CardContent>
          {showRegisterForm && (
            <form
              onSubmit={handleRegisterAgent}
              className="mb-6 p-4 bg-blue-500/10 dark:bg-blue-500/20 rounded-lg border border-blue-500/20"
            >
              <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-3">
                Register Existing Exporter
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-400 mb-4">
                Use this to register an exporter that is already installed and running on the
                server.
              </p>

              {registerError && (
                <div className="mb-4 p-3 bg-red-500/10 dark:bg-red-500/20 border border-red-500/20 rounded text-red-700 dark:text-red-400 text-sm">
                  {registerError}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Exporter Type
                  </label>
                  <select
                    value={agentType}
                    onChange={(e) => handleAgentTypeChange(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                  >
                    {AGENT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Port
                  </label>
                  <input
                    type="number"
                    value={agentPort}
                    onChange={(e) => setAgentPort(parseInt(e.target.value, 10))}
                    min={1}
                    max={65535}
                    className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    The port where the exporter is listening (e.g., 9100 for node_exporter)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Version (Optional)
                  </label>
                  <input
                    type="text"
                    value={agentVersion}
                    onChange={(e) => setAgentVersion(e.target.value)}
                    placeholder="e.g., 1.6.1"
                    className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={registerAgentMutation.isPending}
                  className="w-full"
                >
                  {registerAgentMutation.isPending ? 'Registering...' : 'Register Agent'}
                </Button>
              </div>
            </form>
          )}

          {serverData.agents && serverData.agents.length > 0 ? (
            <div className="space-y-3">
              {serverData.agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div>
                    <p className="font-medium">
                      {AGENT_TYPES.find((t) => t.value === agent.type)?.label ||
                        agent.type.replaceAll('_', ' ')}
                    </p>
                    <p className="text-sm text-muted-foreground">Port: {agent.port}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={agent.status === 'RUNNING' ? 'success' : 'secondary'}>
                      {agent.status}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                      onClick={() => {
                        if (confirm('Are you sure you want to unregister this agent?')) {
                          unregisterAgentMutation.mutate(agent.id);
                        }
                      }}
                      disabled={unregisterAgentMutation.isPending}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : !showRegisterForm ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No agents installed</p>
              <Button variant="outline" onClick={() => setShowRegisterForm(true)}>
                Register Existing
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
