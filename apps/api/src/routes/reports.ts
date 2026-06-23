import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';
import { config } from '../config';

const router = Router();

// ── GET /reports/:jobId/:filename ──────────────────────────────────────────────

router.get('/:jobId/:filename', async (req: Request, res: Response) => {
  const { jobId, filename } = req.params;

  // Validate jobId exists and audit is complete
  const report = await prisma.auditReport.findUnique({
    where: { auditJobId: jobId },
  });

  if (!report) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Report not found' });
  }

  // Security: prevent path traversal
  const safeFilename = path.basename(filename);
  const filePath = path.join(config.STORAGE_PATH, 'reports', jobId, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Report file not found' });
  }

  const ext = path.extname(safeFilename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.csv': 'text/csv',
    '.json': 'application/json',
  };

  res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="seo-audit-${jobId}${ext}"`
  );

  fs.createReadStream(filePath).pipe(res);
});

export default router;
