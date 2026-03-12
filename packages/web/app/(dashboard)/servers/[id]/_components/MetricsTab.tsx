'use client';

import dynamic from 'next/dynamic';
import { ServerForecasting } from '../forecasting';
import { Server } from './types';

const MetricsCharts = dynamic(
  () => import('@/components/dashboard/MetricsCharts').then(mod => ({ default: mod.MetricsCharts })),
  { ssr: false, loading: () => <div className="h-[400px] animate-pulse bg-muted/50 rounded-xl" /> }
);

const BandwidthSummary = dynamic(
  () => import('@/components/dashboard/MetricsCharts').then(mod => ({ default: mod.BandwidthSummary })),
  { ssr: false, loading: () => <div className="h-[120px] animate-pulse bg-muted/50 rounded-xl" /> }
);

interface MetricsTabProps {
  serverId: string;
  serverData: Server;
}

export function MetricsTab({ serverId, serverData }: MetricsTabProps) {
  return (
    <div className="space-y-6">
      <BandwidthSummary serverId={serverId} />
      <ServerForecasting serverId={serverId} />
      <MetricsCharts
        serverId={serverId}
        hasMySQLExporter={serverData.agents?.some(
          (a) => a.type === 'MYSQL_EXPORTER' && a.status === 'RUNNING'
        )}
        hasLiteSpeedExporter={serverData.agents?.some(
          (a) => a.type === 'LITESPEED_EXPORTER' && a.status === 'RUNNING'
        )}
        hasEximExporter={serverData.agents?.some(
          (a) => a.type === 'EXIM_EXPORTER' && a.status === 'RUNNING'
        )}
      />
    </div>
  );
}
