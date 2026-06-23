import type { CrawledPageData } from './crawler';
import {
  TITLE_MIN_LENGTH,
  TITLE_MAX_LENGTH,
  META_DESC_MIN_LENGTH,
  META_DESC_MAX_LENGTH,
  MIN_WORD_COUNT,
  OPTIMAL_WORD_COUNT,
} from '@seo-auditor/shared';
import { IssueType, IssueCategory, IssueSeverity } from '@seo-auditor/shared';

export interface PageAnalysisResult {
  pageId?: string;
  url: string;
  score: number;
  titleScore: number;
  metaScore: number;
  headerScore: number;
  contentScore: number;
  imageScore: number;
  linkScore: number;
  issues: Array<{
    type: IssueType;
    severity: IssueSeverity;
    category: IssueCategory;
    title: string;
    description: string;
    recommendation: string;
    value?: string;
  }>;
}

export interface OnPageAuditResult {
  pages: PageAnalysisResult[];
  avgScore: number;
  distribution: { range: string; count: number }[];
}

export class OnPageAuditService {
  audit(pages: CrawledPageData[]): OnPageAuditResult {
    const htmlPages = pages.filter(
      (p) => p.statusCode === 200 && p.contentType?.includes('text/html')
    );

    const results: PageAnalysisResult[] = htmlPages.map((page) =>
      this.analyzePage(page)
    );

    const avgScore =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.score, 0) / results.length
        : 0;

    const distribution = this.buildDistribution(results);

