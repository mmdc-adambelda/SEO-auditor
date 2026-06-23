import { SCORE_WEIGHTS, GRADE_THRESHOLDS, ReportGrade } from '@seo-auditor/shared';
import type { TechnicalAuditResult } from './technical-audit';
import type { OnPageAuditResult } from './onpage-audit';

export interface AuditScores {
  overall: number;
  technical: number;
  content: number;
  performance: number;
  authority: number;
  ux: number;
  grade: ReportGrade;
}

export class ScoringEngine {
  calculate(params: {
    technicalResult: TechnicalAuditResult;
    onPageResult: OnPageAuditResult;
    cwvScore: number | null;
    pagesCrawled: number;
    hasHttps: boolean;
    hasSitemap: boolean;
    hasRobotsTxt: boolean;
  }): AuditScores {
    const technical = this.calcTechnicalScore(params);
    const content = this.calcContentScore(params.onPageResult);
    const performance = this.calcPerformanceScore(params.cwvScore, params.technicalResult);
    const authority = this.calcAuthorityScore(params);
    const ux = this.calcUXScore(params);

    const overall = Math.round(
      technical * SCORE_WEIGHTS.technical +
        content * SCORE_WEIGHTS.content +
        performance * SCORE_WEIGHTS.performance +
        authority * SCORE_WEIGHTS.authority +
        ux * SCORE_WEIGHTS.ux
    );

    return {
      overall: Math.min(100, Math.max(0, overall)),
      technical: Math.min(100, Math.max(0, Math.round(technical))),
      content: Math.min(100, Math.max(0, Math.round(content))),
      performance: Math.min(100, Math.max(0, Math.round(performance))),
      authority: Math.min(100, Math.max(0, Math.round(authority))),
      ux: Math.min(100, Math.max(0, Math.round(ux))),
      grade: this.scoreToGrade(overall),
    };
  }

  private calcTechnicalScore(params: {
    technicalResult: TechnicalAuditResult;
    hasHttps: boolean;
    hasSitemap: boolean;
    hasRobotsTxt: boolean;
  }): number {
    let score = params.technicalResult.score;

    // Bonus for good practices
    if (params.hasHttps) score = Math.min(100, score + 2);
    if (params.hasSitemap) score = Math.min(100, score + 1);
    if (params.hasRobotsTxt) score = Math.min(100, score + 1);

    return score;
  }

  private calcContentScore(onPageResult: OnPageAuditResult): number {
    return onPageResult.avgScore;
  }

  private calcPerformanceScore(
    cwvScore: number | null,
    technicalResult: TechnicalAuditResult
  ): number {
    // Count performance issues
    const { IssueSeverity } = require('@seo-auditor/shared');
    const perfIssues = technicalResult.issues.filter(
      (i: { category: string }) => i.category === 'PERFORMANCE'
    );

    let baseScore = cwvScore ?? 60; // Default to 60 if no CWV data

    const perfPenalty = perfIssues.reduce((sum: number, issue: { severity: string; count: number; impactScore: number }) => {
      const mult =
        issue.severity === 'CRITICAL'
          ? 1.0
          : issue.severity === 'HIGH'
          ? 0.7
          : 0.3;
      return sum + issue.impactScore * mult;
    }, 0);

    return Math.max(0, baseScore - perfPenalty * 0.5);
  }

  private calcAuthorityScore(params: {
    pagesCrawled: number;
    technicalResult: TechnicalAuditResult;
    hasHttps: boolean;
  }): number {
    // Authority score is a proxy without external data
    // Based on: HTTPS, structured data presence, technical health
    let score = 50; // Base authority

    if (params.hasHttps) score += 15;

    const criticalCount = params.technicalResult.summary.critical;
    const highCount = params.technicalResult.summary.high;

    score -= criticalCount * 5;
    score -= highCount * 2;

    // More pages = slightly more authority signal
    if (params.pagesCrawled > 100) score += 5;
    if (params.pagesCrawled > 500) score += 5;

    return Math.max(10, Math.min(100, score));
  }

  private calcUXScore(params: {
    technicalResult: TechnicalAuditResult;
    onPageResult: OnPageAuditResult;
    cwvScore: number | null;
  }): number {
    let score = 70;

    // Viewport issues hurt UX
    const viewportIssues = params.technicalResult.issues.filter(
      (i) => i.type === 'MISSING_VIEWPORT'
    );
    if (viewportIssues.length > 0) score -= 20;

    // CWV directly impacts UX
    if (params.cwvScore !== null) {
      score = score * 0.4 + params.cwvScore * 0.6;
    }

    // Average readability
    const avgOnPage = params.onPageResult.avgScore;
    score = score * 0.7 + avgOnPage * 0.3;

    return Math.max(0, Math.min(100, score));
  }

  scoreToGrade(score: number): ReportGrade {
    if (score >= GRADE_THRESHOLDS.A_PLUS) return ReportGrade.A_PLUS;
    if (score >= GRADE_THRESHOLDS.A) return ReportGrade.A;
    if (score >= GRADE_THRESHOLDS.B_PLUS) return ReportGrade.B_PLUS;
    if (score >= GRADE_THRESHOLDS.B) return ReportGrade.B;
    if (score >= GRADE_THRESHOLDS.C_PLUS) return ReportGrade.C_PLUS;
    if (score >= GRADE_THRESHOLDS.C) return ReportGrade.C;
    if (score >= GRADE_THRESHOLDS.D) return ReportGrade.D;
    return ReportGrade.F;
  }
}
