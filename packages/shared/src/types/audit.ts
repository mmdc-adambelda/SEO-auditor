// ─── Enums ────────────────────────────────────────────────────────────────────

export enum AuditStatus {
  PENDING = 'PENDING',
  CRAWLING = 'CRAWLING',
  ANALYZING = 'ANALYZING',
  GENERATING_REPORT = 'GENERATING_REPORT',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum IssueSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  INFO = 'INFO',
}

export enum IssueCategory {
  TECHNICAL = 'TECHNICAL',
  ON_PAGE = 'ON_PAGE',
  PERFORMANCE = 'PERFORMANCE',
  CONTENT = 'CONTENT',
  LINKS = 'LINKS',
  IMAGES = 'IMAGES',
  SECURITY = 'SECURITY',
}

export enum IssueType {
  MISSING_TITLE = 'MISSING_TITLE',
  DUPLICATE_TITLE = 'DUPLICATE_TITLE',
  TITLE_TOO_LONG = 'TITLE_TOO_LONG',
  TITLE_TOO_SHORT = 'TITLE_TOO_SHORT',
  MISSING_META_DESCRIPTION = 'MISSING_META_DESCRIPTION',
  DUPLICATE_META_DESCRIPTION = 'DUPLICATE_META_DESCRIPTION',
  META_DESCRIPTION_TOO_LONG = 'META_DESCRIPTION_TOO_LONG',
  META_DESCRIPTION_TOO_SHORT = 'META_DESCRIPTION_TOO_SHORT',
  MISSING_H1 = 'MISSING_H1',
  MULTIPLE_H1 = 'MULTIPLE_H1',
  MISSING_ALT_TEXT = 'MISSING_ALT_TEXT',
  BROKEN_LINK = 'BROKEN_LINK',
  REDIRECT_CHAIN = 'REDIRECT_CHAIN',
  REDIRECT_LOOP = 'REDIRECT_LOOP',
  MISSING_CANONICAL = 'MISSING_CANONICAL',
  CANONICAL_MISMATCH = 'CANONICAL_MISMATCH',
  NOINDEX = 'NOINDEX',
  MISSING_SITEMAP = 'MISSING_SITEMAP',
  INVALID_SITEMAP = 'INVALID_SITEMAP',
  MISSING_ROBOTS_TXT = 'MISSING_ROBOTS_TXT',
  HTTP_NOT_HTTPS = 'HTTP_NOT_HTTPS',
  MIXED_CONTENT = 'MIXED_CONTENT',
  SLOW_PAGE = 'SLOW_PAGE',
  LARGE_IMAGE = 'LARGE_IMAGE',
  MISSING_STRUCTURED_DATA = 'MISSING_STRUCTURED_DATA',
  DUPLICATE_CONTENT = 'DUPLICATE_CONTENT',
  LOW_WORD_COUNT = 'LOW_WORD_COUNT',
  ORPHAN_PAGE = 'ORPHAN_PAGE',
  CRAWL_DEPTH_ISSUE = 'CRAWL_DEPTH_ISSUE',
  HREFLANG_ISSUE = 'HREFLANG_ISSUE',
  MISSING_VIEWPORT = 'MISSING_VIEWPORT',
  LARGE_DOM = 'LARGE_DOM',
  NO_HTTPS_REDIRECT = 'NO_HTTPS_REDIRECT',
}

export enum KeywordIntent {
  INFORMATIONAL = 'INFORMATIONAL',
  NAVIGATIONAL = 'NAVIGATIONAL',
  COMMERCIAL = 'COMMERCIAL',
  TRANSACTIONAL = 'TRANSACTIONAL',
}

export enum KeywordType {
  PRIMARY = 'PRIMARY',
  SECONDARY = 'SECONDARY',
  LONG_TAIL = 'LONG_TAIL',
  QUESTION = 'QUESTION',
}

export enum OpportunityCategory {
  QUICK_WIN = 'QUICK_WIN',
  MEDIUM_DIFFICULTY = 'MEDIUM_DIFFICULTY',
  HIGH_VALUE = 'HIGH_VALUE',
}

export enum ReportGrade {
  A_PLUS = 'A_PLUS',
  A = 'A',
  B_PLUS = 'B_PLUS',
  B = 'B',
  C_PLUS = 'C_PLUS',
  C = 'C',
  D = 'D',
  F = 'F',
}

// ─── Core Interfaces ──────────────────────────────────────────────────────────

export interface AuditJobSummary {
  id: string;
  url: string;
  domain: string | null;
  status: AuditStatus;
  overallScore: number | null;
  technicalScore: number | null;
  contentScore: number | null;
  performanceScore: number | null;
  authorityScore: number | null;
  uxScore: number | null;
  pagesCrawled: number;
  issuesFound: number;
  createdAt: string;
  completedAt: string | null;
}

