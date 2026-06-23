'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, RefreshCw, Globe, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScoreRing } from '@/components/score-ring';
import { AuditProgress } from '@/components/audit-progress';
import { IssueCard } from '@/components/issue-card';
import { CWVCard } from '@/components/cwv-card';
import { api, type AuditJobDetail, type TechnicalIssue, type CoreWebVitals, type Keyword, type Competitor } from '@/lib/api';
import { gradeToDisplay, gradeToColor, formatNumber, cn, truncateUrl } from '@/lib/utils';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';

const POLL_INTERVAL = 3000; // 3s

export default function AuditPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;

  const [job, setJob] = useState<AuditJobDetail | null>(null);
  const [issues, setIssues] = useState<TechnicalIssue[]>([]);
  const [cwv, setCwv] = useState<CoreWebVitals | null>(null);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [severityFilter, setSeverityFilter] = useState<string | undefined>(undefined);

  const fetchJob = useCallback(async () => {
    try {
      const data = await api.audit.get(jobId);
      setJob(data);
      return data;
    } catch (err) {
      console.error('Failed to fetch job', err);
      return null;
    }
  }, [jobId]);

  const fetchDetails = useCallback(async () => {
    try {
      const [issuesRes, cwvRes, kwRes, compRes] = await Promise.allSettled([
        api.audit.technical(jobId, 1, 50, severityFilter),
        api.audit.cwv(jobId),
        api.audit.keywords(jobId, 1, 50),
        api.audit.competitors(jobId),
      ]);

      if (issuesRes.status === 'fulfilled') setIssues(issuesRes.value.data);
      if (cwvRes.status === 'fulfilled') setCwv(cwvRes.value);
      if (kwRes.status === 'fulfilled') setKeywords(kwRes.value.data);
      if (compRes.status === 'fulfilled') setCompetitors(compRes.value.data);
    } catch (err) {
      console.error('Failed to fetch details', err);
    }
  }, [jobId, severityFilter]);

  // Initial load + polling
  useEffect(() => {
    let pollTimer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      const data = await fetchJob();
      setLoading(false);

      if (data && (data.status === 'COMPLETED' || data.status === 'FAILED')) {
        if (data.status === 'COMPLETED') await fetchDetails();
        return; // Stop polling
      }

      pollTimer = setTimeout(poll, POLL_INTERVAL);
    };

    poll();
    return () => clearTimeout(pollTimer);
  }, [fetchJob, fetchDetails]);

  // Re-fetch issues when severity filter changes
  useEffect(() => {
    if (job?.status === 'COMPLETED') {
      api.audit.technical(jobId, 1, 50, severityFilter).then((res) => setIssues(res.data));
    }
  }, [severityFilter, job?.status, jobId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <AlertTriangle className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Audit not found</p>
        <Button onClick={() => router.push('/')}>Start New Audit</Button>
      </div>
    );
  }

  const isInProgress = !['COMPLETED', 'FAILED'].includes(job.status);

  const radarData = [
    { subject: 'Technical', score: job.scores.technical ?? 0 },
    { subject: 'Content', score: job.scores.content ?? 0 },
    { subject: 'Performance', score: job.scores.performance ?? 0 },
    { subject: 'Authority', score: job.scores.authority ?? 0 },
    { subject: 'UX', score: job.scores.ux ?? 0 },
  ];

  const issuesBySeverity = [
    { name: 'Critical', count: issues.filter((i) => i.severity === 'CRITICAL').length, color: '#dc2626' },
    { name: 'High', count: issues.filter((i) => i.severity === 'HIGH').length, color: '#ea580c' },
    { name: 'Medium', count: issues.filter((i) => i.severity === 'MEDIUM').length, color: '#d97706' },
    { name: 'Low', count: issues.filter((i) => i.severity === 'LOW').length, color: '#65a30d' },
  ].filter((item) => item.count > 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-sm truncate">{job.domain || job.url}</span>
            {job.stats.isHttps && (
              <Badge variant="success" className="flex-shrink-0">HTTPS</Badge>
            )}
          </div>
          {job.status === 'COMPLETED' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(api.reports.downloadUrl(jobId, 'pdf'), '_blank')}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* In-progress view */}
        {isInProgress && (
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle>SEO Audit in Progress</CardTitle>
              <CardDescription>This typically takes 3-8 minutes depending on site size</CardDescription>
            </CardHeader>
            <CardContent>
              <AuditProgress
                status={job.status}
                progress={job.progress}
                statusMsg={job.statusMsg}
                url={job.url}
                onComplete={() => {
                  fetchJob();
                  fetchDetails();
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Completed view */}
        {job.status === 'COMPLETED' && (
          <div className="space-y-6">
            {/* Score header */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Overall score */}
              <Card className="lg:col-span-1">
                <CardContent className="p-6 flex flex-col items-center">
                  <ScoreRing score={job.scores.overall} size="xl" />
                  <div className="mt-4 text-center">
                    <div className={cn('text-4xl font-black', gradeToColor(job.grade))}>
                      {gradeToDisplay(job.grade)}
                    </div>
                    <p className="text-muted-foreground text-sm mt-1">Overall SEO Grade</p>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3 w-full text-center text-sm">
                    <div>
                      <div className="font-bold text-red-600">{job.stats.criticalIssues}</div>
                      <div className="text-xs text-muted-foreground">Critical</div>
                    </div>
                    <div>
                      <div className="font-bold">{job.stats.pagesCrawled}</div>
                      <div className="text-xs text-muted-foreground">Pages</div>
                    </div>
                    <div>
                      <div className="font-bold">{job.stats.totalIssues}</div>
                      <div className="text-xs text-muted-foreground">Issues</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Score breakdown */}
              <Card className="lg:col-span-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Score Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: 'Technical SEO', score: job.scores.technical, weight: '30%' },
                    { label: 'Content SEO', score: job.scores.content, weight: '25%' },
                    { label: 'Performance', score: job.scores.performance, weight: '20%' },
                    { label: 'Authority', score: job.scores.authority, weight: '15%' },
                    { label: 'User Experience', score: job.scores.ux, weight: '10%' },
                  ].map(({ label, score, weight }) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className="w-28 text-xs text-muted-foreground">{label}</div>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', {
                            'bg-green-500': (score ?? 0) >= 80,
                            'bg-amber-500': (score ?? 0) >= 60 && (score ?? 0) < 80,
                            'bg-red-500': (score ?? 0) < 60,
                          })}
                          style={{ width: `${score ?? 0}%` }}
                        />
                      </div>
                      <div className="w-8 text-xs font-mono font-semibold text-right">{score ?? '—'}</div>
                      <div className="w-8 text-xs text-muted-foreground">{weight}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Radar chart */}
              <Card className="lg:col-span-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">SEO Radar</CardTitle>
                </CardHeader>
                <CardContent className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                      <Radar
                        name="Score"
                        dataKey="score"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.3}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Pages Crawled', value: formatNumber(job.stats.pagesCrawled) },
                { label: 'Indexable Pages', value: formatNumber(job.stats.pagesIndexable) },
                { label: 'Has Sitemap', value: job.stats.hasSitemap ? '✓ Yes' : '✗ No', color: job.stats.hasSitemap ? 'text-green-600' : 'text-red-600' },
                { label: 'Has robots.txt', value: job.stats.hasRobotsTxt ? '✓ Yes' : '✗ No', color: job.stats.hasRobotsTxt ? 'text-green-600' : 'text-red-600' },
              ].map(({ label, value, color }) => (
                <Card key={label}>
                  <CardContent className="p-4 text-center">
                    <div className={cn('text-xl font-bold', color)}>{value}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="issues">
                  Issues
                  {job.stats.totalIssues > 0 && (
                    <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                      {job.stats.totalIssues}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="performance">Performance</TabsTrigger>
                <TabsTrigger value="keywords">Keywords</TabsTrigger>
                <TabsTrigger value="competitors">Competitors</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4">
                {/* Issues by severity chart */}
                {issuesBySeverity.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Issues by Severity</CardTitle>
                    </CardHeader>
                    <CardContent className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={issuesBySeverity}>
                          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                            {issuesBySeverity.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Site health summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <ScoreRing score={job.scores.technical} size="md" label="Technical" className="p-4 border rounded-lg" />
                  <ScoreRing score={job.scores.content} size="md" label="Content" className="p-4 border rounded-lg" />
                  <ScoreRing score={job.scores.performance} size="md" label="Performance" className="p-4 border rounded-lg" />
                </div>
              </TabsContent>

              {/* Issues Tab */}
              <TabsContent value="issues" className="space-y-4">
                <div className="flex gap-2 flex-wrap">
                  {['', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
                    <Button
                      key={sev}
                      variant={severityFilter === (sev || undefined) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSeverityFilter(sev || undefined)}
                    >
                      {sev || 'All'}
                    </Button>
                  ))}
                </div>
                <div className="space-y-3">
                  {issues.length === 0 ? (
                    <Card>
                      <CardContent className="p-8 text-center text-muted-foreground">
                        No issues found for this filter.
                      </CardContent>
                    </Card>
                  ) : (
                    issues.map((issue) => <IssueCard key={issue.id} issue={issue} />)
                  )}
                </div>
              </TabsContent>

              {/* Performance Tab */}
              <TabsContent value="performance" className="space-y-4">
                {cwv ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <CWVCard data={cwv} device="mobile" />
                      <CWVCard data={cwv} device="desktop" />
                    </div>

                    {cwv.opportunities.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Improvement Opportunities</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {cwv.opportunities.map((opp) => (
                            <div key={opp.id} className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200">
                              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                              <div>
                                <div className="font-medium text-sm">{opp.title}</div>
                                {opp.displayValue && (
                                  <div className="text-xs text-muted-foreground">Savings: {opp.displayValue}</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                      Core Web Vitals data not available.
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Keywords Tab */}
              <TabsContent value="keywords" className="space-y-4">
                {keywords.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                      No keyword data available. Configure DataForSEO API credentials to enable keyword analysis.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {/* Quick wins */}
                    {['QUICK_WIN', 'HIGH_VALUE', 'MEDIUM_DIFFICULTY'].map((cat) => {
                      const catKeywords = keywords.filter((k) => k.category === cat);
                      if (catKeywords.length === 0) return null;
                      const label = cat === 'QUICK_WIN' ? '⚡ Quick Wins' : cat === 'HIGH_VALUE' ? '🏆 High Value' : '📈 Medium Difficulty';

                      return (
                        <Card key={cat}>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base">{label}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b text-muted-foreground text-xs">
                                    <th className="text-left pb-2">Keyword</th>
                                    <th className="text-right pb-2">Volume</th>
                                    <th className="text-right pb-2">Difficulty</th>
                                    <th className="text-right pb-2">CPC</th>
                                    <th className="text-right pb-2">Intent</th>
                                    <th className="text-right pb-2">Score</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {catKeywords.slice(0, 10).map((kw) => (
                                    <tr key={kw.id} className="border-b last:border-0 hover:bg-muted/50">
                                      <td className="py-2 font-medium">{kw.keyword}</td>
                                      <td className="py-2 text-right tabular-nums">{formatNumber(kw.searchVolume)}</td>
                                      <td className="py-2 text-right">
                                        <span className={cn('text-xs font-medium', {
                                          'text-green-600': (kw.difficulty ?? 0) < 30,
                                          'text-amber-600': (kw.difficulty ?? 0) >= 30 && (kw.difficulty ?? 0) < 60,
                                          'text-red-600': (kw.difficulty ?? 0) >= 60,
                                        })}>
                                          {kw.difficulty ?? '—'}
                                        </span>
                                      </td>
                                      <td className="py-2 text-right tabular-nums">${kw.cpc?.toFixed(2) ?? '—'}</td>
                                      <td className="py-2 text-right">
                                        <Badge variant="outline" className="text-xs">
                                          {kw.intent ?? '—'}
                                        </Badge>
                                      </td>
                                      <td className="py-2 text-right font-bold text-primary">{kw.opportunityScore ?? '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* Competitors Tab */}
              <TabsContent value="competitors" className="space-y-4">
                {competitors.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                      No competitor data available. Configure DataForSEO API credentials to enable competitor analysis.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border rounded-lg">
                        <thead className="bg-muted">
                          <tr className="text-xs text-muted-foreground">
                            <th className="text-left p-3">Domain</th>
                            <th className="text-right p-3">Organic Keywords</th>
                            <th className="text-right p-3">Backlinks</th>
                            <th className="text-right p-3">Common Keywords</th>
                            <th className="text-right p-3">Unique to Them</th>
                            <th className="text-right p-3">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {competitors.map((comp) => (
                            <tr key={comp.id} className="border-t hover:bg-muted/50">
                              <td className="p-3 font-medium">{comp.domain}</td>
                              <td className="p-3 text-right tabular-nums">{formatNumber(comp.organicKeywords)}</td>
                              <td className="p-3 text-right tabular-nums">{formatNumber(comp.backlinks)}</td>
                              <td className="p-3 text-right tabular-nums text-blue-600">{formatNumber(comp.commonKeywords)}</td>
                              <td className="p-3 text-right tabular-nums text-orange-600">{formatNumber(comp.uniqueKeywords)}</td>
                              <td className="p-3 text-right">
                                <span className={cn('font-bold', {
                                  'text-green-600': (comp.overallScore ?? 0) >= 70,
                                  'text-amber-600': (comp.overallScore ?? 0) >= 50,
                                  'text-red-600': (comp.overallScore ?? 0) < 50,
                                })}>
                                  {comp.overallScore ?? '—'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Export buttons */}
            <Card>
              <CardContent className="p-4 flex flex-wrap gap-3 items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">Download Report</h3>
                  <p className="text-xs text-muted-foreground">Export your full audit results</p>
                </div>
                <div className="flex gap-2">
                  {(['pdf', 'csv', 'json'] as const).map((type) => (
                    <Button
                      key={type}
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(api.reports.downloadUrl(jobId, type), '_blank')}
                      className="uppercase text-xs"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      {type}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {job.status === 'FAILED' && (
          <Card className="max-w-2xl mx-auto border-red-200">
            <CardHeader>
              <CardTitle className="text-red-600">Audit Failed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                {job.errorMsg || 'The audit encountered an unexpected error.'}
              </p>
              <Button onClick={() => router.push('/')}>Start New Audit</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
