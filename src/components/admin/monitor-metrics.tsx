"use client";

import { useLocale } from "next-intl";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MonitorMetricsProps {
  timeToFirstTokenMs: number | null;
  tokensPerSecond: number | null;
  durationMs: number | null;
  completionTokens: number;
}

export function MonitorMetrics({
  timeToFirstTokenMs,
  tokensPerSecond,
  durationMs,
  completionTokens,
}: MonitorMetricsProps) {
  const locale = useLocale();
  const isZh = locale === "zh-CN" || locale.startsWith("zh");

  const formatDuration = (ms: number | null) => {
    if (ms === null) return "-";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatNumber = (num: number | null) => {
    if (num === null) return "-";
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return String(Math.round(num));
  };

  const getTTFTColor = (ms: number | null) => {
    if (ms === null) return "text-amber-700";
    if (ms < 500) return "text-status-success";
    if (ms < 1000) return "text-amber-500";
    return "text-status-error";
  };

  const getTPSColor = (tps: number | null) => {
    if (tps === null) return "text-amber-700";
    if (tps >= 50) return "text-status-success";
    if (tps >= 20) return "text-amber-500";
    return "text-status-error";
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Time to First Token */}
      <MetricCard
        label={isZh ? "首字耗时" : "TTFT"}
        value={formatDuration(timeToFirstTokenMs)}
        valueColor={getTTFTColor(timeToFirstTokenMs)}
        icon="Zap"
        description={isZh ? "Time to First Token" : "First Token Time"}
      />

      {/* Tokens Per Second */}
      <MetricCard
        label={isZh ? "生成速度" : "TPS"}
        value={tokensPerSecond ? `${formatNumber(tokensPerSecond)}/s` : "-"}
        valueColor={getTPSColor(tokensPerSecond)}
        icon="TrendingUp"
        description={isZh ? "Tokens Per Second" : "Token/Second"}
      />

      {/* Total Duration */}
      <MetricCard
        label={isZh ? "总耗时" : "Duration"}
        value={formatDuration(durationMs)}
        valueColor="text-amber-500"
        icon="Clock"
        description={isZh ? "总响应时间" : "Total Response Time"}
      />

      {/* Completion Tokens */}
      <MetricCard
        label={isZh ? "输出Token" : "Output"}
        value={formatNumber(completionTokens)}
        valueColor="text-amber-500"
        icon="MessageSquare"
        description={isZh ? "Completion Tokens" : "Output Tokens"}
      />
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  valueColor: string;
  icon: LucideIcon | string;
  description: string;
}

function MetricCard({ label, value, valueColor, icon: Icon, description }: MetricCardProps) {
  const icons: Record<string, LucideIcon> = {
    Zap: require("lucide-react").Zap,
    TrendingUp: require("lucide-react").TrendingUp,
    Clock: require("lucide-react").Clock,
    MessageSquare: require("lucide-react").MessageSquare,
  };

  const IconComponent = typeof Icon === "string" ? icons[Icon] : Icon;

  return (
    <div className="bg-surface-200 rounded-cf-sm p-3 border border-divider">
      <div className="flex items-center gap-2 mb-2">
        {IconComponent && <IconComponent className="w-4 h-4 text-amber-500" />}
        <span className="font-mono text-xs uppercase tracking-wider text-amber-700">{label}</span>
      </div>
      <div className="font-mono text-lg font-bold text-amber-500 mb-1 tabular-nums">{value}</div>
      <div className="font-sans text-xs text-amber-700">{description}</div>
    </div>
  );
}
