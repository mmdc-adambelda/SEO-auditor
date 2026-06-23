import { Worker, Job, Queue } from 'bullmq';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';
import prisma from '../lib/prisma';
import { CrawlerService } from '../services/crawler';
import { TechnicalAuditService } from '../services/technical-audit';
import { OnPageAuditService } from '../services/onpage-audit';
import { ScoringEngine } from '../services/scoring-engine';
import { ReportGeneratorService } from '../services/report-generator';
import { PageSpeedService } from '../lib/pagespeed';
import { DataForSEOService } from '../lib/dataforseo';
import { OpenAIService } from '../lib/openai';
import { AuditStatus, IssueSeverity, IssueCategory } from '@seo-auditor/shared';
import type { CrawledPageData } from '../services/crawler';

export interface AuditJobData {
  jobId: string;
  url: string;
  maxPages: number;
  crawlDepth: number;
  includeKeywords: boolean;
  includeCompetitors: boolean;
  competitors?: string[];
}

export const AUDIT_QUEUE_NAME = 'audit-queue';

export const auditQueue = new Queue<AuditJobData>(AUDIT_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export function createAuditWorker(): Worker<AuditJobData> {
  const worker = new Worker<AuditJobData>(
    AUDIT_QUEUE_NAME,
    async (job: Job<AuditJobData>) => {
      const { jobId, url, maxPages, crawlDepth, includeKeywords, includeCompetitors } = job.data;

      logger.info('Starting audit job', { jobId, url });

      try {
        // ── Phase 1: Crawling ──────────────────────────────────────────────
        await updateJobStatus(jobId, AuditStatus.CRAWLING, 5, 'Starting website crawl...');

        const crawler = new CrawlerService();
        const crawlResult = await crawler.crawl(url, {
          maxPages,
          maxDepth: crawlDepth,
          onPageCrawled: async (page, progress) => {
            await updateJobStatus(
              jobId,
              AuditStatus.CRAWLING,
              Math.round(progress * 0.4),
              `Crawling... ${page.url.slice(0, 60)}`
            );
          },
        });

        logger.info('Crawl complete', { jobId, pages: crawlResult.pages.length });

        // Save crawled pages to DB
        await saveCrawledPages(jobId, crawlResult.pages);

        await updateJobStatus(jobId, AuditStatus.CRAWLING, 45, `Crawled ${crawlResult.pages.length} pages. Starting analysis...`);

        // Update job with sitemap/robots info
        await prisma.auditJob.update({
          where: { id: jobId },
          data: {
            hasSitemap: crawlResult.hasSitemap,
            sitemapUrl: crawlResult.sitemapUrl,
            hasRobotsTxt: crawlResult.hasRobotsTxt,
            robotsTxtContent: crawlResult.robotsTxtContent,
            isHttps: crawlResult.isHttps,
            pagesCrawled: crawlResult.pages.length,
            domain: crawlResult.domain,
          },
        });

        // ── Phase 2: Analysis ──────────────────────────────────────────────
        await updateJobStatus(jobId, AuditStatus.ANALYZING, 50, 'Running technical SEO analysis...');

        const technicalService = new TechnicalAuditService();
        const technicalResult = technicalService.audit(crawlResult);

        await updateJobStatus(jobId, AuditStatus.ANALYZING, 55, 'Running on-page analysis...');

        const onPageService = new OnPageAuditService();
        const onPageResult = onPageService.audit(crawlResult.pages);

        await updateJobStatus(jobId, AuditStatus.ANALYZING, 60, 'Analyzing Core Web Vitals...');

        const psiService = new PageSpeedService();
        let cwvScore: number | null = null;
        let cwvData = null;

        try {
          cwvData = await psiService.analyze(url);
          cwvScore = cwvData.mobile.score;
          await saveCWVData(jobId, cwvData);
        } catch (err) {
          logger.warn('CWV analysis failed', { jobId, err });
        }

        await updateJobStatus(jobId, AuditStatus.ANALYZING, 65, 'Calculating scores...');

        const scoringEngine = new ScoringEngine();
        const scores = scoringEngine.calculate({
          technicalResult,
          onPageResult,
          cwvScore,
          pagesCrawled: crawlResult.pages.length,
          hasHttps: crawlResult.isHttps,
          hasSitemap: crawlResult.hasSitemap,
          hasRobotsTxt: crawlResult.hasRobotsTxt,
        });

        // ── Phase 3: AI Enrichment ─────────────────────────────────────────
        await updateJobStatus(jobId, AuditStatus.ANALYZING, 70, 'Generating AI recommendations...');

        const openAIService = new OpenAIService();
        const enrichedIssues = await openAIService.enrichIssues(
          technicalResult.issues,
          crawlResult.domain
        );

        // Save technical issues
        await saveTechnicalIssues(jobId, enrichedIssues);

        // ── Phase 4: Keywords & Competitors ───────────────────────────────
        let keywordData: Awaited<ReturnType<DataForSEOService['getKeywordOpportunities']>> = [];
        let competitorData: Awaited<ReturnType<DataForSEOService['getCompetitors']>> = [];

        if (includeKeywords || includeCompetitors) {
          await updateJobStatus(jobId, AuditStatus.ANALYZING, 75, 'Discovering keyword opportunities...');

          const dfsService = new DataForSEOService();

          if (includeKeywords) {
            try {
              keywordData = await dfsService.getKeywordOpportunities(crawlResult.domain);
              await saveKeywords(jobId, keywordData);
            } catch (err) {
              logger.warn('Keyword analysis failed', { jobId, err });
            }
          }

          if (includeCompetitors) {
            await updateJobStatus(jobId, AuditStatus.ANALYZING, 80, 'Analyzing competitors...');
            try {
              competitorData = await dfsService.getCompetitors(crawlResult.domain);
              await saveCompetitors(jobId, competitorData);
            } catch (err) {
              logger.warn('Competitor analysis failed', { jobId, err });
            }
          }
        }

        // ── Phase 5: Report Generation ─────────────────────────────────────
        await updateJobStatus(jobId, AuditStatus.GENERATING_REPORT, 85, 'Generating executive summary...');

        const executiveSummaryData = await openAIService.generateExecutiveSummary({
          domain: crawlResult.domain,
          overallScore: scores.overall,
          technicalScore: scores.technical,
          contentScore: scores.content,
          performanceScore: scores.performance,
          criticalIssues: technicalResult.summary.critical,
          highIssues: technicalResult.summary.high,
          pagesCrawled: crawlResult.pages.length,
          topKeywords: keywordData.length,
          competitors: competitorData.length,
        });

        await updateJobStatus(jobId, AuditStatus.GENERATING_REPORT, 90, 'Generating downloadable reports...');

        const reportService = new ReportGeneratorService();
        const reportPaths = await reportService.generate({
          jobId,
          domain: crawlResult.domain,
          url,
          scores,
          issues: enrichedIssues,
          keywords: keywordData,
          executiveSummary: executiveSummaryData.summary,
          pagesCrawled: crawlResult.pages.length,
          crawledAt: new Date(),
        });

        // Save report
        await prisma.auditReport.create({
          data: {
            auditJobId: jobId,
            grade: scores.grade,
            overallScore: scores.overall,
            criticalIssues: enrichedIssues.filter(
              (i) => i.severity === IssueSeverity.CRITICAL
            ),
            highPriorityFixes: enrichedIssues.filter(
              (i) => i.severity === IssueSeverity.HIGH
            ),
            quickWins: [],
            longTermOpps: [],
            executiveSummary: executiveSummaryData.summary,
            aiInsights: JSON.stringify(executiveSummaryData),
            pdfPath: reportPaths.pdf,
            csvPath: reportPaths.csv,
            jsonPath: reportPaths.json,
          },
        });

        // Update audit job with final scores
        await prisma.auditJob.update({
          where: { id: jobId },
          data: {
            status: AuditStatus.COMPLETED,
            progress: 100,
            statusMsg: 'Audit complete',
            overallScore: scores.overall,
            technicalScore: scores.technical,
            contentScore: scores.content,
            performanceScore: scores.performance,
            authorityScore: scores.authority,
            uxScore: scores.ux,
            totalIssues: enrichedIssues.length,
            criticalIssues: technicalResult.summary.critical,
            pagesIndexable: crawlResult.pages.filter((p) => p.isIndexable).length,
            completedAt: new Date(),
          },
        });

        logger.info('Audit job completed', { jobId, overall: scores.overall });
      } catch (err) {
        logger.error('Audit job failed', { jobId, err });
        await prisma.auditJob.update({
          where: { id: jobId },
          data: {
            status: AuditStatus.FAILED,
            errorMsg: err instanceof Error ? err.message : 'Unknown error',
          },
        });
        throw err;
      }
    },
    {
      connection: redis,
      concurrency: 3,
    }
  );

  worker.on('completed', (job) => {
    logger.info('Worker job completed', { jobId: job.data.jobId });
  });

  worker.on('failed', (job, err) => {
    logger.error('Worker job failed', { jobId: job?.data.jobId, err });
  });

  return worker;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function updateJobStatus(
  jobId: string,
  status: AuditStatus,
  progress: number,
  message: string
): Promise<void> {
  await prisma.auditJob.update({
    where: { id: jobId },
    data: { status, progress, statusMsg: message },
  });
}

async function saveCrawledPages(jobId: string, pages: CrawledPageData[]): Promise<void> {
  const chunkSize = 50;
  for (let i = 0; i < pages.length; i += chunkSize) {
    const chunk = pages.slice(i, i + chunkSize);
    await prisma.crawledPage.createMany({
      data: chunk.map((page) => ({
        auditJobId: jobId,
        url: page.url,
        finalUrl: page.finalUrl,
        statusCode: page.statusCode,
        contentType: page.contentType,
        wordCount: page.wordCount,
        loadTime: page.loadTime,
        title: page.title,
        titleLength: page.titleLength,
        metaDescription: page.metaDescription,
        metaDescLength: page.metaDescLength,
        h1Count: page.h1Count,
        h2Count: page.h2Count,
        h3Count: page.h3Count,
        h1Text: page.h1Text,
        h2Texts: page.h2Texts,
        lang: page.lang,
        canonical: page.canonical,
        robots: page.robots,
        noindex: page.noindex,
        nofollow: page.nofollow,
        isIndexable: page.isIndexable,
        hasViewport: page.hasViewport,
        isHttps: page.isHttps,
        hasMixedContent: page.hasMixedContent,
        hasStructuredData: page.hasStructuredData,
        structuredDataTypes: page.structuredDataTypes,
        hreflangTags: page.hreflangTags,
        readabilityScore: page.readabilityScore,
        topKeywords: page.topKeywords,
        totalImages: page.totalImages,
        imagesWithoutAlt: page.imagesWithoutAlt,
        largeImages: page.largeImages,
        internalLinks: page.internalLinks.length,
        externalLinks: page.externalLinks.length,
        brokenLinks: page.brokenLinks,
        linkDepth: page.linkDepth,
        contentHash: page.contentHash,
      })),
      skipDuplicates: true,
    });
  }
}

async function saveCWVData(jobId: string, cwvData: ReturnType<PageSpeedService['analyze']> extends Promise<infer T> ? T : never): Promise<void> {
  await prisma.coreWebVitals.create({
    data: {
      auditJobId: jobId,
      mobileLcp: cwvData.mobile.lcp,
      mobileCls: cwvData.mobile.cls,
      mobileInp: cwvData.mobile.inp,
      mobileFcp: cwvData.mobile.fcp,
      mobileTtfb: cwvData.mobile.ttfb,
      mobileScore: cwvData.mobile.score,
      desktopLcp: cwvData.desktop.lcp,
      desktopCls: cwvData.desktop.cls,
      desktopInp: cwvData.desktop.inp,
      desktopFcp: cwvData.desktop.fcp,
      desktopTtfb: cwvData.desktop.ttfb,
      desktopScore: cwvData.desktop.score,
      opportunities: cwvData.opportunities,
      diagnostics: cwvData.diagnostics,
    },
  });
}

async function saveTechnicalIssues(
  jobId: string,
  issues: ReturnType<import('../lib/openai').OpenAIService['enrichIssues']> extends Promise<infer T> ? T : never
): Promise<void> {
  await prisma.technicalIssue.createMany({
    data: issues.map((issue) => ({
      auditJobId: jobId,
      type: issue.type,
      category: issue.category,
      severity: issue.severity,
      title: issue.title,
      description: issue.description,
      affectedUrl: issue.affectedUrl,
      affectedUrls: issue.affectedUrls,
      count: issue.count,
      recommendation: issue.recommendation,
      businessImpact: issue.businessImpact,
      seoImpact: issue.seoImpact,
      implementationSteps: issue.implementationSteps,
      estimatedImpact: issue.estimatedImpact,
      impactScore: issue.impactScore,
    })),
  });
}

async function saveKeywords(jobId: string, keywords: Array<{ id: string; keyword: string; searchVolume: number | null; difficulty: number | null; cpc: number | null; intent: string | null; type: string | null; opportunityScore: number | null; category: string | null; currentRanking: number | null; targetUrl: string | null }>): Promise<void> {
  await prisma.keywordOpportunity.createMany({
    data: keywords.map((kw) => ({
      auditJobId: jobId,
      keyword: kw.keyword,
      searchVolume: kw.searchVolume,
      difficulty: kw.difficulty,
      cpc: kw.cpc,
      intent: kw.intent as any,
      type: kw.type as any,
      opportunityScore: kw.opportunityScore,
      category: kw.category as any,
      currentRanking: kw.currentRanking,
      targetUrl: kw.targetUrl,
    })),
  });
}

async function saveCompetitors(jobId: string, competitors: Array<{ id: string; domain: string; url: string | null; organicKeywords: number | null; topPages: number | null; backlinks: number | null; domainAuthority: number | null; avgWordCount: number | null; contentTopics: string[]; commonKeywords: number | null; uniqueKeywords: number | null; gapKeywords: unknown[]; overallScore: number | null }>): Promise<void> {
  await prisma.competitor.createMany({
    data: competitors.map((c) => ({
      auditJobId: jobId,
      domain: c.domain,
      url: c.url,
      organicKeywords: c.organicKeywords,
      topPages: c.topPages,
      backlinks: c.backlinks,
      domainAuthority: c.domainAuthority,
      avgWordCount: c.avgWordCount,
      contentTopics: c.contentTopics,
      commonKeywords: c.commonKeywords,
      uniqueKeywords: c.uniqueKeywords,
      gapKeywords: c.gapKeywords,
      overallScore: c.overallScore,
    })),
  });
}
