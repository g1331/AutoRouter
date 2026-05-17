"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateGlobalUpstreamFailureRule,
  useCreateUpstreamFailureRule,
  useDeleteUpstreamFailureRule,
  useGlobalUpstreamFailureRules,
  useUpdateUpstreamFailureRule,
  useUpstreamFailureRules,
} from "@/hooks/use-upstreams";
import type { FailoverErrorType, UpstreamFailureRule, UpstreamFailureRuleMatch } from "@/types/api";

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
  const normalizedHeaderName = input.headerName.trim();
  const normalizedHeaderPattern = input.headerPattern.trim();
  return {
    status_codes: parseStatusCodes(input.statusCodes),
    error_types: parseCsvList(input.errorTypes) as FailoverErrorType[],
    body_pattern: input.bodyPattern.trim() || null,
    header_name: normalizedHeaderName && normalizedHeaderPattern ? normalizedHeaderName : null,
    header_pattern:
      normalizedHeaderName && normalizedHeaderPattern ? normalizedHeaderPattern : null,
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

interface RuleConditionDetail {
  key: string;
  label: string;
  value: string;
}

function getRuleConditionDetails(
  match: UpstreamFailureRuleMatch,
  t: ReturnType<typeof useTranslations>
): RuleConditionDetail[] {
  const details: RuleConditionDetail[] = [];
  if (match.status_codes?.length) {
    details.push({
      key: "status_codes",
      label: t("failureRuleStatusCodes"),
      value: match.status_codes.join(", "),
    });
  }
  if (match.error_types?.length) {
    details.push({
      key: "error_types",
      label: t("failureRuleErrorTypes"),
      value: match.error_types.join(", "),
    });
  }
  if (match.body_pattern) {
    details.push({
      key: "body_pattern",
      label: t("failureRuleBodyPattern"),
      value: `/${match.body_pattern}/`,
    });
  }
  if (match.header_name && match.header_pattern) {
    details.push({
      key: "header_pattern",
      label: t("failureRuleHeaderPattern"),
      value: `${match.header_name}: /${match.header_pattern}/`,
    });
  }
  return details;
}

function buildRuleSearchText(rule: UpstreamFailureRule): string {
  const match = rule.match;
  return [
    rule.name,
    rule.enabled ? "enabled" : "disabled",
    match.status_codes?.join(" "),
    match.error_types?.join(" "),
    match.body_pattern,
    match.header_name,
    match.header_pattern,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

interface RegexValidationResult {
  valid: boolean;
  message: string | null;
  regex: RegExp | null;
}

function validateRegexPattern(pattern: string): RegexValidationResult {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return { valid: true, message: null, regex: null };
  }

  try {
    return { valid: true, message: null, regex: new RegExp(trimmed) };
  } catch (error) {
    return {
      valid: false,
      message: error instanceof Error ? error.message : "Invalid regular expression",
      regex: null,
    };
  }
}

function getRegexPreviewMatch(regex: RegExp | null, sample: string): boolean | null {
  if (!regex || !sample) {
    return null;
  }

  regex.lastIndex = 0;
  return regex.test(sample);
}

function RegexPreview({
  label,
  pattern,
  sample,
  onSampleChange,
}: {
  label: string;
  pattern: string;
  sample: string;
  onSampleChange: (value: string) => void;
}) {
  const t = useTranslations("upstreams");
  const validation = useMemo(() => validateRegexPattern(pattern), [pattern]);
  const previewMatched = useMemo(
    () => getRegexPreviewMatch(validation.regex, sample),
    [sample, validation.regex]
  );

  return (
    <div className="space-y-2 rounded-cf-sm border border-divider/60 bg-surface-300/35 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium text-foreground">{label}</div>
        {pattern.trim() ? (
          validation.valid ? (
            previewMatched === null ? (
              <Badge variant="outline" className="border-divider text-[10px]">
                {t("failureRuleRegexWaitingForSample")}
              </Badge>
            ) : previewMatched ? (
              <Badge variant="success" className="text-[10px]">
                {t("failureRuleRegexMatched")}
              </Badge>
            ) : (
              <Badge variant="warning" className="text-[10px]">
                {t("failureRuleRegexNotMatched")}
              </Badge>
            )
          ) : (
            <Badge variant="error" className="text-[10px]">
              {t("failureRuleRegexInvalid")}
            </Badge>
          )
        ) : (
          <Badge variant="outline" className="border-divider text-[10px]">
            {t("failureRuleRegexNotConfigured")}
          </Badge>
        )}
      </div>
      <Textarea
        value={sample}
        onChange={(event) => onSampleChange(event.target.value)}
        placeholder={t("failureRuleRegexSamplePlaceholder")}
        className="min-h-[72px] px-3 py-2 font-mono text-xs"
      />
      {!validation.valid && validation.message ? (
        <p className="text-xs text-status-error" role="alert">
          {t("failureRuleRegexInvalidDetail", { message: validation.message })}
        </p>
      ) : pattern.trim() && sample ? (
        <p
          className={previewMatched ? "text-xs text-status-success" : "text-xs text-status-warning"}
        >
          {previewMatched
            ? t("failureRuleRegexPreviewMatched")
            : t("failureRuleRegexPreviewNotMatched")}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("failureRuleRegexPreviewHint")}</p>
      )}
    </div>
  );
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
  const [ruleSearch, setRuleSearch] = useState("");
  const [bodyPreviewSample, setBodyPreviewSample] = useState("");
  const [headerPreviewSample, setHeaderPreviewSample] = useState("");

  const draftMatch = useMemo(
    () => buildMatch({ statusCodes, errorTypes, bodyPattern, headerName, headerPattern }),
    [bodyPattern, errorTypes, headerName, headerPattern, statusCodes]
  );
  const rules = useMemo(() => rulesQuery.data ?? [], [rulesQuery.data]);
  const normalizedRuleSearch = ruleSearch.trim().toLowerCase();
  const filteredRules = useMemo(() => {
    if (!normalizedRuleSearch) {
      return rules;
    }
    return rules.filter((rule) => buildRuleSearchText(rule).includes(normalizedRuleSearch));
  }, [normalizedRuleSearch, rules]);
  const bodyRegexValidation = useMemo(() => validateRegexPattern(bodyPattern), [bodyPattern]);
  const headerRegexValidation = useMemo(() => validateRegexPattern(headerPattern), [headerPattern]);
  const canCreate = Boolean(
    (scope === "global" || upstreamId) &&
    name.trim() &&
    hasRuleCondition(draftMatch) &&
    bodyRegexValidation.valid &&
    headerRegexValidation.valid
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
    setBodyPreviewSample("");
    setHeaderPreviewSample("");
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
        ) : rules.length ? (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={ruleSearch}
                onChange={(event) => setRuleSearch(event.target.value)}
                placeholder={t("failureRuleSearchPlaceholder")}
                className="pl-8"
              />
            </div>

            {filteredRules.length ? (
              filteredRules.map((rule) => {
                const conditionDetails = getRuleConditionDetails(rule.match, t);
                return (
                  <div
                    key={rule.id}
                    className="rounded-cf-sm border border-divider bg-surface-300/55 px-3 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-medium text-foreground">
                            {rule.name}
                          </div>
                          <Badge
                            variant="outline"
                            className="border-divider px-1.5 py-0 text-[10px]"
                          >
                            {rule.upstream_id
                              ? t("failureRuleScopeLocal")
                              : t("failureRuleScopeGlobal")}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="border-divider px-1.5 py-0 text-[10px]"
                          >
                            {rule.enabled
                              ? t("failureRuleStatusEnabled")
                              : t("failureRuleStatusDisabled")}
                          </Badge>
                        </div>
                        <div className="space-y-1.5">
                          <div className="type-caption text-muted-foreground">
                            {t("failureRuleConditions")}
                          </div>
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {conditionDetails.map((detail) => (
                              <div
                                key={detail.key}
                                className="rounded-cf-sm border border-divider/70 bg-surface-200/45 px-2 py-1.5"
                              >
                                <div className="text-[10px] uppercase text-muted-foreground">
                                  {detail.label}
                                </div>
                                <div className="mt-0.5 break-all font-mono text-xs text-foreground">
                                  {detail.value}
                                </div>
                              </div>
                            ))}
                          </div>
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
                                  toast.error(
                                    t("failureRuleUpdateFailed", { message: error.message })
                                  ),
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
                                  toast.error(
                                    t("failureRuleDeleteFailed", { message: error.message })
                                  ),
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
                );
              })
            ) : (
              <div className="rounded-cf-sm border border-dashed border-divider px-3 py-3 text-xs text-muted-foreground">
                {t("failureRuleNoSearchResults")}
              </div>
            )}
          </>
        ) : (
          <div className="rounded-cf-sm border border-dashed border-divider px-3 py-3 text-xs text-muted-foreground">
            {t(scope === "global" ? "globalFailureRulesEmpty" : "localFailureRulesEmpty")}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("failureRuleNamePlaceholder")}
          />
          <label className="flex h-11 items-center gap-2 rounded-cf-sm border border-divider/60 bg-surface-300/35 px-3 text-sm font-medium text-foreground">
            <Checkbox
              checked={enabled}
              onCheckedChange={(checked) => setEnabled(checked === true)}
            />
            {t("failureRuleCreateEnabled")}
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
            aria-invalid={!bodyRegexValidation.valid}
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
              aria-invalid={!headerRegexValidation.valid}
            />
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <RegexPreview
            label={t("failureRuleBodyRegexPreview")}
            pattern={bodyPattern}
            sample={bodyPreviewSample}
            onSampleChange={setBodyPreviewSample}
          />
          <RegexPreview
            label={t("failureRuleHeaderRegexPreview")}
            pattern={headerPattern}
            sample={headerPreviewSample}
            onSampleChange={setHeaderPreviewSample}
          />
        </div>
        <div className="flex justify-end">
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
