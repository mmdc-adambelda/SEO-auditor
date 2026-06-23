import { IssueType, IssueCategory, IssueSeverity } from '@seo-auditor/shared';
import type { CrawledPageData, CrawlResult } from './crawler';
import {
  TITLE_MIN_LENGTH,
  TITLE_MAX_LENGTH,
  META_DESC_MIN_LENGTH,
  META_DESC_MAX_LENGTH,
  SLOW_PAGE_THRESHOLD_MS,
  MIN_WORD_COUNT,
} from '@seo-auditor/shared';

export interface TechnicalIssueData {
  type: IssueType;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  affectedUrl?: string;
  affectedUrls: string[];
  count: number;
  impactScore: number;
}

export interface TechnicalAuditResult {
  issues: TechnicalIssueData[];
  score: number;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

export class TechnicalAuditService {
  audit(crawlResult: CrawlResult): TechnicalAuditResult {
    const issues: TechnicalIssueData[] = [];
    const { pages } = crawlResult;

    // ── Site-level checks ────────────────────────────────────────────────────
    this.checkHttps(crawlResult, issues);
    this.checkRobotsTxt(crawlResult, issues);
    this.checkSitemap(crawlResult, issues);

    // ── Page-level checks ────────────────────────────────────────────────────
    this.checkTitleTags(pages, issues);
    this.checkMetaDescriptions(pages, issues);
    this.checkH1Tags(pages, issues);
    this.checkCanonicals(pages, issues);
    this.checkIndexability(pages, issues);
    this.checkBrokenLinks(pages, issues);
    this.checkRedirectChains(pages, issues);
    this.checkMixedContent(pages, issues);
    this.checkStructuredData(pages, issues);
    this.checkImageAltText(pages, issues);
    this.checkPageSpeed(pages, issues);
    this.checkWordCount(pages, issues);
    this.checkDuplicateContent(pages, issues);
    this.checkOrphanPages(pages, issues);
    this.checkViewport(pages, issues);
    this.checkCrawlDepth(pages, issues);
    this.checkHreflang(pages, issues);

    const summary = {
      critical: issues.filter((i) => i.severity === IssueSeverity.CRITICAL).length,
      high: issues.filter((i) => i.severity === IssueSeverity.HIGH).length,
      medium: issues.filter((i) => i.severity === IssueSeverity.MEDIUM).length,
      low: issues.filter((i) => i.severity === IssueSeverity.LOW).length,
      info: issues.filter((i) => i.severity === IssueSeverity.INFO).length,
    };

    const score = this.calculateTechnicalScore(issues, pages.length);

    return { issues, score, summary };
  }

  private checkHttps(crawlResult: CrawlResult, issues: TechnicalIssueData[]): void {
    if (!crawlResult.isHttps) {
      issues.push({
        type: IssueType.HTTP_NOT_HTTPS,
        category: IssueCategory.SECURITY,
        severity: IssueSeverity.CRITICAL,
        title: 'Site not served over HTTPS',
        description:
          'Your website is using HTTP instead of HTTPS. HTTPS is a confirmed Google ranking signal and protects user data. Modern browsers warn users when they visit HTTP sites.',
        affectedUrls: [crawlResult.pages[0]?.url ?? ''],
        count: 1,
        impactScore: 30,
      });
    }

    const mixedPages = crawlResult.pages.filter((p) => p.hasMixedContent);
    if (mixedPages.length > 0) {
      issues.push({
        type: IssueType.MIXED_CONTENT,
        category: IssueCategory.SECURITY,
        severity: IssueSeverity.HIGH,
        title: 'Mixed content detected',
        description:
          `${mixedPages.length} page(s) load HTTP resources over an HTTPS connection. This triggers browser security warnings and can hurt user trust and rankings.`,
        affectedUrls: mixedPages.map((p) => p.url).slice(0, 20),
        count: mixedPages.length,
        impactScore: 15,
      });
    }
  }

  private checkRobotsTxt(crawlResult: CrawlResult, issues: TechnicalIssueData[]): void {
    if (!crawlResult.hasRobotsTxt) {
      issues.push({
        type: IssueType.MISSING_ROBOTS_TXT,
        category: IssueCategory.TECHNICAL,
        severity: IssueSeverity.MEDIUM,
        title: 'robots.txt file not found',
        description:
          'No robots.txt file was found at the root of your website. A robots.txt file helps search engines understand which pages to crawl and index.',
        affectedUrls: [`${crawlResult.pages[0]?.url ? new URL(crawlResult.pages[0].url).origin : ''}/robots.txt`],
        count: 1,
        impactScore: 10,
      });
    }
  }

