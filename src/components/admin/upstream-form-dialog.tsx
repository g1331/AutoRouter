"use client";

import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type UIEvent,
} from "react";
import { useForm, useWatch, useFieldArray, type DeepPartial } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertTriangle,
  ArrowDownToLine,
  CircleAlert,
  Coins,
  FileText,
  Gauge,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Link2,
  Plus,
  RefreshCw,
  Route,
  Search,
  Shield,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateUpstream,
  useExecuteUpstreamProbe,
  usePreviewUpstreamCatalog,
  useUpstreamProbes,
  useUpdateUpstream,
} from "@/hooks/use-upstreams";
import type {
  RouteCapability,
  Upstream,
  UpstreamQueuePolicy,
  UpstreamModelCatalogEntry,
  UpstreamModelCatalogSource,
  UpstreamModelCatalogStatus,
  UpstreamModelDiscoveryConfig,
  UpstreamModelDiscoveryMode,
  UpstreamModelRule,
  UpstreamModelRuleSource,
  UpstreamModelRuleType,
  UpstreamCatalogPreviewResponse,
  UpstreamProbeClientProfile,
  UpstreamProbeResponse,
} from "@/types/api";
import { Switch } from "@/components/ui/switch";
import {
  ROUTE_CAPABILITY_VALUES,
  ROUTE_CAPABILITY_DEFINITIONS,
  areSingleProviderCapabilities,
  getPrimaryProviderByCapabilities,
  resolveRouteCapabilities,
} from "@/lib/route-capabilities";
import { RouteCapabilityMultiSelect } from "@/components/admin/route-capability-badges";
import { DEFAULT_CIRCUIT_BREAKER_CONFIG } from "@/lib/circuit-breaker-defaults";
import { inferDefaultModelDiscoveryConfig } from "@/lib/services/upstream-model-types";
import { cn } from "@/lib/utils";

interface UpstreamFormDialogProps {
  upstream?: Upstream | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
}

// Circuit breaker config schema
const circuitBreakerConfigSchema = z
  .object({
    failure_threshold: z.number().int().min(1).max(100).optional(),
    success_threshold: z.number().int().min(1).max(100).optional(),
    open_duration: z.number().int().min(1).max(300).optional(),
    probe_interval: z.number().int().min(1).max(60).optional(),
    first_byte_timeout: z.number().int().min(1).max(300).optional(),
    stream_idle_timeout: z.number().int().min(1).max(300).optional(),
  })
  .nullable();

const failureRuleConfigSchema = z.object({
  use_global_rules: z.boolean(),
});

// Affinity migration config schema
const affinityMigrationConfigSchema = z
  .object({
    enabled: z.boolean(),
    metric: z.enum(["tokens", "length"]),
    threshold: z.preprocess(
      (value) => coerceNumericInput(value, undefined),
      z.number().int().min(1).max(10000000)
    ),
  })
  .nullable();

const spendingRuleSchema = z.object({
  period_type: z.enum(["daily", "monthly", "rolling"]),
  limit: z.coerce.number().positive(),
  period_hours: z.number().int().min(1).max(8760).nullable(),
});

const queuePolicyFormSchema = z.object({
  enabled: z.boolean(),
  timeout_ms: z.preprocess(
    (value) => coerceNumericInput(value, undefined),
    z.number().int().positive()
  ),
  max_queue_length: z.preprocess(
    (value) => coerceNumericInput(value, null),
    z.number().int().positive().nullable()
  ),
});

const ROLLING_DEFAULT_PERIOD_HOURS = 24;
const DEFAULT_QUEUE_POLICY_TIMEOUT_MS = 30000;
const PROBE_RESPONSE_PREVIEW_LIMIT = 1600;
const MODEL_DISCOVERY_MODE_VALUES = [
  "openai_compatible",
  "anthropic_native",
  "gemini_native",
  "gemini_openai_compatible",
  "custom",
  "litellm",
] as const satisfies readonly UpstreamModelDiscoveryMode[];
const MODEL_RULE_TYPE_VALUES = [
  "exact",
  "regex",
  "alias",
] as const satisfies readonly UpstreamModelRuleType[];
const MODEL_RULE_SOURCE_VALUES = [
  "manual",
  "native",
  "inferred",
  "litellm",
] as const satisfies readonly UpstreamModelRuleSource[];
const MODEL_ROW_HEIGHT = 42;
const MODEL_LIST_OVERSCAN = 8;
const DEFAULT_MODEL_LIST_HEIGHT = 436;
const MODEL_RULE_ALIAS_TARGET_REQUIRED_MESSAGE = "modelRuleAliasTargetRequired";

const modelDiscoverySchema = z.object({
  mode: z.enum(MODEL_DISCOVERY_MODE_VALUES),
  custom_endpoint: z.string(),
  enable_lite_llm_fallback: z.boolean(),
  auto_refresh_enabled: z.boolean(),
});

const modelRuleSchema = z
  .object({
    type: z.enum(MODEL_RULE_TYPE_VALUES),
    value: z.string().trim().min(1),
    target_model: z.string().trim().nullable().optional(),
    source: z.enum(MODEL_RULE_SOURCE_VALUES),
    display_label: z.string().trim().nullable().optional(),
  })
  .refine((rule) => rule.type !== "alias" || Boolean(rule.target_model?.trim()), {
    message: MODEL_RULE_ALIAS_TARGET_REQUIRED_MESSAGE,
    path: ["target_model"],
  });

// Preserve transient empty-string edits in the input, and only coerce to numbers at validation time.
function coerceNumericInput(
  value: unknown,
  emptyValue: null | undefined
): number | null | undefined | unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return emptyValue;
  }

  return Number(trimmed);
}

function getNumericInputValue(value: unknown): string | number {
  return typeof value === "string" || typeof value === "number" ? value : "";
}

function coerceOptionalNumber(value: unknown): number | undefined {
  return coerceNumericInput(value, undefined) as number | undefined;
}

function normalizeUpstreamFormValuesForDirtyCheck(
  values: Readonly<DeepPartial<UpstreamFormValues>> | undefined
): Readonly<DeepPartial<UpstreamFormValues>> | undefined {
  if (!values) {
    return values;
  }

  return {
    ...values,
    priority: coerceNumericInput(values.priority, undefined),
    weight: coerceNumericInput(values.weight, undefined),
    billing_input_multiplier: coerceNumericInput(values.billing_input_multiplier, undefined),
    billing_output_multiplier: coerceNumericInput(values.billing_output_multiplier, undefined),
    queue_policy: values.queue_policy
      ? values.queue_policy.enabled
        ? {
            ...values.queue_policy,
            timeout_ms: coerceNumericInput(values.queue_policy.timeout_ms, undefined),
            max_queue_length: coerceNumericInput(values.queue_policy.max_queue_length, null),
          }
        : {
            enabled: false,
            timeout_ms: DEFAULT_QUEUE_POLICY_TIMEOUT_MS,
            max_queue_length: null,
          }
      : {
          enabled: false,
          timeout_ms: DEFAULT_QUEUE_POLICY_TIMEOUT_MS,
          max_queue_length: null,
        },
    spending_rules: values.spending_rules?.map((rule) =>
      rule
        ? {
            ...rule,
            limit: coerceNumericInput(rule.limit, undefined),
          }
        : rule
    ),
    model_discovery: values.model_discovery
      ? {
          ...values.model_discovery,
          custom_endpoint: values.model_discovery.custom_endpoint?.trim() || "",
        }
      : values.model_discovery,
    model_rules: values.model_rules?.map((rule) =>
      rule
        ? {
            ...rule,
            value: rule.value?.trim() || "",
            target_model: rule.target_model?.trim() || null,
            display_label: rule.display_label?.trim() || null,
          }
        : rule
    ),
    circuit_breaker_config: values.circuit_breaker_config
      ? {
          failure_threshold: coerceOptionalNumber(values.circuit_breaker_config.failure_threshold),
          success_threshold: coerceOptionalNumber(values.circuit_breaker_config.success_threshold),
          open_duration: coerceOptionalNumber(values.circuit_breaker_config.open_duration),
          probe_interval: coerceOptionalNumber(values.circuit_breaker_config.probe_interval),
          first_byte_timeout: coerceOptionalNumber(
            values.circuit_breaker_config.first_byte_timeout
          ),
          stream_idle_timeout: coerceOptionalNumber(
            values.circuit_breaker_config.stream_idle_timeout
          ),
        }
      : values.circuit_breaker_config,
    failure_rule_config: values.failure_rule_config
      ? {
          use_global_rules: values.failure_rule_config.use_global_rules ?? true,
        }
      : { use_global_rules: true },
    affinity_migration: values.affinity_migration
      ? {
          ...values.affinity_migration,
          threshold: coerceNumericInput(values.affinity_migration.threshold, undefined),
        }
      : values.affinity_migration,
  };
}

function hasValidRollingPeriodHours(rules: z.input<typeof spendingRuleSchema>[]): boolean {
  return rules.every(
    (rule) =>
      rule.period_type !== "rolling" || (rule.period_hours != null && rule.period_hours >= 1)
  );
}

// Schema for create mode - api_key is required
const createUpstreamFormSchema = z
  .object({
    name: z.string().min(1).max(100),
    base_url: z.string().url(),
    official_website_url: z.union([z.literal(""), z.string().url()]),
    api_key: z.string().min(1),
    description: z.string().max(500),
    max_concurrency: z.number().int().positive().nullable(),
    priority: z.preprocess(
      (value) => coerceNumericInput(value, undefined),
      z.number().int().min(0).max(100)
    ),
    weight: z.preprocess(
      (value) => coerceNumericInput(value, undefined),
      z.number().int().min(1).max(100)
    ),
    billing_input_multiplier: z.preprocess(
      (value) => coerceNumericInput(value, undefined),
      z.number().min(0).max(100)
    ),
    billing_output_multiplier: z.preprocess(
      (value) => coerceNumericInput(value, undefined),
      z.number().min(0).max(100)
    ),
    queue_policy: queuePolicyFormSchema,
    spending_rules: z.array(spendingRuleSchema),
    route_capabilities: z.array(z.enum(ROUTE_CAPABILITY_VALUES)),
    model_discovery: modelDiscoverySchema,
    model_rules: z.array(modelRuleSchema),
    circuit_breaker_config: circuitBreakerConfigSchema,
    failure_rule_config: failureRuleConfigSchema,
    affinity_migration: affinityMigrationConfigSchema,
  })
  .refine((data) => hasValidRollingPeriodHours(data.spending_rules), {
    message: "period_hours is required when period_type is 'rolling'",
    path: ["spending_rules"],
  })
  .refine((data) => areSingleProviderCapabilities(data.route_capabilities), {
    message: "All route capabilities must belong to the same provider",
    path: ["route_capabilities"],
  });

// Schema for edit mode - api_key is optional (leave empty to keep unchanged)
const editUpstreamFormSchema = z
  .object({
    name: z.string().min(1).max(100),
    base_url: z.string().url(),
    official_website_url: z.union([z.literal(""), z.string().url()]),
    api_key: z.string(),
    description: z.string().max(500),
    max_concurrency: z.number().int().positive().nullable(),
    priority: z.preprocess(
      (value) => coerceNumericInput(value, undefined),
      z.number().int().min(0).max(100)
    ),
    weight: z.preprocess(
      (value) => coerceNumericInput(value, undefined),
      z.number().int().min(1).max(100)
    ),
    billing_input_multiplier: z.preprocess(
      (value) => coerceNumericInput(value, undefined),
      z.number().min(0).max(100)
    ),
    billing_output_multiplier: z.preprocess(
      (value) => coerceNumericInput(value, undefined),
      z.number().min(0).max(100)
    ),
    queue_policy: queuePolicyFormSchema,
    spending_rules: z.array(spendingRuleSchema),
    route_capabilities: z.array(z.enum(ROUTE_CAPABILITY_VALUES)),
    model_discovery: modelDiscoverySchema,
    model_rules: z.array(modelRuleSchema),
    circuit_breaker_config: circuitBreakerConfigSchema,
    failure_rule_config: failureRuleConfigSchema,
    affinity_migration: affinityMigrationConfigSchema,
  })
  .refine((data) => hasValidRollingPeriodHours(data.spending_rules), {
    message: "period_hours is required when period_type is 'rolling'",
    path: ["spending_rules"],
  })
  .refine((data) => areSingleProviderCapabilities(data.route_capabilities), {
    message: "All route capabilities must belong to the same provider",
    path: ["route_capabilities"],
  });

type UpstreamFormValues = z.input<typeof editUpstreamFormSchema>;
type UpstreamFormData = z.output<typeof editUpstreamFormSchema>;
type CatalogSourceFilter = "all" | UpstreamModelCatalogSource;

function buildQueuePolicyFormValue(
  queuePolicy: Upstream["queue_policy"] | null | undefined
): UpstreamFormValues["queue_policy"] {
  return {
    enabled: queuePolicy?.enabled ?? false,
    timeout_ms: queuePolicy?.timeout_ms ?? DEFAULT_QUEUE_POLICY_TIMEOUT_MS,
    max_queue_length: queuePolicy?.max_queue_length ?? null,
  };
}

function normalizeQueuePolicyForSubmit(
  queuePolicy: UpstreamFormData["queue_policy"]
): UpstreamQueuePolicy | null {
  if (!queuePolicy.enabled) {
    return null;
  }

  return {
    enabled: true,
    timeout_ms: queuePolicy.timeout_ms,
    max_queue_length: queuePolicy.max_queue_length ?? null,
  };
}

