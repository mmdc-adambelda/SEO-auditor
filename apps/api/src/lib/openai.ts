import OpenAI from 'openai';
import { config } from '../config';
import { logger } from './logger';
import type { TechnicalIssueData } from '../services/technical-audit';
import { IssueSeverity } from '@seo-auditor/shared';

export interface EnrichedIssue extends TechnicalIssueData {
  recommendation: string;
  businessImpact: string;
  seoImpact: string;
  implementationSteps: string[];
  estimatedImpact: string;
}

export interface ExecutiveSummary {
  summary: string;
  keyFindings: string[];
  priorityActions: string[];
  opportunityStatement: string;
}

export class OpenAIService {
  private client: OpenAI | null = null;

  constructor() {
    if (config.OPENAI_API_KEY) {
      this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
    }
  }

  async enrichIssues(
    issues: TechnicalIssueData[],
    domain: string
  ): Promise<EnrichedIssue[]> {
    if (!this.client) {
      logger.warn('OpenAI not configured — returning issues without AI enrichment');
      return issues.map((issue) => this.buildDefaultEnrichment(issue));
    }

    // Only enrich critical and high severity issues (cost control)
    const toEnrich = issues.filter(
      (i) =>
        i.severity === IssueSeverity.CRITICAL || i.severity === IssueSeverity.HIGH
    );
    const others = issues.filter(
      (i) =>
        i.severity !== IssueSeverity.CRITICAL && i.severity !== IssueSeverity.HIGH
    );

    const enrichedBatch = await this.batchEnrichIssues(toEnrich, domain);
    const defaultOthers = others.map((i) => this.buildDefaultEnrichment(i));

    return [...enrichedBatch, ...defaultOthers];
  }

