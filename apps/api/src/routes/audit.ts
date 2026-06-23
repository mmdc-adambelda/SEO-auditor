import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { auditQueue } from '../workers/audit.worker';
import { AuditStatus } from '@seo-auditor/shared';
import { logger } from '../lib/logger';

const router = Router();

// ── Validation ─────────────────────────────────────────────────────────────────

const startAuditSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  maxPages: z.number().int().min(1).max(1000).default(500),
  crawlDepth: z.number().int().min(1).max(10).default(5),
  includeKeywords: z.boolean().default(true),
  includeCompetitors: z.boolean().default(true),
  competitors: z.array(z.string().url()).max(5).optional(),
});

// ── POST /audit ────────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = startAuditSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { url, maxPages, crawlDepth, includeKeywords, includeCompetitors, competitors } =
      parsed.data;

    // Normalize URL
    const normalizedUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    const domain = new URL(normalizedUrl).hostname;

    // Create audit job in DB
    const auditJob = await prisma.auditJob.create({
      data: {
        url: normalizedUrl,
        domain,
        status: AuditStatus.PENDING,
        maxPages,
        crawlDepth,
      },
    });

    // Enqueue the job
    await auditQueue.add(
      `audit-${auditJob.id}`,
      {
        jobId: auditJob.id,
        url: normalizedUrl,
        maxPages,
        crawlDepth,
        includeKeywords,
        includeCompetitors,
        competitors,
      },
      { jobId: auditJob.id }
    );

    logger.info('Audit job enqueued', { jobId: auditJob.id, url: normalizedUrl });

    return res.status(202).json({
      jobId: auditJob.id,
      status: AuditStatus.PENDING,
      message: 'Audit started. Poll /audit/:id for status updates.',
    });
  } catch (err) {
    logger.error('Failed to start audit', { err });
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to start audit' });
  }
});

// ── GET /audit/:id ─────────────────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const job = await prisma.auditJob.findUnique({
      where: { id: req.params.id },
      include: {
        report: true,
        cwvData: true,
        _count: {
          select: {
            crawledPages: true,
            technicalIssues: true,
            keywords: true,
            competitors: true,
          },
        },
      },
    });

    if (!job) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Audit job not found' });
    }

    return res.json({
      id: job.id,
      url: job.url,
      domain: job.domain,
      status: job.status,
      progress: job.progress,
      statusMsg: job.statusMsg,
      errorMsg: job.errorMsg,
      scores: {
        overall: job.overallScore,
        technical: job.technicalScore,
        content: job.contentScore,
        performance: job.performanceScore,
        authority: job.authorityScore,
        ux: job.uxScore,
      },
      grade: job.report?.grade ?? null,
      stats: {
        pagesCrawled: job.pagesCrawled,
        pagesIndexable: job.pagesIndexable,
        totalIssues: job.totalIssues,
        criticalIssues: job.criticalIssues,
        hasSitemap: job.hasSitemap,
        hasRobotsTxt: job.hasRobotsTxt,
        isHttps: job.isHttps,
      },
      counts: job._count,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    });
  } catch (err) {
    logger.error('Failed to fetch audit job', { err });
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch audit' });
  }
});

// ── GET /audit/:id/technical ───────────────────────────────────────────────────

router.get('/:id/technical', async (req: Request, res: Response) => {
  try {
    const { page = '1', pageSize = '20', severity, category } = req.query;

    const where: Record<string, unknown> = { auditJobId: req.params.id };
    if (severity) where.severity = severity;
    if (category) where.category = category;

    const [issues, total] = await Promise.all([
      prisma.technicalIssue.findMany({
        where,
        orderBy: [{ severity: 'asc' }, { impactScore: 'desc' }],
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
      }),
      prisma.technicalIssue.count({ where }),
    ]);

    return res.json({
      data: issues,
      total,
      page: Number(page),
      pageSize: Number(pageSize),
      totalPages: Math.ceil(total / Number(pageSize)),
    });
  } catch (err) {
    logger.error('Failed to fetch technical issues', { err });
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch issues' });
  }
});

