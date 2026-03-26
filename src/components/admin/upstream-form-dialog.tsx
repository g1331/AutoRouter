"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertTriangle,
  Coins,
  FileText,
  Gauge,
  KeyRound,
  Link2,
  Plus,
  Route,
  Search,
  Shield,
  Shuffle,
  SlidersHorizontal,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateUpstream, useUpdateUpstream } from "@/hooks/use-upstreams";
import type { RouteCapability, Upstream } from "@/types/api";
import { TagInput } from "@/components/ui/tag-input";
import { KeyValueInput } from "@/components/ui/key-value-input";
import { Switch } from "@/components/ui/switch";
import { ROUTE_CAPABILITY_VALUES, areSingleProviderCapabilities } from "@/lib/route-capabilities";
import { RouteCapabilityMultiSelect } from "@/components/admin/route-capability-badges";
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
  })
  .nullable();

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

const ROLLING_DEFAULT_PERIOD_HOURS = 24;

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
    spending_rules: z.array(spendingRuleSchema),
    route_capabilities: z.array(z.enum(ROUTE_CAPABILITY_VALUES)),
    allowed_models: z.array(z.string()).nullable(),
    model_redirects: z.record(z.string(), z.string()).nullable(),
    circuit_breaker_config: circuitBreakerConfigSchema,
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
    spending_rules: z.array(spendingRuleSchema),
    route_capabilities: z.array(z.enum(ROUTE_CAPABILITY_VALUES)),
    allowed_models: z.array(z.string()).nullable(),
    model_redirects: z.record(z.string(), z.string()).nullable(),
    circuit_breaker_config: circuitBreakerConfigSchema,
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

type AdvancedSectionId =
  | "advanced-priority-weight"
  | "advanced-model-routing"
  | "advanced-billing-multipliers"
  | "advanced-spending-quota"
  | "advanced-capacity-control"
  | "advanced-circuit-breaker"
  | "advanced-affinity-migration";