interface CatalogWorkspaceState {
  modelCatalog: UpstreamModelCatalogEntry[];
  modelCatalogUpdatedAt: string | null;
  modelCatalogLastStatus: UpstreamModelCatalogStatus | null;
  modelCatalogLastError: string | null;
  modelCatalogLastFailedAt: string | null;
}

function createEmptyModelRule(
  type: UpstreamModelRuleType = "exact"
): UpstreamFormValues["model_rules"][number] {
  return {
    type,
    value: "",
    target_model: type === "alias" ? "" : null,
    source: "manual",
    display_label: null,
  };
}

function toFormModelDiscoveryValue(
  modelDiscovery: Upstream["model_discovery"] | null | undefined,
  routeCapabilities: RouteCapability[] | null | undefined
): UpstreamFormValues["model_discovery"] {
  const inferred = inferDefaultModelDiscoveryConfig(routeCapabilities);

  return {
    mode: modelDiscovery?.mode ?? inferred?.mode ?? "openai_compatible",
    custom_endpoint: modelDiscovery?.custom_endpoint ?? inferred?.customEndpoint ?? "",
    enable_lite_llm_fallback:
      modelDiscovery?.enable_lite_llm_fallback ?? inferred?.enableLiteLlmFallback ?? false,
    auto_refresh_enabled:
      modelDiscovery?.auto_refresh_enabled ?? inferred?.autoRefreshEnabled ?? false,
  };
}

function toApiModelDiscoveryValue(
  modelDiscovery: UpstreamFormData["model_discovery"]
): UpstreamModelDiscoveryConfig {
  return {
    mode: modelDiscovery.mode,
    custom_endpoint: modelDiscovery.custom_endpoint.trim() || null,
    enable_lite_llm_fallback: modelDiscovery.enable_lite_llm_fallback,
    auto_refresh_enabled: modelDiscovery.auto_refresh_enabled,
  };
}

function toFormModelRulesValue(
  modelRules: Upstream["model_rules"] | null | undefined
): UpstreamFormValues["model_rules"] {
  return (modelRules ?? []).map((rule) => ({
    type: rule.type,
    value: rule.value,
    target_model: rule.target_model ?? null,
    source: rule.source,
    display_label: rule.display_label ?? null,
  }));
}

function toApiModelRulesValue(
  modelRules: UpstreamFormData["model_rules"]
): UpstreamModelRule[] | null {
  const normalizedRules = modelRules
    .map((rule) => ({
      type: rule.type,
      value: rule.value.trim(),
      target_model: rule.type === "alias" ? rule.target_model?.trim() || null : null,
      source: rule.source,
      display_label: rule.display_label?.trim() || null,
    }))
    .filter((rule) => rule.value.length > 0);

  return normalizedRules.length > 0 ? normalizedRules : null;
}

function buildCatalogWorkspaceState(upstream?: Upstream | null): CatalogWorkspaceState {
  const modelCatalog = upstream?.model_catalog ?? [];
  const legacyLiteLlmCatalog =
    modelCatalog.some((entry) => entry.source === "inferred") &&
    (upstream?.model_discovery?.mode === "litellm" ||
      (upstream?.model_discovery?.enable_lite_llm_fallback === true &&
        modelCatalog.every((entry) => entry.source === "inferred" || entry.source === "litellm")));

  return {
    modelCatalog: legacyLiteLlmCatalog
      ? modelCatalog.map((entry) =>
          entry.source === "inferred" ? { ...entry, source: "litellm" } : entry
        )
      : modelCatalog,
    modelCatalogUpdatedAt: upstream?.model_catalog_updated_at ?? null,
    modelCatalogLastStatus: upstream?.model_catalog_last_status ?? null,
    modelCatalogLastError: upstream?.model_catalog_last_error ?? null,
    modelCatalogLastFailedAt: upstream?.model_catalog_last_failed_at ?? null,
  };
}

function applyCatalogPreviewToUpstream(
  upstream: Upstream,
  preview: UpstreamCatalogPreviewResponse
): Upstream {
  return {
    ...upstream,
    model_discovery: preview.model_discovery,
    model_catalog: preview.model_catalog,
    model_catalog_updated_at: preview.model_catalog_updated_at,
    model_catalog_last_status: preview.model_catalog_last_status,
    model_catalog_last_error: preview.model_catalog_last_error,
    model_catalog_last_failed_at: preview.model_catalog_last_failed_at,
  };
}

