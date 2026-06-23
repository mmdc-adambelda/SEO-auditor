// ─── SEO Scoring Weights ───────────────────────────────────────────────────────
export const SCORE_WEIGHTS = {
  technical: 0.30,
  content: 0.25,
  performance: 0.20,
  authority: 0.15,
  ux: 0.10,
} as const;

// ─── Title Tag Thresholds ─────────────────────────────────────────────────────
export const TITLE_MIN_LENGTH = 30;
export const TITLE_MAX_LENGTH = 60;
export const TITLE_OPTIMAL_MIN = 50;
export const TITLE_OPTIMAL_MAX = 60;

// ─── Meta Description Thresholds ─────────────────────────────────────────────
export const META_DESC_MIN_LENGTH = 70;
export const META_DESC_MAX_LENGTH = 160;
export const META_DESC_OPTIMAL_MIN = 120;
export const META_DESC_OPTIMAL_MAX = 155;

// ─── Content Thresholds ───────────────────────────────────────────────────────
export const MIN_WORD_COUNT = 300;
export const OPTIMAL_WORD_COUNT = 1000;

// ─── Performance Thresholds ───────────────────────────────────────────────────
export const SLOW_PAGE_THRESHOLD_MS = 3000;
export const LARGE_IMAGE_THRESHOLD_BYTES = 200 * 1024; // 200KB

// ─── CWV Thresholds ───────────────────────────────────────────────────────────
export const CWV_THRESHOLDS = {
  lcp: { good: 2500, poor: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  inp: { good: 200, poor: 500 },
  fcp: { good: 1800, poor: 3000 },
  ttfb: { good: 800, poor: 1800 },
} as const;

// ─── Grade Boundaries ─────────────────────────────────────────────────────────
export const GRADE_THRESHOLDS = {
  A_PLUS: 95,
  A: 90,
  B_PLUS: 85,
  B: 75,
  C_PLUS: 65,
  C: 55,
  D: 40,
} as const;

// ─── Crawler Defaults ─────────────────────────────────────────────────────────
export const CRAWLER_DEFAULTS = {
  maxPages: 500,
  crawlDepth: 5,
  concurrency: 10,
  requestTimeout: 30000,
  retries: 3,
  userAgent: 'SEOAuditor/1.0 (+https://seoauditor.io/bot)',
} as const;

// ─── Keyword Opportunity Scoring ─────────────────────────────────────────────
export const QUICK_WIN_MAX_DIFFICULTY = 30;
export const QUICK_WIN_MIN_VOLUME = 100;
export const HIGH_VALUE_MIN_VOLUME = 1000;
export const HIGH_VALUE_MAX_DIFFICULTY = 70;
