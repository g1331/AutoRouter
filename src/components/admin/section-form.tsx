"use client";

import type { FormEventHandler, ReactNode } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface SectionFormProps {
  title: string;
  description?: string;
  /** Whether the form has unsaved edits — drives the badge and enables Save/Reset. */
  isDirty: boolean;
  /** Whether a save is in flight — disables both actions and shows the pending label. */
  isSaving: boolean;
  /** Submit handler; wire the consumer's `handleSubmit(onValid)` here. */
  onSave: FormEventHandler<HTMLFormElement>;
  onReset: () => void;
  children: ReactNode;
}

/**
 * Section shell for detail-page forms: title + optional description, a "dirty"
 * badge, and a Save/Reset footer. Presentation-only — the consumer owns the
 * react-hook-form instance and passes its dirty/submitting state and handlers.
 */
export function SectionForm({
  title,
  description,
  isDirty,
  isSaving,
  onSave,
  onReset,
  children,
}: SectionFormProps) {
  const t = useTranslations("common");
  const disabled = !isDirty || isSaving;

  return (
    <Card variant="outlined" className="border-divider bg-surface-200/70">
      <form onSubmit={onSave}>
        <div className="flex items-start justify-between gap-3 border-b border-divider px-5 py-3.5">
          <div className="space-y-1">
            <h3 className="type-label-medium text-foreground">{title}</h3>
            {description && <p className="type-body-small text-muted-foreground">{description}</p>}
          </div>
          {isDirty && (
            <Badge variant="warning" className="shrink-0 gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
              {t("unsavedChanges")}
            </Badge>
          )}
        </div>

        <CardContent className="space-y-4 p-5">{children}</CardContent>

        <div className="flex items-center justify-end gap-2 border-t border-divider px-5 py-3.5">
          <Button type="button" variant="outline" size="sm" onClick={onReset} disabled={disabled}>
            {t("reset")}
          </Button>
          <Button type="submit" size="sm" disabled={disabled}>
            {isSaving ? t("saving") : t("save")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
