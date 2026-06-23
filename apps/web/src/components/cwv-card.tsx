'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatMs, getRatingBadgeColor } from '@/lib/utils';
import type { CoreWebVitals } from '@/lib/api';

interface CWVCardProps {
  data: CoreWebVitals;
  device: 'mobile' | 'desktop';
}

interface MetricRow {
  label: string;
  key: string;
  value: number | null;
  unit: string;
  good: number;
  poor: number;
  lowerIsBetter: boolean;
}

function getRating(value: number | null, good: number, poor: number, lowerIsBetter: boolean): 'good' | 'needs-improvement' | 'poor' | null {
  if (value === null) return null;
  if (lowerIsBetter) {
    if (value <= good) return 'good';
    if (value <= poor) return 'needs-improvement';
    return 'poor';
  } else {
    if (value >= good) return 'good';
    if (value >= poor) return 'needs-improvement';
    return 'poor';
  }
}

function formatCWVValue(value: number | null, key: string): string {
  if (value === null) return 'N/A';
  if (key === 'cls') return value.toFixed(3);
  return formatMs(value);
}

export function CWVCard({ data, device }: CWVCardProps) {
  const prefix = device === 'mobile' ? 'mobile' : 'desktop';
  const score = device === 'mobile' ? data.mobileScore : data.desktopScore;

  const metrics: MetricRow[] = [
    {
      label: 'LCP',
      key: 'lcp',
      value: device === 'mobile' ? data.mobileLcp : data.desktopLcp,
      unit: 'ms',
      good: 2500,
      poor: 4000,
      lowerIsBetter: true,
    },
    {
      label: 'CLS',
      key: 'cls',
      value: device === 'mobile' ? data.mobileCls : data.desktopCls,
      unit: '',
      good: 0.1,
      poor: 0.25,
      lowerIsBetter: true,
    },
    {
      label: 'INP',
      key: 'inp',
      value: device === 'mobile' ? data.mobileInp : data.desktopInp,
      unit: 'ms',
      good: 200,
      poor: 500,
      lowerIsBetter: true,
    },
    {
      label: 'FCP',
      key: 'fcp',
      value: device === 'mobile' ? data.mobileFcp : data.desktopFcp,
      unit: 'ms',
      good: 1800,
      poor: 3000,
      lowerIsBetter: true,
    },
    {
      label: 'TTFB',
      key: 'ttfb',
      value: device === 'mobile' ? data.mobileTtfb : data.desktopTtfb,
      unit: 'ms',
      good: 800,
      poor: 1800,
      lowerIsBetter: true,
    },
  ];

  const scoreColor =
    score === null ? 'text-muted-foreground' :
    score >= 90 ? 'text-green-600' :
    score >= 50 ? 'text-amber-600' :
    'text-red-600';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base capitalize">{device}</CardTitle>
          {score !== null && (
            <div className={cn('text-2xl font-bold', scoreColor)}>{Math.round(score)}</div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {metrics.map((metric) => {
            const rating = getRating(
              metric.value,
              metric.good,
              metric.poor,
              metric.lowerIsBetter
            );

            return (
              <div key={metric.key} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-semibold w-10">{metric.label}</span>
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    {metric.label === 'LCP' ? 'Largest Contentful Paint' :
                     metric.label === 'CLS' ? 'Cumulative Layout Shift' :
                     metric.label === 'INP' ? 'Interaction to Next Paint' :
                     metric.label === 'FCP' ? 'First Contentful Paint' :
                     'Time to First Byte'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium tabular-nums">
                    {formatCWVValue(metric.value, metric.key)}
                  </span>
                  <Badge className={cn('text-xs', getRatingBadgeColor(rating))}>
                    {rating === 'needs-improvement' ? 'Needs Improvement' :
                     rating ? rating.charAt(0).toUpperCase() + rating.slice(1) : 'N/A'}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
