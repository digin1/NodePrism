'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';

interface ComponentStatus {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  currentStatus: 'operational' | 'degraded' | 'down';
  uptimePercent: number | null;
  latestResponseTime: number | null;
}

interface IncidentUpdate {
  id: string;
  message: string;
  status: string | null;
  createdAt: string;
}

interface Incident {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  severity: string;
  startedAt: string;
  resolvedAt?: string | null;
  updates: IncidentUpdate[];
}

interface StatusPageData {
  title: string;
  description?: string | null;
  logoUrl?: string | null;
  customCss?: string | null;
  overallStatus: string;
  components: ComponentStatus[];
  recentIncidents: Incident[];
  dailyUptime: Record<string, { date: string; uptimePercent: number }[]>;
}

const statusColors: Record<string, string> = {
  operational: '#10B981',
  degraded: '#F59E0B',
  down: '#EF4444',
  major_outage: '#EF4444',
};

const statusLabels: Record<string, string> = {
  operational: 'All Systems Operational',
  degraded: 'Degraded Performance',
  major_outage: 'Major Outage',
};

const componentStatusLabels: Record<string, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
};

const incidentStatusColors: Record<string, string> = {
  INVESTIGATING: '#EF4444',
  IDENTIFIED: '#F59E0B',
  MONITORING: '#3B82F6',
  RESOLVED: '#10B981',
  POSTMORTEM: '#8B5CF6',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function UptimeBars({ dailyData }: { dailyData?: { date: string; uptimePercent: number }[] }) {
  // Fill 90 days
  const days = useMemo(() => {
    const result: { date: string; uptimePercent: number | null }[] = [];
    const now = new Date();
    for (let i = 89; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const found = dailyData?.find(dd => dd.date === dateStr);
      result.push({ date: dateStr, uptimePercent: found ? found.uptimePercent : null });
    }
    return result;
  }, [dailyData]);

  return (
    <div className="flex gap-px items-end" style={{ height: '32px' }}>
      {days.map((day, i) => {
        let color = '#374151'; // no data gray
        if (day.uptimePercent !== null) {
          if (day.uptimePercent >= 99) color = '#10B981';
          else if (day.uptimePercent >= 95) color = '#F59E0B';
          else color = '#EF4444';
        }
        return (
          <div
            key={i}
            title={`${day.date}: ${day.uptimePercent !== null ? day.uptimePercent + '%' : 'No data'}`}
            style={{
              width: '100%',
              maxWidth: '8px',
              height: '100%',
              backgroundColor: color,
              borderRadius: '1px',
              opacity: day.uptimePercent !== null ? 1 : 0.3,
            }}
          />
        );
      })}
    </div>
  );
}

export default function PublicStatusPage() {
  const params = useParams();
  const slug = (params?.slug ?? '') as string;

  const [data, setData] = useState<StatusPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscribeEmail, setSubscribeEmail] = useState('');
  const [subscribeStatus, setSubscribeStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [subscribeMessage, setSubscribeMessage] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/status-pages/public/${slug}`);
        const json = await res.json();
        if (!res.ok || !json.success) {
          setError(json.error || 'Status page not found');
          return;
        }
        setData(json.data);
      } catch {
        setError('Failed to load status page');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [slug]);

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!subscribeEmail.trim()) return;

    setSubscribeStatus('loading');
    try {
      const res = await fetch(`/api/status-pages/public/${slug}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'EMAIL', endpoint: subscribeEmail.trim() }),
      });
      const json = await res.json();
      if (res.ok) {
        setSubscribeStatus('success');
        setSubscribeMessage(json.message || 'Subscribed successfully');
        setSubscribeEmail('');
      } else {
        setSubscribeStatus('error');
        setSubscribeMessage(json.error || 'Subscription failed');
      }
    } catch {
      setSubscribeStatus('error');
      setSubscribeMessage('An error occurred');
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px', height: '40px', border: '3px solid rgba(59,130,246,0.2)',
            borderTopColor: '#3B82F6', borderRadius: '50%', animation: 'spin 1s linear infinite',
            margin: '0 auto',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ marginTop: '16px', color: '#94A3B8', fontSize: '14px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Loading status...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A', color: '#F8FAFC' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>Status Page Not Found</h1>
          <p style={{ color: '#94A3B8' }}>{error || 'The requested status page does not exist.'}</p>
        </div>
      </div>
    );
  }

  const overallColor = statusColors[data.overallStatus] || '#10B981';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0F172A', color: '#F8FAFC' }}>
      {data.customCss && <style>{data.customCss}</style>}

      {/* Header */}
      <header style={{ borderBottom: '1px solid rgba(148,163,184,0.1)', padding: '24px 0' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {data.logoUrl && (
              <img
                src={data.logoUrl}
                alt={data.title}
                style={{ height: '40px', width: 'auto', borderRadius: '8px' }}
              />
            )}
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.02em' }}>{data.title}</h1>
              {data.description && (
                <p style={{ fontSize: '14px', color: '#94A3B8', marginTop: '4px' }}>{data.description}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Overall Status Banner */}
        <div style={{
          background: `linear-gradient(135deg, ${overallColor}15, ${overallColor}08)`,
          border: `1px solid ${overallColor}30`,
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '32px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}>
          <div style={{
            width: '12px', height: '12px', borderRadius: '50%',
            backgroundColor: overallColor,
            boxShadow: `0 0 12px ${overallColor}60`,
          }} />
          <span style={{ fontSize: '18px', fontWeight: 600, color: overallColor }}>
            {statusLabels[data.overallStatus] || 'Unknown Status'}
          </span>
        </div>

        {/* Components */}
        <div style={{
          background: 'rgba(30,41,59,0.5)',
          border: '1px solid rgba(148,163,184,0.1)',
          borderRadius: '12px',
          overflow: 'hidden',
          marginBottom: '32px',
        }}>
          {data.components.map((comp, idx) => {
            const compColor = statusColors[comp.currentStatus] || '#10B981';
            // Find daily uptime for this component - we need to match by monitorId, but public API doesn't expose it directly
            // dailyUptime is keyed by monitorId; we'll show bars for components that have uptime data
            return (
              <div
                key={comp.id}
                style={{
                  padding: '16px 20px',
                  borderBottom: idx < data.components.length - 1 ? '1px solid rgba(148,163,184,0.08)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div>
                    <span style={{ fontWeight: 500, fontSize: '14px' }}>{comp.name}</span>
                    {comp.uptimePercent !== null && (
                      <span style={{ fontSize: '12px', color: '#94A3B8', marginLeft: '12px' }}>
                        {comp.uptimePercent}% uptime
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: compColor, fontWeight: 500 }}>
                      {componentStatusLabels[comp.currentStatus] || comp.currentStatus}
                    </span>
                    <div style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      backgroundColor: compColor,
                    }} />
                  </div>
                </div>
                {comp.uptimePercent !== null && (
                  <div style={{ marginTop: '4px' }}>
                    <UptimeBars dailyData={Object.values(data.dailyUptime || {})[idx]} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                      <span style={{ fontSize: '10px', color: '#64748B' }}>90 days ago</span>
                      <span style={{ fontSize: '10px', color: '#64748B' }}>Today</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {data.components.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: '#94A3B8', fontSize: '14px' }}>
              No components configured
            </div>
          )}
        </div>

        {/* Recent Incidents */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: '#CBD5E1' }}>
            Recent Incidents
          </h2>

          {data.recentIncidents.length === 0 ? (
            <div style={{
              background: 'rgba(30,41,59,0.5)',
              border: '1px solid rgba(148,163,184,0.1)',
              borderRadius: '12px',
              padding: '32px 20px',
              textAlign: 'center',
              color: '#94A3B8',
              fontSize: '14px',
            }}>
              No recent incidents in the past 14 days.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {data.recentIncidents.map((incident) => {
                const sevColor = incident.severity === 'CRITICAL' ? '#EF4444'
                  : incident.severity === 'WARNING' ? '#F59E0B'
                  : '#3B82F6';
                return (
                  <div
                    key={incident.id}
                    style={{
                      background: 'rgba(30,41,59,0.5)',
                      border: '1px solid rgba(148,163,184,0.1)',
                      borderRadius: '12px',
                      padding: '16px 20px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.05em',
                        color: sevColor,
                        padding: '2px 8px',
                        backgroundColor: `${sevColor}15`,
                        border: `1px solid ${sevColor}30`,
                        borderRadius: '4px',
                      }}>
                        {incident.severity}
                      </span>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 500,
                        color: incidentStatusColors[incident.status] || '#94A3B8',
                      }}>
                        {incident.status}
                      </span>
                    </div>
                    <h3 style={{ fontWeight: 500, fontSize: '14px', marginBottom: '4px' }}>{incident.title}</h3>
                    <p style={{ fontSize: '12px', color: '#94A3B8' }}>
                      {formatDate(incident.startedAt)} at {formatTime(incident.startedAt)}
                      {incident.resolvedAt && ` - Resolved ${formatDate(incident.resolvedAt)}`}
                    </p>
                    {incident.updates.length > 0 && (
                      <div style={{ marginTop: '12px', paddingLeft: '12px', borderLeft: '2px solid rgba(148,163,184,0.15)' }}>
                        {incident.updates.map((update) => (
                          <div key={update.id} style={{ marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                              {update.status && (
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 500,
                                  color: incidentStatusColors[update.status] || '#94A3B8',
                                }}>
                                  {update.status}
                                </span>
                              )}
                              <span style={{ fontSize: '10px', color: '#64748B' }}>
                                {formatDate(update.createdAt)} {formatTime(update.createdAt)}
                              </span>
                            </div>
                            <p style={{ fontSize: '13px', color: '#CBD5E1' }}>{update.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Subscribe */}
        <div style={{
          background: 'rgba(30,41,59,0.5)',
          border: '1px solid rgba(148,163,184,0.1)',
          borderRadius: '12px',
          padding: '24px',
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', color: '#CBD5E1' }}>
            Subscribe to Updates
          </h2>
          <p style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '16px' }}>
            Get notified when we update status or have incidents.
          </p>

          <form onSubmit={handleSubscribe} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="email"
              placeholder="your@email.com"
              value={subscribeEmail}
              onChange={(e) => setSubscribeEmail(e.target.value)}
              required
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(148,163,184,0.2)',
                backgroundColor: 'rgba(15,23,42,0.8)',
                color: '#F8FAFC',
                fontSize: '14px',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={subscribeStatus === 'loading'}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                backgroundColor: '#3B82F6',
                color: 'white',
                fontSize: '14px',
                fontWeight: 500,
                border: 'none',
                cursor: subscribeStatus === 'loading' ? 'not-allowed' : 'pointer',
                opacity: subscribeStatus === 'loading' ? 0.7 : 1,
              }}
            >
              {subscribeStatus === 'loading' ? 'Subscribing...' : 'Subscribe'}
            </button>
          </form>

          {subscribeStatus === 'success' && (
            <p style={{ marginTop: '8px', fontSize: '13px', color: '#10B981' }}>{subscribeMessage}</p>
          )}
          {subscribeStatus === 'error' && (
            <p style={{ marginTop: '8px', fontSize: '13px', color: '#EF4444' }}>{subscribeMessage}</p>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid rgba(148,163,184,0.1)',
        padding: '20px 0',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: '12px', color: '#64748B' }}>
          Powered by NodePrism
        </p>
      </footer>
    </div>
  );
}
