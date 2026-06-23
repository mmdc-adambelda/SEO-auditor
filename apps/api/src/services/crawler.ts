import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import PQueue from 'p-queue';
import { URL } from 'url';
import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../lib/logger';
import {
  TITLE_MIN_LENGTH,
  TITLE_MAX_LENGTH,
  META_DESC_MIN_LENGTH,
  META_DESC_MAX_LENGTH,
  MIN_WORD_COUNT,
  SLOW_PAGE_THRESHOLD_MS,
} from '@seo-auditor/shared';

export interface CrawledPageData {
  url: string;
  finalUrl: string;
  statusCode: number;
  contentType: string;
  loadTime: number;
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescLength: number;
  h1Count: number;
  h2Count: number;
  h3Count: number;
  h1Text: string | null;
  h2Texts: string[];
  lang: string | null;
  canonical: string | null;
  robots: string | null;
  noindex: boolean;
  nofollow: boolean;
  isIndexable: boolean;
  hasViewport: boolean;
  isHttps: boolean;
  hasMixedContent: boolean;
  hasStructuredData: boolean;
  structuredDataTypes: string[];
  hreflangTags: Record<string, string>;
  wordCount: number;
  readabilityScore: number;
  topKeywords: Array<{ word: string; count: number }>;
  totalImages: number;
  imagesWithoutAlt: number;
  largeImages: number;
  internalLinks: string[];
  externalLinks: string[];
  contentHash: string;
  linkDepth: number;
}

export interface CrawlResult {
  pages: CrawledPageData[];
  hasSitemap: boolean;
  sitemapUrl: string | null;
  hasRobotsTxt: boolean;
  robotsTxtContent: string | null;
  sitemapUrls: string[];
  domain: string;
  isHttps: boolean;
}

export interface CrawlOptions {
  maxPages: number;
  maxDepth: number;
  onPageCrawled?: (page: CrawledPageData, progress: number) => void;
}

export class CrawlerService {
  private queue: PQueue;
  private visited = new Set<string>();
  private pages: CrawledPageData[] = [];
  private domain: string = '';
  private baseUrl: string = '';
  private maxPages: number;
  private maxDepth: number;
  private onPageCrawled?: (page: CrawledPageData, progress: number) => void;

  constructor() {
    this.queue = new PQueue({
      concurrency: config.CRAWLER_CONCURRENCY,
      interval: 100,
      intervalCap: 5,
    });
    this.maxPages = config.CRAWLER_MAX_PAGES;
    this.maxDepth = config.CRAWLER_MAX_DEPTH;
  }

