'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useFormatDate } from '@/hooks/useFormatDate';

interface Alert {
  id: string;
  message: string;
  severity: string;
  startsAt: string;
}

interface ServerAlertsProps {
  alerts: Alert[] | undefined;
}

export function ServerAlerts({ alerts }: ServerAlertsProps) {
  const { formatDateTime } = useFormatDate();

  return (
    <div className="space-y-6">
      {alerts && alerts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Active Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alerts.map((alert) => {
                const isWarning = alert.severity === 'WARNING';
                return (
                  <div
                    key={alert.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isWarning
                        ? 'bg-amber-500/10 dark:bg-amber-500/20 border-amber-500/20'
                        : 'bg-red-500/10 dark:bg-red-500/20 border-red-500/20'
                    }`}
                  >
                    <div>
                      <p className={`font-medium ${isWarning ? 'text-amber-700 dark:text-amber-300' : 'text-red-800 dark:text-red-300'}`}>
                        {alert.message}
                      </p>
                      <p className={`text-sm ${isWarning ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                        Started: {formatDateTime(alert.startsAt)}
                      </p>
                    </div>
                    <Badge variant={isWarning ? 'warning' : 'danger'}>{alert.severity}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">
              No active alerts for this server.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
