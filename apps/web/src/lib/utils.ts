import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'N/A';
  return Math.round(score).toString();
}

export function getScoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'text-muted-foreground';
  if (score >= 80) return 'text-score-good';
  if (score >= 60) return 'text-score-medium';
  return 'text-score-poor';
}

export function getScoreBg(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'bg-muted';
  if (score >= 80) return 'bg-green-50 dark:bg-green-950';
  if (score >= 60) return 'bg-amber-50 dark:bg-amber-950';
  return 'bg-red-50 dark:bg-red-950';
}

export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return 'text-red-600 bg-red-50 border-red-200';
    case 'HIGH': return 'text-orange-600 bg-orange-50 border-orange-200';
    case 'MEDIUM': return 'text-amber-600 bg-amber-50 border-amber-200';
    case 'LOW': return 'text-lime-600 bg-lime-50 border-lime-200';
    default: return 'text-sky-600 bg-sky-50 border-sky-200';
  }
}

export function getSeverityDotColor(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return 'bg-red-500';
    case 'HIGH': return 'bg-orange-500';
    case 'MEDIUM': return 'bg-amber-500';
    case 'LOW': return 'bg-lime-500';
    default: return 'bg-sky-500';
  }
}

export function gradeToDisplay(grade: string | null | undefined): string {
  if (!grade) return '—';
  return grade.replace('_PLUS', '+').replace('_', '');
}

export function gradeToColor(grade: string | null | undefined): string {
  if (!grade) return 'text-muted-foreground';
  if (grade.startsWith('A')) return 'text-green-600';
  if (grade.startsWith('B')) return 'text-emerald-600';
  if (grade.startsWith('C')) return 'text-amber-600';
  if (grade === 'D') return 'text-orange-600';
  return 'text-red-600';
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'N/A';
  return n.toLocaleString();
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return 'N/A';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

export function getRatingColor(rating: 'good' | 'needs-improvement' | 'poor' | null): string {
  switch (rating) {
    case 'good': return 'text-green-600';
    case 'needs-improvement': return 'text-amber-600';
    case 'poor': return 'text-red-600';
    default: return 'text-muted-foreground';
  }
}

export function getRatingBadgeColor(rating: 'good' | 'needs-improvement' | 'poor' | null): string {
  switch (rating) {
    case 'good': return 'bg-green-100 text-green-800';
    case 'needs-improvement': return 'bg-amber-100 text-amber-800';
    case 'poor': return 'bg-red-100 text-red-800';
    default: return 'bg-muted text-muted-foreground';
  }
}

export function truncateUrl(url: string, maxLen = 60): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen) + '...';
}

export function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
