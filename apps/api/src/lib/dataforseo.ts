import axios from 'axios';
import { config } from '../config';
import { logger } from './logger';
import {
  KeywordIntent,
  KeywordType,
  OpportunityCategory,
  QUICK_WIN_MAX_DIFFICULTY,
  QUICK_WIN_MIN_VOLUME,
  HIGH_VALUE_MIN_VOLUME,
  HIGH_VALUE_MAX_DIFFICULTY,
} from '@seo-auditor/shared';
import type { KeywordOpportunityData, CompetitorData } from '@seo-auditor/shared';

const DFS_BASE = 'https://api.dataforseo.com/v3';

interface DFSKeyword {
  keyword: string;
  search_volume: number;
  keyword_difficulty: number;
  cpc: number;
  search_intent_info?: {
    main_intent: string;
  };
  monthly_searches?: Array<{ month: number; year: number; search_volume: number }>;
}

interface DFSCompetitor {
  domain: string;
  avg_position: number;
  sum_position: number;
  intersections: number;
  se_keywords: number;
  relevant_serp_items?: number;
}

export class DataForSEOService {
  private authHeader: string;

  constructor() {
    const login = config.DATAFORSEO_LOGIN || '';
    const password = config.DATAFORSEO_PASSWORD || '';
    this.authHeader = `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
  }

  private get headers() {
    return {
      Authorization: this.authHeader,
      'Content-Type': 'application/json',
    };
  }

  async getKeywordOpportunities(
    domain: string,
    seedKeywords?: string[]
  ): Promise<KeywordOpportunityData[]> {
    if (!config.DATAFORSEO_LOGIN) {
      logger.warn('DataForSEO not configured — returning mock keyword data');
      return this.getMockKeywords(domain);
    }

    try {
      // Get keywords for domain
      const domainKeywords = await this.getDomainKeywords(domain);

      // Get suggestions for seed keywords
      const suggestions = seedKeywords?.length
        ? await this.getKeywordSuggestions(seedKeywords)
        : [];

      const allKeywords = [...domainKeywords, ...suggestions];
      return this.processKeywords(allKeywords, domain);
    } catch (err) {
      logger.error('DataForSEO keyword fetch failed', { err });
      return this.getMockKeywords(domain);
    }
  }

  async getCompetitors(domain: string): Promise<CompetitorData[]> {
    if (!config.DATAFORSEO_LOGIN) {
      logger.warn('DataForSEO not configured — returning mock competitor data');
      return this.getMockCompetitors(domain);
    }

    try {
      const response = await axios.post(
        `${DFS_BASE}/dataforseo_labs/google/competitors_domain/live`,
        [{ target: domain, language_name: 'English', location_name: 'United States', limit: 10 }],
        { headers: this.headers, timeout: 30000 }
      );

      const competitors: DFSCompetitor[] =
        response.data?.tasks?.[0]?.result?.[0]?.items ?? [];

      return competitors.slice(0, 5).map((c, idx) =>
        this.buildCompetitorData(c, domain, idx)
      );
    } catch (err) {
      logger.error('DataForSEO competitor fetch failed', { err });
      return this.getMockCompetitors(domain);
    }
  }

  private async getDomainKeywords(domain: string): Promise<DFSKeyword[]> {
    const response = await axios.post(
      `${DFS_BASE}/dataforseo_labs/google/ranked_keywords/live`,
      [
        {
          target: domain,
          language_name: 'English',
          location_name: 'United States',
          limit: 100,
          filters: ['keyword_difficulty', '<', 70],
        },
      ],
      { headers: this.headers, timeout: 30000 }
    );

    return response.data?.tasks?.[0]?.result?.[0]?.items?.map(
      (item: { keyword_data: DFSKeyword }) => item.keyword_data
    ) ?? [];
  }

  private async getKeywordSuggestions(seeds: string[]): Promise<DFSKeyword[]> {
    const response = await axios.post(
      `${DFS_BASE}/dataforseo_labs/google/keyword_suggestions/live`,
      seeds.slice(0, 5).map((keyword) => ({
        keyword,
        language_name: 'English',
        location_name: 'United States',
        limit: 30,
      })),
      { headers: this.headers, timeout: 30000 }
    );

    return (
      response.data?.tasks?.flatMap(
        (task: { result?: Array<{ items?: DFSKeyword[] }> }) =>
          task.result?.[0]?.items ?? []
      ) ?? []
    );
  }

  private processKeywords(
    keywords: DFSKeyword[],
    domain: string
  ): KeywordOpportunityData[] {
    // Deduplicate
    const seen = new Set<string>();
    const unique = keywords.filter((k) => {
      if (seen.has(k.keyword)) return false;
      seen.add(k.keyword);
      return true;
    });

    return unique.map((kw, idx) => {
      const type = this.classifyKeywordType(kw.keyword);
      const intent = this.inferIntent(kw.search_intent_info?.main_intent);
      const opportunityScore = this.calcOpportunityScore(kw);
      const category = this.categorizeOpportunity(kw);

      return {
        id: `kw_${idx}`,
        keyword: kw.keyword,
        searchVolume: kw.search_volume,
        difficulty: kw.keyword_difficulty,
        cpc: kw.cpc,
        intent,
        type,
        opportunityScore,
        category,
        currentRanking: null,
        targetUrl: null,
      };
    });
  }

  private classifyKeywordType(keyword: string): KeywordType {
    const wordCount = keyword.split(' ').length;
    const questionWords = /^(what|how|why|when|where|who|which|can|does|is|are|will)/i;

    if (questionWords.test(keyword)) return KeywordType.QUESTION;
    if (wordCount >= 4) return KeywordType.LONG_TAIL;
    if (wordCount >= 3) return KeywordType.SECONDARY;
    return KeywordType.PRIMARY;
  }

  private inferIntent(intentStr?: string): KeywordIntent {
    switch (intentStr?.toLowerCase()) {
      case 'commercial': return KeywordIntent.COMMERCIAL;
      case 'transactional': return KeywordIntent.TRANSACTIONAL;
      case 'navigational': return KeywordIntent.NAVIGATIONAL;
      default: return KeywordIntent.INFORMATIONAL;
    }
  }

  private calcOpportunityScore(kw: DFSKeyword): number {
    const volumeScore = Math.min(100, (kw.search_volume / 10000) * 100);
    const difficultyScore = 100 - kw.keyword_difficulty;
    const cpcScore = Math.min(100, (kw.cpc / 10) * 100);

    return Math.round(volumeScore * 0.4 + difficultyScore * 0.4 + cpcScore * 0.2);
  }

  private categorizeOpportunity(kw: DFSKeyword): OpportunityCategory {
    if (
      kw.keyword_difficulty <= QUICK_WIN_MAX_DIFFICULTY &&
      kw.search_volume >= QUICK_WIN_MIN_VOLUME
    ) {
      return OpportunityCategory.QUICK_WIN;
    }

    if (
      kw.search_volume >= HIGH_VALUE_MIN_VOLUME &&
      kw.keyword_difficulty <= HIGH_VALUE_MAX_DIFFICULTY
    ) {
      return OpportunityCategory.HIGH_VALUE;
    }

    return OpportunityCategory.MEDIUM_DIFFICULTY;
  }

  private buildCompetitorData(
    c: DFSCompetitor,
    targetDomain: string,
    idx: number
  ): CompetitorData {
    return {
      id: `comp_${idx}`,
      domain: c.domain,
      url: `https://${c.domain}`,
      organicKeywords: c.se_keywords,
      topPages: null,
      backlinks: null,
      domainAuthority: null,
      avgWordCount: null,
      contentTopics: [],
      commonKeywords: c.intersections,
      uniqueKeywords: c.se_keywords - c.intersections,
      gapKeywords: [],
      overallScore: null,
    };
  }

  // ── Mock data for development without API key ────────────────────────────────

  private getMockKeywords(domain: string): KeywordOpportunityData[] {
    const baseName = domain.replace(/www\./, '').split('.')[0];
    return [
      { id: 'k1', keyword: `${baseName} reviews`, searchVolume: 2400, difficulty: 25, cpc: 1.20, intent: KeywordIntent.COMMERCIAL, type: KeywordType.PRIMARY, opportunityScore: 82, category: OpportunityCategory.QUICK_WIN, currentRanking: null, targetUrl: null },
      { id: 'k2', keyword: `best ${baseName} alternatives`, searchVolume: 1900, difficulty: 35, cpc: 2.10, intent: KeywordIntent.COMMERCIAL, type: KeywordType.SECONDARY, opportunityScore: 74, category: OpportunityCategory.QUICK_WIN, currentRanking: null, targetUrl: null },
      { id: 'k3', keyword: `how to use ${baseName}`, searchVolume: 3200, difficulty: 20, cpc: 0.80, intent: KeywordIntent.INFORMATIONAL, type: KeywordType.QUESTION, opportunityScore: 88, category: OpportunityCategory.QUICK_WIN, currentRanking: null, targetUrl: null },
      { id: 'k4', keyword: `${baseName} pricing`, searchVolume: 1200, difficulty: 30, cpc: 3.50, intent: KeywordIntent.TRANSACTIONAL, type: KeywordType.PRIMARY, opportunityScore: 78, category: OpportunityCategory.QUICK_WIN, currentRanking: null, targetUrl: null },
      { id: 'k5', keyword: `${baseName} vs competitors`, searchVolume: 880, difficulty: 40, cpc: 2.80, intent: KeywordIntent.COMMERCIAL, type: KeywordType.LONG_TAIL, opportunityScore: 65, category: OpportunityCategory.MEDIUM_DIFFICULTY, currentRanking: null, targetUrl: null },
      { id: 'k6', keyword: `best practices for ${baseName}`, searchVolume: 5400, difficulty: 45, cpc: 1.60, intent: KeywordIntent.INFORMATIONAL, type: KeywordType.LONG_TAIL, opportunityScore: 70, category: OpportunityCategory.HIGH_VALUE, currentRanking: null, targetUrl: null },
      { id: 'k7', keyword: `${baseName} tutorial for beginners`, searchVolume: 4100, difficulty: 22, cpc: 0.90, intent: KeywordIntent.INFORMATIONAL, type: KeywordType.LONG_TAIL, opportunityScore: 85, category: OpportunityCategory.QUICK_WIN, currentRanking: null, targetUrl: null },
      { id: 'k8', keyword: `what is ${baseName}`, searchVolume: 8900, difficulty: 15, cpc: 0.50, intent: KeywordIntent.INFORMATIONAL, type: KeywordType.QUESTION, opportunityScore: 90, category: OpportunityCategory.QUICK_WIN, currentRanking: null, targetUrl: null },
      { id: 'k9', keyword: `${baseName} enterprise`, searchVolume: 12000, difficulty: 65, cpc: 8.20, intent: KeywordIntent.COMMERCIAL, type: KeywordType.SECONDARY, opportunityScore: 72, category: OpportunityCategory.HIGH_VALUE, currentRanking: null, targetUrl: null },
      { id: 'k10', keyword: `${baseName} API integration`, searchVolume: 6700, difficulty: 50, cpc: 4.10, intent: KeywordIntent.TRANSACTIONAL, type: KeywordType.LONG_TAIL, opportunityScore: 76, category: OpportunityCategory.MEDIUM_DIFFICULTY, currentRanking: null, targetUrl: null },
    ];
  }

  private getMockCompetitors(domain: string): CompetitorData[] {
    return [
      { id: 'c1', domain: 'competitor1.com', url: 'https://competitor1.com', organicKeywords: 15420, topPages: 234, backlinks: 8900, domainAuthority: 62, avgWordCount: 1450, contentTopics: ['SEO', 'Content Marketing', 'Analytics'], commonKeywords: 4200, uniqueKeywords: 11220, gapKeywords: [], overallScore: 72 },
      { id: 'c2', domain: 'competitor2.com', url: 'https://competitor2.com', organicKeywords: 22100, topPages: 456, backlinks: 14200, domainAuthority: 71, avgWordCount: 1850, contentTopics: ['SEO Tools', 'Rank Tracking', 'Backlinks'], commonKeywords: 5800, uniqueKeywords: 16300, gapKeywords: [], overallScore: 81 },
      { id: 'c3', domain: 'competitor3.com', url: 'https://competitor3.com', organicKeywords: 9800, topPages: 167, backlinks: 4300, domainAuthority: 54, avgWordCount: 1200, contentTopics: ['Technical SEO', 'Site Audit', 'Performance'], commonKeywords: 2900, uniqueKeywords: 6900, gapKeywords: [], overallScore: 61 },
    ];
  }
}
