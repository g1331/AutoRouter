"use client";

import { formatDistanceToNow } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import {
  Pencil,
  Trash2,
  Server,
  Play,
  CheckCircle,
  XCircle,
  HelpCircle,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { Upstream } from "@/types/api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { getDateLocale } from "@/lib/date-locale";

interface UpstreamsTableProps {
  upstreams: Upstream[];
  onEdit: (upstream: Upstream) => void;
  onDelete: (upstream: Upstream) => void;
  onTest: (upstream: Upstream) => void;
}

/**
 * Cassette Futurism Upstreams Data Table
 *
 * Terminal-style data display with:
 * - Mono font for URL data
 * - Provider-specific badge colors
 * - Amber accents and glow effects
 */
export function UpstreamsTable({ upstreams, onEdit, onDelete, onTest }: UpstreamsTableProps) {
  const t = useTranslations("upstreams");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

  const formatProvider = (provider: string) => {
    const providerMap: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
      openai: { label: "OpenAI", variant: "success" },
      anthropic: { label: "Anthropic", variant: "secondary" },
      azure: { label: "Azure", variant: "info" },
      gemini: { label: "Gemini", variant: "warning" },
    };

    const config = providerMap[provider.toLowerCase()] || {
      label: provider,
      variant: "neutral" as const,
    };

    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatProviderType = (providerType: string | null) => {
    if (!providerType) return null;

    const typeMap: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
      anthropic: { label: "Anthropic", variant: "default" },
      openai: { label: "OpenAI", variant: "success" },
      google: { label: "Google", variant: "warning" },
      custom: { label: "Custom", variant: "outline" },
    };

    const config = typeMap[providerType.toLowerCase()] || {
      label: providerType,
      variant: "neutral" as const,
    };

    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatHealthStatus = (upstream: Upstream) => {
    const healthStatus = upstream.health_status;

    if (!healthStatus) {
      return (
        <div className="flex items-center gap-1.5">
          <HelpCircle className="h-4 w-4 text-amber-600" aria-hidden="true" />
          <span className="text-amber-600 text-sm">{t("healthUnknown")}</span>
        </div>
      );
    }

    if (healthStatus.is_healthy) {
      return (
        <div className="flex items-center gap-1.5">
          <CheckCircle className="h-4 w-4 text-green-500" aria-hidden="true" />
          <span className="text-green-500 text-sm">{t("healthHealthy")}</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5">
        <XCircle className="h-4 w-4 text-status-error" aria-hidden="true" />
        <span className="text-status-error text-sm">{t("healthUnhealthy")}</span>
      </div>
    );
  };

  const formatCircuitBreakerStatus = (upstream: Upstream) => {
    const cb = upstream.circuit_breaker;

    if (!cb) {
      return (
        <div className="flex items-center gap-1.5">
          <Shield className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-muted-foreground text-sm">{t("circuitBreakerUnknown")}</span>
        </div>
      );
    }

    if (cb.state === "closed") {
      return (
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-green-500" aria-hidden="true" />
          <span className="text-green-500 text-sm">{t("circuitBreakerClosed")}</span>
        </div>
      );
    }

    if (cb.state === "open") {
      return (
        <div className="flex items-center gap-1.5">
          <ShieldAlert className="h-4 w-4 text-status-error" aria-hidden="true" />
          <span className="text-status-error text-sm">{t("circuitBreakerOpen")}</span>
        </div>
      );
    }

    // half_open
    return (
      <div className="flex items-center gap-1.5">
        <Shield className="h-4 w-4 text-amber-500" aria-hidden="true" />
        <span className="text-amber-500 text-sm">{t("circuitBreakerHalfOpen")}</span>
      </div>
    );
  };

  if (upstreams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-cf-sm bg-surface-300 border border-divider flex items-center justify-center mb-4">
          <Server className="w-8 h-8 text-amber-700" aria-hidden="true" />
        </div>
        <h3 className="font-mono text-lg text-amber-500 mb-2">{t("noUpstreams")}</h3>
        <p className="font-sans text-sm text-amber-700">{t("noUpstreamsDesc")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-cf-sm border border-divider overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{tCommon("name")}</TableHead>
            <TableHead>{t("tableProvider")}</TableHead>
            <TableHead>{t("providerType")}</TableHead>
            <TableHead>{t("tableGroup")}</TableHead>
            <TableHead>{t("tableWeight")}</TableHead>
            <TableHead>{t("tableHealth")}</TableHead>
            <TableHead>{t("tableCircuitBreaker")}</TableHead>
            <TableHead>{t("tableBaseUrl")}</TableHead>
            <TableHead>{tCommon("createdAt")}</TableHead>
            <TableHead className="text-right">{tCommon("actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {upstreams.map((upstream) => (
            <TableRow key={upstream.id}>
              <TableCell className="font-medium">{upstream.name}</TableCell>
              <TableCell>{formatProvider(upstream.provider)}</TableCell>
              <TableCell>
                {upstream.provider_type ? (
                  formatProviderType(upstream.provider_type)
                ) : (
                  <span className="text-muted-foreground text-sm">—</span>
                )}
              </TableCell>
              <TableCell>
                {upstream.group_name ? (
                  <Badge variant="secondary">{upstream.group_name}</Badge>
                ) : (
                  <span className="text-amber-700 text-sm">{t("noGroup")}</span>
                )}
              </TableCell>
              <TableCell>
                <code className="px-2 py-0.5 bg-surface-300 text-amber-500 rounded-cf-sm font-mono text-xs border border-divider">
                  {upstream.weight}
                </code>
              </TableCell>
              <TableCell>{formatHealthStatus(upstream)}</TableCell>
              <TableCell className="cursor-pointer hover:bg-muted/50">
                {formatCircuitBreakerStatus(upstream)}
              </TableCell>
              <TableCell>
                <code className="px-2 py-1 bg-surface-300 text-amber-500 rounded-cf-sm font-mono text-xs border border-divider max-w-xs truncate inline-block">
                  {upstream.base_url}
                </code>
              </TableCell>
              <TableCell>
                {formatDistanceToNow(new Date(upstream.created_at), {
                  addSuffix: true,
                  locale: dateLocale,
                })}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="h-8 w-8 text-green-500 hover:bg-green-500/10"
                    onClick={() => onTest(upstream)}
                    aria-label={`${tCommon("test")}: ${upstream.name}`}
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="h-8 w-8 text-amber-500 hover:bg-amber-500/10"
                    onClick={() => onEdit(upstream)}
                    aria-label={`${tCommon("edit")}: ${upstream.name}`}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="h-8 w-8 text-status-error hover:bg-status-error-muted"
                    onClick={() => onDelete(upstream)}
                    aria-label={`${tCommon("delete")}: ${upstream.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
