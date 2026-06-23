'use client';

import { useEffect, useRef } from 'react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  Search,
  Cpu,
  BarChart3,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';

interface AuditProgressProps {
  status: string;
  progress: number;
  statusMsg: string | null;
  url: string;
  onComplete?: () => void;
}

const statusSteps = [
  { status: 'PENDING', label: 'Initializing', icon: Loader2, threshold: 0 },
  { status: 'CRAWLING', label: 'Crawling pages', icon: Search, threshold: 5 },
  { status: 'ANALYZING', label: 'Analyzing SEO', icon: Cpu, threshold: 50 },
  { status: 'GENERATING_REPORT', label: 'Generating report', icon: FileText, threshold: 85 },
  { status: 'COMPLETED', label: 'Complete', icon: CheckCircle2, threshold: 100 },
];

export function AuditProgress({ status, progress, statusMsg, url, onComplete }: AuditProgressProps) {
  const prevStatusRef = useRef(status);

  useEffect(() => {
    if (status === 'COMPLETED' && prevStatusRef.current !== 'COMPLETED') {
      onComplete?.();
    }
    prevStatusRef.current = status;
  }, [status, onComplete]);

  const isFailed = status === 'FAILED';
  const isComplete = status === 'COMPLETED';

  const currentStepIndex = statusSteps.findIndex((s) => s.status === status);

  return (
    <div className="space-y-6">
      {/* URL being analyzed */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Analyzing</p>
        <p className="font-mono text-sm font-medium truncate max-w-md mx-auto">{url}</p>
      </div>

      {/* Main progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{statusMsg || 'Processing...'}</span>
          <span className="font-medium">{Math.round(progress)}%</span>
        </div>
        <Progress
          value={progress}
          className={cn('h-3', {
            'bg-red-100': isFailed,
            '[&>div]:bg-red-500': isFailed,
            '[&>div]:bg-green-500': isComplete,
          })}
        />
      </div>

      {/* Steps */}
      <div className="flex justify-between relative">
        <div className="absolute top-4 left-0 right-0 h-0.5 bg-muted mx-8" />
        {statusSteps.map((step, idx) => {
          const isPast = idx < currentStepIndex || isComplete;
          const isCurrent = step.status === status && !isComplete;
          const Icon = step.icon;

          return (
            <div key={step.status} className="flex flex-col items-center gap-2 relative z-10">
              <div
                className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center border-2 bg-background transition-all',
                  {
                    'border-green-500 bg-green-50 text-green-600': isPast,
                    'border-primary bg-primary text-primary-foreground animate-pulse': isCurrent,
                    'border-red-500 bg-red-50 text-red-600': isFailed && isCurrent,
                    'border-muted text-muted-foreground': !isPast && !isCurrent,
                  }
                )}
              >
                {isPast && !isCurrent ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : isFailed && isCurrent ? (
                  <XCircle className="h-4 w-4" />
                ) : (
                  <Icon className={cn('h-4 w-4', { 'animate-spin': isCurrent && step.status !== 'COMPLETED' })} />
                )}
              </div>
              <span
                className={cn('text-xs font-medium hidden sm:block', {
                  'text-green-600': isPast,
                  'text-primary': isCurrent,
                  'text-muted-foreground': !isPast && !isCurrent,
                })}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {isFailed && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-red-800">Audit failed</p>
              <p className="text-sm text-red-700">
                The audit encountered an error. Please check the URL and try again.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