  private checkSitemap(crawlResult: CrawlResult, issues: TechnicalIssueData[]): void {
    if (!crawlResult.hasSitemap) {
      issues.push({
        type: IssueType.MISSING_SITEMAP,
        category: IssueCategory.TECHNICAL,
        severity: IssueSeverity.MEDIUM,
        title: 'XML sitemap not found',
        description:
          'No XML sitemap was found. A sitemap helps search engines discover and crawl all pages on your website more efficiently.',
        affectedUrls: [],
        count: 1,
        impactScore: 12,
      });
    }
  }

  private checkTitleTags(pages: CrawledPageData[], issues: TechnicalIssueData[]): void {
    const missing = pages.filter((p) => !p.title && p.statusCode === 200);
    const tooLong = pages.filter((p) => p.title && p.titleLength > TITLE_MAX_LENGTH);
    const tooShort = pages.filter(
      (p) => p.title && p.titleLength > 0 && p.titleLength < TITLE_MIN_LENGTH
    );

    // Duplicate titles
    const titleMap = new Map<string, string[]>();
    for (const page of pages) {
      if (page.title) {
        const key = page.title.toLowerCase().trim();
        const existing = titleMap.get(key) || [];
        existing.push(page.url);
        titleMap.set(key, existing);
      }
    }
    const duplicateTitles = [...titleMap.entries()].filter(([, urls]) => urls.length > 1);

    if (missing.length > 0) {
      issues.push({
        type: IssueType.MISSING_TITLE,
        category: IssueCategory.ON_PAGE,
        severity: IssueSeverity.CRITICAL,
        title: 'Pages missing title tags',
        description: `${missing.length} page(s) have no title tag. The title tag is one of the most important on-page SEO elements — it appears in search results and browser tabs.`,
        affectedUrls: missing.map((p) => p.url).slice(0, 20),
        count: missing.length,
        impactScore: 25,
      });
    }

    if (tooLong.length > 0) {
      issues.push({
        type: IssueType.TITLE_TOO_LONG,
        category: IssueCategory.ON_PAGE,
        severity: IssueSeverity.MEDIUM,
        title: 'Title tags too long (over 60 characters)',
        description: `${tooLong.length} page(s) have titles exceeding 60 characters. Google typically truncates titles beyond ~60 chars in search results, which can hurt CTR.`,
        affectedUrls: tooLong.map((p) => p.url).slice(0, 20),
        count: tooLong.length,
        impactScore: 8,
      });
    }

    if (tooShort.length > 0) {
      issues.push({
        type: IssueType.TITLE_TOO_SHORT,
        category: IssueCategory.ON_PAGE,
        severity: IssueSeverity.LOW,
        title: 'Title tags too short (under 30 characters)',
        description: `${tooShort.length} page(s) have titles under 30 characters. Short titles miss the opportunity to include target keywords and provide context.`,
        affectedUrls: tooShort.map((p) => p.url).slice(0, 20),
        count: tooShort.length,
        impactScore: 5,
      });
    }

    if (duplicateTitles.length > 0) {
      const allAffected = duplicateTitles.flatMap(([, urls]) => urls);
      issues.push({
        type: IssueType.DUPLICATE_TITLE,
        category: IssueCategory.ON_PAGE,
        severity: IssueSeverity.HIGH,
        title: 'Duplicate title tags found',
        description: `${duplicateTitles.length} groups of pages share the same title tag. Duplicate titles confuse search engines about which page to rank for a given query.`,
        affectedUrls: allAffected.slice(0, 20),
        count: allAffected.length,
        impactScore: 18,
      });
    }
  }

