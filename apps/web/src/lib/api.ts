const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export interface StartAuditPayload {
  url: string;
  maxPages?: number;
  crawlDepth?: number;
  includeKeywords?: boolean;
  includeCompetitors?: boolean;
}

export const api = {
  audit: {
    start: (data: StartAuditPayload) =>
      apiFetch<{ jobId: string; status: string; message: string }>('/audit', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    get: (id: string) => apiFetch<AuditJobDetail>(`/audit/${id}`),

    list: (page = 1, pageSize = 10) =>
      apiFetch<PaginatedResponse<AuditListItem>>(`/audit?page=${page}&pageSize=${pageSize}`),

    technical: (id: string, page = 1, pageSize = 20, severity?: string) =>
      apiFetch<PaginatedResponse<TechnicalIssue>>(
        `/audit/${id}/technical?page=${page}&pageSize=${pageSize}${severity ? `&severity=${severity}` : ''}`
      ),

    pages: (id: string, page = 1, pageSize = 20, sort = 'onPageScore', order = 'asc') =>
      apiFetch<PaginatedResponse<CrawledPage>>(
        `/audit/${id}/pages?page=${page}&pageSize=${pageSize}&sort=${sort}&order=${order}`
      ),

    cwv: (id: string) => apiFetch<CoreWebVitals>(`/audit/${id}/cwv`),

    keywords: (id: string, page = 1, pageSize = 50, category?: string) =>
      apiFetch<PaginatedResponse<Keyword>>(
        `/audit/${id}/keywords?page=${page}&pageSize=${pageSize}${category ? `&category=${category}` : ''}`
      ),

    competitors: (id: string) =>
      apiFetch<{ data: Competitor[] }>(`/audit/${id}/competitors`),

    report: (id: string) => apiFetch<AuditReport>(`/audit/${id}/report`),
  },

  reports: {
    downloadUrl: (jobId: string, type: 'pdf' | 'csv' | 'json') =>
      `${API_URL}/reports/${jobId}/${type === 'pdf' ? 'report.pdf' : type === 'csv' ? 'issues.csv' : 'report.json'}`,
  },
};

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AuditJobDetail {
  id: string;
  url: string;
  domain: string | null;
  status: string;
  progress: number;
  statusMsg: string | null;
  errorMsg: string | null;
  scores: {
    overall: number | null;
    technical: number | null;
    content: number | null;
    performance: number | null;
    authority: number | null;
    ux: number | null;
  };
  grade: string | null;
  stats: {
    pagesCrawled: number;
    pagesIndexable: number;
    totalIssues: number;
    criticalIssues: number;
    hasSitemap: boolean;
    hasRobotsTxt: boolean;
    isHttps: boolean;
  };
  counts: {
    crawledPages: number;
    technicalIssues: number;
    keywords: number;
    competitors: number;
  };
  createdAt: string;
  completedAt: string | null;
}

export interface AuditListItem {
  id: string;
  url: string;
  domain: string | null;
  status: string;
  progress: number;
  overallScore: number | null;
  pagesCrawled: number;
  totalIssues: number;
  criticalIssues: number;
  createdAt: string;
  completedAt: string | null;
}

export interface TechnicalIssue {
  id: string;
  type: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  affectedUrls: string[];
  count: number;
  recommendation: string | null;
  businessImpact: string | null;
  seoImpact: string | null;
  implementationSteps: string[];
  estimatedImpact: string | null;
  impactScore: number | null;
}

export interface CrawledPage {
  id: string;
  url: string;
  statusCode: number | null;
  title: string | null;
  titleLength: number | null;
  metaDescription: string | null;
  wordCount: number | null;
  onPageScore: number | null;
  isIndexable: boolean;
  loadTime: number | null;
  internalLinks: number | null;
  imagesWithoutAlt: number | null;
  h1Count: number | null;
  issues: Array<{ type: string; severity: string; title: string }>;
}

export interface CoreWebVitals {
  mobileLcp: number | null;
  mobileCls: number | null;
  mobileInp: number | null;
  mobileFcp: number | null;
  mobileTtfb: number | null;
  mobileScore: number | null;
  desktopLcp: number | null;
  desktopCls: number | null;
  desktopInp: number | null;
  desktopFcp: number | null;
  desktopTtfb: number | null;
  desktopScore: number | null;
  opportunities: Array<{
    id: string;
    title: string;
    description: string;
    displayValue?: string;
    score: number;
  }>;
  diagnostics: Array<{
    id: string;
    title: string;
    displayValue?: string;
    score: number | null;
  }>;
}

export interface Keyword {
  id: string;
  keyword: string;
  searchVolume: number | null;
  difficulty: number | null;
  cpc: number | null;
  intent: string | null;
  type: string | null;
  opportunityScore: number | null;
  category: string | null;
  currentRanking: number | null;
}

export interface Competitor {
  id: string;
  domain: string;
  organicKeywords: number | null;
  backlinks: number | null;
  domainAuthority: number | null;
  commonKeywords: number | null;
  uniqueKeywords: number | null;
  overallScore: number | null;
}

export interface AuditReport {
  id: string;
  grade: string | null;
  overallScore: number | null;
  executiveSummary: string | null;
  pdfPath: string | null;
  csvPath: string | null;
  jsonPath: string | null;
  auditJob: {
    url: string;
    domain: string | null;
    overallScore: number | null;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
