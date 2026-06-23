'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Clock, CheckCircle2, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api, type AuditListItem } from '@/lib/api';
import { gradeToDisplay, gradeToColor, formatNumber, cn } from '@/lib/utils';

const statusConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  PENDING: { label: 'Pending', icon: Clock, color: 'text-muted-foreground' },
  CRAWLING: { label: 'Crawling', icon: Loader2, color: 'text-blue-600' },
  ANALYZING: { label: 'Analyzing', icon: Search, color: 'text-purple-600' },
  GENERATING_REPORT: { label: 'Generating', icon: Loader2, color: 'text-amber-600' },
  COMPLETED: { label: 'Completed', icon: CheckCircle2, color: 'text-green-600' },
  FAILED: { label: 'Failed', icon: XCircle, color: 'text-red-600' },
};

export default function DashboardPage() {
  const router = useRouter();
  const [audits, setAudits] = useState<AuditListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.audit.list(page, 10);
        setAudits(res.data);
        setTotalPages(res.totalPages);
      } catch (err) {
        console.error('Failed to fetch audits', err);
      } finally {
        setLoading(false);
      }
    };

    fetch();
    // Poll for in-progress audits
    const timer = setInterval(async () => {
      const hasInProgress = audits.some(
        (a) => !['COMPLETED', 'FAILED'].includes(a.status)
      );
      if (hasInProgress) {
        const res = await api.audit.list(page, 10);
        setAudits(res.data);
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [page]);

  const completedAudits = audits.filter((a) => a.status === 'COMPLETED');
  const avgScore =
    completedAudits.length > 0
      ? Math.round(
          completedAudits.reduce((sum, a) => sum + (a.overallScore ?? 0), 0) /
            completedAudits.length
        )
      : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold">SEO Auditor Dashboard</h1>
          <Button onClick={() => router.push('/')} className="gap-2">
            <Plus className="h-4 w-4" />
            New Audit
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold">{audits.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Total Audits</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-green-600">
                {completedAudits.length}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Completed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-blue-600">
                {audits.filter((a) => !['COMPLETED', 'FAILED'].includes(a.status)).length}
              </div>
              <div className="text-xs text-muted-foreground mt-1">In Progress</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold">{avgScore ?? '—'}</div>
              <div className="text-xs text-muted-foreground mt-1">Avg SEO Score</div>
            </CardContent>
          </Card>
        </div>

        {/* Audits table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Audits</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : audits.length === 0 ? (
              <div className="p-8 text-center space-y-4">
                <p className="text-muted-foreground">No audits yet</p>
                <Button onClick={() => router.push('/')}>Start your first audit</Button>
              </div>
            ) : (
              <div className="divide-y">
                {audits.map((audit) => {
                  const statusCfg = statusConfig[audit.status] || statusConfig.PENDING;
                  const StatusIcon = statusCfg.icon;
                  const isInProgress = !['COMPLETED', 'FAILED'].includes(audit.status);

                  return (
                    <div
                      key={audit.id}
                      className="flex items-center gap-4 p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/audit/${audit.id}`)}
                    >
                      {/* Score */}
                      <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-full border-2 border-muted">
                        {audit.overallScore !== null ? (
                          <span className={cn('text-sm font-bold', {
                            'text-green-600': audit.overallScore >= 80,
                            'text-amber-600': audit.overallScore >= 60,
                            'text-red-600': audit.overallScore < 60,
                          })}>
                            {Math.round(audit.overallScore)}
                          </span>
                        ) : (
                          <StatusIcon
                            className={cn(
                              'h-5 w-5',
                              statusCfg.color,
                              isInProgress && 'animate-spin'
                            )}
                          />
                        )}
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {audit.domain || audit.url}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{audit.url}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant={audit.status === 'COMPLETED' ? 'success' : audit.status === 'FAILED' ? 'destructive' : 'secondary'}
                            className="text-xs"
                          >
                            {statusCfg.label}
                          </Badge>
                          {audit.status === 'COMPLETED' && (
                            <>
                              <span className="text-xs text-muted-foreground">
                                {formatNumber(audit.pagesCrawled)} pages
                              </span>
                              {audit.criticalIssues > 0 && (
                                <span className="text-xs text-red-600">
                                  {audit.criticalIssues} critical
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Date */}
                      <div className="text-xs text-muted-foreground text-right flex-shrink-0">
                        {new Date(audit.createdAt).toLocaleDateString()}
                        <ArrowRight className="h-4 w-4 ml-2 inline" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground flex items-center px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