type BasicSectionId = "basic-name" | "basic-profile" | "basic-route-endpoint" | "basic-api-key";
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
  const updateMutation = useUpdateUpstream();
  const t = useTranslations("upstreams");
  const tCommon = useTranslations("common");
  const circuitBreakerUseDefaultPlaceholder = t("circuitBreakerUseDefaultPlaceholder");
  const [configSearchQuery, setConfigSearchQuery] = useState("");
  const [activeSectionId, setActiveSectionId] = useState<ConfigSectionId>("basic-name");
  const [highlightedSectionId, setHighlightedSectionId] = useState<ConfigSectionId | null>(null);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);
  const contentScrollContainerRef = useRef<HTMLDivElement | null>(null);

  const form = useForm<UpstreamFormValues>({
    resolver: zodResolver(activeSchema),
    defaultValues: {
      name: "",
      base_url: "",
      official_website_url: "",
      api_key: "",
      description: "",
      max_concurrency: null,
      priority: 0,
      weight: 1,
      billing_input_multiplier: 1,
      billing_output_multiplier: 1,
      spending_rules: [],
      route_capabilities: [],
      allowed_models: null,
      model_redirects: null,
      circuit_breaker_config: null,
      affinity_migration: null,
    },
  });

  // Watch circuit_breaker_config for controlled inputs
  const circuitBreakerConfig = useWatch({
    control: form.control,
    name: "circuit_breaker_config",
  });

  // Watch affinity_migration for controlled inputs
  const affinityMigration = useWatch({
    control: form.control,
    name: "affinity_migration",
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
  const endpointPreview = useMemo(
    () => resolveEndpointPreview(watchedBaseUrl ?? "", watchedRouteCapabilities),
    [watchedBaseUrl, watchedRouteCapabilities]
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
        label: t("maxConcurrency"),
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
    if (upstream && open) {
      form.reset({
        name: upstream.name,
        base_url: upstream.base_url,
        official_website_url: upstream.official_website_url ?? "",
        api_key: "",
        description: upstream.description || "",
        max_concurrency: upstream.max_concurrency ?? null,
        priority: upstream.priority ?? 0,
        weight: upstream.weight ?? 1,
        billing_input_multiplier: upstream.billing_input_multiplier ?? 1,
        billing_output_multiplier: upstream.billing_output_multiplier ?? 1,
        spending_rules: (upstream.spending_rules ?? []).map((r) => ({
          period_type: r.period_type as "daily" | "monthly" | "rolling",
          limit: r.limit,
          period_hours:
            r.period_type === "rolling" ? (r.period_hours ?? ROLLING_DEFAULT_PERIOD_HOURS) : null,
        })),
        route_capabilities: upstream.route_capabilities || [],
        allowed_models: upstream.allowed_models || null,
        model_redirects: upstream.model_redirects || null,
        circuit_breaker_config: upstream.circuit_breaker?.config
          ? {
              failure_threshold: upstream.circuit_breaker.config.failure_threshold,
              success_threshold: upstream.circuit_breaker.config.success_threshold,
              open_duration: upstream.circuit_breaker.config.open_duration,
              probe_interval: upstream.circuit_breaker.config.probe_interval,
            }
          : null,
        affinity_migration: upstream.affinity_migration,
      });
    } else if (!open) {
      form.reset({
        name: "",
        base_url: "",
        official_website_url: "",
        api_key: "",
        description: "",
        max_concurrency: null,
        priority: 0,
        weight: 1,
        billing_input_multiplier: 1,
        billing_output_multiplier: 1,
        spending_rules: [],
        route_capabilities: [],
        allowed_models: null,
        model_redirects: null,
        circuit_breaker_config: null,
        affinity_migration: null,
      });
    }
  }, [upstream, open, form]);

  const resetDialogUiState = () => {
    setConfigSearchQuery("");
    setActiveSectionId("basic-name");
    setHighlightedSectionId(null);
  };

  const closeDialog = () => {
    resetDialogUiState();
    onOpenChange(false);
  };

  const hasUnsavedChanges = () => {
    if (form.formState.isDirty) {
      return true;
    }

    const defaultValues = form.formState.defaultValues;
    if (!defaultValues) {
      return false;
    }

    return JSON.stringify(form.getValues()) !== JSON.stringify(defaultValues);
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

  const onSubmit = async (values: UpstreamFormValues) => {
    try {
      const data = activeSchema.parse(values) as UpstreamFormData;
      const endpointPreviewState = resolveEndpointPreview(data.base_url, data.route_capabilities);
      const normalizedBaseUrl = endpointPreviewState?.normalizedBaseUrl ?? data.base_url.trim();
      const officialWebsiteUrl = data.official_website_url.trim()
        ? data.official_website_url.trim()
        : null;
      const maxConcurrency = data.max_concurrency ?? null;
      if (isEdit) {
        // Only include api_key when provided
        const updateData: {
          name: string;
          base_url: string;
          official_website_url?: string | null;
          api_key?: string;
          description: string | null;
          max_concurrency?: number | null;
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
          allowed_models?: string[] | null;
          model_redirects?: Record<string, string> | null;
          circuit_breaker_config?: {
            failure_threshold?: number;
            success_threshold?: number;
            open_duration?: number;
            probe_interval?: number;
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
          allowed_models: data.allowed_models,
          model_redirects: data.model_redirects,
          circuit_breaker_config: data.circuit_breaker_config,
          affinity_migration: data.affinity_migration,
        };
        if (officialWebsiteUrl !== null || upstream.official_website_url != null) {
          updateData.official_website_url = officialWebsiteUrl;
        }
        if (maxConcurrency !== null || upstream.max_concurrency != null) {
          updateData.max_concurrency = maxConcurrency;
        }
        if (data.api_key) {
          updateData.api_key = data.api_key;
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
          allowed_models: string[] | null;
          model_redirects: Record<string, string> | null;
          circuit_breaker_config: {
            failure_threshold?: number;
            success_threshold?: number;
            open_duration?: number;
            probe_interval?: number;
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
          spending_rules: spendingRulesToApi(data.spending_rules),
          route_capabilities: data.route_capabilities,
          allowed_models: data.allowed_models,
          model_redirects: data.model_redirects,
          circuit_breaker_config: data.circuit_breaker_config,
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

  const dialogContent = (
    <DialogContent
      className="max-w-5xl h-[90vh] overflow-hidden p-0"
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
                              <Input
                                {...field}
                                type="password"
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
                      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
                        {t("modelBasedRouting")}
                      </h3>

                      <FormField
                        control={form.control}
                        name="allowed_models"
                        render={({ field }) => (
                          <FormItem className="mt-4">
                            <FormLabel>{t("allowedModels")}</FormLabel>
                            <FormControl>
                              <TagInput
                                placeholder={t("allowedModelsPlaceholder")}
                                tags={field.value || []}
                                onTagsChange={(tags) =>
                                  field.onChange(tags.length > 0 ? tags : null)
                                }
                              />
                            </FormControl>
                            <FormDescription>{t("allowedModelsDescription")}</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="model_redirects"
                        render={({ field }) => (
                          <FormItem className="mt-4">
                            <FormLabel>{t("modelRedirects")}</FormLabel>
                            <FormControl>
                              <KeyValueInput
                                placeholder={t("modelRedirectsPlaceholder")}
                                entries={field.value || {}}
                                onEntriesChange={(entries) =>
                                  field.onChange(Object.keys(entries).length > 0 ? entries : null)
                                }
                                keyLabel={t("sourceModel")}
                                valueLabel={t("targetModel")}
                              />
                            </FormControl>
                            <FormDescription>{t("modelRedirectsDescription")}</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
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
                            placeholder={circuitBreakerUseDefaultPlaceholder}
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
                            placeholder={circuitBreakerUseDefaultPlaceholder}
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
                            placeholder={circuitBreakerUseDefaultPlaceholder}
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
                            placeholder={circuitBreakerUseDefaultPlaceholder}
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
                      </div>
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
