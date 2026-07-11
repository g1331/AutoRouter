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
import type { useResetBillingManualOverrides } from "@/hooks/use-billing";
import type { BillingManualOverride } from "@/types/api";

import type { BillingTranslate } from "./billing-format";

export function OverrideResetDialog({
  resetDialogTargets,
  closeResetDialog,
  canMorph,
  manualOverrideMap,
  resetOverrides,
  onConfirmReset,
  t,
  tCommon,
}: {
  resetDialogTargets: string[] | null;
  closeResetDialog: () => void;
  canMorph: boolean;
  manualOverrideMap: Map<string, BillingManualOverride>;
  resetOverrides: ReturnType<typeof useResetBillingManualOverrides>;
  onConfirmReset: () => void;
  t: BillingTranslate;
  tCommon: (key: string) => string;
}) {
  return (
    <AlertDialog open={!!resetDialogTargets} onOpenChange={(v) => !v && closeResetDialog()}>
      <AlertDialogContent morph={canMorph} morphName="morph-billing-override-reset">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("priceCatalogResetDialogTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("priceCatalogResetDialogDesc", { count: resetDialogTargets?.length ?? 0 })}
            {(() => {
              const targets = resetDialogTargets ?? [];
              const missingOfficialCount = targets.filter(
                (model) => manualOverrideMap.get(model)?.has_official_price === false
              ).length;
              if (missingOfficialCount === 0) {
                return null;
              }
              return (
                <span className="mt-2 block text-status-warning">
                  {t("priceCatalogResetDialogWarningNoOfficial", {
                    count: missingOfficialCount,
                  })}
                </span>
              );
            })()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={resetOverrides.isPending}>
            {tCommon("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void onConfirmReset()}
            disabled={resetOverrides.isPending}
          >
            {resetOverrides.isPending ? tCommon("loading") : t("priceCatalogResetConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