  private checkMetaDescriptions(pages: CrawledPageData[], issues: TechnicalIssueData[]): void {
    const htmlPages = pages.filter((p) => p.statusCode === 200 && p.contentType?.includes('text/html'));
    const missing = htmlPages.filter((p) => !p.metaDescription);
    const tooLong = htmlPages.filter(
      (p) => p.metaDescription && p.metaDescLength > META_DESC_MAX_LENGTH
    );
    const tooShort = htmlPages.filter(
      (p) => p.metaDescription && p.metaDescLength < META_DESC_MIN_LENGTH
    );

    // Duplicate meta descriptions
    const metaMap = new Map<string, string[]>();
    for (const page of htmlPages) {
      if (page.metaDescription) {
        const key = page.metaDescription.toLowerCase().trim();
        const existing = metaMap.get(key) || [];
        existing.push(page.url);
        metaMap.set(key, existing);
      }
    }
    const duplicateMeta = [...metaMap.entries()].filter(([, urls]) => urls.length > 1);

    if (missing.length > 0) {
      issues.push({
        type: IssueType.MISSING_META_DESCRIPTION,
        category: IssueCategory.ON_PAGE,
        severity: IssueSeverity.HIGH,
        title: 'Pages missing meta descriptions',
        description: `${missing.length} page(s) have no meta description. While not a direct ranking factor, meta descriptions are the snippet shown in search results and greatly affect CTR.`,
        affectedUrls: missing.map((p) => p.url).slice(0, 20),
        count: missing.length,
        impactScore: 15,
      });
    }

    if (tooLong.length > 0) {
      issues.push({
        type: IssueType.META_DESCRIPTION_TOO_LONG,
        category: IssueCategory.ON_PAGE,
        severity: IssueSeverity.LOW,
        title: 'Meta descriptions too long (over 160 characters)',
        description: `${tooLong.length} page(s) have meta descriptions exceeding 160 characters. Google truncates these in search results.`,
        affectedUrls: tooLong.map((p) => p.url).slice(0, 20),
        count: tooLong.length,
        impactScore: 5,
      });
    }

    if (duplicateMeta.length > 0) {
      const allAffected = duplicateMeta.flatMap(([, urls]) => urls);
      issues.push({
        type: IssueType.DUPLICATE_META_DESCRIPTION,
        category: IssueCategory.ON_PAGE,
        severity: IssueSeverity.MEDIUM,
        title: 'Duplicate meta descriptions',
        description: `${duplicateMeta.length} groups of pages share identical meta descriptions. Each page should have a unique, compelling description.`,
        affectedUrls: allAffected.slice(0, 20),
        count: allAffected.length,
        impactScore: 8,
      });
    }
  }

  private checkH1Tags(pages: CrawledPageData[], issues: TechnicalIssueData[]): void {
    const htmlPages = pages.filter((p) => p.statusCode === 200 && p.isIndexable);
    const missingH1 = htmlPages.filter((p) => p.h1Count === 0);
    const multipleH1 = htmlPages.filter((p) => p.h1Count > 1);

    if (missingH1.length > 0) {
      issues.push({
        type: IssueType.MISSING_H1,
        category: IssueCategory.ON_PAGE,
        severity: IssueSeverity.HIGH,
        title: 'Pages missing H1 heading',
        description: `${missingH1.length} page(s) have no H1 tag. The H1 is the primary heading and tells search engines what the page is about — it should include the primary keyword.`,
        affectedUrls: missingH1.map((p) => p.url).slice(0, 20),
        count: missingH1.length,
        impactScore: 15,
      });
    }

    if (multipleH1.length > 0) {
      issues.push({
        type: IssueType.MULTIPLE_H1,
        category: IssueCategory.ON_PAGE,
        severity: IssueSeverity.MEDIUM,
        title: 'Pages with multiple H1 headings',
        description: `${multipleH1.length} page(s) have more than one H1 tag. While not a critical error, best practice is one H1 per page to clearly define the primary topic.`,
        affectedUrls: multipleH1.map((p) => p.url).slice(0, 20),
        count: multipleH1.length,
        impactScore: 6,
      });
    }
  }

