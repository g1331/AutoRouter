"use client";

/**
 * Dashboard statistics cards component.
 *
 * Displays overview metrics in a grid of cards with Cassette Futurism styling.
 */

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Clock, Zap } from "lucide-react";
import { formatNumber, formatDuration } from "./chart-theme";

interface StatsCardsProps {
  todayRequests: number;
  avgResponseTimeMs: number;
  totalTokensToday: number;
  isLoading: boolean;
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
      {/* Today's Requests */}
      <Card className="cf-panel">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-amber-700 mb-2">
                {t("stats.todayRequests")}
              </p>
              {isLoading ? (
                <Skeleton variant="counter" placeholder="---" />
              ) : (
                <p className="font-display text-5xl text-amber-500 cf-glow-text">
                  {formatNumber(todayRequests)}
                </p>
              )}
              <p className="font-mono text-xs text-amber-700 mt-2">{t("stats.requests")}</p>
            </div>
            <div className="w-12 h-12 rounded-cf-sm bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <Activity className="w-6 h-6 text-amber-500" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Average Response Time */}
      <Card className="cf-panel">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-amber-700 mb-2">
                {t("stats.avgResponseTime")}
              </p>
              {isLoading ? (
                <Skeleton variant="counter" placeholder="---" />
              ) : (
                <p className="font-display text-5xl text-amber-500 cf-glow-text">
                  {formatDuration(avgResponseTimeMs)}
                </p>
              )}
              <p className="font-mono text-xs text-amber-700 mt-2">{t("stats.latency")}</p>
            </div>
            <div className="w-12 h-12 rounded-cf-sm bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-500" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Total Tokens */}
      <Card className="cf-panel">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-amber-700 mb-2">
                {t("stats.totalTokens")}
              </p>
              {isLoading ? (
                <Skeleton variant="counter" placeholder="---" />
              ) : (
                <p className="font-display text-5xl text-amber-500 cf-glow-text">
                  {formatNumber(totalTokensToday)}
                </p>
              )}
              <p className="font-mono text-xs text-amber-700 mt-2">{t("stats.tokens")}</p>
            </div>
            <div className="w-12 h-12 rounded-cf-sm bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <Zap className="w-6 h-6 text-amber-500" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
