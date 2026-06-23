'use client';

import { cn, getScoreColor } from '@/lib/utils';

interface ScoreRingProps {
  score: number | null | undefined;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
  showLabel?: boolean;
  className?: string;
}

const sizeConfig = {
  sm: { diameter: 64, strokeWidth: 6, fontSize: 'text-base' },
  md: { diameter: 96, strokeWidth: 8, fontSize: 'text-xl' },
  lg: { diameter: 128, strokeWidth: 10, fontSize: 'text-2xl' },
  xl: { diameter: 160, strokeWidth: 12, fontSize: 'text-4xl' },
};

export function ScoreRing({ score, size = 'md', label, showLabel = true, className }: ScoreRingProps) {
  const { diameter, strokeWidth, fontSize } = sizeConfig[size];
  const radius = (diameter - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeScore = score ?? 0;
  const offset = circumference - (safeScore / 100) * circumference;

  const strokeColor =
    safeScore >= 80 ? '#22c55e' : safeScore >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <div className="relative" style={{ width: diameter, height: diameter }}>
        <svg width={diameter} height={diameter}>
          {/* Background ring */}
          <circle
            cx={diameter / 2}
            cy={diameter / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted"
          />
          {/* Score ring */}
          <circle
            cx={diameter / 2}
            cy={diameter / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={score === null || score === undefined ? circumference : offset}
            className="score-ring"
          />
        </svg>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
        >
          <span className={cn('font-bold leading-none', fontSize, getScoreColor(score))}>
            {score === null || score === undefined ? '—' : Math.round(score)}
          </span>
          {size !== 'sm' && (
            <span className="text-xs text-muted-foreground mt-0.5">/100</span>
          )}
        </div>
      </div>
      {showLabel && label && (
        <span className="text-xs font-medium text-muted-foreground text-center">{label}</span>
      )}
    </div>
  );
}