  private checkCanonicals(pages: CrawledPageData[], issues: TechnicalIssueData[]): void {
    const htmlPages = pages.filter((p) => p.statusCode === 200);
    const missingCanonical = htmlPages.filter((p) => !p.canonical);
    const canonicalMismatch = htmlPages.filter(
      (p) =>
        p.canonical &&
        p.finalUrl &&
        p.canonical.replace(/\/$/, '') !== p.finalUrl.replace(/\/$/, '') &&
        p.canonical.replace(/\/$/, '') !== p.url.replace(/\/$/, '')
    );

    if (missingCanonical.length > 0) {
      issues.push({
        type: IssueType.MISSING_CANONICAL,
        category: IssueCategory.TECHNICAL,
        severity: IssueSeverity.MEDIUM,
        title: 'Pages missing canonical tags',
        description: `${missingCanonical.length} page(s) do not have a canonical tag. Canonicals help prevent duplicate content issues and consolidate link equity.`,
        affectedUrls: missingCanonical.map((p) => p.url).slice(0, 20),
        count: missingCanonical.length,
        impactScore: 10,
      });
    }

    if (canonicalMismatch.length > 0) {
      issues.push({
        type: IssueType.CANONICAL_MISMATCH,
        category: IssueCategory.TECHNICAL,
        severity: IssueSeverity.HIGH,
        title: 'Canonical tag mismatch detected',
        description: `${canonicalMismatch.length} page(s) have canonical tags pointing to a different URL than the page itself. This can cause indexing confusion.`,
        affectedUrls: canonicalMismatch.map((p) => p.url).slice(0, 20),
        count: canonicalMismatch.length,
        impactScore: 18,
      });
    }
  }

  private checkIndexability(pages: CrawledPageData[], issues: TechnicalIssueData[]): void {
    const noindexPages = pages.filter(
      (p) => p.noindex && p.statusCode === 200
    );

    if (noindexPages.length > 0) {
      issues.push({
        type: IssueType.NOINDEX,
        category: IssueCategory.TECHNICAL,
        severity: IssueSeverity.HIGH,
        title: 'Pages blocked from indexing with noindex',
        description: `${noindexPages.length} page(s) have a noindex directive, meaning search engines will not include them in search results. Review whether these pages should be indexed.`,
        affectedUrls: noindexPages.map((p) => p.url).slice(0, 20),
        count: noindexPages.length,
        impactScore: 20,
      });
    }
  }

  private checkBrokenLinks(pages: CrawledPageData[], issues: TechnicalIssueData[]): void {
    const brokenPages = pages.filter(
      (p) => p.statusCode === 404 || p.statusCode === 410
    );

    if (brokenPages.length > 0) {
      issues.push({
        type: IssueType.BROKEN_LINK,
        category: IssueCategory.LINKS,
        severity: IssueSeverity.HIGH,
        title: 'Broken pages (404/410) found',
        description: `${brokenPages.length} URL(s) return an error status code. Broken links waste crawl budget, hurt user experience, and lose potential link equity.`,
        affectedUrls: brokenPages.map((p) => p.url).slice(0, 20),
        count: brokenPages.length,
        impactScore: 20,
      });
    }
  }

  private checkRedirectChains(pages: CrawledPageData[], issues: TechnicalIssueData[]): void {
    const redirectPages = pages.filter(
      (p) => p.statusCode >= 300 && p.statusCode < 400
    );

    if (redirectPages.length > 0) {
      issues.push({
        type: IssueType.REDIRECT_CHAIN,
        category: IssueCategory.TECHNICAL,
        severity: IssueSeverity.MEDIUM,
        title: 'Redirect chains detected',
        description: `${redirectPages.length} URL(s) are redirects. Redirect chains (A→B→C) waste crawl budget and dilute PageRank. Aim for direct redirects.`,
        affectedUrls: redirectPages.map((p) => p.url).slice(0, 20),
        count: redirectPages.length,
        impactScore: 8,
      });
    }
  }

  private checkMixedContent(pages: CrawledPageData[], issues: TechnicalIssueData[]): void {
    // Already handled in checkHttps
  }

  private checkStructuredData(pages: CrawledPageData[], issues: TechnicalIssueData[]): void {
    const htmlPages = pages.filter((p) => p.statusCode === 200 && p.isIndexable);
    const noStructuredData = htmlPages.filter((p) => !p.hasStructuredData);

    if (noStructuredData.length > htmlPages.length * 0.8 && noStructuredData.length > 5) {
      issues.push({
        type: IssueType.MISSING_STRUCTURED_DATA,
        category: IssueCategory.TECHNICAL,
        severity: IssueSeverity.MEDIUM,
        title: 'Most pages missing structured data (JSON-LD)',
        description: `${noStructuredData.length} of ${htmlPages.length} pages have no JSON-LD structured data. Structured data enables rich results in Google Search and improves click-through rates.`,
        affectedUrls: noStructuredData.map((p) => p.url).slice(0, 10),
        count: noStructuredData.length,
        impactScore: 12,
      });
    }
  }