// ── GET /audit/:id/pages ───────────────────────────────────────────────────────

router.get('/:id/pages', async (req: Request, res: Response) => {
  try {
    const { page = '1', pageSize = '20', sort = 'onPageScore', order = 'asc' } = req.query;

    const pages = await prisma.crawledPage.findMany({
      where: { auditJobId: req.params.id },
      orderBy: { [sort as string]: order as 'asc' | 'desc' },
      skip: (Number(page) - 1) * Number(pageSize),
      take: Number(pageSize),
      include: {
        issues: { take: 5, orderBy: { severity: 'asc' } },
      },
    });

    const total = await prisma.crawledPage.count({
      where: { auditJobId: req.params.id },
    });

    return res.json({
      data: pages,
      total,
      page: Number(page),
      pageSize: Number(pageSize),
      totalPages: Math.ceil(total / Number(pageSize)),
    });
  } catch (err) {
    logger.error('Failed to fetch crawled pages', { err });
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch pages' });
  }
});

// ── GET /audit/:id/cwv ─────────────────────────────────────────────────────────

router.get('/:id/cwv', async (req: Request, res: Response) => {
  try {
    const cwv = await prisma.coreWebVitals.findUnique({
      where: { auditJobId: req.params.id },
    });

    if (!cwv) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'CWV data not available yet' });
    }

    return res.json(cwv);
  } catch (err) {
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch CWV data' });
  }
});

// ── GET /audit/:id/keywords ────────────────────────────────────────────────────

router.get('/:id/keywords', async (req: Request, res: Response) => {
  try {
    const { category, type, page = '1', pageSize = '50' } = req.query;

    const where: Record<string, unknown> = { auditJobId: req.params.id };
    if (category) where.category = category;
    if (type) where.type = type;

    const [keywords, total] = await Promise.all([
      prisma.keywordOpportunity.findMany({
        where,
        orderBy: { opportunityScore: 'desc' },
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
      }),
      prisma.keywordOpportunity.count({ where }),
    ]);

    return res.json({
      data: keywords,
      total,
      page: Number(page),
      pageSize: Number(pageSize),
      totalPages: Math.ceil(total / Number(pageSize)),
    });
  } catch (err) {
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch keywords' });
  }
});

// ── GET /audit/:id/competitors ─────────────────────────────────────────────────

router.get('/:id/competitors', async (req: Request, res: Response) => {
  try {
    const competitors = await prisma.competitor.findMany({
      where: { auditJobId: req.params.id },
      orderBy: { organicKeywords: 'desc' },
    });

    return res.json({ data: competitors });
  } catch (err) {
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch competitors' });
  }
});

// ── GET /audit/:id/report ──────────────────────────────────────────────────────

router.get('/:id/report', async (req: Request, res: Response) => {
  try {
    const report = await prisma.auditReport.findUnique({
      where: { auditJobId: req.params.id },
      include: { auditJob: { select: { url: true, domain: true, overallScore: true } } },
    });

    if (!report) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Report not ready yet' });
    }

    return res.json(report);
  } catch (err) {
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch report' });
  }
});

// ── GET /audit (list recent audits) ───────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const { page = '1', pageSize = '10' } = req.query;

    const [jobs, total] = await Promise.all([
      prisma.auditJob.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        select: {
          id: true,
          url: true,
          domain: true,
          status: true,
          progress: true,
          overallScore: true,
          pagesCrawled: true,
          totalIssues: true,
          criticalIssues: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      prisma.auditJob.count(),
    ]);

    return res.json({
      data: jobs,
      total,
      page: Number(page),
      pageSize: Number(pageSize),
      totalPages: Math.ceil(total / Number(pageSize)),
    });
  } catch (err) {
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch audits' });
  }
});

export default router;
