"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  useCreateGlobalUpstreamFailureRule,
  useCreateUpstreamFailureRule,
  useDeleteUpstreamFailureRule,
  useGlobalUpstreamFailureRules,
  useUpdateUpstreamFailureRule,
  useUpstreamFailureRules,
} from "@/hooks/use-upstreams";
import type { FailoverErrorType, UpstreamFailureRuleMatch } from "@/types/api";

interface UpstreamFailureRulesEditorProps {
  upstreamId?: string;
  scope?: "upstream" | "global";
}

function parseCsvList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseStatusCodes(value: string): number[] | null {
  const codes = parseCsvList(value)
    .map((item) => Number(item))
    .filter((code) => Number.isInteger(code) && code >= 100 && code <= 599);
  return codes.length > 0 ? codes : null;
}

function buildMatch(input: {
  statusCodes: string;
  errorTypes: string;
  bodyPattern: string;
  headerName: string;
  headerPattern: string;
}): UpstreamFailureRuleMatch {
  return {
    status_codes: parseStatusCodes(input.statusCodes),
    error_types: parseCsvList(input.errorTypes) as FailoverErrorType[],
    body_pattern: input.bodyPattern.trim() || null,
    header_name: input.headerName.trim() || null,
    header_pattern: input.headerPattern.trim() || null,
  };
}

function hasRuleCondition(match: UpstreamFailureRuleMatch): boolean {
  return Boolean(
    match.status_codes?.length ||
    match.error_types?.length ||
    match.body_pattern?.trim() ||
    (match.header_name?.trim() && match.header_pattern?.trim())
  );
}

function summarizeMatch(match: UpstreamFailureRuleMatch): string[] {
  const parts: string[] = [];
  if (match.status_codes?.length) parts.push(`HTTP ${match.status_codes.join(",")}`);
  if (match.error_types?.length) parts.push(match.error_types.join(","));
  if (match.body_pattern) parts.push(`body /${match.body_pattern}/`);
  if (match.header_name && match.header_pattern) {
    parts.push(`${match.header_name}: /${match.header_pattern}/`);
  }
  return parts;
}

export function UpstreamFailureRulesEditor({
  upstreamId,
  scope = "upstream",
}: UpstreamFailureRulesEditorProps) {
  const t = useTranslations("upstreams");
  const localRulesQuery = useUpstreamFailureRules(
    upstreamId,
    scope === "upstream" && Boolean(upstreamId)
  );
  const globalRulesQuery = useGlobalUpstreamFailureRules(scope === "global");
  const rulesQuery = scope === "global" ? globalRulesQuery : localRulesQuery;
  const createRule = useCreateUpstreamFailureRule();
  const createGlobalRule = useCreateGlobalUpstreamFailureRule();
  const updateRule = useUpdateUpstreamFailureRule();
  const deleteRule = useDeleteUpstreamFailureRule();
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [statusCodes, setStatusCodes] = useState("");
  const [errorTypes, setErrorTypes] = useState("");
  const [bodyPattern, setBodyPattern] = useState("");
  const [headerName, setHeaderName] = useState("");
  const [headerPattern, setHeaderPattern] = useState("");

  const draftMatch = useMemo(
    () => buildMatch({ statusCodes, errorTypes, bodyPattern, headerName, headerPattern }),
    [bodyPattern, errorTypes, headerName, headerPattern, statusCodes]
  );
  const canCreate = Boolean(
    (scope === "global" || upstreamId) && name.trim() && hasRuleCondition(draftMatch)
  );

  if (scope === "upstream" && !upstreamId) {
    return (
      <div className="rounded-cf-sm border border-divider/50 bg-surface-200/35 px-3 py-3 text-xs text-muted-foreground">
        {t("localFailureRulesCreateModeHint")}
      </div>
    );
  }

  const resetDraft = () => {
    setName("");
    setEnabled(true);
    setStatusCodes("");
    setErrorTypes("");
    setBodyPattern("");
    setHeaderName("");
    setHeaderPattern("");
  };

  const handleCreate = async () => {
    if (!canCreate) return;
    try {
      const data = {
        name: name.trim(),
        enabled,
        match: draftMatch,
      };
      if (scope === "global") {
        await createGlobalRule.mutateAsync({ data });
      } else if (upstreamId) {
        await createRule.mutateAsync({
          upstreamId,
          data,
        });
      }
      toast.success(t("failureRuleCreated"));
      resetDraft();
    } catch (error) {
      toast.error(t("failureRuleCreateFailed", { message: (error as Error).message }));
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {rulesQuery.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("failureRulesLoading")}
          </div>
        ) : rulesQuery.data?.length ? (
          rulesQuery.data.map((rule) => (
            <div
              key={rule.id}
              className="rounded-cf-sm border border-divider bg-surface-300/55 px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{rule.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {summarizeMatch(rule.match).map((part) => (
                      <Badge key={part} variant="outline" className="px-1.5 py-0 text-[10px]">
                        {part}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    aria-label={t("failureRuleEnabled")}
                    checked={rule.enabled}
                    onCheckedChange={(nextEnabled) => {
                      updateRule.mutate(
                        {
                          ...(scope === "global" ? { scope } : {}),
                          upstreamId,
                          ruleId: rule.id,
                          data: { enabled: nextEnabled },
                        },
                        {
                          onSuccess: () => toast.success(t("failureRuleUpdated")),
                          onError: (error) =>
                            toast.error(t("failureRuleUpdateFailed", { message: error.message })),
                        }
                      );
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-status-error hover:bg-status-error-muted"
                    onClick={() =>
                      deleteRule.mutate(
                        {
                          ...(scope === "global" ? { scope } : {}),
                          upstreamId,
                          ruleId: rule.id,
                        },
                        {
                          onSuccess: () => toast.success(t("failureRuleDeleted")),
                          onError: (error) =>
                            toast.error(t("failureRuleDeleteFailed", { message: error.message })),
                        }
                      )
                    }
                    aria-label={t("deleteFailureRule")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-cf-sm border border-dashed border-divider px-3 py-3 text-xs text-muted-foreground">
            {t(scope === "global" ? "globalFailureRulesEmpty" : "localFailureRulesEmpty")}
          </div>
        )}
      </div>

      <div className="rounded-cf-sm border border-divider/60 bg-surface-200/35 px-3 py-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("failureRuleNamePlaceholder")}
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={enabled}
              onCheckedChange={(checked) => setEnabled(checked === true)}
            />
            {t("failureRuleEnabled")}
          </label>
          <Input
            value={statusCodes}
            onChange={(event) => setStatusCodes(event.target.value)}
            placeholder={t("failureRuleStatusCodesPlaceholder")}
          />
          <Input
            value={errorTypes}
            onChange={(event) => setErrorTypes(event.target.value)}
            placeholder={t("failureRuleErrorTypesPlaceholder")}
          />
          <Input
            value={bodyPattern}
            onChange={(event) => setBodyPattern(event.target.value)}
            placeholder={t("failureRuleBodyPatternPlaceholder")}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={headerName}
              onChange={(event) => setHeaderName(event.target.value)}
              placeholder={t("failureRuleHeaderNamePlaceholder")}
            />
            <Input
              value={headerPattern}
              onChange={(event) => setHeaderPattern(event.target.value)}
              placeholder={t("failureRuleHeaderPatternPlaceholder")}
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canCreate || createRule.isPending || createGlobalRule.isPending}
            onClick={handleCreate}
          >
            {createRule.isPending || createGlobalRule.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-2 h-3.5 w-3.5" />
            )}
            {t("addFailureRule")}
          </Button>
        </div>
      </div>
    </div>
  );
}
