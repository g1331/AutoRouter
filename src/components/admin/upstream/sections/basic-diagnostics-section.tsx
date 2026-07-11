"use client";

import { useId, useMemo, useState } from "react";
import { CheckCircle2, Copy, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useExecuteUpstreamProbe, useUpstreamProbes } from "@/hooks/use-upstreams";
import { ROUTE_CAPABILITY_DEFINITIONS, resolveRouteCapabilities } from "@/lib/route-capabilities";
import type {
  RouteCapability,
  Upstream,
  UpstreamModelCatalogEntry,
  UpstreamProbeClientProfile,
  UpstreamProbeResponse,
} from "@/types/api";

const PROBE_RESPONSE_PREVIEW_LIMIT = 1600;

const PROBE_CAPABILITY_CLIENT_PROFILES: Partial<
  Record<RouteCapability, readonly UpstreamProbeClientProfile[]>
> = {
  codex_cli_responses: ["codex_cli"],
  openai_responses: ["generic_openai"],
  claude_code_messages: ["claude_code"],
  anthropic_messages: ["generic_anthropic"],
};

const PROBE_TEMPLATE_DEFAULT_MODELS: Partial<
  Record<RouteCapability, Partial<Record<UpstreamProbeClientProfile, string>>>
> = {
  codex_cli_responses: { codex_cli: "gpt-5.4-mini" },
  openai_responses: { generic_openai: "gpt-5.4-mini" },
  claude_code_messages: { claude_code: "claude-sonnet-4-5-20250929" },
  anthropic_messages: { generic_anthropic: "claude-sonnet-4-5-20250929" },
};

function isProbeSupportedCapability(capability: RouteCapability): boolean {
  return Boolean(PROBE_CAPABILITY_CLIENT_PROFILES[capability]);
}

function getDefaultProbeClientProfile(
  capability: RouteCapability | ""
): UpstreamProbeClientProfile | "" {
  if (!capability) {
    return "";
  }
  return PROBE_CAPABILITY_CLIENT_PROFILES[capability]?.[0] ?? "";
}

function getDefaultProbeModel(
  capability: RouteCapability | "",
  clientProfile: UpstreamProbeClientProfile | ""
): string {
  if (!capability || !clientProfile) {
    return "";
  }
  return PROBE_TEMPLATE_DEFAULT_MODELS[capability]?.[clientProfile] ?? "";
}

function getUniqueCatalogModels(catalog: readonly UpstreamModelCatalogEntry[]): string[] {
  return Array.from(new Set(catalog.map((entry) => entry.model))).sort((left, right) =>
    left.localeCompare(right)
  );
}

function formatCatalogTimestamp(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleString();
}

