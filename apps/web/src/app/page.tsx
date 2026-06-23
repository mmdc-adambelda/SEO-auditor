'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Search,
  Zap,
  ShieldCheck,
  BarChart3,
  Globe,
  ArrowRight,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';

const auditSchema = z.object({
  url: z.string().url('Please enter a valid URL (e.g. https://example.com)'),
  maxPages: z.coerce.number().int().min(1).max(1000).default(500),
  crawlDepth: z.coerce.number().int().min(1).max(10).default(5),
  includeKeywords: z.boolean().default(true),
  includeCompetitors: z.boolean().default(true),
});

type AuditFormData = z.infer<typeof auditSchema>;

const features = [
  { icon: Search, title: 'Deep Site Crawl', desc: 'Crawl up to 1,000 pages, discover issues at scale' },
  { icon: ShieldCheck, title: 'Technical SEO', desc: '30+ technical checks: HTTPS, sitemaps, canonicals, redirects' },
  { icon: BarChart3, title: 'Keyword Opportunities', desc: 'Discover quick wins, long-tail targets, and content gaps' },
  { icon: Globe, title: 'Competitor Analysis', desc: 'See what competitors rank for and where you can win' },
  { icon: Zap, title: 'Core Web Vitals', desc: 'LCP, CLS, INP, FCP, TTFB with Google PageSpeed data' },
  { icon: CheckCircle2, title: 'AI Recommendations', desc: 'GPT-4 powered fix recommendations with impact scoring' },
];

export default function HomePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<AuditFormData>({
    resolver: zodResolver(auditSchema),
    defaultValues: {
      url: '',
      maxPages: 500,
      crawlDepth: 5,
      includeKeywords: true,
      includeCompetitors: true,
    },
  });

  const onSubmit = async (data: AuditFormData) => {
    setIsSubmitting(true);
    try {
      const result = await api.audit.start(data);
      router.push(`/audit/${result.jobId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start audit');
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <nav className="border-b border-white/10 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Search className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-white text-lg">SEO Auditor</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/dashboard')}
            className="border-white/20 text-white hover:bg-white/10"
          >
            Dashboard
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white/80 text-sm mb-6">
            <Zap className="h-3.5 w-3.5" />
            AI-Powered SEO Analysis Platform
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white mb-6 leading-tight">
            Comprehensive SEO Audit<br />
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              in Minutes
            </span>
          </h1>
          <p className="text-xl text-white/70 mb-10 max-w-2xl mx-auto">
            Enter any URL and get a full technical SEO analysis, keyword opportunities, competitor insights, and AI-powered fix recommendations — all in one report.
          </p>

          {/* Audit Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl mx-auto">
            <div className="flex gap-2 p-2 bg-white rounded-2xl shadow-2xl">
              <input
                {...register('url')}
                type="url"
                placeholder="https://yourwebsite.com"
                className="flex-1 px-4 py-3 text-slate-900 text-sm placeholder:text-slate-400 bg-transparent outline-none"
                disabled={isSubmitting}
              />
              <Button
                type="submit"
                size="lg"
                disabled={isSubmitting}
                className="rounded-xl px-6 gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    Analyze
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
            {errors.url && (
              <p className="text-red-400 text-sm mt-2">{errors.url.message}</p>
            )}

            {/* Advanced Options Toggle */}
            <button
              type="button"
              className="text-white/50 text-xs mt-3 hover:text-white/80 transition-colors"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? 'Hide' : 'Show'} advanced options
            </button>

            {showAdvanced && (
              <div className="mt-4 p-4 bg-white/10 rounded-xl text-left grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-white/70 mb-1">Max Pages</label>
                  <input
                    {...register('maxPages')}
                    type="number"
                    className="w-full px-3 py-2 rounded-lg bg-white/10 text-white text-sm outline-none border border-white/20"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/70 mb-1">Crawl Depth</label>
                  <input
                    {...register('crawlDepth')}
                    type="number"
                    className="w-full px-3 py-2 rounded-lg bg-white/10 text-white text-sm outline-none border border-white/20"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input {...register('includeKeywords')} type="checkbox" id="kw" className="rounded" defaultChecked />
                  <label htmlFor="kw" className="text-xs text-white/70">Keyword Analysis</label>
                </div>
                <div className="flex items-center gap-2">
                  <input {...register('includeCompetitors')} type="checkbox" id="comp" className="rounded" defaultChecked />
                  <label htmlFor="comp" className="text-xs text-white/70">Competitor Analysis</label>
                </div>
              </div>
            )}
          </form>

          <p className="text-white/40 text-xs mt-4">
            Analyzes up to 500 pages · Typical audit time: 3-8 minutes
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {features.map((feature) => (
            <Card key={feature.title} className="bg-white/5 border-white/10 hover:bg-white/10 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <feature.icon className="h-4 w-4 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-1">{feature.title}</h3>
                    <p className="text-xs text-white/60">{feature.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
