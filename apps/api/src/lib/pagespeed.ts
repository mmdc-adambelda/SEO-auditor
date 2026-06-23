import axios from 'axios';
import { config } from '../config';
import { logger } from './logger';
import { CWV_THRESHOLDS } from '@seo-auditor/shared';
import type { CoreWebVitalsData, CWVMetrics, CWVOpportunity, CWVDiagnostic } from '@seo-auditor/shared';

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

interface PSIAudit {
  id: string;
  title: string;
  description: string;
  score: number | null;
  displayValue?: string;
  numericValue?: number;
  details?: Record<string, unknown>;
}

interface PSIResponse {
  lighthouseResult: {
    categories: {
      performance?: { score: number };
    };
    audits: Record<string, PSIAudit>;
  };
}

export class PageSpeedService {
  async analyze(url: string): Promise<CoreWebVitalsData> {
    const [mobileResult, desktopResult] = await Promise.allSettled([
      this.runPSI(url, 'mobile'),
      this.runPSI(url, 'desktop'),
    ]);

    const mobileData =
      mobileResult.status === 'fulfilled' ? mobileResult.value : null;
    const desktopData =
      desktopResult.status === 'fulfilled' ? desktopResult.value : null;

    const mobile = this.extractMetrics(mobileData);
    const desktop = this.extractMetrics(desktopData);
    const opportunities = this.extractOpportunities(mobileData);
    const diagnostics = this.extractDiagnostics(mobileData);

    return { mobile, desktop, opportunities, diagnostics };
  }

  private async runPSI(url: string, strategy: 'mobile' | 'desktop'): Promise<PSIResponse> {
    if (!config.GOOGLE_PAGESPEED_API_KEY) {
      throw new Error('PageSpeed API key not configured');
    }

    const response = await axios.get<PSIResponse>(PSI_ENDPOINT, {
      params: {
        url,
        strategy,
        key: config.GOOGLE_PAGESPEED_API_KEY,
        category: 'performance',
      },
      timeout: 60000,
    });

    return response.data;
  }

  private extractMetrics(data: PSIResponse | null): CWVMetrics {
    if (!data) {
      return {
        lcp: null, cls: null, inp: null, fcp: null, ttfb: null, score: null,
        ratings: { lcp: null, cls: null, inp: null, fcp: null, ttfb: null },
      };
    }

    const audits = data.lighthouseResult.audits;
    const score = (data.lighthouseResult.categories.performance?.score ?? 0) * 100;

    const lcp = audits['largest-contentful-paint']?.numericValue ?? null;
    const cls = audits['cumulative-layout-shift']?.numericValue ?? null;
    const inp = audits['interaction-to-next-paint']?.numericValue ?? null;
    const fcp = audits['first-contentful-paint']?.numericValue ?? null;
    const ttfb = audits['server-response-time']?.numericValue ?? null;

    return {
      lcp,
      cls,
      inp,
      fcp,
      ttfb,
      score: Math.round(score),
      ratings: {
        lcp: lcp !== null ? this.rateLCP(lcp) : null,
        cls: cls !== null ? this.rateCLS(cls) : null,
        inp: inp !== null ? this.rateINP(inp) : null,
        fcp: fcp !== null ? this.rateFCP(fcp) : null,
        ttfb: ttfb !== null ? this.rateTTFB(ttfb) : null,
      },
    };
  }

  private extractOpportunities(data: PSIResponse | null): CWVOpportunity[] {
    if (!data) return [];

    const opportunityIds = [
      'render-blocking-resources',
      'unused-css-rules',
      'unused-javascript',
      'uses-optimized-images',
      'uses-webp-images',
      'uses-text-compression',
      'uses-responsive-images',
      'efficient-animated-content',
      'duplicated-javascript',
      'legacy-javascript',
    ];

    return opportunityIds
      .map((id) => {
        const audit = data.lighthouseResult.audits[id];
        if (!audit) return null;

        return {
          id: audit.id,
          title: audit.title,
          description: audit.description,
          savings: audit.numericValue,
          displayValue: audit.displayValue,
          score: audit.score ?? 0,
        };
      })
      .filter((o): o is CWVOpportunity => o !== null && (o.score ?? 1) < 0.9)
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  }

  private extractDiagnostics(data: PSIResponse | null): CWVDiagnostic[] {
    if (!data) return [];

    const diagnosticIds = [
      'dom-size',
      'critical-request-chains',
      'network-requests',
      'network-rtt',
      'network-server-latency',
      'main-thread-tasks',
      'bootup-time',
      'uses-long-cache-ttl',
      'total-byte-weight',
    ];

    return diagnosticIds
      .map((id) => {
        const audit = data.lighthouseResult.audits[id];
        if (!audit) return null;

        return {
          id: audit.id,
          title: audit.title,
          description: audit.description,
          displayValue: audit.displayValue,
          score: audit.score,
        };
      })
      .filter((d): d is CWVDiagnostic => d !== null);
  }

  private rateLCP(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value <= CWV_THRESHOLDS.lcp.good) return 'good';
    if (value <= CWV_THRESHOLDS.lcp.poor) return 'needs-improvement';
    return 'poor';
  }

  private rateCLS(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value <= CWV_THRESHOLDS.cls.good) return 'good';
    if (value <= CWV_THRESHOLDS.cls.poor) return 'needs-improvement';
    return 'poor';
  }

  private rateINP(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value <= CWV_THRESHOLDS.inp.good) return 'good';
    if (value <= CWV_THRESHOLDS.inp.poor) return 'needs-improvement';
    return 'poor';
  }

  private rateFCP(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value <= CWV_THRESHOLDS.fcp.good) return 'good';
    if (value <= CWV_THRESHOLDS.fcp.poor) return 'needs-improvement';
    return 'poor';
  }

  private rateTTFB(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value <= CWV_THRESHOLDS.ttfb.good) return 'good';
    if (value <= CWV_THRESHOLDS.ttfb.poor) return 'needs-improvement';
    return 'poor';
  }
}
