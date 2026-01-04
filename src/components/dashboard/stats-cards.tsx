"use client";

/**
 * Dashboard statistics cards component.
 *
 * Displays overview metrics in a grid of cards with enhanced Cassette Futurism styling.
 * Features: CRT flicker-in animation, phosphor glow effects, scanning line overlays.
 */

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Clock, Zap } from "lucide-react";
import { formatNumber, formatDuration } from "./chart-theme";
import { cn } from "@/lib/utils";

interface StatsCardsProps {
  todayRequests: number;
  avgResponseTimeMs: number;
  totalTokensToday: number;
  isLoading: boolean;
}

/**
 * Animated counter display with phosphor trail effect
 */
function AnimatedCounter({ value, isLoading }: { value: string; isLoading: boolean }) {
  if (isLoading) {
    return <Skeleton variant="counter" placeholder="---" />;
  }

  return (
    <p className="font-display text-5xl text-amber-500 cf-phosphor-trail cf-counter-roll">
      {value}
    </p>
  );
}

/**
 * Stat card with CRT-inspired visual effects
 */
function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  isLoading,
  delay = 0,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: typeof Activity;
  isLoading: boolean;
  delay?: number;
}) {
  return (
    <Card
      className={cn(
        "cf-panel cf-flicker-in cf-data-scan group",
        "hover:cf-pulse-glow transition-all duration-300"
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <CardContent className="p-6 relative">
        {/* Corner decorations - retro sci-fi style */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-amber-500/50" />
        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-amber-500/50" />
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-amber-500/50" />
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-amber-500/50" />

        <div className="flex items-start justify-between">
          <div className="relative z-10">
            {/* Label with terminal prompt style */}
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-[10px] text-amber-600">&gt;</span>
              <p className="font-mono text-xs uppercase tracking-wider text-amber-700">{title}</p>
            </div>

            {/* Animated value display */}
            <AnimatedCounter value={value} isLoading={isLoading} />

            {/* Subtitle with status indicator */}
            <div className="flex items-center gap-2 mt-2">
              <div className="cf-status-led cf-status-led-online" />
              <p className="font-mono text-xs text-amber-700">{subtitle}</p>
            </div>
          </div>

          {/* Icon container with glow effect */}
          <div
            className={cn(
              "w-14 h-14 rounded-cf-sm flex items-center justify-center",
              "bg-gradient-to-br from-amber-500/20 to-amber-500/5",
              "border border-amber-500/40",
              "group-hover:border-amber-500/60 group-hover:shadow-cf-glow-subtle",
              "transition-all duration-300"
            )}
          >
            <Icon
              className={cn(
                "w-7 h-7 text-amber-500",
                "group-hover:scale-110 transition-transform duration-300"
              )}
            />
          </div>
        </div>

        {/* Bottom progress bar decoration */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500/20 overflow-hidden">
          <div
            className={cn(
              "h-full bg-gradient-to-r from-transparent via-amber-500/60 to-transparent",
              "w-1/3 animate-shimmer"
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function StatsCards({
  todayRequests,
  avgResponseTimeMs,
  totalTokensToday,
  isLoading,
}: StatsCardsProps) {
  const t = useTranslations("dashboard");

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <StatCard
        title={t("stats.todayRequests")}
        value={formatNumber(todayRequests)}
        subtitle={t("stats.requests")}
        icon={Activity}
        isLoading={isLoading}
        delay={0}
      />
      <StatCard
        title={t("stats.avgResponseTime")}
        value={formatDuration(avgResponseTimeMs)}
        subtitle={t("stats.latency")}
        icon={Clock}
        isLoading={isLoading}
        delay={100}
      />
      <StatCard
        title={t("stats.totalTokens")}
        value={formatNumber(totalTokensToday)}
        subtitle={t("stats.tokens")}
        icon={Zap}
        isLoading={isLoading}
        delay={200}
      />
    </div>
  );
}