    return { pages: results, avgScore: Math.round(avgScore * 10) / 10, distribution };
  }

  private analyzePage(page: CrawledPageData): PageAnalysisResult {
    const issues: PageAnalysisResult['issues'] = [];

    const titleScore = this.scoreTitleTag(page, issues);
    const metaScore = this.scoreMetaDescription(page, issues);
    const headerScore = this.scoreHeaders(page, issues);
    const contentScore = this.scoreContent(page, issues);
    const imageScore = this.scoreImages(page, issues);
    const linkScore = this.scoreLinks(page, issues);

    // Weighted overall score
    const score =
      titleScore * 0.25 +
      metaScore * 0.15 +
      headerScore * 0.15 +
      contentScore * 0.25 +
      imageScore * 0.10 +
      linkScore * 0.10;

    return {
      url: page.url,
      score: Math.round(score * 10) / 10,
      titleScore,
      metaScore,
      headerScore,
      contentScore,
      imageScore,
      linkScore,
      issues,
    };
  }

  private scoreTitleTag(page: CrawledPageData, issues: PageAnalysisResult['issues']): number {
    if (!page.title) {
      issues.push({
        type: IssueType.MISSING_TITLE,
        severity: IssueSeverity.CRITICAL,
        category: IssueCategory.ON_PAGE,
        title: 'Missing title tag',
        description: 'This page has no title tag.',
        recommendation: 'Add a descriptive title tag between 50-60 characters that includes the primary keyword near the beginning.',
      });
      return 0;
    }

    let score = 100;

    if (page.titleLength > TITLE_MAX_LENGTH) {
      score -= 25;
      issues.push({
        type: IssueType.TITLE_TOO_LONG,
        severity: IssueSeverity.MEDIUM,
        category: IssueCategory.ON_PAGE,
        title: 'Title tag too long',
        description: `Title is ${page.titleLength} characters (max ${TITLE_MAX_LENGTH}).`,
        recommendation: `Shorten the title to under ${TITLE_MAX_LENGTH} characters. Current: "${page.title}"`,
        value: page.title,
      });
    } else if (page.titleLength < TITLE_MIN_LENGTH) {
      score -= 20;
      issues.push({
        type: IssueType.TITLE_TOO_SHORT,
        severity: IssueSeverity.LOW,
        category: IssueCategory.ON_PAGE,
        title: 'Title tag too short',
        description: `Title is only ${page.titleLength} characters (recommended: ${TITLE_MIN_LENGTH}-${TITLE_MAX_LENGTH}).`,
        recommendation: `Expand the title to include more descriptive keywords. Current: "${page.title}"`,
        value: page.title,
      });
    }

    return Math.max(0, score);
  }

  private scoreMetaDescription(
    page: CrawledPageData,
    issues: PageAnalysisResult['issues']
  ): number {
    if (!page.metaDescription) {
      issues.push({
        type: IssueType.MISSING_META_DESCRIPTION,
        severity: IssueSeverity.HIGH,
        category: IssueCategory.ON_PAGE,
        title: 'Missing meta description',
        description: 'This page has no meta description.',
        recommendation: 'Write a compelling meta description of 120-155 characters that summarizes the page and includes the primary keyword.',
      });
      return 0;
    }

    let score = 100;

    if (page.metaDescLength > META_DESC_MAX_LENGTH) {
      score -= 30;
      issues.push({
        type: IssueType.META_DESCRIPTION_TOO_LONG,
        severity: IssueSeverity.LOW,
        category: IssueCategory.ON_PAGE,
        title: 'Meta description too long',
        description: `Meta description is ${page.metaDescLength} characters. Google truncates at ~160.`,
        recommendation: `Trim the meta description to under ${META_DESC_MAX_LENGTH} characters.`,
        value: page.metaDescription,
      });
    } else if (page.metaDescLength < META_DESC_MIN_LENGTH) {
      score -= 20;
      issues.push({
        type: IssueType.META_DESCRIPTION_TOO_SHORT,
        severity: IssueSeverity.LOW,
        category: IssueCategory.ON_PAGE,
        title: 'Meta description too short',
        description: `Meta description is only ${page.metaDescLength} characters. Aim for ${META_DESC_MIN_LENGTH}-${META_DESC_MAX_LENGTH}.`,
        recommendation: 'Expand the meta description with more detail to improve CTR.',
        value: page.metaDescription,
      });
    }

    return Math.max(0, score);
  }

  private scoreHeaders(
    page: CrawledPageData,
    issues: PageAnalysisResult['issues']
  ): number {
    let score = 100;

    if (page.h1Count === 0) {
      score -= 40;
      issues.push({
        type: IssueType.MISSING_H1,
        severity: IssueSeverity.HIGH,
        category: IssueCategory.ON_PAGE,
        title: 'Missing H1 heading',
        description: 'No H1 tag found on this page.',
        recommendation: 'Add a single H1 heading that includes your primary keyword. It should clearly describe what the page is about.',
      });
    } else if (page.h1Count > 1) {
      score -= 15;
      issues.push({
        type: IssueType.MULTIPLE_H1,
        severity: IssueSeverity.MEDIUM,
        category: IssueCategory.ON_PAGE,
        title: 'Multiple H1 headings',
        description: `Found ${page.h1Count} H1 tags. Best practice is one H1 per page.`,
        recommendation: 'Reduce to a single H1 and use H2/H3 for subheadings.',
      });
    }

    if (page.h2Count === 0 && (page.wordCount || 0) > 300) {
      score -= 10;
    }

    return Math.max(0, score);
  }

  private scoreContent(
    page: CrawledPageData,
    issues: PageAnalysisResult['issues']
  ): number {
    let score = 100;
    const wordCount = page.wordCount || 0;

    if (wordCount < MIN_WORD_COUNT) {
      const penalty = wordCount < 100 ? 50 : 30;
      score -= penalty;
      issues.push({
        type: IssueType.LOW_WORD_COUNT,
        severity: wordCount < 100 ? IssueSeverity.HIGH : IssueSeverity.MEDIUM,
        category: IssueCategory.CONTENT,
        title: 'Thin content',
        description: `Page has only ${wordCount} words. Minimum recommended: ${MIN_WORD_COUNT}.`,
        recommendation: `Expand the page content to at least ${OPTIMAL_WORD_COUNT} words with comprehensive, helpful information.`,
        value: String(wordCount),
      });
    } else if (wordCount < OPTIMAL_WORD_COUNT) {
      score -= 10;
    }

    // Readability bonus/penalty
    const readability = page.readabilityScore || 50;
    if (readability < 30) {
      score -= 15; // Very hard to read
    } else if (readability > 60) {
      score += 5; // Easy to read bonus
    }

    return Math.max(0, Math.min(100, score));
  }

  private scoreImages(
    page: CrawledPageData,
    issues: PageAnalysisResult['issues']
  ): number {
    if (!page.totalImages || page.totalImages === 0) return 80;

    let score = 100;
    const missingAlt = page.imagesWithoutAlt || 0;

    if (missingAlt > 0) {
      const ratio = missingAlt / page.totalImages;
      const penalty = Math.round(ratio * 40);
      score -= penalty;

      issues.push({
        type: IssueType.MISSING_ALT_TEXT,
        severity: ratio > 0.5 ? IssueSeverity.HIGH : IssueSeverity.MEDIUM,
        category: IssueCategory.IMAGES,
        title: 'Images missing alt text',
        description: `${missingAlt} of ${page.totalImages} images are missing alt attributes.`,
        recommendation: 'Add descriptive alt text to all images. Include relevant keywords naturally but avoid keyword stuffing.',
        value: `${missingAlt}/${page.totalImages}`,
      });
    }

    return Math.max(0, score);
  }

  private scoreLinks(
    page: CrawledPageData,
    issues: PageAnalysisResult['issues']
  ): number {
    let score = 100;

    const internalLinks = page.internalLinks?.length || 0;
    const brokenLinks = page.brokenLinks || 0;

    if (brokenLinks > 0) {
      score -= Math.min(40, brokenLinks * 10);
      issues.push({
        type: IssueType.BROKEN_LINK,
        severity: IssueSeverity.HIGH,
        category: IssueCategory.LINKS,
        title: 'Broken internal links',
        description: `Found ${brokenLinks} broken link(s) on this page.`,
        recommendation: 'Fix or remove broken links. They waste crawl budget and harm user experience.',
        value: String(brokenLinks),
      });
    }

    if (internalLinks === 0 && (page.wordCount || 0) > MIN_WORD_COUNT) {
      score -= 15;
    }

    if (page.linkDepth && page.linkDepth > 4) {
      score -= 10;
    }

    return Math.max(0, score);
  }

  private buildDistribution(results: PageAnalysisResult[]): { range: string; count: number }[] {
    const ranges = [
      { range: '90-100', min: 90, max: 100 },
      { range: '70-89', min: 70, max: 89 },
      { range: '50-69', min: 50, max: 69 },
      { range: '30-49', min: 30, max: 49 },
      { range: '0-29', min: 0, max: 29 },
    ];

    return ranges.map(({ range, min, max }) => ({
      range,
      count: results.filter((r) => r.score >= min && r.score <= max).length,
    }));
  }
}
