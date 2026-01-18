"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "logs-refresh-interval";

export type RefreshInterval = "0" | "10" | "30" | "60";

/**
 * Get initial interval from localStorage
 */
function getInitialInterval(): RefreshInterval {
  if (typeof window === "undefined") return "0";
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && ["0", "10", "30", "60"].includes(saved)) {
    return saved as RefreshInterval;
  }
  return "0";
}

interface RefreshIntervalSelectProps {
  onIntervalChange: (interval: number | false) => void;
  onManualRefresh: () => void;
  isRefreshing?: boolean;
}

/**
 * Refresh Interval Select Component
 *
 * Cassette Futurism styled dropdown for selecting auto-refresh interval.
 * Persists preference to localStorage.
 */
export function RefreshIntervalSelect({
  onIntervalChange,
  onManualRefresh,
  isRefreshing = false,
}: RefreshIntervalSelectProps) {
  const t = useTranslations("logs");
  const [interval, setInterval] = useState<RefreshInterval>(getInitialInterval);

  // Notify parent of initial interval on mount
  useEffect(() => {
    const ms = parseInt(interval, 10) * 1000;
    onIntervalChange(ms > 0 ? ms : false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleIntervalChange = (value: RefreshInterval) => {
    setInterval(value);
    localStorage.setItem(STORAGE_KEY, value);
    const ms = parseInt(value, 10) * 1000;
    onIntervalChange(ms > 0 ? ms : false);
  };

  const intervalLabels: Record<RefreshInterval, string> = {
    "0": t("refreshOff"),
    "10": t("refresh10s"),
    "30": t("refresh30s"),
    "60": t("refresh60s"),
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={interval} onValueChange={handleIntervalChange}>
        <SelectTrigger className="w-[100px] h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0">{intervalLabels["0"]}</SelectItem>
          <SelectItem value="10">{intervalLabels["10"]}</SelectItem>
          <SelectItem value="30">{intervalLabels["30"]}</SelectItem>
          <SelectItem value="60">{intervalLabels["60"]}</SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        onClick={onManualRefresh}
        disabled={isRefreshing}
        className="gap-1.5"
      >
        <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden="true" />
        {t("manualRefresh")}
      </Button>
    </div>
  );
}