  private checkImageAltText(pages: CrawledPageData[], issues: TechnicalIssueData[]): void {
    const pagesWithMissingAlt = pages.filter(
      (p) => p.imagesWithoutAlt && p.imagesWithoutAlt > 0
    );
    const totalMissingAlt = pagesWithMissingAlt.reduce(
      (sum, p) => sum + (p.imagesWithoutAlt || 0),
      0
    );

    if (pagesWithMissingAlt.length > 0) {
      issues.push({
        type: IssueType.MISSING_ALT_TEXT,
        category: IssueCategory.IMAGES,
        severity: IssueSeverity.MEDIUM,
        title: 'Images missing alt text',
        description: `${totalMissingAlt} image(s) across ${pagesWithMissingAlt.length} page(s) are missing alt text. Alt text is important for accessibility and image SEO.`,
        affectedUrls: pagesWithMissingAlt.map((p) => p.url).slice(0, 20),
        count: totalMissingAlt,
        impactScore: 10,
      });
    }
  }

  private checkPageSpeed(pages: CrawledPageData[], issues: TechnicalIssueData[]): void {
    const slowPages = pages.filter(
      (p) => p.loadTime && p.loadTime > SLOW_PAGE_THRESHOLD_MS
    );

    if (slowPages.length > 0) {
      issues.push({
        type: IssueType.SLOW_PAGE,
        category: IssueCategory.PERFORMANCE,
        severity:
          slowPages.length > pages.length * 0.3 ? IssueSeverity.HIGH : IssueSeverity.MEDIUM,
        title: 'Slow page load times detected',
        description: `${slowPages.length} page(s) take more than ${SLOW_PAGE_THRESHOLD_MS / 1000}s to load. Page speed is a direct Google ranking factor and affects user experience.`,
        affectedUrls: slowPages
          .sort((a, b) => (b.loadTime || 0) - (a.loadTime || 0))
          .map((p) => p.url)
          .slice(0, 20),
        count: slowPages.length,
        impactScore: 15,
      });
    }
  }

  private checkWordCount(pages: CrawledPageData[], issues: TechnicalIssueData[]): void {
    const htmlPages = pages.filter((p) => p.statusCode === 200 && p.isIndexable);
    const thinContent = htmlPages.filter(
      (p) => p.wordCount !== null && p.wordCount < MIN_WORD_COUNT
    );

    if (thinContent.length > 0) {
      issues.push({
        type: IssueType.LOW_WORD_COUNT,
        category: IssueCategory.CONTENT,
        severity: IssueSeverity.MEDIUM,
        title: `Thin content pages (under ${MIN_WORD_COUNT} words)`,
        description: `${thinContent.length} page(s) have fewer than ${MIN_WORD_COUNT} words. Thin content is unlikely to rank well in competitive searches. Aim for comprehensive content.`,
        affectedUrls: thinContent.map((p) => p.url).slice(0, 20),
        count: thinContent.length,
        impactScore: 12,
      });
    }
  }

  private checkDuplicateContent(pages: CrawledPageData[], issues: TechnicalIssueData[]): void {
    const hashMap = new Map<string, string[]>();
    for (const page of pages) {
      if (page.contentHash && page.statusCode === 200) {
        const existing = hashMap.get(page.contentHash) || [];
        existing.push(page.url);
        hashMap.set(page.contentHash, existing);
      }
    }

    const duplicates = [...hashMap.entries()].filter(([, urls]) => urls.length > 1);

    if (duplicates.length > 0) {
      const allAffected = duplicates.flatMap(([, urls]) => urls);
      issues.push({
        type: IssueType.DUPLICATE_CONTENT,
        category: IssueCategory.CONTENT,
        severity: IssueSeverity.HIGH,
        title: 'Duplicate content detected',
        description: `${duplicates.length} group(s) of pages with near-identical content were found. Duplicate content dilutes link equity and can cause ranking issues.`,
        affectedUrls: allAffected.slice(0, 20),
        count: allAffected.length,
        impactScore: 20,
      });
    }
  }