function areCatalogWorkspaceStatesEqual(
  left: CatalogWorkspaceState,
  right: CatalogWorkspaceState
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function importCatalogModelsIntoRules(
  catalog: UpstreamModelCatalogEntry[],
  selectedModels: string[],
  currentRules: UpstreamFormValues["model_rules"]
): UpstreamFormValues["model_rules"] {
  const catalogByModel = new Map(catalog.map((entry) => [entry.model, entry]));
  const nextRules = [...currentRules];

  for (const model of selectedModels) {
    const catalogEntry = catalogByModel.get(model);
    if (!catalogEntry) {
      continue;
    }

    const importedRule: UpstreamFormValues["model_rules"][number] = {
      type: "exact",
      value: catalogEntry.model,
      target_model: null,
      source: catalogEntry.source,
      display_label: null,
    };
    const alreadyPresent = nextRules.some(
      (rule) =>
        rule.type === importedRule.type &&
        rule.value === importedRule.value &&
        (rule.target_model ?? null) === importedRule.target_model &&
        rule.source === importedRule.source
    );

    if (!alreadyPresent) {
      nextRules.push(importedRule);
    }
  }

  return nextRules;
}

function buildUpstreamFormDefaults(upstream?: Upstream | null): UpstreamFormValues {
  return {
    name: upstream?.name ?? "",
    base_url: upstream?.base_url ?? "",
    official_website_url: upstream?.official_website_url ?? "",
    api_key: "",
    description: upstream?.description || "",
    max_concurrency: upstream?.max_concurrency ?? null,
    priority: upstream?.priority ?? 0,
    weight: upstream?.weight ?? 1,
    billing_input_multiplier: upstream?.billing_input_multiplier ?? 1,
    billing_output_multiplier: upstream?.billing_output_multiplier ?? 1,
    queue_policy: buildQueuePolicyFormValue(upstream?.queue_policy ?? null),
    spending_rules: (upstream?.spending_rules ?? []).map((rule) => ({
      period_type: rule.period_type as "daily" | "monthly" | "rolling",
      limit: rule.limit,
      period_hours:
        rule.period_type === "rolling" ? (rule.period_hours ?? ROLLING_DEFAULT_PERIOD_HOURS) : null,
    })),
    route_capabilities: upstream?.route_capabilities ?? [],
    model_discovery: toFormModelDiscoveryValue(
      upstream?.model_discovery ?? null,
      upstream?.route_capabilities ?? []
    ),
    model_rules: toFormModelRulesValue(upstream?.model_rules),
    circuit_breaker_config: upstream?.circuit_breaker?.config
      ? {
          failure_threshold: upstream.circuit_breaker.config.failure_threshold,
          success_threshold: upstream.circuit_breaker.config.success_threshold,
          open_duration: upstream.circuit_breaker.config.open_duration,
          probe_interval: upstream.circuit_breaker.config.probe_interval,
          first_byte_timeout: upstream.circuit_breaker.config.first_byte_timeout,
          stream_idle_timeout: upstream.circuit_breaker.config.stream_idle_timeout,
        }
      : null,
    failure_rule_config: upstream?.failure_rule_config ?? { use_global_rules: true },
    affinity_migration: upstream?.affinity_migration ?? null,
  };
}

function buildCatalogRefreshDependencySnapshot(
  values: Readonly<DeepPartial<UpstreamFormValues>> | undefined
) {
  return {
    base_url: values?.base_url?.trim() ?? "",
    route_capabilities: values?.route_capabilities ?? [],
    model_discovery: values?.model_discovery
      ? {
          mode: values.model_discovery.mode ?? "openai_compatible",
          custom_endpoint: values.model_discovery.custom_endpoint?.trim() || "",
          enable_lite_llm_fallback: values.model_discovery.enable_lite_llm_fallback ?? false,
          auto_refresh_enabled: values.model_discovery.auto_refresh_enabled ?? false,
        }
      : null,
    api_key_changed: Boolean(values?.api_key?.trim()),
  };
}

const V1_AUTO_APPEND_CAPABILITIES = new Set<RouteCapability>([
  "openai_responses",
  "codex_cli_responses",
  "anthropic_messages",
  "claude_code_messages",
  "openai_chat_compatible",
  "openai_extended",
]);

const CAPABILITY_PREVIEW_PATHS: Record<RouteCapability, string> = {
  openai_responses: "responses",
  codex_cli_responses: "responses",
  anthropic_messages: "messages",
  claude_code_messages: "messages",
  openai_chat_compatible: "chat/completions",
  openai_extended: "completions",
  gemini_native_generate: "v1beta/models/{model}:generateContent",
  gemini_code_assist_internal: "v1internal:generateContent",
};

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

type AdvancedSectionId =
  | "advanced-priority-weight"
  | "advanced-model-routing"
  | "advanced-billing-multipliers"
  | "advanced-spending-quota"
  | "advanced-capacity-control"
  | "advanced-circuit-breaker"
  | "advanced-failure-rules"
  | "advanced-affinity-migration";

type BasicSectionId =
  | "basic-name"
  | "basic-profile"
  | "basic-route-endpoint"
  | "basic-api-key"
  | "basic-diagnostics";
type ConfigSectionId = BasicSectionId | AdvancedSectionId;
type ConfigCategoryKey =
  | "configCategoryBasic"
  | "configCategoryStrategy"
  | "configCategoryReliability";

interface ConfigSectionEntry {
  id: ConfigSectionId;
  label: string;
  icon: LucideIcon;
  category: ConfigCategoryKey;
}

interface ConfigSectionGroup {
  category: ConfigCategoryKey;
  sections: ConfigSectionEntry[];
}

interface EndpointPreviewState {
  normalizedBaseUrl: string;
  previewUrl: string;
  previewPath: string;
  duplicateV1Warning: boolean;
  autoAppendV1Applied: boolean;
}

interface ModelDiscoveryPreviewState {
  apiRoot: string;
  requestUrl: string | null;
  authProfile: "bearer" | "anthropic" | "query_key" | "public";
}

function shouldAutoAppendV1(routeCapabilities: RouteCapability[] | null | undefined): boolean {
  return (routeCapabilities ?? []).some((capability) =>
    V1_AUTO_APPEND_CAPABILITIES.has(capability)
  );
}

function getPreviewPath(routeCapabilities: RouteCapability[] | null | undefined): string {
  const firstCapability = (routeCapabilities ?? [])[0];
  if (!firstCapability) {
    return CAPABILITY_PREVIEW_PATHS.openai_chat_compatible;
  }
  return (
    CAPABILITY_PREVIEW_PATHS[firstCapability] ?? CAPABILITY_PREVIEW_PATHS.openai_chat_compatible
  );
}

function resolveEndpointPreview(
  rawBaseUrl: string,
  routeCapabilities: RouteCapability[] | null | undefined
): EndpointPreviewState | null {
  const trimmed = rawBaseUrl.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const autoAppendV1 = shouldAutoAppendV1(routeCapabilities);
    const normalizedPathname = url.pathname.replace(/\/+$/, "") || "/";
    const manualV1Present = normalizedPathname.toLowerCase().endsWith("/v1");

    let finalPathname = normalizedPathname;
    let autoAppendV1Applied = false;
    if (autoAppendV1 && !manualV1Present) {
      finalPathname = `${normalizedPathname === "/" ? "" : normalizedPathname}/v1`;
      autoAppendV1Applied = true;
    }

    url.pathname = finalPathname || "/";
    const normalizedBaseUrl = url.toString().replace(/\/$/, "");
    const previewPath = getPreviewPath(routeCapabilities);
    const previewUrl = `${normalizedBaseUrl}/${previewPath.replace(/^\//, "")}`;

    return {
      normalizedBaseUrl,
      previewUrl,
      previewPath,
      duplicateV1Warning: autoAppendV1 && manualV1Present,
      autoAppendV1Applied,
    };
  } catch {
    return null;
  }
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function stripTrailingModelsPath(pathname: string): string {
  if (pathname.endsWith("/models")) {
    return pathname.slice(0, -"/models".length) || "/";
  }
  return pathname || "/";
}

function normalizeApiRootForDiscoveryPreview(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.hash = "";
  url.search = "";
  url.pathname = stripTrailingModelsPath(stripTrailingSlash(url.pathname || "/"));
  return url.toString().replace(/\/$/, url.pathname === "/" ? "" : "");
}

function resolveDiscoveryPreview(
  rawBaseUrl: string,
  routeCapabilities: RouteCapability[] | null | undefined,
  modelDiscovery: UpstreamFormValues["model_discovery"] | undefined
): ModelDiscoveryPreviewState | null {
  const trimmedBaseUrl = rawBaseUrl.trim();
  if (!trimmedBaseUrl) {
    return null;
  }

  try {
    const apiRoot = normalizeApiRootForDiscoveryPreview(trimmedBaseUrl);
    const provider = getPrimaryProviderByCapabilities(resolveRouteCapabilities(routeCapabilities));
    const mode = modelDiscovery?.mode ?? "openai_compatible";
    let requestUrl: URL;
    let authProfile: ModelDiscoveryPreviewState["authProfile"];

    switch (mode) {
      case "anthropic_native":
        requestUrl = new URL("models", `${apiRoot}/`);
        authProfile = "anthropic";
        break;
      case "gemini_native":
        requestUrl = new URL("models", `${apiRoot}/`);
        requestUrl.searchParams.set("key", "API_KEY");
        authProfile = "query_key";
        break;
      case "custom": {
        const customEndpoint = modelDiscovery?.custom_endpoint.trim();
        if (!customEndpoint) {
          return {
            apiRoot,
            requestUrl: null,
            authProfile:
              provider === "anthropic"
                ? "anthropic"
                : provider === "google"
                  ? "query_key"
                  : "bearer",
          };
        }
        requestUrl = new URL(customEndpoint, `${apiRoot}/`);
        authProfile =
          provider === "anthropic" ? "anthropic" : provider === "google" ? "query_key" : "bearer";
        if (authProfile === "query_key") {
          requestUrl.searchParams.set("key", "API_KEY");
        }
        break;
      }
      case "litellm":
        requestUrl = new URL(
          "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
        );
        authProfile = "public";
        break;
      case "gemini_openai_compatible":
      case "openai_compatible":
      default:
        requestUrl = new URL("models", `${apiRoot}/`);
        authProfile = "bearer";
        break;
    }

    return {
      apiRoot,
      requestUrl: requestUrl.toString(),
      authProfile,
    };
  } catch {
    return null;
  }
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

function useVirtualCatalogRows(
  itemCount: number,
  resetKey: string,
  scrollRef: RefObject<HTMLDivElement | null>
) {
  const [viewport, setViewport] = useState({
    scrollTop: 0,
    height: DEFAULT_MODEL_LIST_HEIGHT,
    resetKey,
  });
  const currentViewport =
    viewport.resetKey === resetKey
      ? viewport
      : {
          scrollTop: 0,
          height: DEFAULT_MODEL_LIST_HEIGHT,
          resetKey,
        };

  useEffect(() => {
    const viewportElement = scrollRef.current;
    if (viewportElement) {
      viewportElement.scrollTop = 0;
    }
  }, [resetKey, scrollRef]);

  const startIndex =
    itemCount === 0
      ? 0
      : Math.min(
          Math.max(
            0,
            Math.floor(currentViewport.scrollTop / MODEL_ROW_HEIGHT) - MODEL_LIST_OVERSCAN
          ),
          itemCount - 1
        );
  const endIndex = Math.min(
    itemCount,
    Math.ceil((currentViewport.scrollTop + currentViewport.height) / MODEL_ROW_HEIGHT) +
      MODEL_LIST_OVERSCAN
  );

  return {
    startIndex,
    endIndex,
    totalHeight: itemCount * MODEL_ROW_HEIGHT,
    onScroll: (event: UIEvent<HTMLDivElement>) => {
      setViewport({
        scrollTop: event.currentTarget.scrollTop,
        height: event.currentTarget.clientHeight || DEFAULT_MODEL_LIST_HEIGHT,
        resetKey,
      });
    },
  };
}

function VirtualCatalogEntryList({
  entries,
  selectedModels,
  onToggle,
}: {
  entries: UpstreamModelCatalogEntry[];
  selectedModels: ReadonlySet<string>;
  onToggle: (model: string, checked: boolean) => void;
}) {
  const resetKey = entries.map((entry) => `${entry.model}:${entry.source}`).join("\u0000");
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualRows = useVirtualCatalogRows(entries.length, resetKey, scrollRef);
  const visibleEntries = entries.slice(virtualRows.startIndex, virtualRows.endIndex);

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-auto rounded-cf-sm border border-divider/70 bg-card/15"
      onScroll={virtualRows.onScroll}
    >
      <div className="relative" style={{ height: virtualRows.totalHeight }}>
        {visibleEntries.map((entry, index) => {
          const checked = selectedModels.has(entry.model);
          return (
            <label
              key={entry.model}
              className="absolute left-0 flex min-w-full cursor-pointer items-center gap-3 px-2.5 transition-colors hover:bg-surface-200/55"
              style={{
                top: (virtualRows.startIndex + index) * MODEL_ROW_HEIGHT,
                height: MODEL_ROW_HEIGHT,
                width: "max-content",
              }}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(nextChecked) => onToggle(entry.model, nextChecked === true)}
              />
              <span className="whitespace-nowrap font-mono text-sm text-foreground">
                {entry.model}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function getRuleSourceBadgeVariant(
  source: UpstreamModelRuleSource
): NonNullable<React.ComponentProps<typeof Badge>["variant"]> {
  if (source === "native") {
    return "success";
  }
  if (source === "inferred") {
    return "info";
  }
  if (source === "litellm") {
    return "warning";
  }
  return "secondary";
}

function spendingRulesToApi(
  rules: UpstreamFormData["spending_rules"]
): { period_type: "daily" | "monthly" | "rolling"; limit: number; period_hours?: number }[] | null {
  if (!rules || rules.length === 0) return null;
  return rules.map((r) => ({
    period_type: r.period_type,
    limit: r.limit,
    ...(r.period_type === "rolling"
      ? { period_hours: r.period_hours ?? ROLLING_DEFAULT_PERIOD_HOURS }
      : {}),
  }));
}

/**
 * M3 Upstream Form Dialog (Create/Edit)
 */
export function UpstreamFormDialog({
  upstream,
  open,
  onOpenChange,
  trigger,
}: UpstreamFormDialogProps) {
  const isEdit = !!upstream;
  const activeSchema = isEdit ? editUpstreamFormSchema : createUpstreamFormSchema;
  const createMutation = useCreateUpstream();
  const previewCatalogMutation = usePreviewUpstreamCatalog();
  const updateMutation = useUpdateUpstream();
  const executeProbeMutation = useExecuteUpstreamProbe();
  const resetExecuteProbeMutation = executeProbeMutation.reset;
  const { data: probeData } = useUpstreamProbes(upstream?.id, open && isEdit && !!upstream?.id);
  const probeModelListId = useId();
  const t = useTranslations("upstreams");
  const tCommon = useTranslations("common");
  const circuitBreakerDefaults = {
    failureThreshold: DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold,
    successThreshold: DEFAULT_CIRCUIT_BREAKER_CONFIG.successThreshold,
    openDuration: Math.round(DEFAULT_CIRCUIT_BREAKER_CONFIG.openDuration / 1000),
    probeInterval: Math.round(DEFAULT_CIRCUIT_BREAKER_CONFIG.probeInterval / 1000),
    firstByteTimeout: Math.round(DEFAULT_CIRCUIT_BREAKER_CONFIG.firstByteTimeout / 1000),
    streamIdleTimeout: Math.round(DEFAULT_CIRCUIT_BREAKER_CONFIG.streamIdleTimeout / 1000),
  };
  const [configSearchQuery, setConfigSearchQuery] = useState("");
  const [activeSectionId, setActiveSectionId] = useState<ConfigSectionId>("basic-name");
  const [highlightedSectionId, setHighlightedSectionId] = useState<ConfigSectionId | null>(null);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);
  const [catalogSearchQuery, setCatalogSearchQuery] = useState("");
  const deferredCatalogSearchQuery = useDeferredValue(catalogSearchQuery);
  const [catalogSourceFilter, setCatalogSourceFilter] = useState<CatalogSourceFilter>("all");
  const [selectedCatalogModels, setSelectedCatalogModels] = useState<string[]>([]);
  const [selectedModelRuleIds, setSelectedModelRuleIds] = useState<string[]>([]);
  const [selectedProbeCapability, setSelectedProbeCapability] = useState<RouteCapability | "">("");
  const [selectedProbeClientProfile, setSelectedProbeClientProfile] = useState<
    UpstreamProbeClientProfile | ""
  >("");
  const [probeModel, setProbeModel] = useState("");
  const [expandedProbeResponseId, setExpandedProbeResponseId] = useState<string | null>(null);
  const [copiedProbeResponseId, setCopiedProbeResponseId] = useState<string | null>(null);
  const [workspaceUpstream, setWorkspaceUpstream] = useState<Upstream | null>(null);
  const contentScrollContainerRef = useRef<HTMLDivElement | null>(null);

  const form = useForm<UpstreamFormValues>({
    resolver: zodResolver(activeSchema),
    defaultValues: buildUpstreamFormDefaults(upstream),
  });

  useEffect(() => {
    resetExecuteProbeMutation();
  }, [resetExecuteProbeMutation, open, upstream?.id]);

  // Watch circuit_breaker_config for controlled inputs
  const circuitBreakerConfig = useWatch({
    control: form.control,
    name: "circuit_breaker_config",
  });
  const failureRuleConfig = useWatch({
    control: form.control,
    name: "failure_rule_config",
  });

  // Watch affinity_migration for controlled inputs
  const affinityMigration = useWatch({
    control: form.control,
    name: "affinity_migration",
  });
  const queuePolicy = useWatch({
    control: form.control,
    name: "queue_policy",
  });

  // Field array for spending rules
  const {
    fields: spendingRuleFields,
    append: appendSpendingRule,
    remove: removeSpendingRule,
  } = useFieldArray({
    control: form.control,
    name: "spending_rules",
  });
  const {
    fields: modelRuleFields,
    append: appendModelRule,
    remove: removeModelRule,
    replace: replaceModelRules,
  } = useFieldArray({
    control: form.control,
    name: "model_rules",
  });

  const spendingRules = useWatch({
    control: form.control,
    name: "spending_rules",
  });
  const watchedRouteCapabilities = useWatch({
    control: form.control,
    name: "route_capabilities",
  });
  const watchedBaseUrl = useWatch({
    control: form.control,
    name: "base_url",
  });
  const watchedApiKey = useWatch({
    control: form.control,
    name: "api_key",
  });
  const watchedModelDiscovery = useWatch({
    control: form.control,
    name: "model_discovery",
  });
  const watchedModelRules = useWatch({
    control: form.control,
    name: "model_rules",
  });
  const queuePolicyTimeoutMs =
    typeof queuePolicy?.timeout_ms === "number"
      ? queuePolicy.timeout_ms
      : DEFAULT_QUEUE_POLICY_TIMEOUT_MS;
  const queuePolicyMaxQueueLength =
    typeof queuePolicy?.max_queue_length === "number" ? queuePolicy.max_queue_length : null;
  const endpointPreview = useMemo(
    () => resolveEndpointPreview(watchedBaseUrl ?? "", watchedRouteCapabilities),
    [watchedBaseUrl, watchedRouteCapabilities]
  );
  const discoveryPreview = useMemo(
    () =>
      resolveDiscoveryPreview(
        watchedBaseUrl ?? "",
        watchedRouteCapabilities,
        watchedModelDiscovery
      ),
    [watchedBaseUrl, watchedRouteCapabilities, watchedModelDiscovery]
  );
  const catalogState = useMemo(
    () => buildCatalogWorkspaceState(workspaceUpstream ?? upstream),
    [upstream, workspaceUpstream]
  );
  const catalogWorkspaceDirty = useMemo(
    () =>
      isEdit &&
      !!upstream &&
      !areCatalogWorkspaceStatesEqual(
        buildCatalogWorkspaceState(upstream),
        buildCatalogWorkspaceState(workspaceUpstream ?? upstream)
      ),
    [isEdit, upstream, workspaceUpstream]
  );
  const configSections = useMemo<ConfigSectionEntry[]>(
    () => [
      {
        id: "basic-name",
        label: t("upstreamName"),
        icon: Type,
        category: "configCategoryBasic",
      },
      {
        id: "basic-profile",
        label: t("upstreamDescription"),
        icon: FileText,
        category: "configCategoryBasic",
      },
      {
        id: "basic-route-endpoint",
        label: t("baseUrl"),
        icon: Link2,
        category: "configCategoryBasic",
      },
      {
        id: "basic-api-key",
        label: t("apiKey"),
        icon: KeyRound,
        category: "configCategoryBasic",
      },
      {
        id: "basic-diagnostics",
        label: t("probeDiagnostics"),
        icon: CheckCircle2,
        category: "configCategoryBasic",
      },
      {
        id: "advanced-priority-weight",
        label: t("priorityAndWeight"),
        icon: SlidersHorizontal,
        category: "configCategoryStrategy",
      },
      {
        id: "advanced-model-routing",
        label: t("modelBasedRouting"),
        icon: Route,
        category: "configCategoryStrategy",
      },
      {
        id: "advanced-billing-multipliers",
        label: t("billingMultipliers"),
        icon: Coins,
        category: "configCategoryStrategy",
      },
      {
        id: "advanced-spending-quota",
        label: t("spendingQuota"),
        icon: Wallet,
        category: "configCategoryStrategy",
      },
      {
        id: "advanced-capacity-control",
        label: t("capacityAndQueue"),
        icon: Gauge,
        category: "configCategoryReliability",
      },
      {
        id: "advanced-circuit-breaker",
        label: t("circuitBreakerConfig"),
        icon: Shield,
        category: "configCategoryReliability",
      },
      {
        id: "advanced-failure-rules",
        label: t("failureRulesConfig"),
        icon: CircleAlert,
        category: "configCategoryReliability",
      },
      {
        id: "advanced-affinity-migration",
        label: t("affinityMigrationConfig"),
        icon: Shuffle,
        category: "configCategoryReliability",
      },
    ],
    [t]
  );

  const filteredConfigSections = useMemo(() => {
    const query = configSearchQuery.trim().toLowerCase();
    return query
      ? configSections.filter((section) => section.label.toLowerCase().includes(query))
      : configSections;
  }, [configSearchQuery, configSections]);

  const groupedFilteredConfigSections = useMemo<ConfigSectionGroup[]>(
    () =>
      filteredConfigSections.reduce<ConfigSectionGroup[]>((groups, section) => {
        const existingGroup = groups.find((group) => group.category === section.category);
        if (existingGroup) {
          existingGroup.sections.push(section);
          return groups;
        }

        groups.push({
          category: section.category,
          sections: [section],
        });
        return groups;
      }, []),
    [filteredConfigSections]
  );
  const filteredCatalogEntries = useMemo(() => {
    const query = deferredCatalogSearchQuery.trim().toLowerCase();
    return catalogState.modelCatalog.filter((entry) => {
      const matchesQuery = !query || entry.model.toLowerCase().includes(query);
      const matchesSource = catalogSourceFilter === "all" || entry.source === catalogSourceFilter;
      return matchesQuery && matchesSource;
    });
  }, [deferredCatalogSearchQuery, catalogSourceFilter, catalogState.modelCatalog]);
  const catalogSourceCounts = useMemo(
    () =>
      catalogState.modelCatalog.reduce(
        (counts, entry) => {
          counts[entry.source] += 1;
          return counts;
        },
        { native: 0, inferred: 0, litellm: 0 } satisfies Record<UpstreamModelCatalogSource, number>
      ),
    [catalogState.modelCatalog]
  );
  const catalogModelOptions = useMemo(
    () =>
      getUniqueCatalogModels(
        catalogState.modelCatalog.length > 0
          ? catalogState.modelCatalog
          : (upstream?.model_catalog ?? [])
      ),
    [catalogState.modelCatalog, upstream?.model_catalog]
  );
  const savedProbeCapabilities = useMemo(
    () => resolveRouteCapabilities(upstream?.route_capabilities).filter(isProbeSupportedCapability),
    [upstream?.route_capabilities]
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
  const catalogRefreshDependencyDirty = useMemo(() => {
    const defaultValues = form.formState.defaultValues;
    if (!defaultValues) {
      return false;
    }

    const currentSnapshot = buildCatalogRefreshDependencySnapshot({
      base_url: watchedBaseUrl,
      api_key: watchedApiKey,
      route_capabilities: watchedRouteCapabilities,
      model_discovery: watchedModelDiscovery,
    });
    const defaultSnapshot = buildCatalogRefreshDependencySnapshot(defaultValues);
    return JSON.stringify(currentSnapshot) !== JSON.stringify(defaultSnapshot);
  }, [
    form.formState.defaultValues,
    watchedApiKey,
    watchedBaseUrl,
    watchedModelDiscovery,
    watchedRouteCapabilities,
  ]);

  useEffect(() => {
    if (!highlightedSectionId) {
      return;
    }

    const timer = window.setTimeout(() => {
      setHighlightedSectionId(null);
    }, 1800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [highlightedSectionId]);

  useEffect(() => {
    if (open) {
      form.reset(buildUpstreamFormDefaults(upstream));
      replaceModelRules(toFormModelRulesValue(upstream?.model_rules));
      return;
    }

    form.reset(buildUpstreamFormDefaults(null));
    replaceModelRules([]);
  }, [form, open, replaceModelRules, upstream]);

  const resetDialogUiState = () => {
    setConfigSearchQuery("");
    setCatalogSearchQuery("");
    setCatalogSourceFilter("all");
    setSelectedCatalogModels([]);
    setSelectedModelRuleIds([]);
    setSelectedProbeCapability("");
    setSelectedProbeClientProfile("");
    setProbeModel("");
    setActiveSectionId("basic-name");
    setHighlightedSectionId(null);
  };

  const closeDialog = () => {
    setWorkspaceUpstream(null);
    resetDialogUiState();
    onOpenChange(false);
  };

  const hasUnsavedChanges = () => {
    const defaultValues = form.formState.defaultValues;
    if (!defaultValues) {
      return false;
    }

    const currentValues = normalizeUpstreamFormValuesForDirtyCheck(form.getValues());
    const normalizedDefaultValues = normalizeUpstreamFormValuesForDirtyCheck(defaultValues);

    return (
      catalogWorkspaceDirty ||
      JSON.stringify(currentValues) !== JSON.stringify(normalizedDefaultValues)
    );
  };

  const mutationProbe =
    executeProbeMutation.data?.upstream_id === upstream?.id ? executeProbeMutation.data : null;
  const latestProbe: UpstreamProbeResponse | null =
    mutationProbe ?? probeData?.data?.[0] ?? upstream?.probe_results?.[0] ?? null;
  const showFullProbeResponse = !!latestProbe && expandedProbeResponseId === latestProbe.id;
  const copiedProbeResponse = !!latestProbe && copiedProbeResponseId === latestProbe.id;
  const probeResponseText = latestProbe?.response_body || t("probeUpstreamResponseEmpty");
  const hasProbeResponseBody = !!latestProbe?.response_body;
  const probeResponseIsLong = probeResponseText.length > PROBE_RESPONSE_PREVIEW_LIMIT;
  const visibleProbeResponseText =
    probeResponseIsLong && !showFullProbeResponse
      ? `${probeResponseText.slice(0, PROBE_RESPONSE_PREVIEW_LIMIT).trimEnd()}\n…`
      : probeResponseText;
  const probeConfigDirty = isEdit && hasUnsavedChanges();
  const probeDisabled =
    !upstream ||
    !effectiveProbeCapability ||
    !effectiveProbeClientProfile ||
    probeConfigDirty ||
    executeProbeMutation.isPending;

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
    if (
      !upstream ||
      !effectiveProbeCapability ||
      !effectiveProbeClientProfile ||
      probeConfigDirty
    ) {
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

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }

    if (hasUnsavedChanges()) {
      setShowUnsavedChangesDialog(true);
      return;
    }

    closeDialog();
  };

  const confirmDiscardChanges = () => {
    setShowUnsavedChangesDialog(false);
    closeDialog();
  };

  const markSectionHighlight = (sectionId: ConfigSectionId) => {
    setHighlightedSectionId(sectionId);
  };

  const getSectionClassName = (sectionId: ConfigSectionId, extra?: string) =>
    cn(
      "scroll-mt-28 rounded-cf-sm border p-4 transition-all duration-cf-normal ease-cf-standard",
      highlightedSectionId === sectionId
        ? "border-status-info/55 bg-status-info-muted shadow-[0_0_0_1px_rgba(56,189,248,0.18)]"
        : "border-divider bg-surface-300/35",
      extra
    );

  const scrollToSection = (sectionId: ConfigSectionId | "advanced-quick-jump") => {
    const container = contentScrollContainerRef.current;
    if (!container) return;

    if (sectionId === "advanced-quick-jump") {
      if (typeof container.scrollTo === "function") {
        container.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        container.scrollTop = 0;
      }
      return;
    }

    const target = document.getElementById(sectionId);
    if (!target) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const nextTop = container.scrollTop + (targetRect.top - containerRect.top) - 12;
    const targetTop = Math.max(nextTop, 0);
    if (typeof container.scrollTo === "function") {
      container.scrollTo({ top: targetTop, behavior: "smooth" });
    } else {
      container.scrollTop = targetTop;
    }
  };

  const jumpToSection = (sectionId: ConfigSectionId) => {
    setActiveSectionId(sectionId);
    markSectionHighlight(sectionId);
    scrollToSection(sectionId);
  };

  const updateRuleAtIndex = (
    index: number,
    patch: Partial<UpstreamFormValues["model_rules"][number]>,
    options?: { forceManualSource?: boolean }
  ) => {
    const currentRule = form.getValues(`model_rules.${index}`);
    if (!currentRule) {
      return;
    }

    form.setValue(
      `model_rules.${index}`,
      {
        ...currentRule,
        ...patch,
        source: options?.forceManualSource ? "manual" : (patch.source ?? currentRule.source),
      },
      { shouldDirty: true, shouldValidate: true }
    );
  };

  const syncWorkspaceFromRemoteUpstream = (
    remoteUpstream: Upstream,
    options?: { replaceRules?: boolean }
  ) => {
    const nextRules = toFormModelRulesValue(remoteUpstream.model_rules);
    const nextDefaults = buildUpstreamFormDefaults(remoteUpstream);

    form.reset(
      {
        ...nextDefaults,
        model_rules: options?.replaceRules ? nextRules : nextDefaults.model_rules,
      },
      { keepDirtyValues: true }
    );

    if (options?.replaceRules) {
      replaceModelRules(nextRules);
    }

    setWorkspaceUpstream(remoteUpstream);
  };

  const toggleCatalogModelSelection = (model: string, checked: boolean) => {
    setSelectedCatalogModels((current) => {
      if (checked) {
        return current.includes(model) ? current : [...current, model];
      }
      return current.filter((value) => value !== model);
    });
  };

  const toggleModelRuleSelection = (ruleId: string, checked: boolean) => {
    setSelectedModelRuleIds((current) => {
      const nextCurrent = current.filter((value) =>
        modelRuleFields.some((field) => field.id === value)
      );
      if (checked) {
        return nextCurrent.includes(ruleId) ? nextCurrent : [...nextCurrent, ruleId];
      }
      return nextCurrent.filter((value) => value !== ruleId);
    });
  };

  const handleSelectAllModelRules = (checked: boolean) => {
    setSelectedModelRuleIds(checked ? modelRuleFields.map((field) => field.id) : []);
  };

  const handleRemoveModelRule = (index: number) => {
    const ruleId = modelRuleFields[index]?.id;
    if (ruleId) {
      setSelectedModelRuleIds((current) => current.filter((value) => value !== ruleId));
    }
    removeModelRule(index);
  };

  const handleRemoveSelectedModelRules = () => {
    const selectedRuleIdSet = new Set(
      selectedModelRuleIds.filter((id) => modelRuleFields.some((field) => field.id === id))
    );
    if (selectedRuleIdSet.size === 0) {
      return;
    }

    const remainingRules = form
      .getValues("model_rules")
      .filter((_, index) => !selectedRuleIdSet.has(modelRuleFields[index]?.id ?? ""));

    replaceModelRules(remainingRules);
    setSelectedModelRuleIds([]);
  };

  const handleSelectFilteredCatalogEntries = () => {
    const filteredModels = filteredCatalogEntries.map((entry) => entry.model);
    setSelectedCatalogModels((current) => [...new Set([...current, ...filteredModels])]);
  };

  const handleClearCatalogSelection = () => {
    setSelectedCatalogModels([]);
  };

  const handleRefreshCatalog = async () => {
    if (!upstream) {
      return;
    }

    try {
      const preview = await previewCatalogMutation.mutateAsync({
        id: upstream.id,
        data: {
          base_url: watchedBaseUrl ?? "",
          ...(watchedApiKey?.trim() ? { api_key: watchedApiKey.trim() } : {}),
          route_capabilities: watchedRouteCapabilities ?? [],
          model_discovery: watchedModelDiscovery
            ? toApiModelDiscoveryValue(watchedModelDiscovery)
            : null,
        },
      });
      setWorkspaceUpstream((current) =>
        applyCatalogPreviewToUpstream(current ?? upstream, preview)
      );
      const refreshedModelSet = new Set((preview.model_catalog ?? []).map((entry) => entry.model));
      setSelectedCatalogModels((current) =>
        current.filter((model) => refreshedModelSet.has(model))
      );
    } catch {
      // Refresh errors are surfaced by the mutation toast.
    }
  };

  const handleClearLiteLlmCatalogEntries = async () => {
    if (!upstream || catalogSourceCounts.litellm === 0) {
      return;
    }

    const retainedCatalog = catalogState.modelCatalog.filter((entry) => entry.source !== "litellm");
    const retainedModelSet = new Set(retainedCatalog.map((entry) => entry.model));

    try {
      const updatedUpstream = await updateMutation.mutateAsync({
        id: upstream.id,
        data: {
          model_catalog: retainedCatalog.length > 0 ? retainedCatalog : null,
          model_catalog_updated_at:
            retainedCatalog.length > 0 ? catalogState.modelCatalogUpdatedAt : null,
          model_catalog_last_status: retainedCatalog.length > 0 ? "success" : null,
          model_catalog_last_error: null,
          model_catalog_last_failed_at: null,
        },
      });
      setSelectedCatalogModels((current) => current.filter((model) => retainedModelSet.has(model)));
      syncWorkspaceFromRemoteUpstream(updatedUpstream);
    } catch {
      // Update errors are surfaced by the mutation toast.
    }
  };

  const handleImportCatalog = async () => {
    if (selectedCatalogModels.length === 0) {
      return;
    }

    const nextRules = importCatalogModelsIntoRules(
      catalogState.modelCatalog,
      selectedCatalogModels,
      form.getValues("model_rules")
    );
    replaceModelRules(nextRules);
    setSelectedCatalogModels([]);
  };

  const onSubmit = async (values: UpstreamFormValues) => {
    try {
      const data = activeSchema.parse(values) as UpstreamFormData;
      const endpointPreviewState = resolveEndpointPreview(data.base_url, data.route_capabilities);
      const normalizedBaseUrl = endpointPreviewState?.normalizedBaseUrl ?? data.base_url.trim();
      const officialWebsiteUrl = data.official_website_url.trim()
        ? data.official_website_url.trim()
        : null;
      const maxConcurrency = data.max_concurrency ?? null;
      const queuePolicy = normalizeQueuePolicyForSubmit(data.queue_policy);
      if (isEdit) {
        // Only include api_key when provided
        const updateData: {
          name: string;
          base_url: string;
          official_website_url?: string | null;
          api_key?: string;
          description: string | null;
          max_concurrency?: number | null;
          queue_policy?: UpstreamQueuePolicy | null;
          priority?: number;
          weight?: number;
          billing_input_multiplier?: number;
          billing_output_multiplier?: number;
          spending_rules?:
            | {
                period_type: "daily" | "monthly" | "rolling";
                limit: number;
                period_hours?: number;
              }[]
            | null;
          route_capabilities?: RouteCapability[] | null;
          model_discovery?: UpstreamModelDiscoveryConfig | null;
          model_catalog?: UpstreamModelCatalogEntry[] | null;
          model_catalog_updated_at?: string | null;
          model_catalog_last_status?: UpstreamModelCatalogStatus | null;
          model_catalog_last_error?: string | null;
          model_catalog_last_failed_at?: string | null;
          model_rules?: UpstreamModelRule[] | null;
          circuit_breaker_config?: {
            failure_threshold?: number;
            success_threshold?: number;
            open_duration?: number;
            probe_interval?: number;
            first_byte_timeout?: number;
            stream_idle_timeout?: number;
          } | null;
          failure_rule_config?: {
            use_global_rules: boolean;
          } | null;
          affinity_migration?: {
            enabled: boolean;
            metric: "tokens" | "length";
            threshold: number;
          } | null;
        } = {
          name: data.name,
          base_url: normalizedBaseUrl,
          description: data.description || null,
          priority: data.priority,
          weight: data.weight,
          billing_input_multiplier: data.billing_input_multiplier,
          billing_output_multiplier: data.billing_output_multiplier,
          spending_rules: spendingRulesToApi(data.spending_rules),
          route_capabilities: data.route_capabilities,
          model_discovery: toApiModelDiscoveryValue(data.model_discovery),
          model_rules: toApiModelRulesValue(data.model_rules),
          circuit_breaker_config: data.circuit_breaker_config,
          failure_rule_config: data.failure_rule_config,
          affinity_migration: data.affinity_migration,
        };
        if (officialWebsiteUrl !== null || upstream.official_website_url != null) {
          updateData.official_website_url = officialWebsiteUrl;
        }
        if (maxConcurrency !== null || upstream.max_concurrency != null) {
          updateData.max_concurrency = maxConcurrency;
        }
        if (queuePolicy !== null || upstream.queue_policy != null) {
          updateData.queue_policy = queuePolicy;
        }
        if (data.api_key) {
          updateData.api_key = data.api_key;
        }
        if (workspaceUpstream) {
          updateData.model_catalog = workspaceUpstream.model_catalog;
          updateData.model_catalog_updated_at = workspaceUpstream.model_catalog_updated_at;
          updateData.model_catalog_last_status = workspaceUpstream.model_catalog_last_status;
          updateData.model_catalog_last_error = workspaceUpstream.model_catalog_last_error;
          updateData.model_catalog_last_failed_at = workspaceUpstream.model_catalog_last_failed_at;
        }
        await updateMutation.mutateAsync({
          id: upstream.id,
          data: updateData,
        });
      } else {
        const createData: {
          name: string;
          base_url: string;
          api_key: string;
          official_website_url?: string | null;
          max_concurrency?: number | null;
          queue_policy: UpstreamQueuePolicy | null;
          description: string | null;
          priority: number;
          weight: number;
          billing_input_multiplier: number;
          billing_output_multiplier: number;
          spending_rules:
            | {
                period_type: "daily" | "monthly" | "rolling";
                limit: number;
                period_hours?: number;
              }[]
            | null;
          route_capabilities: RouteCapability[] | null;
          model_discovery: UpstreamModelDiscoveryConfig | null;
          model_rules: UpstreamModelRule[] | null;
          circuit_breaker_config: {
            failure_threshold?: number;
            success_threshold?: number;
            open_duration?: number;
            probe_interval?: number;
            first_byte_timeout?: number;
            stream_idle_timeout?: number;
          } | null;
          failure_rule_config: {
            use_global_rules: boolean;
          } | null;
          affinity_migration: {
            enabled: boolean;
            metric: "tokens" | "length";
            threshold: number;
          } | null;
        } = {
          name: data.name,
          base_url: normalizedBaseUrl,
          api_key: data.api_key!,
          description: data.description || null,
          priority: data.priority,
          weight: data.weight,
          billing_input_multiplier: data.billing_input_multiplier,
          billing_output_multiplier: data.billing_output_multiplier,
          queue_policy: queuePolicy,
          spending_rules: spendingRulesToApi(data.spending_rules),
          route_capabilities: data.route_capabilities,
          model_discovery: toApiModelDiscoveryValue(data.model_discovery),
          model_rules: toApiModelRulesValue(data.model_rules),
          circuit_breaker_config: data.circuit_breaker_config,
          failure_rule_config: data.failure_rule_config,
          affinity_migration: data.affinity_migration,
        };
        if (officialWebsiteUrl) {
          createData.official_website_url = officialWebsiteUrl;
        }
        if (maxConcurrency !== null) {
          createData.max_concurrency = maxConcurrency;
        }
        await createMutation.mutateAsync(createData);
      }

      form.reset();
      closeDialog();
    } catch {
      // Error already handled by mutation onError
    }
  };

  const onInvalidSubmit = () => {
    const values = form.getValues();
    const rules = values.spending_rules;
    let hasRollingRuleWithMissingHours = false;
    let hasSpendingLimitError = false;

    const rawBaseUrl = values.base_url.trim();
    if (!rawBaseUrl) {
      form.setError("base_url", {
        type: "manual",
        message: t("baseUrlRequired"),
      });
    } else {
      try {
        new URL(rawBaseUrl);
      } catch {
        form.setError("base_url", {
          type: "manual",
          message: t("baseUrlInvalid"),
        });
      }
    }

    if (!isEdit && !values.api_key.trim()) {
      form.setError("api_key", {
        type: "manual",
        message: t("apiKeyRequired"),
      });
    }

    rules.forEach((rule, index) => {
      const limitValue = Number(rule.limit);
      if (!Number.isFinite(limitValue) || limitValue <= 0) {
        hasSpendingLimitError = true;
        form.setError(`spending_rules.${index}.limit`, {
          type: "manual",
          message: t("spendingLimitMustBePositive"),
        });
      }

      if (rule.period_type === "rolling" && (rule.period_hours == null || rule.period_hours < 1)) {
        hasRollingRuleWithMissingHours = true;
        form.setError(`spending_rules.${index}.period_hours`, {
          type: "manual",
          message: t("spendingPeriodHoursRequired"),
        });
      }
    });

    if (!areSingleProviderCapabilities(values.route_capabilities)) {
      form.setError("route_capabilities", {
        type: "manual",
        message: t("routeCapabilitiesSingleProvider"),
      });
    }

    toast.error(
      hasRollingRuleWithMissingHours
        ? t("spendingPeriodHoursRequired")
        : hasSpendingLimitError
          ? t("spendingLimitMustBePositive")
          : t("formValidationFailed")
    );
  };

  const selectedCatalogModelSet = useMemo(
    () => new Set(selectedCatalogModels),
    [selectedCatalogModels]
  );
  const selectedVisibleCatalogCount = filteredCatalogEntries.filter((entry) =>
    selectedCatalogModelSet.has(entry.model)
  ).length;
  const catalogUpdatedAtLabel = formatCatalogTimestamp(catalogState.modelCatalogUpdatedAt);
  const catalogFailedAtLabel = formatCatalogTimestamp(catalogState.modelCatalogLastFailedAt);
  const catalogHasEntries = catalogState.modelCatalog.length > 0;
  const catalogIsRefreshing = previewCatalogMutation.isPending;
  const catalogRefreshBlocked = !isEdit || !watchedBaseUrl?.trim();
  const currentRuleCount = watchedModelRules?.length ?? 0;
  const selectedModelRuleIdSet = new Set(
    selectedModelRuleIds.filter((id) => modelRuleFields.some((field) => field.id === id))
  );
  const selectedModelRuleCount = selectedModelRuleIdSet.size;
  const modelRuleHeaderSelectionState =
    currentRuleCount === 0
      ? false
      : selectedModelRuleCount === 0
        ? false
        : selectedModelRuleCount === currentRuleCount
          ? true
          : ("indeterminate" as const);

  const dialogContent = (
    <DialogContent
      className="h-[92vh] max-w-6xl overflow-hidden p-0"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        (event.currentTarget as HTMLElement).focus();
      }}
      tabIndex={-1}
    >
      <div className="flex h-full min-h-0 flex-col">
        <DialogHeader className="shrink-0 border-b border-divider bg-card px-6 py-4 text-left">
          <DialogTitle>{isEdit ? t("editUpstreamTitle") : t("createUpstreamTitle")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("editUpstreamDesc") : t("createUpstreamDesc")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, onInvalidSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 overflow-hidden px-6 py-4">
              <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
                <aside className="hidden h-full lg:block lg:w-[240px] lg:shrink-0">
                  <div className="flex h-full flex-col rounded-cf-sm border border-divider bg-surface-200/55 p-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={configSearchQuery}
                        onChange={(event) => setConfigSearchQuery(event.target.value)}
                        placeholder={t("configSearchPlaceholder")}
                        className="h-8 pl-8 text-xs"
                      />
                    </div>
                    {filteredConfigSections.length > 0 ? (
                      <div className="mt-3 flex-1 space-y-4 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
                        {groupedFilteredConfigSections.map((group, groupIndex) => (
                          <section
                            key={group.category}
                            className={cn(
                              "space-y-1.5",
                              groupIndex > 0 && "border-t border-divider/70 pt-3"
                            )}
                          >
                            <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                              {t(group.category)}
                            </p>
                            {group.sections.map((section) => {
                              const Icon = section.icon;
                              return (
                                <Button
                                  key={section.id}
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className={cn(
                                    "h-8 w-full justify-start gap-2 border text-xs",
                                    activeSectionId === section.id
                                      ? "border-status-info/45 bg-status-info-muted text-foreground hover:bg-status-info-muted/90"
                                      : "border-transparent text-muted-foreground hover:border-divider hover:bg-surface-300/65 hover:text-foreground"
                                  )}
                                  onClick={() => jumpToSection(section.id)}
                                >
                                  <Icon className="h-3.5 w-3.5" />
                                  <span className="truncate">{section.label}</span>
                                </Button>
                              );
                            })}
                          </section>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground">
                        {t("configSearchNoResult")}
                      </p>
                    )}
                  </div>
                </aside>

                <div
                  ref={contentScrollContainerRef}
                  className="h-full min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 [scrollbar-gutter:stable]"
                >
                  <div className="p-4">
                    <div
                      id="advanced-quick-jump"
                      className="sticky top-0 z-20 mb-4 rounded-cf-sm border border-divider bg-card/95 px-4 py-3 backdrop-blur lg:hidden"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs font-medium text-muted-foreground">
                          {t("configQuickJump")}
                        </p>
                        <div className="relative w-full sm:w-72">
                          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            value={configSearchQuery}
                            onChange={(event) => setConfigSearchQuery(event.target.value)}
                            placeholder={t("configSearchPlaceholder")}
                            className="h-8 pl-8 text-xs"
                          />
                        </div>
                      </div>
                      {filteredConfigSections.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {filteredConfigSections.map((section) => {
                            const Icon = section.icon;
                            return (
                              <Button
                                key={section.id}
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={cn(
                                  "h-7 gap-1.5 border text-xs",
                                  activeSectionId === section.id
                                    ? "border-status-info/45 bg-status-info-muted text-foreground hover:bg-status-info-muted/90"
                                    : "border-divider bg-card text-muted-foreground hover:bg-surface-300/65 hover:text-foreground"
                                )}
                                onClick={() => jumpToSection(section.id)}
                              >
                                <Icon className="h-3.5 w-3.5" />
                                {section.label}
                              </Button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-muted-foreground">
                          {t("configSearchNoResult")}
                        </p>
                      )}
                    </div>

                    <div id="basic-name" className={getSectionClassName("basic-name")}>
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("upstreamName")} *</FormLabel>
                            <FormControl>
                              <Input placeholder={t("upstreamNamePlaceholder")} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div
                      id="basic-profile"
                      className={getSectionClassName("basic-profile", "mt-4")}
                    >
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem className="sm:col-span-2">
                              <FormLabel>{t("upstreamDescription")}</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder={t("upstreamDescriptionPlaceholder")}
                                  rows={3}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="official_website_url"
                          render={({ field }) => (
                            <FormItem className="sm:col-span-2">
                              <FormLabel>{t("officialWebsiteUrl")}</FormLabel>
                              <FormControl>
                                <Input
                                  type="url"
                                  placeholder={t("officialWebsiteUrlPlaceholder")}
                                  {...field}
                                  value={field.value ?? ""}
                                />
                              </FormControl>
                              <FormDescription>{t("officialWebsiteUrlDesc")}</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    <div
                      id="basic-route-endpoint"
                      className={getSectionClassName("basic-route-endpoint", "mt-4")}
                    >
                      <FormField
                        control={form.control}
                        name="route_capabilities"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("routeCapabilities")}</FormLabel>
                            <FormControl>
                              <RouteCapabilityMultiSelect
                                selected={field.value ?? []}
                                onChange={(next) => field.onChange(next)}
                              />
                            </FormControl>
                            <FormDescription>{t("routeCapabilitiesDescription")}</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="base_url"
                        render={({ field }) => (
                          <FormItem className="mt-4">
                            <FormLabel>{t("baseUrl")} *</FormLabel>
                            <FormControl>
                              <Input type="url" placeholder={t("baseUrlPlaceholder")} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {endpointPreview?.autoAppendV1Applied && (
                        <p className="mt-2 rounded-cf-sm border border-status-info/30 bg-status-info-muted px-3 py-2 text-xs text-status-info">
                          {t("baseUrlAutoAppendV1Hint")}
                        </p>
                      )}
                      {endpointPreview?.duplicateV1Warning && (
                        <div className="mt-2 flex items-start gap-2 rounded-cf-sm border border-status-warning/40 bg-status-warning-muted px-3 py-2 text-xs text-status-warning">
                          <AlertTriangle
                            className="mt-0.5 h-3.5 w-3.5 shrink-0"
                            aria-hidden="true"
                          />
                          <span>{t("baseUrlDuplicateV1Warning")}</span>
                        </div>
                      )}
                      <div className="mt-2 rounded-cf-sm border border-divider bg-surface-200/45 px-3 py-2.5">
                        <div className="text-xs font-medium text-muted-foreground">
                          {t("finalRequestPreview")}
                        </div>
                        <code className="mt-1 block break-all rounded-cf-sm border border-divider bg-surface-300/65 px-2 py-1 font-mono text-[11px] text-foreground">
                          {endpointPreview?.previewUrl ?? t("finalRequestPreviewEmpty")}
                        </code>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {endpointPreview
                            ? `${t("finalRequestPreviewPath")}: /${endpointPreview.previewPath}`
                            : t("finalRequestPreviewHint")}
                        </p>
                      </div>
                    </div>

                    <div
                      id="basic-api-key"
                      className={getSectionClassName("basic-api-key", "mt-4")}
                    >
                      <FormField
                        control={form.control}
                        name="api_key"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("apiKey")} *</FormLabel>
                            <FormControl>
                              <PasswordInput
                                {...field}
                                autoComplete="new-password"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                                data-1p-ignore="true"
                                data-lpignore="true"
                                placeholder={t("apiKeyPlaceholder")}
                              />
                            </FormControl>
                            <FormDescription>
                              {isEdit ? t("apiKeyEditHint") : undefined}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {isEdit && (
                      <div
                        id="basic-diagnostics"
                        className={getSectionClassName("basic-diagnostics", "mt-4")}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="text-sm font-medium text-foreground">
                              {t("probeDiagnostics")}
                            </h3>
                            <p className="mt-1 text-xs text-muted-foreground">
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

                        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr]">
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">
                              {t("probeRouteCapability")}
                            </label>
                            <Select
                              value={effectiveProbeCapability}
                              onValueChange={(value) => {
                                const nextCapability = value as RouteCapability;
                                setSelectedProbeCapability(nextCapability);
                                setSelectedProbeClientProfile(
                                  getDefaultProbeClientProfile(nextCapability)
                                );
                              }}
                              disabled={savedProbeCapabilities.length === 0}
                            >
                              <SelectTrigger>
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
                            <label className="text-sm font-medium text-foreground">
                              {t("probeClientProfile")}
                            </label>
                            <Select
                              value={effectiveProbeClientProfile}
                              onValueChange={(value) =>
                                setSelectedProbeClientProfile(value as UpstreamProbeClientProfile)
                              }
                              disabled={selectableProbeClientProfiles.length === 0}
                            >
                              <SelectTrigger>
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
                            <label className="text-sm font-medium text-foreground">
                              {t("probeModel")}
                            </label>
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
                          <p className="mt-3 rounded-cf-sm border border-divider bg-surface-200/45 px-3 py-2 text-xs text-muted-foreground">
                            {t("probeNoSupportedCapability")}
                          </p>
                        ) : selectedProbeCapabilityDefinition ? (
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            {t("probeSelectedRequestProfile", {
                              capability: t(selectedProbeCapabilityDefinition.labelKey),
                              profile: effectiveProbeClientProfile
                                ? t(`probeClientProfileValue.${effectiveProbeClientProfile}`)
                                : "--",
                            })}
                          </p>
                        ) : null}

                        {probeConfigDirty && (
                          <div className="mt-3 flex items-start gap-2 rounded-cf-sm border border-status-warning/40 bg-status-warning-muted px-3 py-2 text-xs text-status-warning">
                            <AlertTriangle
                              className="mt-0.5 h-3.5 w-3.5 shrink-0"
                              aria-hidden="true"
                            />
                            <span>{t("probeSaveBeforeRun")}</span>
                          </div>
                        )}

                        {latestProbe ? (
                          <div className="mt-4 min-w-0 space-y-3 overflow-hidden rounded-cf-sm border border-divider bg-surface-200/45 p-3">
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
                                {t("probeCheckedAt")}:{" "}
                                {formatCatalogTimestamp(latestProbe.checked_at)}
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
                                      aria-label={
                                        copiedProbeResponse ? tCommon("copied") : tCommon("copy")
                                      }
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
                                  {t("probeUpstreamResponsePreview", {
                                    count: PROBE_RESPONSE_PREVIEW_LIMIT,
                                  })}
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
                          <p className="mt-3 rounded-cf-sm border border-divider bg-surface-200/45 px-3 py-2 text-xs text-muted-foreground">
                            {t("probeNoResult")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div id="upstream-advanced-config" className="mt-4 space-y-6 px-4">
                    <div
                      id="advanced-priority-weight"
                      className={getSectionClassName("advanced-priority-weight", "space-y-6")}
                    >
                      <h3 className="text-sm font-medium text-muted-foreground">
                        {t("priorityAndWeight")}
                      </h3>
                      <FormField
                        control={form.control}
                        name="priority"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("priority")}</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                placeholder={t("priorityPlaceholder")}
                                name={field.name}
                                ref={field.ref}
                                value={getNumericInputValue(field.value)}
                                onBlur={field.onBlur}
                                onChange={(e) => field.onChange(e.target.value)}
                              />
                            </FormControl>
                            <FormDescription>{t("priorityDescription")}</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="weight"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("weight")}</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                max={100}
                                placeholder={t("weightPlaceholder")}
                                name={field.name}
                                ref={field.ref}
                                value={getNumericInputValue(field.value)}
                                onBlur={field.onBlur}
                                onChange={(e) => field.onChange(e.target.value)}
                              />
                            </FormControl>
                            <FormDescription>{t("weightDescription")}</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Model-based Routing Section */}
                    <div
                      id="advanced-model-routing"
                      className={getSectionClassName("advanced-model-routing")}
                    >
                      <div className="space-y-4">
                        <div className="flex flex-col gap-3 rounded-cf-sm bg-surface-200/45 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                                {t("modelBasedRouting")}
                              </span>
                              <Badge
                                variant={
                                  catalogIsRefreshing
                                    ? "info"
                                    : catalogState.modelCatalogLastStatus === "failed"
                                      ? "error"
                                      : catalogHasEntries
                                        ? "success"
                                        : "neutral"
                                }
                              >
                                {catalogIsRefreshing ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : catalogState.modelCatalogLastStatus === "failed" ? (
                                  <CircleAlert className="h-3.5 w-3.5" />
                                ) : catalogHasEntries ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : (
                                  <Sparkles className="h-3.5 w-3.5" />
                                )}
                                {catalogIsRefreshing
                                  ? t("catalogRefreshing")
                                  : catalogState.modelCatalogLastStatus === "failed"
                                    ? t("catalogStatusFailed")
                                    : catalogHasEntries
                                      ? t("catalogStatusReady")
                                      : t("catalogStatusIdle")}
                              </Badge>
                              {catalogSourceCounts.native > 0 && (
                                <Badge variant="neutral">
                                  {t("catalogSourceCountNative", {
                                    count: catalogSourceCounts.native,
                                  })}
                                </Badge>
                              )}
                              {catalogSourceCounts.inferred > 0 && (
                                <Badge variant="info">
                                  {t("catalogSourceCountInferred", {
                                    count: catalogSourceCounts.inferred,
                                  })}
                                </Badge>
                              )}
                              {catalogSourceCounts.litellm > 0 && (
                                <Badge variant="warning">
                                  {t("catalogSourceCountLiteLlm", {
                                    count: catalogSourceCounts.litellm,
                                  })}
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {catalogUpdatedAtLabel
                                  ? t("catalogUpdatedAtLabel", { time: catalogUpdatedAtLabel })
                                  : t("catalogNeverRefreshed")}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {catalogRefreshDependencyDirty && isEdit
                                ? t("catalogSavedConfigHint")
                                : t("catalogStatusBarHint")}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2 self-start xl:self-auto">
                            {catalogSourceCounts.litellm > 0 ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={() => {
                                  void handleClearLiteLlmCatalogEntries();
                                }}
                                disabled={updateMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                                {t("clearLiteLlmCatalogEntries")}
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => {
                                void handleRefreshCatalog();
                              }}
                              disabled={catalogRefreshBlocked || catalogIsRefreshing}
                            >
                              {catalogIsRefreshing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                              {t("refreshCatalog")}
                            </Button>
                          </div>
                        </div>

                        <div className="grid gap-4 xl:h-[min(76vh,860px)] xl:grid-cols-[minmax(0,1.02fr)_minmax(340px,0.98fr)]">
                          <div className="flex min-h-0 flex-col gap-4 xl:border-r xl:border-divider/70 xl:pr-5">
                            <section className="space-y-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <h3 className="text-sm font-medium text-foreground">
                                  {t("modelDiscoverySectionTitle")}
                                </h3>
                                <Badge variant="outline">
                                  {t(
                                    `modelDiscoveryModeLabel_${watchedModelDiscovery?.mode ?? "openai_compatible"}`
                                  )}
                                </Badge>
                              </div>

                              <div className="space-y-3">
                                <FormField
                                  control={form.control}
                                  name="model_discovery.mode"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>{t("modelDiscoveryMode")}</FormLabel>
                                      <Select
                                        value={field.value}
                                        onValueChange={(value: UpstreamModelDiscoveryMode) => {
                                          field.onChange(value);
                                        }}
                                      >
                                        <FormControl>
                                          <SelectTrigger>
                                            <SelectValue />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          {MODEL_DISCOVERY_MODE_VALUES.map((mode) => (
                                            <SelectItem key={mode} value={mode}>
                                              {t(`modelDiscoveryModeLabel_${mode}`)}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <FormDescription>
                                        {t(`modelDiscoveryModeDescription_${field.value}`)}
                                      </FormDescription>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />

                                <FormField
                                  control={form.control}
                                  name="model_discovery.enable_lite_llm_fallback"
                                  render={({ field }) => (
                                    <FormItem className="flex h-10 items-center justify-between gap-3 rounded-cf-sm border border-divider/50 bg-surface-200/35 px-3">
                                      <FormLabel className="m-0 text-xs font-medium leading-none text-foreground">
                                        {t("enableLiteLlmFallback")}
                                      </FormLabel>
                                      <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                      />
                                    </FormItem>
                                  )}
                                />

                                <FormField
                                  control={form.control}
                                  name="model_discovery.auto_refresh_enabled"
                                  render={({ field }) => (
                                    <FormItem className="flex h-10 items-center justify-between gap-3 rounded-cf-sm border border-divider/50 bg-surface-200/35 px-3">
                                      <FormLabel className="m-0 text-xs font-medium leading-none text-foreground">
                                        {t("modelDiscoveryAutoRefresh")}
                                      </FormLabel>
                                      <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                      />
                                    </FormItem>
                                  )}
                                />
                              </div>

                              {watchedModelDiscovery?.mode === "custom" && (
                                <FormField
                                  control={form.control}
                                  name="model_discovery.custom_endpoint"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>{t("customDiscoveryEndpoint")}</FormLabel>
                                      <FormControl>
                                        <Input
                                          placeholder={t("customDiscoveryEndpointPlaceholder")}
                                          value={field.value ?? ""}
                                          onChange={(event) => field.onChange(event.target.value)}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              )}

                              <div className="space-y-3 border-t border-divider/70 pt-3">
                                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                  <Link2 className="h-4 w-4 text-muted-foreground" />
                                  {t("modelDiscoveryPreviewTitle")}
                                </div>
                                {!discoveryPreview ? (
                                  <p className="text-sm text-muted-foreground">
                                    {t("modelDiscoveryPreviewEmpty")}
                                  </p>
                                ) : (
                                  <div className="min-w-0 space-y-2 text-xs">
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                      <Badge variant="outline">
                                        {t(
                                          `modelDiscoveryAuthProfile_${discoveryPreview.authProfile}`
                                        )}
                                      </Badge>
                                      <span className="text-muted-foreground">
                                        {t("modelDiscoveryPreviewApiRoot")}
                                      </span>
                                      <code className="inline-block max-w-full overflow-x-auto whitespace-nowrap rounded-cf-sm bg-surface-200/75 px-2 py-1 font-mono text-[11px] text-foreground ring-1 ring-divider/50">
                                        {discoveryPreview.apiRoot}
                                      </code>
                                    </div>
                                    <div className="max-w-full overflow-x-auto whitespace-nowrap rounded-cf-sm bg-surface-200/75 px-3 py-2 font-mono text-[11px] text-foreground ring-1 ring-divider/50">
                                      {discoveryPreview.requestUrl ??
                                        t("customDiscoveryEndpointRequired")}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </section>

                            <section className="flex min-h-0 flex-1 flex-col gap-3 border-t border-divider/70 pt-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <h3 className="text-sm font-medium text-foreground">
                                    {t("modelRulesSectionTitle")}
                                  </h3>
                                  <Badge variant="outline">{currentRuleCount}</Badge>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  {modelRuleFields.length > 0 ? (
                                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <Checkbox
                                        checked={modelRuleHeaderSelectionState}
                                        onCheckedChange={(value) =>
                                          handleSelectAllModelRules(
                                            value === true || value === "indeterminate"
                                          )
                                        }
                                        aria-label={t("modelRulesSelectAll")}
                                      />
                                      <span>{t("modelRulesSelectAll")}</span>
                                    </label>
                                  ) : null}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="gap-2"
                                    onClick={() => appendModelRule(createEmptyModelRule())}
                                  >
                                    <Plus className="h-4 w-4" />
                                    {t("addModelRule")}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="gap-2 text-status-error hover:bg-status-error-muted"
                                    onClick={handleRemoveSelectedModelRules}
                                    disabled={selectedModelRuleCount === 0}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    {t("deleteSelectedModelRules")}
                                  </Button>
                                </div>
                              </div>

                              {modelRuleFields.length === 0 ? (
                                <div className="flex min-h-[180px] flex-1 items-center rounded-cf-sm border border-dashed border-divider bg-card/15 px-4 text-sm text-muted-foreground">
                                  {t("modelRulesEmpty")}
                                </div>
                              ) : (
                                <div className="min-h-0 flex-1 overflow-auto pr-1 [scrollbar-gutter:stable]">
                                  <div className="space-y-3">
                                    {modelRuleFields.map((ruleField, index) => {
                                      const currentRule = watchedModelRules?.[index] ?? ruleField;
                                      const isAliasRule = currentRule.type === "alias";
                                      const valueLabel =
                                        currentRule.type === "regex"
                                          ? t("modelRuleRegexPattern")
                                          : currentRule.type === "alias"
                                            ? t("sourceModel")
                                            : t("modelRuleValue");
                                      const valuePlaceholder =
                                        currentRule.type === "regex"
                                          ? t("modelRuleRegexPlaceholder")
                                          : currentRule.type === "alias"
                                            ? t("modelRuleAliasPlaceholder")
                                            : t("modelRuleExactPlaceholder");

                                      return (
                                        <div
                                          key={ruleField.id}
                                          className="rounded-cf-sm border border-divider/70 bg-card/20 p-3"
                                        >
                                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <Checkbox
                                                checked={selectedModelRuleIdSet.has(ruleField.id)}
                                                onCheckedChange={(value) =>
                                                  toggleModelRuleSelection(
                                                    ruleField.id,
                                                    value === true
                                                  )
                                                }
                                                aria-label={`${t("selectModelRule")} ${index + 1}`}
                                              />
                                              <Badge
                                                variant={getRuleSourceBadgeVariant(
                                                  currentRule.source
                                                )}
                                              >
                                                {t(`modelRuleSource_${currentRule.source}`)}
                                              </Badge>
                                              <span className="text-xs text-muted-foreground">
                                                {currentRule.display_label ||
                                                  t(`modelRuleTypeLabel_${currentRule.type}`)}
                                              </span>
                                            </div>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8 text-status-error hover:bg-status-error-muted"
                                              onClick={() => handleRemoveModelRule(index)}
                                              aria-label={t("removeModelRule")}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </div>

                                          <div
                                            className={cn(
                                              "grid gap-3",
                                              isAliasRule
                                                ? "md:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)]"
                                                : "md:grid-cols-[150px_minmax(0,1fr)]"
                                            )}
                                          >
                                            <FormField
                                              control={form.control}
                                              name={`model_rules.${index}.type`}
                                              render={({ field }) => (
                                                <FormItem>
                                                  <FormLabel>{t("modelRuleType")}</FormLabel>
                                                  <Select
                                                    value={field.value}
                                                    onValueChange={(
                                                      value: UpstreamModelRuleType
                                                    ) => {
                                                      field.onChange(value);
                                                      updateRuleAtIndex(
                                                        index,
                                                        {
                                                          type: value,
                                                          target_model:
                                                            value === "alias"
                                                              ? (currentRule.target_model ?? "")
                                                              : null,
                                                          display_label: null,
                                                        },
                                                        { forceManualSource: true }
                                                      );
                                                    }}
                                                  >
                                                    <FormControl>
                                                      <SelectTrigger>
                                                        <SelectValue />
                                                      </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                      {MODEL_RULE_TYPE_VALUES.map((type) => (
                                                        <SelectItem key={type} value={type}>
                                                          {t(`modelRuleTypeLabel_${type}`)}
                                                        </SelectItem>
                                                      ))}
                                                    </SelectContent>
                                                  </Select>
                                                  <FormMessage />
                                                </FormItem>
                                              )}
                                            />

                                            <FormField
                                              control={form.control}
                                              name={`model_rules.${index}.value`}
                                              render={({ field }) => (
                                                <FormItem>
                                                  <FormLabel>{valueLabel}</FormLabel>
                                                  <FormControl>
                                                    <Input
                                                      placeholder={valuePlaceholder}
                                                      value={field.value}
                                                      onChange={(event) => {
                                                        field.onChange(event.target.value);
                                                        updateRuleAtIndex(
                                                          index,
                                                          { value: event.target.value },
                                                          { forceManualSource: true }
                                                        );
                                                      }}
                                                    />
                                                  </FormControl>
                                                  <FormMessage />
                                                </FormItem>
                                              )}
                                            />

                                            {isAliasRule ? (
                                              <FormField
                                                control={form.control}
                                                name={`model_rules.${index}.target_model`}
                                                render={({ field, fieldState }) => (
                                                  <FormItem>
                                                    <FormLabel>{t("targetModel")}</FormLabel>
                                                    <FormControl>
                                                      <Input
                                                        placeholder={t(
                                                          "modelRuleTargetPlaceholder"
                                                        )}
                                                        value={field.value ?? ""}
                                                        onChange={(event) => {
                                                          field.onChange(event.target.value);
                                                          updateRuleAtIndex(
                                                            index,
                                                            { target_model: event.target.value },
                                                            { forceManualSource: true }
                                                          );
                                                        }}
                                                      />
                                                    </FormControl>
                                                    {fieldState.error?.message ? (
                                                      <p className="type-body-small text-[rgb(var(--md-sys-color-error))]">
                                                        {fieldState.error.message ===
                                                        MODEL_RULE_ALIAS_TARGET_REQUIRED_MESSAGE
                                                          ? t("modelRuleAliasTargetRequired")
                                                          : fieldState.error.message}
                                                      </p>
                                                    ) : null}
                                                  </FormItem>
                                                )}
                                              />
                                            ) : null}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </section>
                          </div>

                          <div className="flex min-h-0 flex-col xl:pl-5">
                            <section className="flex min-h-0 flex-1 flex-col space-y-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="space-y-1">
                                  <h3 className="text-sm font-medium text-foreground">
                                    {t("catalogSectionTitle")}
                                  </h3>
                                </div>
                                <Badge variant="outline">
                                  {t("catalogSelectedSummary", {
                                    count: selectedCatalogModels.length,
                                  })}
                                </Badge>
                              </div>

                              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_136px]">
                                <div className="space-y-2">
                                  <label className="text-xs font-medium text-foreground">
                                    {t("catalogSearchLabel")}
                                  </label>
                                  <div className="relative">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                      className="pl-9"
                                      placeholder={t("catalogSearchPlaceholder")}
                                      value={catalogSearchQuery}
                                      onChange={(event) =>
                                        setCatalogSearchQuery(event.target.value)
                                      }
                                    />
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <label className="text-xs font-medium text-foreground">
                                    {t("catalogSourceFilterLabel")}
                                  </label>
                                  <Select
                                    value={catalogSourceFilter}
                                    onValueChange={(value: CatalogSourceFilter) =>
                                      setCatalogSourceFilter(value)
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="all">
                                        {t("catalogSourceFilterAll")}
                                      </SelectItem>
                                      <SelectItem value="native">
                                        {t("modelRuleSource_native")}
                                      </SelectItem>
                                      <SelectItem value="inferred">
                                        {t("modelRuleSource_inferred")}
                                      </SelectItem>
                                      <SelectItem value="litellm">
                                        {t("modelRuleSource_litellm")}
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              {catalogState.modelCatalogLastStatus === "failed" && (
                                <div className="rounded-cf-sm border border-status-error/45 bg-status-error-muted px-3 py-3 text-xs text-status-error">
                                  <div className="font-medium">{t("catalogFailureTitle")}</div>
                                  <div className="mt-1">
                                    {catalogState.modelCatalogLastError ||
                                      t("catalogFailureUnknown")}
                                  </div>
                                  {catalogFailedAtLabel && (
                                    <div className="mt-1 text-status-error/85">
                                      {t("catalogFailedAtLabel", { time: catalogFailedAtLabel })}
                                    </div>
                                  )}
                                </div>
                              )}

                              {!isEdit ? (
                                <div className="flex min-h-[180px] items-center rounded-cf-sm border border-dashed border-divider bg-card/15 p-4 text-sm text-muted-foreground">
                                  {t("catalogCreateHint")}
                                </div>
                              ) : catalogIsRefreshing ? (
                                <div className="flex min-h-[180px] items-center justify-center gap-2 rounded-cf-sm bg-card/15 px-3 py-4 text-sm text-muted-foreground ring-1 ring-divider/50">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  {t("catalogLoading")}
                                </div>
                              ) : !catalogHasEntries ? (
                                <div className="flex min-h-[180px] items-center rounded-cf-sm border border-dashed border-divider bg-card/15 p-4 text-sm text-muted-foreground">
                                  {t("catalogEmptyState")}
                                </div>
                              ) : (
                                <div className="flex min-h-0 flex-1 flex-col gap-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                    <span>
                                      {t("catalogFilteredSummary", {
                                        visible: filteredCatalogEntries.length,
                                        total: catalogState.modelCatalog.length,
                                      })}
                                    </span>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={handleSelectFilteredCatalogEntries}
                                        disabled={filteredCatalogEntries.length === 0}
                                      >
                                        {t("catalogSelectVisible")}
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={handleClearCatalogSelection}
                                        disabled={selectedCatalogModels.length === 0}
                                      >
                                        {t("catalogClearSelection")}
                                      </Button>
                                    </div>
                                  </div>

                                  {filteredCatalogEntries.length === 0 ? (
                                    <div className="min-h-0 flex-1 rounded-cf-sm border border-divider/70 bg-card/15 p-4 text-sm text-muted-foreground">
                                      {t("catalogNoMatchingModels")}
                                    </div>
                                  ) : (
                                    <VirtualCatalogEntryList
                                      entries={filteredCatalogEntries}
                                      selectedModels={selectedCatalogModelSet}
                                      onToggle={toggleCatalogModelSelection}
                                    />
                                  )}

                                  <div className="flex flex-col gap-3 border-t border-divider/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
                                    <span className="text-xs text-muted-foreground">
                                      {t("catalogSelectionFeedback", {
                                        selected: selectedCatalogModels.length,
                                        visible: selectedVisibleCatalogCount,
                                      })}
                                    </span>
                                    <Button
                                      type="button"
                                      className="gap-2 self-start sm:self-auto"
                                      onClick={() => {
                                        void handleImportCatalog();
                                      }}
                                      disabled={selectedCatalogModels.length === 0}
                                    >
                                      <ArrowDownToLine className="h-4 w-4" />
                                      {t("catalogImportScope", {
                                        count: selectedCatalogModels.length,
                                      })}
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </section>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      id="advanced-billing-multipliers"
                      className={getSectionClassName("advanced-billing-multipliers")}
                    >
                      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
                        {t("billingMultipliers")}
                      </h3>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="billing_input_multiplier"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("billingInputMultiplier")}</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.01}
                                  inputMode="decimal"
                                  name={field.name}
                                  ref={field.ref}
                                  value={getNumericInputValue(field.value)}
                                  onBlur={field.onBlur}
                                  onChange={(e) => field.onChange(e.target.value)}
                                />
                              </FormControl>
                              <FormDescription>{t("billingInputMultiplierDesc")}</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="billing_output_multiplier"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("billingOutputMultiplier")}</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.01}
                                  inputMode="decimal"
                                  name={field.name}
                                  ref={field.ref}
                                  value={getNumericInputValue(field.value)}
                                  onBlur={field.onBlur}
                                  onChange={(e) => field.onChange(e.target.value)}
                                />
                              </FormControl>
                              <FormDescription>{t("billingOutputMultiplierDesc")}</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* Spending Quota Section */}
                    <div
                      id="advanced-spending-quota"
                      className={getSectionClassName("advanced-spending-quota")}
                    >
                      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
                        {t("spendingQuota")}
                      </h3>
                      <div className="mb-4 flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() =>
                            appendSpendingRule({
                              period_type: "daily",
                              limit: 0,
                              period_hours: null,
                            })
                          }
                        >
                          <Plus className="h-3 w-3" />
                          {t("addSpendingRule")}
                        </Button>
                      </div>

                      {spendingRuleFields.length === 0 && (
                        <p className="text-xs text-muted-foreground">{t("noSpendingRules")}</p>
                      )}

                      <div className="space-y-3">
                        {spendingRuleFields.map((ruleField, index) => {
                          const periodType =
                            spendingRules?.[index]?.period_type ?? ruleField.period_type;
                          return (
                            <div
                              key={ruleField.id}
                              className="grid grid-cols-[1fr_1fr_auto] items-start gap-2 rounded-cf-sm border border-divider bg-surface-300/30 p-3"
                            >
                              <FormField
                                control={form.control}
                                name={`spending_rules.${index}.period_type`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs">
                                      {t("spendingPeriodType")}
                                    </FormLabel>
                                    <Select
                                      value={field.value}
                                      onValueChange={(v) => {
                                        field.onChange(v);
                                        if (v === "rolling") {
                                          const currentHours = form.getValues(
                                            `spending_rules.${index}.period_hours`
                                          );
                                          if (currentHours == null) {
                                            form.setValue(
                                              `spending_rules.${index}.period_hours`,
                                              ROLLING_DEFAULT_PERIOD_HOURS,
                                              { shouldValidate: true, shouldDirty: true }
                                            );
                                          }
                                        } else {
                                          form.setValue(
                                            `spending_rules.${index}.period_hours`,
                                            null
                                          );
                                        }
                                      }}
                                    >
                                      <FormControl>
                                        <SelectTrigger className="h-8 text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="daily">
                                          {t("spendingPeriodDaily")}
                                        </SelectItem>
                                        <SelectItem value="monthly">
                                          {t("spendingPeriodMonthly")}
                                        </SelectItem>
                                        <SelectItem value="rolling">
                                          {t("spendingPeriodRolling")}
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <div className="space-y-2">
                                <FormField
                                  control={form.control}
                                  name={`spending_rules.${index}.limit`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs">
                                        {t("spendingLimit")}
                                      </FormLabel>
                                      <FormControl>
                                        <Input
                                          type="number"
                                          min={0}
                                          step={0.01}
                                          inputMode="decimal"
                                          className="h-8 text-xs"
                                          placeholder={t("spendingLimitPlaceholder")}
                                          {...field}
                                          value={getNumericInputValue(field.value)}
                                          onChange={(e) => field.onChange(e.target.value)}
                                          onBlur={(e) => {
                                            field.onBlur();
                                            const raw = e.target.value.trim();
                                            if (raw.startsWith(".")) {
                                              field.onChange(`0${raw}`);
                                            }
                                          }}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                {periodType === "rolling" && (
                                  <FormField
                                    control={form.control}
                                    name={`spending_rules.${index}.period_hours`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel className="text-xs">
                                          {t("spendingPeriodHours")}
                                        </FormLabel>
                                        <FormControl>
                                          <Input
                                            type="number"
                                            min={1}
                                            max={8760}
                                            step={1}
                                            inputMode="numeric"
                                            className="h-8 text-xs"
                                            placeholder={String(ROLLING_DEFAULT_PERIOD_HOURS)}
                                            value={field.value ?? ""}
                                            onChange={(e) => {
                                              const v = e.target.value;
                                              field.onChange(v === "" ? null : Number(v));
                                            }}
                                            onBlur={field.onBlur}
                                          />
                                        </FormControl>
                                        <FormDescription className="text-xs">
                                          {t("spendingPeriodHoursDesc")}
                                        </FormDescription>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                )}
                              </div>

                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="mt-6 h-8 w-8 text-status-error hover:bg-status-error-muted"
                                onClick={() => removeSpendingRule(index)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div
                      id="advanced-capacity-control"
                      className={getSectionClassName("advanced-capacity-control")}
                    >
                      <div className="space-y-4">
                        <FormField
                          control={form.control}
                          name="max_concurrency"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("maxConcurrency")}</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={1}
                                  step={1}
                                  placeholder={t("maxConcurrencyPlaceholder")}
                                  value={field.value ?? ""}
                                  onChange={(e) => {
                                    const rawValue = e.target.value.trim();
                                    field.onChange(rawValue === "" ? null : Number(rawValue));
                                  }}
                                />
                              </FormControl>
                              <FormDescription>{t("maxConcurrencyDesc")}</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="queue_policy.enabled"
                          render={({ field }) => (
                            <FormItem className="rounded-cf-sm border border-divider/50 bg-surface-200/35 px-3 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="space-y-1">
                                  <FormLabel className="m-0 text-sm font-medium text-foreground">
                                    {t("queuePolicyEnabled")}
                                  </FormLabel>
                                  <FormDescription className="m-0 text-xs">
                                    {t("queuePolicyEnabledDesc")}
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    aria-label={t("queuePolicyEnabled")}
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Badge
                                  variant="outline"
                                  className={
                                    field.value
                                      ? "border-status-warning/45 text-status-warning"
                                      : "border-divider text-muted-foreground"
                                  }
                                >
                                  {field.value
                                    ? t("queuePolicyEnabledBadge")
                                    : t("queuePolicyDisabled")}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className="border-divider text-muted-foreground"
                                >
                                  {t("queuePolicySummaryTimeout", {
                                    timeoutMs: queuePolicyTimeoutMs,
                                  })}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className="border-divider text-muted-foreground"
                                >
                                  {queuePolicyMaxQueueLength == null
                                    ? t("queuePolicySummaryLengthUnlimited")
                                    : t("queuePolicySummaryLength", {
                                        maxQueueLength: queuePolicyMaxQueueLength,
                                      })}
                                </Badge>
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {queuePolicy?.enabled && (
                          <div className="grid gap-4 md:grid-cols-2">
                            <FormField
                              control={form.control}
                              name="queue_policy.timeout_ms"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>{t("queuePolicyTimeout")}</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      min={1}
                                      step={1}
                                      inputMode="numeric"
                                      placeholder={t("queuePolicyTimeoutPlaceholder")}
                                      value={getNumericInputValue(field.value)}
                                      onChange={(e) => {
                                        const rawValue = e.target.value.trim();
                                        field.onChange(rawValue === "" ? "" : Number(rawValue));
                                      }}
                                    />
                                  </FormControl>
                                  <FormDescription>{t("queuePolicyTimeoutDesc")}</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="queue_policy.max_queue_length"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>{t("queuePolicyMaxQueueLength")}</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      min={1}
                                      step={1}
                                      inputMode="numeric"
                                      placeholder={t("queuePolicyMaxQueueLengthPlaceholder")}
                                      value={getNumericInputValue(field.value)}
                                      onChange={(e) => {
                                        const rawValue = e.target.value.trim();
                                        field.onChange(rawValue === "" ? null : Number(rawValue));
                                      }}
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    {t("queuePolicyMaxQueueLengthDesc")}
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Circuit Breaker Configuration Section */}
                    <div
                      id="advanced-circuit-breaker"
                      className={getSectionClassName("advanced-circuit-breaker")}
                    >
                      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
                        {t("circuitBreakerConfig")}
                      </h3>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">{t("failureThreshold")}</label>
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            placeholder={t("circuitBreakerUseDefaultPlaceholder", {
                              value: circuitBreakerDefaults.failureThreshold,
                            })}
                            value={circuitBreakerConfig?.failure_threshold ?? ""}
                            onChange={(e) => {
                              const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                              const currentConfig = form.getValues("circuit_breaker_config") || {};
                              form.setValue(
                                "circuit_breaker_config",
                                val !== undefined
                                  ? { ...currentConfig, failure_threshold: val }
                                  : null,
                                { shouldValidate: true }
                              );
                            }}
                          />
                          <p className="text-xs text-muted-foreground">
                            {t("failureThresholdDesc")}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium">{t("successThreshold")}</label>
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            placeholder={t("circuitBreakerUseDefaultPlaceholder", {
                              value: circuitBreakerDefaults.successThreshold,
                            })}
                            value={circuitBreakerConfig?.success_threshold ?? ""}
                            onChange={(e) => {
                              const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                              const currentConfig = form.getValues("circuit_breaker_config") || {};
                              form.setValue(
                                "circuit_breaker_config",
                                val !== undefined
                                  ? { ...currentConfig, success_threshold: val }
                                  : null,
                                { shouldValidate: true }
                              );
                            }}
                          />
                          <p className="text-xs text-muted-foreground">
                            {t("successThresholdDesc")}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium">{t("openDuration")}</label>
                          <Input
                            type="number"
                            min={1}
                            max={300}
                            step={1}
                            placeholder={t("circuitBreakerUseDefaultPlaceholder", {
                              value: circuitBreakerDefaults.openDuration,
                            })}
                            value={circuitBreakerConfig?.open_duration ?? ""}
                            onChange={(e) => {
                              const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                              const currentConfig = form.getValues("circuit_breaker_config") || {};
                              form.setValue(
                                "circuit_breaker_config",
                                val !== undefined ? { ...currentConfig, open_duration: val } : null,
                                { shouldValidate: true }
                              );
                            }}
                          />
                          <p className="text-xs text-muted-foreground">{t("openDurationDesc")}</p>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium">{t("probeInterval")}</label>
                          <Input
                            type="number"
                            min={1}
                            max={60}
                            step={1}
                            placeholder={t("circuitBreakerUseDefaultPlaceholder", {
                              value: circuitBreakerDefaults.probeInterval,
                            })}
                            value={circuitBreakerConfig?.probe_interval ?? ""}
                            onChange={(e) => {
                              const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                              const currentConfig = form.getValues("circuit_breaker_config") || {};
                              form.setValue(
                                "circuit_breaker_config",
                                val !== undefined
                                  ? { ...currentConfig, probe_interval: val }
                                  : null,
                                { shouldValidate: true }
                              );
                            }}
                          />
                          <p className="text-xs text-muted-foreground">{t("probeIntervalDesc")}</p>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium">{t("firstByteTimeout")}</label>
                          <Input
                            type="number"
                            min={1}
                            max={300}
                            step={1}
                            placeholder={t("circuitBreakerUseDefaultPlaceholder", {
                              value: circuitBreakerDefaults.firstByteTimeout,
                            })}
                            value={circuitBreakerConfig?.first_byte_timeout ?? ""}
                            onChange={(e) => {
                              const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                              const currentConfig = form.getValues("circuit_breaker_config") || {};
                              form.setValue(
                                "circuit_breaker_config",
                                val !== undefined
                                  ? { ...currentConfig, first_byte_timeout: val }
                                  : null,
                                { shouldValidate: true }
                              );
                            }}
                          />
                          <p className="text-xs text-muted-foreground">
                            {t("firstByteTimeoutDesc")}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium">{t("streamIdleTimeout")}</label>
                          <Input
                            type="number"
                            min={1}
                            max={300}
                            step={1}
                            placeholder={t("circuitBreakerUseDefaultPlaceholder", {
                              value: circuitBreakerDefaults.streamIdleTimeout,
                            })}
                            value={circuitBreakerConfig?.stream_idle_timeout ?? ""}
                            onChange={(e) => {
                              const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                              const currentConfig = form.getValues("circuit_breaker_config") || {};
                              form.setValue(
                                "circuit_breaker_config",
                                val !== undefined
                                  ? { ...currentConfig, stream_idle_timeout: val }
                                  : null,
                                { shouldValidate: true }
                              );
                            }}
                          />
                          <p className="text-xs text-muted-foreground">
                            {t("streamIdleTimeoutDesc")}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div
                      id="advanced-failure-rules"
                      className={getSectionClassName("advanced-failure-rules")}
                    >
                      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
                        {t("failureRulesConfig")}
                      </h3>

                      <FormField
                        control={form.control}
                        name="failure_rule_config.use_global_rules"
                        render={({ field }) => (
                          <FormItem className="rounded-cf-sm border border-divider/50 bg-surface-200/35 px-3 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="space-y-1">
                                <FormLabel className="m-0 text-sm font-medium text-foreground">
                                  {t("useGlobalFailureRules")}
                                </FormLabel>
                                <FormDescription className="m-0 text-xs">
                                  {t("useGlobalFailureRulesDesc")}
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  aria-label={t("useGlobalFailureRules")}
                                  checked={failureRuleConfig?.use_global_rules ?? true}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Session Affinity Migration Configuration Section */}
                    <div
                      id="advanced-affinity-migration"
                      className={getSectionClassName("advanced-affinity-migration")}
                    >
                      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
                        {t("affinityMigrationConfig")}
                      </h3>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <label className="text-sm font-medium">
                              {t("affinityMigrationEnabled")}
                            </label>
                            <p className="text-xs text-muted-foreground">
                              {t("affinityMigrationEnabledDesc")}
                            </p>
                          </div>
                          <Switch
                            aria-label={t("affinityMigrationEnabled")}
                            checked={affinityMigration?.enabled ?? false}
                            onCheckedChange={(checked) => {
                              const currentConfig = form.getValues("affinity_migration");
                              form.setValue(
                                "affinity_migration",
                                checked
                                  ? {
                                      enabled: true,
                                      metric: currentConfig?.metric ?? "tokens",
                                      threshold: currentConfig?.threshold ?? 50000,
                                    }
                                  : null,
                                { shouldValidate: true }
                              );
                            }}
                          />
                        </div>

                        {affinityMigration?.enabled && (
                          <>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">
                                {t("affinityMigrationMetric")}
                              </label>
                              <Select
                                value={affinityMigration.metric}
                                onValueChange={(value: "tokens" | "length") => {
                                  form.setValue(
                                    "affinity_migration",
                                    {
                                      ...affinityMigration,
                                      metric: value,
                                    },
                                    { shouldValidate: true }
                                  );
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="tokens">{t("metricTokens")}</SelectItem>
                                  <SelectItem value="length">{t("metricLength")}</SelectItem>
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground">
                                {t("affinityMigrationMetricDesc")}
                              </p>
                            </div>

                            <div className="space-y-2">
                              <label className="text-sm font-medium">
                                {t("affinityMigrationThreshold")}
                              </label>
                              <Input
                                type="number"
                                min={1}
                                max={10000000}
                                step={1}
                                placeholder="50000"
                                value={getNumericInputValue(affinityMigration.threshold)}
                                onChange={(e) => {
                                  form.setValue(
                                    "affinity_migration",
                                    {
                                      ...affinityMigration,
                                      threshold: e.target.value,
                                    },
                                    { shouldValidate: true }
                                  );
                                }}
                              />
                              <p className="text-xs text-muted-foreground">
                                {affinityMigration.metric === "tokens"
                                  ? t("affinityMigrationThresholdTokensDesc")
                                  : t("affinityMigrationThresholdLengthDesc")}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="shrink-0 border-t border-divider bg-card px-6 py-4">
              <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending
                  ? isEdit
                    ? t("updating")
                    : t("creating")
                  : isEdit
                    ? tCommon("save")
                    : tCommon("create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </div>
    </DialogContent>
  );

  const unsavedChangesDialog = (
    <AlertDialog open={showUnsavedChangesDialog} onOpenChange={setShowUnsavedChangesDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("unsavedChangesTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("unsavedChangesDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDiscardChanges}>
            {t("discardChanges")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (trigger) {
    return (
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        {dialogContent}
        {unsavedChangesDialog}
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      {dialogContent}
      {unsavedChangesDialog}
    </Dialog>
  );
}

/**
 * M3 Create Upstream Button with Dialog
 */
export function CreateUpstreamButton() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("upstreams");

  return (
    <UpstreamFormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="tonal">
          <Plus className="h-4 w-4 mr-2" />
          {t("addUpstream")}
        </Button>
      }
    />
  );
}