  private async batchEnrichIssues(
    issues: TechnicalIssueData[],
    domain: string
  ): Promise<EnrichedIssue[]> {
    if (issues.length === 0) return [];

    // Process in batches of 5 to manage API calls
    const batchSize = 5;
    const results: EnrichedIssue[] = [];

    for (let i = 0; i < issues.length; i += batchSize) {
      const batch = issues.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map((issue) => this.enrichSingleIssue(issue, domain))
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push(this.buildDefaultEnrichment(batch[j]));
        }
      }
    }

    return results;
  }

  private async enrichSingleIssue(
    issue: TechnicalIssueData,
    domain: string
  ): Promise<EnrichedIssue> {
    const prompt = `You are an expert SEO consultant. For the website "${domain}", provide a concise SEO remediation for this issue:

Issue Type: ${issue.type}
Category: ${issue.category}
Severity: ${issue.severity}
Title: ${issue.title}
Description: ${issue.description}
Affected URLs: ${issue.affectedUrls.slice(0, 3).join(', ')}
Count: ${issue.count} page(s) affected

Respond with JSON only:
{
  "recommendation": "2-3 sentence technical recommendation",
  "businessImpact": "1-2 sentence business impact statement",
  "seoImpact": "1-2 sentence SEO impact statement",
  "implementationSteps": ["step 1", "step 2", "step 3", "step 4"],
  "estimatedImpact": "e.g., +5-15% organic traffic in 3-6 months"
}`;

    const response = await this.client!.chat.completions.create({
      model: config.OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return this.buildDefaultEnrichment(issue);

    try {
      const enrichment = JSON.parse(content);
      return {
        ...issue,
        recommendation: enrichment.recommendation || issue.description,
        businessImpact: enrichment.businessImpact || 'Affects user experience and search visibility.',
        seoImpact: enrichment.seoImpact || 'May impact search rankings and crawlability.',
        implementationSteps: Array.isArray(enrichment.implementationSteps)
          ? enrichment.implementationSteps
          : [],
        estimatedImpact: enrichment.estimatedImpact || 'Improvement expected after fix.',
      };
    } catch {
      return this.buildDefaultEnrichment(issue);
    }
  }

  async generateExecutiveSummary(params: {
    domain: string;
    overallScore: number;
    technicalScore: number;
    contentScore: number;
    performanceScore: number;
    criticalIssues: number;
    highIssues: number;
    pagesCrawled: number;
    topKeywords: number;
    competitors: number;
  }): Promise<ExecutiveSummary> {
    if (!this.client) {
      return this.buildDefaultSummary(params);
    }

    const prompt = `You are an SEO expert. Generate a concise executive summary for this SEO audit:

Domain: ${params.domain}
Overall SEO Score: ${params.overallScore}/100
Technical Score: ${params.technicalScore}/100
Content Score: ${params.contentScore}/100
Performance Score: ${params.performanceScore}/100
Critical Issues: ${params.criticalIssues}
High Priority Issues: ${params.highIssues}
Pages Crawled: ${params.pagesCrawled}
Keyword Opportunities: ${params.topKeywords}
Competitors Analyzed: ${params.competitors}

Respond with JSON only:
{
  "summary": "3-4 sentence executive overview",
  "keyFindings": ["finding 1", "finding 2", "finding 3", "finding 4"],
  "priorityActions": ["action 1", "action 2", "action 3"],
  "opportunityStatement": "2-3 sentence growth opportunity statement"
}`;

    try {
      const response = await this.client.chat.completions.create({
        model: config.OPENAI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.5,
        max_tokens: 600,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return this.buildDefaultSummary(params);

      const result = JSON.parse(content);
      return {
        summary: result.summary || '',
        keyFindings: result.keyFindings || [],
        priorityActions: result.priorityActions || [],
        opportunityStatement: result.opportunityStatement || '',
      };
    } catch (err) {
      logger.error('OpenAI summary generation failed', { err });
      return this.buildDefaultSummary(params);
    }
  }

  async generateContentRecommendations(params: {
    domain: string;
    topKeywords: Array<{ keyword: string; searchVolume: number; difficulty: number }>;
    competitorTopics: string[];
  }): Promise<string[]> {
    if (!this.client) {
      return [
        'Create comprehensive pillar pages around your core topics',
        'Develop a content cluster strategy linking related articles',
        'Target long-tail question keywords with FAQ content',
        'Build topic authority with in-depth guides and case studies',
      ];
    }

    const prompt = `SEO content strategy for ${params.domain}.
Top keyword opportunities: ${params.topKeywords.slice(0, 5).map((k) => k.keyword).join(', ')}
Competitor topics: ${params.competitorTopics.slice(0, 5).join(', ')}

Give 5 specific, actionable content recommendations as a JSON array of strings.`;

    try {
      const response = await this.client.chat.completions.create({
        model: config.OPENAI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.6,
        max_tokens: 400,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return [];

      const result = JSON.parse(content);
      return Array.isArray(result.recommendations) ? result.recommendations : [];
    } catch {
      return [];
    }
  }

  private buildDefaultEnrichment(issue: TechnicalIssueData): EnrichedIssue {
    const defaultSteps: Record<string, string[]> = {
      MISSING_TITLE: [
        'Identify all pages missing title tags using the affected URLs list',
        'Write unique, descriptive titles for each page',
        'Include the primary keyword near the beginning of the title',
        'Keep titles between 50-60 characters',
        'Deploy changes and verify with a follow-up crawl',
      ],
      DUPLICATE_TITLE: [
        'Export the list of duplicate title pages',
        'Identify which page should be the canonical version',
        'Write unique titles for all duplicate pages',
        'Add canonical tags where appropriate',
      ],
      MISSING_META_DESCRIPTION: [
        'Compile all pages missing meta descriptions',
        'Write compelling, unique descriptions for each page',
        'Include the primary keyword and a call-to-action',
        'Keep descriptions between 120-155 characters',
      ],
      MISSING_H1: [
        'Identify all pages missing H1 tags',
        'Add a single H1 per page that includes the primary keyword',
        'Ensure the H1 differs from the title tag but is related',
        'Update content management system templates if systematic',
      ],
    };

    return {
      ...issue,
      recommendation: issue.description,
      businessImpact:
        'Fixing this issue can improve search visibility and organic traffic.',
      seoImpact:
        `This ${issue.severity.toLowerCase()} severity issue affects your SEO performance.`,
      implementationSteps:
        defaultSteps[issue.type] || [
          'Review all affected URLs listed',
          'Implement the recommended fix on each page',
          'Re-crawl the website to verify the fix',
          'Monitor rankings for improvement over 4-6 weeks',
        ],
      estimatedImpact: 'Improvement expected within 4-8 weeks of fixing.',
    };
  }

  private buildDefaultSummary(params: {
    domain: string;
    overallScore: number;
    technicalScore: number;
    contentScore: number;
    performanceScore: number;
    criticalIssues: number;
    highIssues: number;
    pagesCrawled: number;
    topKeywords: number;
    competitors: number;
  }): ExecutiveSummary {
    const grade =
      params.overallScore >= 90
        ? 'excellent'
        : params.overallScore >= 70
        ? 'good'
        : params.overallScore >= 50
        ? 'moderate'
        : 'poor';

    return {
      summary: `${params.domain} has a ${grade} overall SEO score of ${params.overallScore}/100. The audit of ${params.pagesCrawled} pages revealed ${params.criticalIssues} critical and ${params.highIssues} high-priority issues that need immediate attention. Technical SEO scored ${params.technicalScore}/100 with content scoring ${params.contentScore}/100.`,
      keyFindings: [
        `${params.criticalIssues} critical SEO issues require immediate attention`,
        `Technical health score: ${params.technicalScore}/100`,
        `Content quality score: ${params.contentScore}/100`,
        `${params.topKeywords} keyword opportunities identified`,
        `${params.competitors} competitors analyzed for gap opportunities`,
      ],
      priorityActions: [
        'Fix all critical and high severity technical issues',
        'Optimize title tags and meta descriptions for missing pages',
        'Improve Core Web Vitals performance scores',
      ],
      opportunityStatement: `With ${params.topKeywords} identified keyword opportunities, ${params.domain} has significant potential to increase organic traffic. Prioritizing the ${params.criticalIssues + params.highIssues} critical and high-priority fixes could improve search rankings within 3-6 months.`,
    };
  }
}