  async crawl(startUrl: string, options: CrawlOptions): Promise<CrawlResult> {
    this.visited.clear();
    this.pages = [];
    this.maxPages = options.maxPages;
    this.maxDepth = options.maxDepth;
    this.onPageCrawled = options.onPageCrawled;

    const parsedUrl = new URL(startUrl);
    this.domain = parsedUrl.hostname;
    this.baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}`;

    logger.info('Starting crawl', { url: startUrl, maxPages: this.maxPages, maxDepth: this.maxDepth });

    // Fetch robots.txt and sitemap first
    const [robotsResult, sitemapResult] = await Promise.allSettled([
      this.fetchRobotsTxt(),
      this.fetchSitemap(startUrl),
    ]);

    const robotsTxtContent =
      robotsResult.status === 'fulfilled' ? robotsResult.value : null;
    const sitemapData =
      sitemapResult.status === 'fulfilled' ? sitemapResult.value : null;

    // Start crawling from the seed URL
    await this.crawlPage(startUrl, 0);
    await this.queue.onIdle();

    // Compute link depths (BFS from homepage)
    this.computeLinkDepths(startUrl);

    return {
      pages: this.pages,
      hasSitemap: !!sitemapData,
      sitemapUrl: sitemapData?.url ?? null,
      hasRobotsTxt: !!robotsTxtContent,
      robotsTxtContent,
      sitemapUrls: sitemapData?.urls ?? [],
      domain: this.domain,
      isHttps: parsedUrl.protocol === 'https:',
    };
  }

  private async crawlPage(url: string, depth: number): Promise<void> {
    const normalizedUrl = this.normalizeUrl(url);
    if (!normalizedUrl) return;
    if (this.visited.has(normalizedUrl)) return;
    if (this.pages.length >= this.maxPages) return;
    if (depth > this.maxDepth) return;
    if (!this.isSameDomain(normalizedUrl)) return;

    this.visited.add(normalizedUrl);

    await this.queue.add(async () => {
      if (this.pages.length >= this.maxPages) return;

      try {
        const pageData = await this.fetchAndParsePage(normalizedUrl, depth);
        if (!pageData) return;

        this.pages.push(pageData);

        const progress = Math.min((this.pages.length / this.maxPages) * 100, 99);
        this.onPageCrawled?.(pageData, progress);

        logger.debug('Crawled page', { url: normalizedUrl, status: pageData.statusCode });

        // Queue internal links for crawling
        for (const link of pageData.internalLinks) {
          await this.crawlPage(link, depth + 1);
        }
      } catch (err) {
        logger.warn('Failed to crawl page', { url: normalizedUrl, err });
      }
    });
  }

  private async fetchAndParsePage(
    url: string,
    depth: number
  ): Promise<CrawledPageData | null> {
    const start = Date.now();

    try {
      const response = await axios.get(url, {
        timeout: config.CRAWLER_REQUEST_TIMEOUT,
        headers: {
          'User-Agent': config.CRAWLER_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        maxRedirects: 5,
        validateStatus: () => true, // don't throw on non-2xx
      });

      const loadTime = Date.now() - start;
      const contentType = response.headers['content-type'] || '';

      if (!contentType.includes('text/html')) {
        return this.buildNonHtmlPage(url, response, loadTime, depth);
      }

      const html = response.data as string;
      return this.parseHtml(url, response.request?.res?.responseUrl ?? url, html, response.status, loadTime, depth);
    } catch (err: unknown) {
      const loadTime = Date.now() - start;
      const status = axios.isAxiosError(err) ? (err.response?.status ?? 0) : 0;

      return {
        url,
        finalUrl: url,
        statusCode: status,
        contentType: '',
        loadTime,
        title: null,
        titleLength: 0,
        metaDescription: null,
        metaDescLength: 0,
        h1Count: 0,
        h2Count: 0,
        h3Count: 0,
        h1Text: null,
        h2Texts: [],
        lang: null,
        canonical: null,
        robots: null,
        noindex: false,
        nofollow: false,
        isIndexable: true,
        hasViewport: false,
        isHttps: url.startsWith('https://'),
        hasMixedContent: false,
        hasStructuredData: false,
        structuredDataTypes: [],
        hreflangTags: {},
        wordCount: 0,
        readabilityScore: 0,
        topKeywords: [],
        totalImages: 0,
        imagesWithoutAlt: 0,
        largeImages: 0,
        internalLinks: [],
        externalLinks: [],
        contentHash: crypto.createHash('sha256').update(url).digest('hex'),
        linkDepth: depth,
      };
    }
  }

  private parseHtml(
    url: string,
    finalUrl: string,
    html: string,
    statusCode: number,
    loadTime: number,
    depth: number
  ): CrawledPageData {
    const $ = cheerio.load(html);

    // Title
    const title = $('title').first().text().trim() || null;
    const titleLength = title?.length ?? 0;

    // Meta description
    const metaDesc =
      $('meta[name="description"]').attr('content')?.trim() ||
      $('meta[property="og:description"]').attr('content')?.trim() ||
      null;
    const metaDescLength = metaDesc?.length ?? 0;

    // Headers
    const h1Elements = $('h1');
    const h2Elements = $('h2');
    const h3Elements = $('h3');
    const h1Text = h1Elements.first().text().trim() || null;
    const h2Texts = h2Elements
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .slice(0, 10);

    // Meta robots
    const robotsMeta =
      $('meta[name="robots"]').attr('content')?.toLowerCase() ||
      $('meta[name="googlebot"]').attr('content')?.toLowerCase() ||
      null;
    const noindex = robotsMeta?.includes('noindex') ?? false;
    const nofollow = robotsMeta?.includes('nofollow') ?? false;

    // Canonical
    const canonical = $('link[rel="canonical"]').attr('href') || null;

    // Viewport
    const hasViewport = $('meta[name="viewport"]').length > 0;

    // Language
    const lang = $('html').attr('lang') || null;

    // Structured data
    const structuredDataScripts = $('script[type="application/ld+json"]');
    const hasStructuredData = structuredDataScripts.length > 0;
    const structuredDataTypes: string[] = [];

    structuredDataScripts.each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || '{}');
        const types = Array.isArray(data)
          ? data.map((d) => d['@type']).filter(Boolean)
          : [data['@type']].filter(Boolean);
        structuredDataTypes.push(...types);
      } catch {
        // malformed JSON-LD, skip
      }
    });

    // Hreflang
    const hreflangTags: Record<string, string> = {};
    $('link[rel="alternate"][hreflang]').each((_, el) => {
      const lang = $(el).attr('hreflang');
      const href = $(el).attr('href');
      if (lang && href) hreflangTags[lang] = href;
    });

    // Mixed content check
    const hasMixedContent =
      url.startsWith('https://') &&
      (html.includes('http://') &&
        (html.includes('src="http://') || html.includes("src='http://")));

    // Images
    const images = $('img');
    const totalImages = images.length;
    let imagesWithoutAlt = 0;
    images.each((_, el) => {
      const alt = $(el).attr('alt');
      if (alt === undefined || alt === '') imagesWithoutAlt++;
    });

    // Links
    const internalLinks: string[] = [];
    const externalLinks: string[] = [];

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:'))
        return;

      try {
        const resolved = new URL(href, url).href;
        const parsedResolved = new URL(resolved);

        if (parsedResolved.hostname === this.domain) {
          const clean = `${parsedResolved.origin}${parsedResolved.pathname}`;
          if (!internalLinks.includes(clean)) internalLinks.push(clean);
        } else {
          if (!externalLinks.includes(resolved)) externalLinks.push(resolved);
        }
      } catch {
        // relative link that failed to parse
      }
    });

    // Word count & content
    const bodyText = $('body').clone()
      .find('script, style, nav, footer, header, noscript').remove().end()
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

    // Readability score (Flesch-Kincaid approximation)
    const readabilityScore = this.calculateReadabilityScore(bodyText);

    // Top keywords (simple frequency analysis)
    const topKeywords = this.extractTopKeywords(bodyText);

    // Content hash for duplicate detection
    const contentHash = crypto
      .createHash('sha256')
      .update(bodyText.slice(0, 10000))
      .digest('hex');

    // Indexability
    const isIndexable = !noindex && statusCode >= 200 && statusCode < 300;

    return {
      url,
      finalUrl,
      statusCode,
      contentType: 'text/html',
      loadTime,
      title,
      titleLength,
      metaDescription: metaDesc,
      metaDescLength,
      h1Count: h1Elements.length,
      h2Count: h2Elements.length,
      h3Count: h3Elements.length,
      h1Text,
      h2Texts,
      lang,
      canonical,
      robots: robotsMeta,
      noindex,
      nofollow,
      isIndexable,
      hasViewport,
      isHttps: url.startsWith('https://'),
      hasMixedContent,
      hasStructuredData,
      structuredDataTypes: [...new Set(structuredDataTypes)],
      hreflangTags,
      wordCount,
      readabilityScore,
      topKeywords,
      totalImages,
      imagesWithoutAlt,
      largeImages: 0, // would require HEAD requests for image sizes
      internalLinks: internalLinks.slice(0, 200),
      externalLinks: externalLinks.slice(0, 100),
      contentHash,
      linkDepth: depth,
    };
  }

  private buildNonHtmlPage(
    url: string,
    response: AxiosResponse,
    loadTime: number,
    depth: number
  ): CrawledPageData {
    return {
      url,
      finalUrl: url,
      statusCode: response.status,
      contentType: response.headers['content-type'] || '',
      loadTime,
      title: null,
      titleLength: 0,
      metaDescription: null,
      metaDescLength: 0,
      h1Count: 0,
      h2Count: 0,
      h3Count: 0,
      h1Text: null,
      h2Texts: [],
      lang: null,
      canonical: null,
      robots: null,
      noindex: false,
      nofollow: false,
      isIndexable: false,
      hasViewport: false,
      isHttps: url.startsWith('https://'),
      hasMixedContent: false,
      hasStructuredData: false,
      structuredDataTypes: [],
      hreflangTags: {},
      wordCount: 0,
      readabilityScore: 0,
      topKeywords: [],
      totalImages: 0,
      imagesWithoutAlt: 0,
      largeImages: 0,
      internalLinks: [],
      externalLinks: [],
      contentHash: crypto.createHash('sha256').update(url).digest('hex'),
      linkDepth: depth,
    };
  }

  private async fetchRobotsTxt(): Promise<string | null> {
    try {
      const response = await axios.get(`${this.baseUrl}/robots.txt`, {
        timeout: 10000,
        headers: { 'User-Agent': config.CRAWLER_USER_AGENT },
        validateStatus: (s) => s < 500,
      });
      if (response.status === 200) return response.data as string;
      return null;
    } catch {
      return null;
    }
  }

  private async fetchSitemap(
    startUrl: string
  ): Promise<{ url: string; urls: string[] } | null> {
    const sitemapUrls = [
      `${this.baseUrl}/sitemap.xml`,
      `${this.baseUrl}/sitemap_index.xml`,
      `${this.baseUrl}/sitemap/sitemap.xml`,
    ];

    for (const sitemapUrl of sitemapUrls) {
      try {
        const response = await axios.get(sitemapUrl, {
          timeout: 10000,
          headers: { 'User-Agent': config.CRAWLER_USER_AGENT },
          validateStatus: (s) => s < 500,
        });

        if (response.status === 200) {
          const urls = this.parseSitemap(response.data as string);
          return { url: sitemapUrl, urls };
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private parseSitemap(xml: string): string[] {
    const $ = cheerio.load(xml, { xmlMode: true });
    const urls: string[] = [];

    $('url loc').each((_, el) => {
      const url = $(el).text().trim();
      if (url) urls.push(url);
    });

    // Handle sitemap index
    $('sitemap loc').each((_, el) => {
      const url = $(el).text().trim();
      if (url) urls.push(url);
    });

    return urls.filter((u) => u.includes(this.domain));
  }

  private normalizeUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      // Remove hash, trailing slash for consistency
      parsed.hash = '';
      let normalized = parsed.href;
      if (normalized.endsWith('/') && parsed.pathname !== '/') {
        normalized = normalized.slice(0, -1);
      }
      // Skip common non-HTML resources
      const ext = parsed.pathname.split('.').pop()?.toLowerCase();
      if (
        ext &&
        ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'ico', 'css', 'js', 'woff', 'woff2', 'ttf', 'eot', 'zip', 'tar', 'gz', 'mp4', 'mp3', 'avi', 'mov', 'doc', 'docx', 'xls', 'xlsx'].includes(ext)
      ) {
        return null;
      }
      return normalized;
    } catch {
      return null;
    }
  }

  private isSameDomain(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname === this.domain || parsed.hostname === `www.${this.domain}` || `www.${parsed.hostname}` === this.domain;
    } catch {
      return false;
    }
  }

  private calculateReadabilityScore(text: string): number {
    if (!text || text.length < 100) return 50;

    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const words = text.split(/\s+/).filter(Boolean);
    const syllables = words.reduce((acc, word) => acc + this.countSyllables(word), 0);

    if (sentences.length === 0 || words.length === 0) return 50;

    const avgSentenceLength = words.length / sentences.length;
    const avgSyllablesPerWord = syllables / words.length;

    // Flesch Reading Ease
    const score = 206.835 - 1.015 * avgSentenceLength - 84.6 * avgSyllablesPerWord;
    return Math.max(0, Math.min(100, score));
  }

  private countSyllables(word: string): number {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!word) return 0;
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  }

  private extractTopKeywords(
    text: string
  ): Array<{ word: string; count: number }> {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'shall', 'can', 'that', 'this',
      'it', 'its', 'they', 'them', 'their', 'we', 'our', 'you', 'your',
      'he', 'she', 'his', 'her', 'i', 'my', 'me', 'not', 'no', 'so', 'if',
      'then', 'than', 'also', 'more', 'about', 'what', 'which', 'who',
    ]);

    const freq: Record<string, number> = {};
    text
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopWords.has(w))
      .forEach((w) => {
        freq[w] = (freq[w] || 0) + 1;
      });

    return Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([word, count]) => ({ word, count }));
  }

  private computeLinkDepths(startUrl: string): void {
    const normalizedStart = this.normalizeUrl(startUrl);
    if (!normalizedStart) return;

    const depthMap = new Map<string, number>();
    depthMap.set(normalizedStart, 0);

    // Build adjacency from crawled pages
    const linkMap = new Map<string, string[]>();
    for (const page of this.pages) {
      const norm = this.normalizeUrl(page.url);
      if (norm) linkMap.set(norm, page.internalLinks);
    }

    // BFS
    const queue: [string, number][] = [[normalizedStart, 0]];
    while (queue.length > 0) {
      const [current, depth] = queue.shift()!;
      const links = linkMap.get(current) || [];
      for (const link of links) {
        const normLink = this.normalizeUrl(link);
        if (normLink && !depthMap.has(normLink)) {
          depthMap.set(normLink, depth + 1);
          queue.push([normLink, depth + 1]);
        }
      }
    }

    // Update pages with computed depths
    for (const page of this.pages) {
      const norm = this.normalizeUrl(page.url);
      if (norm && depthMap.has(norm)) {
        page.linkDepth = depthMap.get(norm)!;
      }
    }
  }
}