export interface TechnicalIssue {
  id: string;
  type: IssueType;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  affectedUrl?: string;
  affectedUrls: string[];
  count: number;
  recommendation?: string;
  businessImpact?: string;
  seoImpact?: string;
  implementationSteps: string[];
  estimatedImpact?: string;
  impactScore?: number;
}

export interface CrawledPageSummary {
  id: string;
  url: string;
  statusCode: number | null;
  title: string | null;
  titleLength: number | null;
  metaDescription: string | null;
  metaDescLength: number | null;
  wordCount: number | null;
  onPageScore: number | null;
  isIndexable: boolean;
  loadTime: number | null;
  internalLinks: number | null;
  externalLinks: number | null;
  brokenLinks: number | null;
  imagesWithoutAlt: number | null;
  issues: PageIssueSummary[];
}

export interface PageIssueSummary {
  type: IssueType;
  severity: IssueSeverity;
  title: string;
  description: string;
  recommendation?: string;
}

export interface CoreWebVitalsData {
  mobile: CWVMetrics;
  desktop: CWVMetrics;
  opportunities: CWVOpportunity[];
  diagnostics: CWVDiagnostic[];
}

export interface CWVMetrics {
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  fcp: number | null;
  ttfb: number | null;
  score: number | null;
  ratings: {
    lcp: 'good' | 'needs-improvement' | 'poor' | null;
    cls: 'good' | 'needs-improvement' | 'poor' | null;
    inp: 'good' | 'needs-improvement' | 'poor' | null;
    fcp: 'good' | 'needs-improvement' | 'poor' | null;
    ttfb: 'good' | 'needs-improvement' | 'poor' | null;
  };
}

export interface CWVOpportunity {
  id: string;
  title: string;
  description: string;
  savings?: number;
  displayValue?: string;
  score: number;
}

export interface CWVDiagnostic {
  id: string;
  title: string;
  description: string;
  displayValue?: string;
  score: number | null;
}

export interface KeywordOpportunityData {
  id: string;
  keyword: string;
  searchVolume: number | null;
  difficulty: number | null;
  cpc: number | null;
  intent: KeywordIntent | null;
  type: KeywordType | null;
  opportunityScore: number | null;
  category: OpportunityCategory | null;
  currentRanking: number | null;
  targetUrl: string | null;
}

export interface CompetitorData {
  id: string;
  domain: string;
  url: string | null;
  organicKeywords: number | null;
  topPages: number | null;
  backlinks: number | null;
  domainAuthority: number | null;
  avgWordCount: number | null;
  contentTopics: string[];
  commonKeywords: number | null;
  uniqueKeywords: number | null;
  gapKeywords: KeywordGap[];
  overallScore: number | null;
}

export interface KeywordGap {
  keyword: string;
  competitorRank: number;
  targetRank: number | null;
  searchVolume: number;
  difficulty: number;
  opportunity: 'high' | 'medium' | 'low';
}

export interface AuditReportData {
  id: string;
  auditJobId: string;
  grade: ReportGrade | null;
  overallScore: number | null;
  criticalIssues: TechnicalIssue[];
  highPriorityFixes: TechnicalIssue[];
  quickWins: QuickWin[];
  longTermOpps: LongTermOpportunity[];
  executiveSummary: string | null;
}

export interface QuickWin {
  title: string;
  description: string;
  effort: 'low' | 'medium';
  impact: 'medium' | 'high';
  category: IssueCategory;
  steps: string[];
}

export interface LongTermOpportunity {
  title: string;
  description: string;
  effort: 'medium' | 'high';
  impact: 'high';
  timeframe: string;
  category: string;
  strategy: string;
}

export interface AuditScores {
  overall: number;
  technical: number;
  content: number;
  performance: number;
  authority: number;
  ux: number;
}

export interface ScoreBreakdown {
  score: number;
  maxScore: number;
  label: string;
  issues: number;
  weight: number;
}

// ─── API Request/Response Types ───────────────────────────────────────────────

export interface StartAuditRequest {
  url: string;
  maxPages?: number;
  crawlDepth?: number;
  competitors?: string[];
  includeKeywords?: boolean;
  includeCompetitors?: boolean;
}

export interface StartAuditResponse {
  jobId: string;
  status: AuditStatus;
  message: string;
}

export interface AuditProgressEvent {
  jobId: string;
  status: AuditStatus;
  progress: number;
  message: string;
  pagesCrawled?: number;
  pagesTotal?: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
