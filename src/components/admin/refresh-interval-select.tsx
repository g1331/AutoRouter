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

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "0" || saved === "10" || saved === "30" || saved === "60") {
      return saved;
    }
  } catch {
    // localStorage can throw (e.g., disabled/blocked); fall back to "Off"
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

  // Keep parent interval in sync with local state (and initial localStorage value)
  useEffect(() => {
    const ms = parseInt(interval, 10) * 1000;
    onIntervalChange(ms > 0 ? ms : false);
  }, [interval, onIntervalChange]);

  const handleIntervalChange = (value: RefreshInterval) => {
    setInterval(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Ignore storage failures; auto-refresh still works for this session
    }
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
        <SelectTrigger className="w-[100px] h-9" aria-label={t("refreshInterval")}>
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