  private checkOrphanPages(pages: CrawledPageData[], issues: TechnicalIssueData[]): void {
    // Pages with linkDepth > 5 are effectively orphaned
    const orphans = pages.filter(
      (p) => p.linkDepth > 5 && p.statusCode === 200 && p.isIndexable
    );

    if (orphans.length > 0) {
      issues.push({
        type: IssueType.ORPHAN_PAGE,
        category: IssueCategory.LINKS,
        severity: IssueSeverity.MEDIUM,
        title: 'Deep or orphaned pages detected',
        description: `${orphans.length} page(s) are more than 5 clicks from the homepage. Deep pages are harder for search engines to discover and rank.`,
        affectedUrls: orphans.map((p) => p.url).slice(0, 20),
        count: orphans.length,
        impactScore: 10,
      });
    }
  }

  private checkViewport(pages: CrawledPageData[], issues: TechnicalIssueData[]): void {
    const missingViewport = pages.filter(
      (p) => !p.hasViewport && p.statusCode === 200 && p.contentType?.includes('text/html')
    );

    if (missingViewport.length > 0) {
      issues.push({
        type: IssueType.MISSING_VIEWPORT,
        category: IssueCategory.TECHNICAL,
        severity: IssueSeverity.HIGH,
        title: 'Missing viewport meta tag',
        description: `${missingViewport.length} page(s) are missing the viewport meta tag. This is critical for mobile-friendliness, a key Google ranking signal.`,
        affectedUrls: missingViewport.map((p) => p.url).slice(0, 20),
        count: missingViewport.length,
        impactScore: 18,
      });
    }
  }

  private checkCrawlDepth(pages: CrawledPageData[], issues: TechnicalIssueData[]): void {
    const deepPages = pages.filter((p) => p.linkDepth > 3);
    if (deepPages.length > pages.length * 0.3) {
      issues.push({
        type: IssueType.CRAWL_DEPTH_ISSUE,
        category: IssueCategory.TECHNICAL,
        severity: IssueSeverity.LOW,
        title: 'Many pages require more than 3 clicks to reach',
        description: `${deepPages.length} page(s) are more than 3 clicks deep. Flat site architecture helps search engines crawl more efficiently and pass more link equity.`,
        affectedUrls: deepPages.map((p) => p.url).slice(0, 10),
        count: deepPages.length,
        impactScore: 6,
      });
    }
  }

  private checkHreflang(pages: CrawledPageData[], issues: TechnicalIssueData[]): void {
    const hreflangPages = pages.filter(
      (p) => p.hreflangTags && Object.keys(p.hreflangTags).length > 0
    );

    if (hreflangPages.length > 0) {
      // Check for self-referencing hreflang
      const missingXDefault = hreflangPages.filter(
        (p) => !p.hreflangTags['x-default']
      );

      if (missingXDefault.length > 0) {
        issues.push({
          type: IssueType.HREFLANG_ISSUE,
          category: IssueCategory.TECHNICAL,
          severity: IssueSeverity.MEDIUM,
          title: 'Hreflang missing x-default tag',
          description: `${missingXDefault.length} page(s) with hreflang tags are missing the x-default fallback. The x-default tag tells Google which page to show when no language matches.`,
          affectedUrls: missingXDefault.map((p) => p.url).slice(0, 10),
          count: missingXDefault.length,
          impactScore: 8,
        });
      }
    }
  }

  private calculateTechnicalScore(issues: TechnicalIssueData[], totalPages: number): number {
    if (totalPages === 0) return 0;

    let penaltyPoints = 0;

    for (const issue of issues) {
      const basePenalty = issue.impactScore;
      const severityMultiplier = {
        [IssueSeverity.CRITICAL]: 1.0,
        [IssueSeverity.HIGH]: 0.7,
        [IssueSeverity.MEDIUM]: 0.4,
        [IssueSeverity.LOW]: 0.2,
        [IssueSeverity.INFO]: 0.05,
      }[issue.severity];

      // Scale by affected page percentage
      const affectedRatio = Math.min(issue.count / totalPages, 1);
      penaltyPoints += basePenalty * severityMultiplier * (0.5 + 0.5 * affectedRatio);
    }

    const score = Math.max(0, 100 - penaltyPoints);
    return Math.round(score * 10) / 10;
  }
}
