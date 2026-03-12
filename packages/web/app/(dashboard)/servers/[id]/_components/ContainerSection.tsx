'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  VirtualContainer,
  ContainerMetrics,
  ContainerMetricsResponse,
} from '@/lib/api';
import { useFormatDate } from '@/hooks/useFormatDate';
import { formatBytes, formatBytesRate, formatTraffic } from './types';

function ContainerRow({
  container: c,
  metrics,
}: {
  container: VirtualContainer;
  metrics?: ContainerMetrics;
}) {
  const [expanded, setExpanded] = useState(false);
  const { formatDateTime } = useFormatDate();
  const meta = c.metadata as Record<string, unknown> | null;

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setExpanded(!expanded)}>
        <TableCell className="w-8 text-center">
          <span className="text-muted-foreground text-xs">{expanded ? '▼' : '▶'}</span>
        </TableCell>
        <TableCell className="font-medium">{c.name}</TableCell>
        <TableCell>
          <Badge variant="outline">{c.type.toUpperCase()}</Badge>
        </TableCell>
        <TableCell>
          <Badge
            variant={
              c.status === 'running' ? 'success' : c.status === 'paused' ? 'warning' : 'secondary'
            }
          >
            {c.status}
          </Badge>
        </TableCell>
        <TableCell className="font-mono text-sm">{c.ipAddress || '—'}</TableCell>
        <TableCell className="text-right">
          {metrics?.cpuPercent != null ? `${metrics.cpuPercent.toFixed(1)}%` : '—'}
        </TableCell>
        <TableCell className="text-right">
          {metrics?.memoryUsageBytes != null && metrics?.memoryMaxBytes
            ? `${formatBytes(metrics.memoryUsageBytes)} / ${formatBytes(metrics.memoryMaxBytes)}`
            : '—'}
        </TableCell>
        <TableCell className="text-right">
          {meta?.diskUsageBytes != null && Number(meta.diskUsageBytes) > 0 && meta?.diskLimitBytes
            ? `${formatBytes(Number(meta.diskUsageBytes))} / ${formatBytes(Number(meta.diskLimitBytes))}`
            : meta?.diskLimitBytes && Number(meta.diskLimitBytes) > 0
              ? formatBytes(Number(meta.diskLimitBytes))
              : meta?.diskSizeBytes
                ? formatBytes(Number(meta.diskSizeBytes))
                : '—'}
        </TableCell>
        <TableCell className="text-right text-green-600">
          {metrics?.netRxBytesPerSec != null
            ? formatBytesRate(metrics.netRxBytesPerSec)
            : formatTraffic(c.networkRxBytes)}
        </TableCell>
        <TableCell className="text-right text-blue-600">
          {metrics?.netTxBytesPerSec != null
            ? formatBytesRate(metrics.netTxBytesPerSec)
            : formatTraffic(c.networkTxBytes)}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={10} className="bg-muted/30 p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Container ID</p>
                <p className="font-mono text-sm">{c.containerId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Type</p>
                <p className="text-sm">{c.type}</p>
              </div>
              {metrics?.vCPUs != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">vCPUs</p>
                  <p className="text-sm">{metrics.vCPUs}</p>
                </div>
              )}
              {metrics?.cpuPercent != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">CPU Usage</p>
                  <p className="text-sm font-medium">{metrics.cpuPercent.toFixed(1)}%</p>
                </div>
              )}
              {metrics?.memoryUsageBytes != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Memory Used</p>
                  <p className="text-sm font-medium">{formatBytes(metrics.memoryUsageBytes)}</p>
                </div>
              )}
              {metrics?.memoryMaxBytes != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Memory Max</p>
                  <p className="text-sm">{formatBytes(metrics.memoryMaxBytes)}</p>
                </div>
              )}
              {metrics?.diskReadBytesPerSec != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Disk Read</p>
                  <p className="text-sm">{formatBytesRate(metrics.diskReadBytesPerSec)}</p>
                </div>
              )}
              {metrics?.diskWriteBytesPerSec != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Disk Write</p>
                  <p className="text-sm">{formatBytesRate(metrics.diskWriteBytesPerSec)}</p>
                </div>
              )}
              {!metrics && meta && Object.keys(meta).length > 0 && (
                <>
                  {meta.vcpus !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">vCPUs</p>
                      <p className="text-sm">{String(meta.vcpus)}</p>
                    </div>
                  )}
                  {meta.memoryKB !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Memory</p>
                      <p className="text-sm">{formatBytes(Number(meta.memoryKB) * 1024)}</p>
                    </div>
                  )}
                </>
              )}
            </div>
            {c.lastSeen && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Last seen: {formatDateTime(c.lastSeen)}.
                  {c.status === 'running' ? ' Currently active.' : ` Currently ${c.status}.`}
                </p>
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

interface ContainerSectionProps {
  containerList: VirtualContainer[] | undefined;
  containerMetricsResponse: ContainerMetricsResponse | undefined;
}

export function ContainerSection({
  containerList,
  containerMetricsResponse,
}: ContainerSectionProps) {
  const [containerSort, setContainerSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({
    key: 'name',
    dir: 'asc',
  });
  const [containerSearch, setContainerSearch] = useState('');

  const containerMetricsList = containerMetricsResponse?.data;
  const storagePool = containerMetricsResponse?.storagePool;

  return (
    <div className="space-y-6">
      {containerList && containerList.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <svg
                className="w-5 h-5 text-purple-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
              Virtual Machines / Containers
              <span className="text-sm font-normal text-muted-foreground">
                ({containerList.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const running = containerList.filter((c) => c.status === 'running').length;
              const stopped = containerList.length - running;
              const totalMemUsed =
                containerMetricsList?.reduce((sum, m) => sum + (m.memoryUsageBytes ?? 0), 0) ??
                0;
              const totalMemMax =
                containerMetricsList?.reduce((sum, m) => sum + (m.memoryMaxBytes ?? 0), 0) ?? 0;
              const totalCpu =
                containerMetricsList?.reduce((sum, m) => sum + (m.cpuPercent ?? 0), 0) ?? 0;
              const totalVCPUs =
                containerMetricsList?.reduce((sum, m) => sum + (m.vCPUs ?? 0), 0) ?? 0;
              const hasCpu = containerMetricsList?.some((m) => m.cpuPercent != null);
              const hasMem = totalMemMax > 0 || totalMemUsed > 0;
              const totalDiskAlloc = containerList.reduce((sum, c) => {
                const meta = c.metadata as Record<string, unknown> | null;
                return (
                  sum +
                  (meta?.diskUsageBytes
                    ? Number(meta.diskUsageBytes)
                    : meta?.diskSizeBytes
                      ? Number(meta.diskSizeBytes)
                      : 0)
                );
              }, 0);
              return (
                <div className="flex flex-wrap gap-4 mb-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    <span className="text-muted-foreground">{running} running</span>
                  </div>
                  {stopped > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                      <span className="text-muted-foreground">{stopped} stopped</span>
                    </div>
                  )}
                  {totalVCPUs > 0 && (
                    <div className="text-muted-foreground">{totalVCPUs} vCPUs</div>
                  )}
                  {hasCpu && (
                    <div className="text-muted-foreground">CPU: {totalCpu.toFixed(1)}%</div>
                  )}
                  {hasMem && (
                    <div className="text-muted-foreground">
                      Memory: {totalMemUsed > 0 ? `${formatBytes(totalMemUsed)} / ` : ''}
                      {formatBytes(totalMemMax)}
                    </div>
                  )}
                  {totalDiskAlloc > 0 && (
                    <div className="text-muted-foreground">
                      Disk Allocated: {formatBytes(totalDiskAlloc)}
                    </div>
                  )}
                  {storagePool && (
                    <div className="text-muted-foreground">
                      {storagePool.name.startsWith('/')
                        ? `Storage ${storagePool.name}`
                        : `VG ${storagePool.name}`}
                      : {formatBytes(storagePool.sizeBytes - storagePool.freeBytes)} /{' '}
                      {formatBytes(storagePool.sizeBytes)} ({formatBytes(storagePool.freeBytes)}{' '}
                      free)
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="mb-3">
              <Input
                placeholder="Search by name, IP, status..."
                value={containerSearch}
                onChange={(e) => setContainerSearch(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  {[
                    { key: 'name', label: 'Name', align: '' },
                    { key: 'type', label: 'Type', align: '' },
                    { key: 'status', label: 'Status', align: '' },
                    { key: 'ip', label: 'IP Address', align: '' },
                    { key: 'cpu', label: 'CPU', align: 'text-right' },
                    { key: 'memory', label: 'Memory', align: 'text-right' },
                    { key: 'disk', label: 'Disk', align: 'text-right' },
                    { key: 'rx', label: 'RX', align: 'text-right' },
                    { key: 'tx', label: 'TX', align: 'text-right' },
                  ].map((col) => (
                    <TableHead
                      key={col.key}
                      className={`${col.align} cursor-pointer select-none hover:text-foreground`}
                      onClick={() =>
                        setContainerSort((prev) =>
                          prev.key === col.key
                            ? { key: col.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                            : { key: col.key, dir: 'asc' }
                        )
                      }
                    >
                      {col.label}
                      {containerSort.key === col.key && (
                        <span className="ml-1 text-xs">
                          {containerSort.dir === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const getMetrics = (c: VirtualContainer) =>
                    containerMetricsList?.find(
                      (m) => m.domain === c.name || m.domain === c.containerId
                    );
                  const searchLower = containerSearch.toLowerCase().trim();
                  const filtered = searchLower
                    ? containerList.filter(
                        (c) =>
                          c.name.toLowerCase().includes(searchLower) ||
                          c.containerId.toLowerCase().includes(searchLower) ||
                          (c.ipAddress || '').toLowerCase().includes(searchLower) ||
                          (c.hostname || '').toLowerCase().includes(searchLower) ||
                          c.status.toLowerCase().includes(searchLower) ||
                          c.type.toLowerCase().includes(searchLower)
                      )
                    : containerList;
                  const sorted = [...filtered].sort((a, b) => {
                    const dir = containerSort.dir === 'asc' ? 1 : -1;
                    const ma = getMetrics(a);
                    const mb = getMetrics(b);
                    switch (containerSort.key) {
                      case 'name':
                        return dir * a.name.localeCompare(b.name);
                      case 'type':
                        return dir * a.type.localeCompare(b.type);
                      case 'status':
                        return dir * a.status.localeCompare(b.status);
                      case 'ip':
                        return dir * (a.ipAddress || '').localeCompare(b.ipAddress || '');
                      case 'cpu':
                        return dir * ((ma?.cpuPercent ?? -1) - (mb?.cpuPercent ?? -1));
                      case 'memory':
                        return (
                          dir *
                          ((ma?.memoryUsageBytes ?? ma?.memoryMaxBytes ?? -1) -
                            (mb?.memoryUsageBytes ?? mb?.memoryMaxBytes ?? -1))
                        );
                      case 'disk': {
                        const ma2 = a.metadata as Record<string, unknown> | null;
                        const mb2 = b.metadata as Record<string, unknown> | null;
                        const da = ma2?.diskUsageBytes ?? ma2?.diskSizeBytes;
                        const db = mb2?.diskUsageBytes ?? mb2?.diskSizeBytes;
                        return dir * ((da ? Number(da) : -1) - (db ? Number(db) : -1));
                      }
                      case 'rx':
                        return (
                          dir *
                          ((ma?.netRxBytesPerSec ?? Number(a.networkRxBytes)) -
                            (mb?.netRxBytesPerSec ?? Number(b.networkRxBytes)))
                        );
                      case 'tx':
                        return (
                          dir *
                          ((ma?.netTxBytesPerSec ?? Number(a.networkTxBytes)) -
                            (mb?.netTxBytesPerSec ?? Number(b.networkTxBytes)))
                        );
                      default:
                        return 0;
                    }
                  });
                  return sorted.map((c) => (
                    <ContainerRow key={c.id} container={c} metrics={getMetrics(c)} />
                  ));
                })()}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">
              No containers or VMs detected on this server.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
