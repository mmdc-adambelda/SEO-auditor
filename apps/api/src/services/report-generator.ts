import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from '../lib/logger';
import { ReportGrade, IssueSeverity } from '@seo-auditor/shared';
import type { AuditScores } from './scoring-engine';
import type { TechnicalIssueData } from './technical-audit';
import type { KeywordOpportunityData } from '@seo-auditor/shared';

export interface ReportData {
  jobId: string;
  domain: string;
  url: string;
  scores: AuditScores;
  issues: TechnicalIssueData[];
  keywords: KeywordOpportunityData[];
  executiveSummary: string;
  pagesCrawled: number;
  crawledAt: Date;
}

export interface ReportPaths {
  pdf: string;
  csv: string;
  json: string;
}

export class ReportGeneratorService {
  private storagePath: string;

  constructor() {
    this.storagePath = config.STORAGE_PATH;
    this.ensureStorageDir();
  }

  private ensureStorageDir(): void {
    const dirs = [
      this.storagePath,
      path.join(this.storagePath, 'reports'),
    ];
    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
  }

  async generate(data: ReportData): Promise<ReportPaths> {
    const [pdfPath, csvPath, jsonPath] = await Promise.all([
      this.generatePDF(data),
      this.generateCSV(data),
      this.generateJSON(data),
    ]);

    return { pdf: pdfPath, csv: csvPath, json: jsonPath };
  }

