'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn, getSeverityColor } from '@/lib/utils';
import type { TechnicalIssue } from '@/lib/api';

interface IssueCardProps {
  issue: TechnicalIssue;
}

const severityIcon = {
  CRITICAL: <AlertCircle className="h-4 w-4 text-red-600" />,
  HIGH: <AlertTriangle className="h-4 w-4 text-orange-600" />,
  MEDIUM: <AlertTriangle className="h-4 w-4 text-amber-600" />,
  LOW: <Info className="h-4 w-4 text-lime-600" />,
  INFO: <Info className="h-4 w-4 text-sky-600" />,
};

const severityVariant: Record<string, 'critical' | 'high' | 'medium' | 'low' | 'info'> = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
};

export function IssueCard({ issue }: IssueCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={cn('border-l-4 transition-all', {
      'border-l-red-500': issue.severity === 'CRITICAL',
      'border-l-orange-500': issue.severity === 'HIGH',
      'border-l-amber-500': issue.severity === 'MEDIUM',
      'border-l-lime-500': issue.severity === 'LOW',
      'border-l-sky-500': issue.severity === 'INFO',
    })}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="mt-0.5 flex-shrink-0">
              {severityIcon[issue.severity as keyof typeof severityIcon] || <Info className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-medium text-sm">{issue.title}</span>
                <Badge variant={severityVariant[issue.severity] || 'info'}>
                  {issue.severity}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {issue.category}
                </Badge>
                {issue.count > 1 && (
                  <span className="text-xs text-muted-foreground">{issue.count} pages affected</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{issue.description}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="flex-shrink-0 h-8 w-8"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        {expanded && (
          <div className="mt-4 space-y-4 border-t pt-4">
            {issue.recommendation && (
              <div>
                <h4 className="text-sm font-semibold mb-1 text-blue-700">Recommendation</h4>
                <p className="text-sm text-muted-foreground">{issue.recommendation}</p>
              </div>
            )}

            {issue.businessImpact && (
              <div>
                <h4 className="text-sm font-semibold mb-1 text-purple-700">Business Impact</h4>
                <p className="text-sm text-muted-foreground">{issue.businessImpact}</p>
              </div>
            )}

            {issue.seoImpact && (
              <div>
                <h4 className="text-sm font-semibold mb-1 text-green-700">SEO Impact</h4>
                <p className="text-sm text-muted-foreground">{issue.seoImpact}</p>
              </div>
            )}

            {issue.implementationSteps.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Implementation Steps</h4>
                <ol className="space-y-1">
                  {issue.implementationSteps.map((step, i) => (
                    <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {issue.estimatedImpact && (
              <div className="flex items-center gap-2 p-2 rounded bg-green-50 dark:bg-green-950">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800 dark:text-green-200">
                  Expected impact: {issue.estimatedImpact}
                </span>
              </div>
            )}

            {issue.affectedUrls.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-1">Affected URLs (sample)</h4>
                <div className="space-y-1">
                  {issue.affectedUrls.slice(0, 5).map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-blue-600 hover:underline truncate"
                    >
                      {url}
                    </a>
                  ))}
                  {issue.affectedUrls.length > 5 && (
                    <p className="text-xs text-muted-foreground">
                      +{issue.affectedUrls.length - 5} more URLs
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
