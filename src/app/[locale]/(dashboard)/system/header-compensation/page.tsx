"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeftRight, GripVertical, Pencil, Plus, Trash2, X, Check } from "lucide-react";
import { toast } from "sonner";

import { Topbar } from "@/components/admin/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useCompensationRules,
  useCreateCompensationRule,
  useUpdateCompensationRule,
  useDeleteCompensationRule,
} from "@/hooks/use-compensation-rules";
import { ROUTE_CAPABILITY_DEFINITIONS } from "@/lib/route-capabilities";
import type { CompensationRule, CompensationRuleCreate, CompensationRuleUpdate } from "@/types/api";

// ---- Source list with drag-sort (no external lib) ----

interface SourceListProps {
  sources: string[];
  onChange: (sources: string[]) => void;
}

function SourceList({ sources, onChange }: SourceListProps) {
  const t = useTranslations("compensation");
  const [newSource, setNewSource] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const addSource = () => {
    const trimmed = newSource.trim();
    if (!trimmed || sources.includes(trimmed)) return;
    onChange([...sources, trimmed]);
    setNewSource("");
  };

  const removeSource = (idx: number) => {
    onChange(sources.filter((_, i) => i !== idx));
  };

  const handleDragStart = (idx: number) => setDragIndex(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setOverIndex(idx);
  };
  const handleDrop = () => {
    if (dragIndex === null || overIndex === null || dragIndex === overIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = [...sources];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(overIndex, 0, moved);
    onChange(next);
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className="space-y-1.5">
      {sources.map((src, idx) => (
        <div
          key={src}
          draggable
          onDragStart={() => handleDragStart(idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDrop={handleDrop}
          onDragEnd={() => {
            setDragIndex(null);
            setOverIndex(null);
          }}
          className={cn(
            "flex items-center gap-2 rounded-cf-sm border border-divider bg-surface-300/50 px-2 py-1.5 text-xs",
            overIndex === idx && dragIndex !== idx && "border-amber-500/50 bg-amber-500/5"
          )}
        >
          <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/50" />
          <span className="flex-1 font-mono text-foreground">{src}</span>
          <button
            type="button"
            onClick={() => removeSource(idx)}
            className="text-muted-foreground hover:text-status-error"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <div className="flex gap-1.5">
        <Input
          value={newSource}
          onChange={(e) => setNewSource(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSource())}
          placeholder={t("sourcesPlaceholder")}
          className="h-7 font-mono text-xs"
        />
        <Button type="button" size="sm" variant="outline" onClick={addSource} className="h-7 px-2">
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ---- Capability checkboxes ----

interface CapabilityPickerProps {
  selected: string[];
  onChange: (caps: string[]) => void;
}

function CapabilityPicker({ selected, onChange }: CapabilityPickerProps) {
  const t = useTranslations("upstreams");

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((c) => c !== value) : [...selected, value]);
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {ROUTE_CAPABILITY_DEFINITIONS.map((def) => {
        const active = selected.includes(def.value);
        return (
          <button
            key={def.value}
            type="button"
            onClick={() => toggle(def.value)}
            className={cn(
              "flex items-center gap-1 rounded-cf-sm border px-2 py-1 text-[11px] transition-colors",
              active
                ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
                : "border-divider bg-surface-300/50 text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            {active && <Check className="h-2.5 w-2.5" />}
            {t(def.labelKey as Parameters<typeof t>[0])}
          </button>
        );
      })}
    </div>
  );
}

// ---- Rule form dialog ----

interface RuleFormDialogProps {
  open: boolean;
  onClose: () => void;
  initial?: CompensationRule;
}

function RuleFormDialog({ open, onClose, initial }: RuleFormDialogProps) {
  const t = useTranslations("compensation");
  const createMutation = useCreateCompensationRule();
  const updateMutation = useUpdateCompensationRule();

  const [name, setName] = useState(initial?.name ?? "");
  const [targetHeader, setTargetHeader] = useState(initial?.target_header ?? "");
  const [capabilities, setCapabilities] = useState<string[]>(initial?.capabilities ?? []);
  const [sources, setSources] = useState<string[]>(initial?.sources ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEditing = !!initial;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t("ruleNameRequired");
    if (!targetHeader.trim()) errs.targetHeader = t("targetHeaderRequired");
    if (capabilities.length === 0) errs.capabilities = t("capabilitiesRequired");
    if (sources.length === 0) errs.sources = t("sourcesRequired");
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (isEditing) {
      const update: CompensationRuleUpdate = {
        enabled: initial.enabled,
        capabilities,
        target_header: targetHeader.trim(),
        sources,
        mode: initial.mode,
      };
      if (!initial.is_builtin) update.name = name.trim();
      await updateMutation.mutateAsync({ id: initial.id, data: update });
      toast.success(t("createSuccess"));
    } else {
      const create: CompensationRuleCreate = {
        name: name.trim(),
        target_header: targetHeader.trim(),
        capabilities,
        sources,
        mode: "missing_only",
      };
      await createMutation.mutateAsync(create);
      toast.success(t("createSuccess"));
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm tracking-wider">
            {isEditing ? t("ruleName") : t("addRule")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("ruleName")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("ruleNamePlaceholder")}
              disabled={isEditing && initial?.is_builtin}
              className="text-xs"
            />
            {errors.name && <p className="text-[11px] text-status-error">{errors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t("targetHeader")}</Label>
            <Input
              value={targetHeader}
              onChange={(e) => setTargetHeader(e.target.value)}
              placeholder={t("targetHeaderPlaceholder")}
              className="font-mono text-xs"
            />
            {errors.targetHeader && (
              <p className="text-[11px] text-status-error">{errors.targetHeader}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t("capabilities")}</Label>
            <CapabilityPicker selected={capabilities} onChange={setCapabilities} />
            {errors.capabilities && (
              <p className="text-[11px] text-status-error">{errors.capabilities}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t("sources")}</Label>
            <SourceList sources={sources} onChange={setSources} />
            {errors.sources && <p className="text-[11px] text-status-error">{errors.sources}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? (
                t("creating")
              ) : (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  {isEditing ? "Save" : t("addRule")}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Rule card ----

interface RuleCardProps {
  rule: CompensationRule;
  onEdit: (rule: CompensationRule) => void;
  onDelete: (rule: CompensationRule) => void;
}

function RuleCard({ rule, onEdit, onDelete }: RuleCardProps) {
  const t = useTranslations("compensation");
  const tUp = useTranslations("upstreams");
  const updateMutation = useUpdateCompensationRule();

  const handleToggle = async (enabled: boolean) => {
    await updateMutation.mutateAsync({ id: rule.id, data: { enabled } });
    toast.success(enabled ? t("enableSuccess") : t("disableSuccess"));
  };

  return (
    <div className="rounded-cf-sm border border-divider bg-surface-300/55 shadow-[var(--vr-shadow-xs)]">
      <div className="flex items-center gap-3 border-b border-divider/80 bg-surface-200/70 px-3 py-2">
        <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        <span className="flex-1 truncate text-xs font-medium text-foreground">{rule.name}</span>
        <div className="flex items-center gap-1.5">
          {rule.is_builtin && (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[10px] text-amber-400"
            >
              {t("builtin")}
            </Badge>
          )}
          <Badge
            variant="outline"
            className={cn(
              "px-1.5 py-0 text-[10px]",
              rule.enabled
                ? "border-status-success/40 bg-status-success/10 text-status-success"
                : "border-divider text-muted-foreground"
            )}
          >
            {rule.enabled ? t("enabled") : t("disabled")}
          </Badge>
        </div>
      </div>

      <div className="px-3 py-2.5 space-y-2">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-muted-foreground">{t("targetHeader")}:</span>
          <code className="rounded bg-surface-400/40 px-1 py-0.5 font-mono text-foreground">
            {rule.target_header}
          </code>
          <span className="ml-auto text-muted-foreground">{t("mode")}:</span>
          <span className="text-foreground">{t("modeMissingOnly")}</span>
        </div>

        <div className="flex flex-wrap gap-1">
          {rule.capabilities.map((cap) => {
            const def = ROUTE_CAPABILITY_DEFINITIONS.find((d) => d.value === cap);
            return (
              <span
                key={cap}
                className="rounded border border-divider bg-surface-400/30 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {def ? tUp(def.labelKey as Parameters<typeof tUp>[0]) : cap}
              </span>
            );
          })}
        </div>

        <div className="space-y-0.5">
          {rule.sources.map((src, i) => (
            <div key={src} className="flex items-center gap-1.5 text-[11px]">
              <span className="w-3.5 text-right tabular-nums text-muted-foreground/50">
                {i + 1}.
              </span>
              <code className="font-mono text-foreground">{src}</code>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-divider/60 px-3 py-2">
        <Switch
          checked={rule.enabled}
          onCheckedChange={(v) => void handleToggle(v)}
          disabled={updateMutation.isPending}
          aria-label={rule.enabled ? t("disable") : t("enable")}
        />
        <span className="text-[11px] text-muted-foreground">
          {rule.enabled ? t("enable") : t("disable")}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {!rule.is_builtin && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => onEdit(rule)}
              title="Edit"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          {!rule.is_builtin && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-status-error"
              onClick={() => onDelete(rule)}
              title={t("deleteRule")}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Capability matrix ----

function CapabilityMatrix({ rules }: { rules: CompensationRule[] }) {
  const t = useTranslations("compensation");
  const tUp = useTranslations("upstreams");

  const enabledRules = rules.filter((r) => r.enabled);

  return (
    <div className="rounded-cf-sm border border-divider bg-surface-300/55 shadow-[var(--vr-shadow-xs)]">
      <div className="border-b border-divider/80 bg-surface-200/70 px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("capabilityMatrix")}
        </span>
        <p className="mt-0.5 text-[11px] text-muted-foreground/70">{t("capabilityMatrixDesc")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-divider/60">
              <th className="px-3 py-2 text-left font-normal text-muted-foreground">
                {t("ruleName")}
              </th>
              {ROUTE_CAPABILITY_DEFINITIONS.map((def) => (
                <th
                  key={def.value}
                  className="px-2 py-2 text-center font-normal text-muted-foreground"
                >
                  {tUp(def.labelKey as Parameters<typeof tUp>[0])}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-divider/40">
            {enabledRules.length === 0 ? (
              <tr>
                <td
                  colSpan={ROUTE_CAPABILITY_DEFINITIONS.length + 1}
                  className="px-3 py-4 text-center text-muted-foreground"
                >
                  {t("noRules")}
                </td>
              </tr>
            ) : (
              enabledRules.map((rule) => (
                <tr key={rule.id} className="hover:bg-surface-300/30">
                  <td className="px-3 py-2 font-medium text-foreground">{rule.name}</td>
                  {ROUTE_CAPABILITY_DEFINITIONS.map((def) => (
                    <td key={def.value} className="px-2 py-2 text-center">
                      {rule.capabilities.includes(def.value) ? (
                        <Check className="mx-auto h-3 w-3 text-amber-500" />
                      ) : (
                        <span className="text-divider">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Page ----

export default function HeaderCompensationPage() {
  const t = useTranslations("compensation");
  const tCommon = useTranslations("common");
  const { data, isLoading } = useCompensationRules();
  const deleteMutation = useDeleteCompensationRule();

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CompensationRule | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<CompensationRule | undefined>();

  const rules = data ?? [];
  const builtinRules = rules.filter((rule) => rule.is_builtin);
  const customRules = rules.filter((rule) => !rule.is_builtin);

  const openCreate = () => {
    setEditTarget(undefined);
    setFormOpen(true);
  };

  const openEdit = (rule: CompensationRule) => {
    setEditTarget(rule);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteMutation.mutateAsync(deleteTarget.id);
    toast.success(t("deleteSuccess"));
    setDeleteTarget(undefined);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <Topbar title={t("pageTitle")} />
      <main className="flex-1 space-y-6 px-6 py-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium tracking-wider text-foreground">
              {t("management")}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("managementDesc")}</p>
          </div>
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            {t("addRule")}
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="h-32 animate-pulse rounded-cf-sm border border-divider bg-surface-300/40"
              />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-cf-sm border border-dashed border-divider py-16 text-center">
            <ArrowLeftRight className="mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">{t("noRules")}</p>
            <p className="mt-1 text-xs text-muted-foreground/60">{t("noRulesDesc")}</p>
          </div>
        ) : (
          <div className="space-y-5">
            <section className="space-y-2">
              <div className="flex items-baseline justify-between">
                <div>
                  <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {t("builtinRulesTitle")}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground/70">{t("builtinRulesDesc")}</p>
                </div>
              </div>
              {builtinRules.length === 0 ? (
                <div className="rounded-cf-sm border border-dashed border-divider bg-surface-300/30 px-4 py-6 text-center text-xs text-muted-foreground">
                  {t("builtinRulesMissing")}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {builtinRules.map((rule) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      onEdit={openEdit}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex items-baseline justify-between">
                <div>
                  <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {t("customRulesTitle")}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground/70">{t("customRulesDesc")}</p>
                </div>
              </div>
              {customRules.length === 0 ? (
                <div className="rounded-cf-sm border border-dashed border-divider bg-surface-300/30 px-4 py-6 text-center text-xs text-muted-foreground">
                  {t("customRulesEmpty")}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {customRules.map((rule) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      onEdit={openEdit}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {rules.length > 0 && <CapabilityMatrix rules={rules} />}
      </main>

      {formOpen && (
        <RuleFormDialog open={formOpen} onClose={() => setFormOpen(false)} initial={editTarget} />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteRuleTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteRuleDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="bg-status-error text-white hover:bg-status-error/90"
            >
              {t("deleteRule")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