  private getReportDir(jobId: string): string {
    const dir = path.join(this.storagePath, 'reports', jobId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private async generatePDF(data: ReportData): Promise<string> {
    const filePath = path.join(this.getReportDir(data.jobId), 'report.pdf');

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // ── Header ────────────────────────────────────────────────────────────
      doc.fontSize(28).fillColor('#1a1a2e').text('SEO Audit Report', { align: 'center' });
      doc.fontSize(14).fillColor('#666').text(data.domain, { align: 'center' });
      doc.fontSize(10).fillColor('#999').text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
      doc.moveDown(2);

      // ── Overall Score ──────────────────────────────────────────────────────
      const gradeDisplay = this.gradeToDisplay(data.scores.grade);
      doc.fontSize(18).fillColor('#1a1a2e').text(`Overall SEO Score: ${data.scores.overall}/100 (Grade: ${gradeDisplay})`);
      doc.moveDown(0.5);

      // ── Score Breakdown ────────────────────────────────────────────────────
      doc.fontSize(14).fillColor('#1a1a2e').text('Score Breakdown');
      doc.moveDown(0.3);

      const scoreItems = [
        { label: 'Technical SEO', score: data.scores.technical },
        { label: 'Content SEO', score: data.scores.content },
        { label: 'Performance', score: data.scores.performance },
        { label: 'Authority', score: data.scores.authority },
        { label: 'User Experience', score: data.scores.ux },
      ];

      scoreItems.forEach(({ label, score }) => {
        const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
        doc.fontSize(11).fillColor('#333').text(`${label}: `, { continued: true });
        doc.fillColor(color).text(`${score}/100`);
      });

      doc.moveDown(1);

      // ── Executive Summary ──────────────────────────────────────────────────
      doc.fontSize(14).fillColor('#1a1a2e').text('Executive Summary');
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#444').text(data.executiveSummary);
      doc.moveDown(1);

      // ── Critical Issues ────────────────────────────────────────────────────
      const criticalIssues = data.issues.filter((i) => i.severity === IssueSeverity.CRITICAL);
      const highIssues = data.issues.filter((i) => i.severity === IssueSeverity.HIGH);

      if (criticalIssues.length > 0) {
        doc.fontSize(14).fillColor('#ef4444').text(`Critical Issues (${criticalIssues.length})`);
        doc.moveDown(0.3);

        criticalIssues.slice(0, 10).forEach((issue) => {
          doc.fontSize(11).fillColor('#333').text(`• ${issue.title}`);
          doc.fontSize(9).fillColor('#666').text(`  ${issue.description.slice(0, 150)}...`);
          if (issue.recommendation) {
            doc.fontSize(9).fillColor('#0066cc').text(`  Fix: ${issue.recommendation.slice(0, 100)}...`);
          }
          doc.moveDown(0.3);
        });
        doc.moveDown(0.5);
      }

      if (highIssues.length > 0) {
        doc.fontSize(14).fillColor('#f59e0b').text(`High Priority Issues (${highIssues.length})`);
        doc.moveDown(0.3);

        highIssues.slice(0, 10).forEach((issue) => {
          doc.fontSize(11).fillColor('#333').text(`• ${issue.title}`);
          doc.fontSize(9).fillColor('#666').text(`  ${issue.description.slice(0, 150)}`);
          doc.moveDown(0.3);
        });
        doc.moveDown(0.5);
      }

      // ── Keyword Opportunities ──────────────────────────────────────────────
      const topKeywords = data.keywords
        .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0))
        .slice(0, 10);

      if (topKeywords.length > 0) {
        doc.addPage();
        doc.fontSize(14).fillColor('#1a1a2e').text('Top Keyword Opportunities');
        doc.moveDown(0.5);

        topKeywords.forEach((kw, idx) => {
          doc.fontSize(10).fillColor('#333')
            .text(`${idx + 1}. ${kw.keyword}`, { continued: true })
            .fillColor('#666')
            .text(` | Volume: ${kw.searchVolume?.toLocaleString() || 'N/A'} | Difficulty: ${kw.difficulty || 'N/A'} | Score: ${kw.opportunityScore || 'N/A'}`);
        });
        doc.moveDown(1);
      }

      // ── Footer ────────────────────────────────────────────────────────────
      doc.fontSize(8).fillColor('#999').text(
        `SEO Auditor Report | ${data.pagesCrawled} pages crawled | ${data.issues.length} issues found`,
        50,
        doc.page.height - 50,
        { align: 'center' }
      );

      doc.end();
      stream.on('finish', () => resolve(filePath));
      stream.on('error', reject);
    });
  }

  private async generateCSV(data: ReportData): Promise<string> {
    const filePath = path.join(this.getReportDir(data.jobId), 'issues.csv');

    const header = 'Type,Category,Severity,Title,Affected URLs,Count,Impact Score\n';
    const rows = data.issues
      .map((issue) =>
        [
          issue.type,
          issue.category,
          issue.severity,
          `"${issue.title.replace(/"/g, '""')}"`,
          `"${issue.affectedUrls.slice(0, 3).join('; ')}"`,
          issue.count,
          issue.impactScore,
        ].join(',')
      )
      .join('\n');

    fs.writeFileSync(filePath, header + rows, 'utf-8');
    return filePath;
  }

  private async generateJSON(data: ReportData): Promise<string> {
    const filePath = path.join(this.getReportDir(data.jobId), 'report.json');

    const report = {
      meta: {
        jobId: data.jobId,
        domain: data.domain,
        url: data.url,
        generatedAt: new Date().toISOString(),
        pagesCrawled: data.pagesCrawled,
      },
      scores: data.scores,
      summary: data.executiveSummary,
      issues: {
        total: data.issues.length,
        critical: data.issues.filter((i) => i.severity === IssueSeverity.CRITICAL).length,
        high: data.issues.filter((i) => i.severity === IssueSeverity.HIGH).length,
        medium: data.issues.filter((i) => i.severity === IssueSeverity.MEDIUM).length,
        low: data.issues.filter((i) => i.severity === IssueSeverity.LOW).length,
        items: data.issues,
      },
      keywords: data.keywords,
    };

    fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
    return filePath;
  }

  private gradeToDisplay(grade: ReportGrade): string {
    const map: Record<ReportGrade, string> = {
      [ReportGrade.A_PLUS]: 'A+',
      [ReportGrade.A]: 'A',
      [ReportGrade.B_PLUS]: 'B+',
      [ReportGrade.B]: 'B',
      [ReportGrade.C_PLUS]: 'C+',
      [ReportGrade.C]: 'C',
      [ReportGrade.D]: 'D',
      [ReportGrade.F]: 'F',
    };
    return map[grade] || 'F';
  }

  getReportUrl(jobId: string, type: 'pdf' | 'csv' | 'json'): string {
    const ext = type === 'pdf' ? 'pdf' : type === 'csv' ? 'issues.csv' : 'report.json';
    return `/api/v1/reports/${jobId}/${ext}`;
  }
}