export function BasicDiagnosticsSection({ upstream }: { upstream: Upstream }) {
  const t = useTranslations("upstreams");
  const tCommon = useTranslations("common");
  const probeModelListId = useId();

  const [selectedProbeCapability, setSelectedProbeCapability] = useState<RouteCapability | "">("");
  const [selectedProbeClientProfile, setSelectedProbeClientProfile] = useState<
    UpstreamProbeClientProfile | ""
  >("");
  const [probeModel, setProbeModel] = useState("");
  const [expandedProbeResponseId, setExpandedProbeResponseId] = useState<string | null>(null);
  const [copiedProbeResponseId, setCopiedProbeResponseId] = useState<string | null>(null);

  const executeProbeMutation = useExecuteUpstreamProbe();
  const { data: probeData } = useUpstreamProbes(upstream.id, !!upstream.id);

  const catalogModelOptions = useMemo(
    () => getUniqueCatalogModels(upstream.model_catalog ?? []),
    [upstream.model_catalog]
  );
  const savedProbeCapabilities = useMemo(
    () => resolveRouteCapabilities(upstream.route_capabilities).filter(isProbeSupportedCapability),
    [upstream.route_capabilities]
  );

  const effectiveProbeCapability = savedProbeCapabilities.includes(
    selectedProbeCapability as RouteCapability
  )
    ? selectedProbeCapability
    : (savedProbeCapabilities[0] ?? "");
  const selectableProbeClientProfiles = effectiveProbeCapability
    ? (PROBE_CAPABILITY_CLIENT_PROFILES[effectiveProbeCapability] ?? [])
    : [];
  const effectiveProbeClientProfile = selectableProbeClientProfiles.includes(
    selectedProbeClientProfile as UpstreamProbeClientProfile
  )
    ? selectedProbeClientProfile
    : getDefaultProbeClientProfile(effectiveProbeCapability);
  const defaultProbeModel = getDefaultProbeModel(
    effectiveProbeCapability,
    effectiveProbeClientProfile
  );
  const selectedProbeCapabilityDefinition = effectiveProbeCapability
    ? ROUTE_CAPABILITY_DEFINITIONS.find(
        (definition) => definition.value === effectiveProbeCapability
      )
    : null;

  const mutationProbe =
    executeProbeMutation.data?.upstream_id === upstream.id ? executeProbeMutation.data : null;
  const latestProbe: UpstreamProbeResponse | null =
    mutationProbe ?? probeData?.data?.[0] ?? upstream.probe_results?.[0] ?? null;
  const showFullProbeResponse = !!latestProbe && expandedProbeResponseId === latestProbe.id;
  const copiedProbeResponse = !!latestProbe && copiedProbeResponseId === latestProbe.id;
  const probeResponseText = latestProbe?.response_body || t("probeUpstreamResponseEmpty");
  const hasProbeResponseBody = !!latestProbe?.response_body;
  const probeResponseIsLong = probeResponseText.length > PROBE_RESPONSE_PREVIEW_LIMIT;
  const visibleProbeResponseText =
    probeResponseIsLong && !showFullProbeResponse
      ? `${probeResponseText.slice(0, PROBE_RESPONSE_PREVIEW_LIMIT).trimEnd()}\n…`
      : probeResponseText;
  const probeDisabled =
    !effectiveProbeCapability || !effectiveProbeClientProfile || executeProbeMutation.isPending;

  const handleCopyProbeResponse = async () => {
    if (!latestProbe?.response_body) {
      return;
    }
    try {
      await navigator.clipboard.writeText(latestProbe.response_body);
      setCopiedProbeResponseId(latestProbe.id);
      toast.success(tCommon("copied"));
      setTimeout(() => {
        setCopiedProbeResponseId((current) => (current === latestProbe.id ? null : current));
      }, 2000);
    } catch {
      toast.error(tCommon("error"));
    }
  };

  const handleExecuteProbe = async () => {
    if (!effectiveProbeCapability || !effectiveProbeClientProfile) {
      return;
    }
    try {
      const selectedModel = probeModel.trim() || defaultProbeModel;
      await executeProbeMutation.mutateAsync({
        id: upstream.id,
        data: {
          route_capability: effectiveProbeCapability,
          client_profile: effectiveProbeClientProfile,
          ...(selectedModel ? { model: selectedModel } : {}),
        },
      });
    } catch {
      // Probe errors are surfaced by the mutation toast.
    }
  };

  return (
    <Card variant="outlined" className="border-divider bg-surface-200/70">
      <div className="flex flex-col gap-3 border-b border-divider px-5 py-3.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h3 className="type-label-medium text-foreground">{t("probeDiagnostics")}</h3>
          <p className="type-body-small text-muted-foreground">
            {t("probeDiagnosticsDescription")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void handleExecuteProbe();
          }}
          disabled={probeDisabled}
          className="shrink-0 gap-2"
        >
          {executeProbeMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {executeProbeMutation.isPending ? t("probeRunning") : t("runProbe")}
        </Button>
      </div>

      <CardContent className="space-y-4 p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr]">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              {t("probeRouteCapability")}
            </label>
            <Select
              value={effectiveProbeCapability}
              onValueChange={(value) => {
                const nextCapability = value as RouteCapability;
                setSelectedProbeCapability(nextCapability);
                setSelectedProbeClientProfile(getDefaultProbeClientProfile(nextCapability));
              }}
              disabled={savedProbeCapabilities.length === 0}
            >
              <SelectTrigger aria-label={t("probeRouteCapability")}>
                <SelectValue placeholder={t("probeRouteCapabilityPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {savedProbeCapabilities.map((capability) => {
                  const definition = ROUTE_CAPABILITY_DEFINITIONS.find(
                    (item) => item.value === capability
                  );
                  return (
                    <SelectItem key={capability} value={capability}>
                      {definition ? t(definition.labelKey) : capability}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t("probeClientProfile")}</label>
            <Select
              value={effectiveProbeClientProfile}
              onValueChange={(value) =>
                setSelectedProbeClientProfile(value as UpstreamProbeClientProfile)
              }
              disabled={selectableProbeClientProfiles.length === 0}
            >
              <SelectTrigger aria-label={t("probeClientProfile")}>
                <SelectValue placeholder={t("probeClientProfilePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {selectableProbeClientProfiles.map((profile) => (
                  <SelectItem key={profile} value={profile}>
                    {t(`probeClientProfileValue.${profile}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t("probeModel")}</label>
            <Input
              value={probeModel}
              onChange={(event) => setProbeModel(event.target.value)}
              placeholder={t("probeModelPlaceholder", { model: defaultProbeModel })}
              list={catalogModelOptions.length > 0 ? probeModelListId : undefined}
            />
            {catalogModelOptions.length > 0 && (
              <datalist id={probeModelListId}>
                {catalogModelOptions.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            )}
          </div>
        </div>

        {savedProbeCapabilities.length === 0 ? (
          <p className="rounded-cf-sm border border-divider bg-surface-200/45 px-3 py-2 text-xs text-muted-foreground">
            {t("probeNoSupportedCapability")}
          </p>
        ) : selectedProbeCapabilityDefinition ? (
          <p className="text-[11px] text-muted-foreground">
            {t("probeSelectedRequestProfile", {
              capability: t(selectedProbeCapabilityDefinition.labelKey),
              profile: effectiveProbeClientProfile
                ? t(`probeClientProfileValue.${effectiveProbeClientProfile}`)
                : "--",
            })}
          </p>
        ) : null}

        {latestProbe ? (
          <div className="min-w-0 space-y-3 overflow-hidden rounded-cf-sm border border-divider bg-surface-200/45 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={latestProbe.success ? "success" : "destructive"}>
                {t(`probeStatus.${latestProbe.status}`)}
              </Badge>
              <Badge variant="outline">
                {latestProbe.client_profile} / {latestProbe.route_capability}
              </Badge>
              {latestProbe.latency_ms !== null && (
                <Badge variant="outline">
                  {t("probeLatency")}: {latestProbe.latency_ms}ms
                </Badge>
              )}
              {latestProbe.status_code !== null && (
                <Badge variant="outline">
                  {t("probeStatusCode")}: {latestProbe.status_code}
                </Badge>
              )}
            </div>

            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                {t("probeCheckedAt")}: {formatCatalogTimestamp(latestProbe.checked_at)}
              </div>
              <div>
                {t("probeLayer")}: {latestProbe.layer}
              </div>
              {latestProbe.probe_url && (
                <div className="break-all sm:col-span-2">
                  {t("probeUrl")}: {latestProbe.probe_url}
                </div>
              )}
              {latestProbe.error_message && (
                <div className="break-words text-status-error sm:col-span-2">
                  {t("probeErrorMessage")}: {latestProbe.error_message}
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs font-medium text-muted-foreground">
                  {t("probeUpstreamResponse")}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {probeResponseIsLong && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() =>
                        setExpandedProbeResponseId((current) =>
                          current === latestProbe.id ? null : latestProbe.id
                        )
                      }
                      aria-expanded={showFullProbeResponse}
                    >
                      {showFullProbeResponse
                        ? t("probeCollapseResponse")
                        : t("probeExpandResponse")}
                    </Button>
                  )}
                  {hasProbeResponseBody && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 px-2 text-xs"
                      onClick={() => {
                        void handleCopyProbeResponse();
                      }}
                      aria-label={copiedProbeResponse ? tCommon("copied") : tCommon("copy")}
                    >
                      {copiedProbeResponse ? (
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {copiedProbeResponse ? tCommon("copied") : tCommon("copy")}
                    </Button>
                  )}
                </div>
              </div>
              {probeResponseIsLong && !showFullProbeResponse && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("probeUpstreamResponsePreview", { count: PROBE_RESPONSE_PREVIEW_LIMIT })}
                </p>
              )}
              {probeResponseIsLong && showFullProbeResponse && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("probeUpstreamResponseFullHint")}
                </p>
              )}
              <pre className="mt-2 max-h-56 w-full max-w-full overflow-auto overscroll-contain whitespace-pre-wrap break-all rounded-cf-sm border border-divider bg-surface-300/65 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                {visibleProbeResponseText}
              </pre>
            </div>
          </div>
        ) : (
          <p className="rounded-cf-sm border border-divider bg-surface-200/45 px-3 py-2 text-xs text-muted-foreground">
            {t("probeNoResult")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
