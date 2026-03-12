'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useSettings } from '@/hooks/useSettings';

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const icon = (d: string) => (
  <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} />
  </svg>
);

const navSections: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: icon('M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z') },
      { name: 'Servers', href: '/servers', icon: icon('M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01') },
      { name: 'Metrics', href: '/metrics', icon: icon('M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z') },
      { name: 'Dashboards', href: '/dashboards', icon: icon('M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z') },
      { name: 'Service Map', href: '/service-map', icon: icon('M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1') },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { name: 'Uptime', href: '/uptime', icon: icon('M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z') },
      { name: 'Multi-Step', href: '/multi-step-monitors', icon: icon('M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15') },
      { name: 'Composite', href: '/composite-monitors', icon: icon('M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z') },
      { name: 'Synthetic', href: '/synthetic-checks', icon: icon('M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z') },
      { name: 'SNMP Devices', href: '/snmp-devices', icon: icon('M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z') },
      { name: 'Kubernetes', href: '/kubernetes', icon: icon('M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4') },
      { name: 'RUM', href: '/rum', icon: icon('M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z') },
    ],
  },
  {
    label: 'Alerting',
    items: [
      { name: 'Alerts', href: '/alerts', icon: icon('M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9') },
      { name: 'Routing Rules', href: '/alert-routing-rules', icon: icon('M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4') },
      { name: 'Inhibition', href: '/alert-inhibition-rules', icon: icon('M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636') },
      { name: 'Escalation', href: '/escalation-policies', icon: icon('M13 7h8m0 0v8m0-8l-8 8-4-4-6 6') },
      { name: 'On-Call', href: '/on-call', icon: icon('M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z') },
    ],
  },
  {
    label: 'Incidents',
    items: [
      { name: 'Incidents', href: '/incidents', icon: icon('M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z') },
      { name: 'Post-Mortems', href: '/post-mortems', icon: icon('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01') },
      { name: 'Annotations', href: '/annotations', icon: icon('M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z') },
      { name: 'SLOs', href: '/slos', icon: icon('M13 10V3L4 14h7v7l9-11h-7z') },
      { name: 'SLA Policies', href: '/sla-policies', icon: icon('M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z') },
    ],
  },
  {
    label: 'Observability',
    items: [
      { name: 'Traces', href: '/traces', icon: icon('M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z') },
      { name: 'Infra Logs', href: '/infrastructure-logs', icon: icon('M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z') },
      { name: 'Event Log', href: '/logs', icon: icon('M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z') },
      { name: 'Infra Changes', href: '/infra-changes', icon: icon('M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15') },
    ],
  },
  {
    label: 'Automation',
    items: [
      { name: 'Runbooks', href: '/runbooks', icon: icon('M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4') },
      { name: 'Reports', href: '/scheduled-reports', icon: icon('M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z') },
      { name: 'Retention', href: '/retention-policies', icon: icon('M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16') },
    ],
  },
  {
    label: 'Admin',
    items: [
      { name: 'Status Pages', href: '/status-pages', icon: icon('M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z') },
      { name: 'API Tokens', href: '/api-tokens', icon: icon('M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z') },
      { name: 'System Status', href: '/system-status', icon: icon('M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z') },
      { name: 'Settings', href: '/settings', icon: (
        <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ) },
      { name: 'Docs', href: '/docs', icon: icon('M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253') },
    ],
  },
];

const externalLinks = [
  {
    name: 'API Docs',
    href: process.env.NEXT_PUBLIC_DOCS_URL || 'https://digin1.github.io/NodePrism/',
    color: '#3B82F6',
    logoSrc: '/icon-nodeprism.png',
  },
  {
    name: 'Grafana',
    href: process.env.NEXT_PUBLIC_GRAFANA_URL || 'http://localhost:3030',
    color: '#F46800',
    logoSrc: '/external/grafana.svg',
  },
  {
    name: 'Prometheus',
    href: process.env.NEXT_PUBLIC_PROMETHEUS_URL || 'http://localhost:9090',
    color: '#E6522C',
    logoSrc: '/external/prometheus.svg',
  },
  {
    name: 'AlertManager',
    href: process.env.NEXT_PUBLIC_ALERTMANAGER_URL || 'http://localhost:9093',
    color: '#DB4437',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v4m0 4h.01m-7.938 4h15.876c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L2.33 18.5c-.77.833.192 2.5 1.732 2.5z"
        />
      </svg>
    ),
  },
];

function SectionHeader({ label, collapsed, onToggle }: { label: string; collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground hover:text-foreground transition-colors"
    >
      <span>{label}</span>
      <svg
        className={cn('h-3 w-3 transition-transform', collapsed && '-rotate-90')}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: settings } = useSettings();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const logoUrl = settings?.logoUrl || null;
  const systemName = settings?.systemName || 'NodePrism';
  const primaryColor = settings?.primaryColor || '#3B82F6';

  const toggleSection = (label: string) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div className="flex h-full w-[18rem] flex-col border-r subtle-divider bg-[linear-gradient(180deg,hsl(var(--panel-elevated))_0%,hsl(var(--background))_100%)]">
      <div className="border-b subtle-divider px-5 py-5">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-card/85">
            {logoUrl ? (
              <div className="rounded-lg bg-white px-2.5 py-1">
                <img
                  src={logoUrl}
                  alt={systemName}
                  style={{ height: '32px', width: 'auto', maxWidth: '140px' }}
                />
              </div>
            ) : (
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <span className="text-lg font-bold" style={{ color: primaryColor }}>
                  {systemName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              Telemetry Grid
            </p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {navSections.map((section) => {
          const isCollapsed = collapsed[section.label] ?? false;
          const hasActive = section.items.some(
            (item) => pathname === item.href || pathname?.startsWith(item.href + '/')
          );

          return (
            <div key={section.label}>
              <SectionHeader
                label={section.label}
                collapsed={isCollapsed}
                onToggle={() => toggleSection(section.label)}
              />
              {(!isCollapsed || hasActive) && (
                <div className="space-y-0.5 pb-1">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                    if (isCollapsed && !isActive) return null;
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={cn(
                          'group flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all',
                          isActive
                            ? 'border border-primary/20 bg-primary/12 text-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.08)]'
                            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                        )}
                      >
                        <span
                          className={cn(
                            'transition-colors',
                            isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'
                          )}
                        >
                          {item.icon}
                        </span>
                        <span>{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t subtle-divider px-3 py-2">
        <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          External
        </p>
        <div className="space-y-0.5">
          {externalLinks.map((item) => (
            <a
              key={item.name}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            >
              {item.logoSrc ? (
                <span className="flex h-4 w-4 items-center justify-center overflow-hidden rounded bg-white dark:bg-transparent">
                  <img src={item.logoSrc} alt={item.name} className="h-4 w-4 object-contain" />
                </span>
              ) : item.icon ? (
                <span
                  className="flex h-4 w-4 items-center justify-center rounded text-white"
                  style={{ backgroundColor: item.color }}
                >
                  {item.icon}
                </span>
              ) : (
                <span
                  className="flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold text-white"
                  style={{ backgroundColor: item.color }}
                >
                  {item.name.charAt(0)}
                </span>
              )}
              {item.name}
              <svg
                className="ml-auto h-3 w-3 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          ))}
        </div>
      </div>

      {(settings?.managerHostname || settings?.managerIp) && (
        <div className="border-t subtle-divider px-4 py-2">
          <div className="text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"
                />
              </svg>
              <span className="truncate" title={settings.managerHostname || ''}>
                {settings.managerHostname}
              </span>
            </div>
            {settings.managerIp && (
              <div className="metric-text mt-0.5 pl-4 text-[11px]">{settings.managerIp}</div>
            )}
          </div>
        </div>
      )}

      <div className="border-t subtle-divider px-3 py-2">
        <a
          href="https://digindominic.me"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 flex items-center justify-between rounded-xl px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <span>Built by Digin Dominic</span>
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </div>
    </div>
  );
}
