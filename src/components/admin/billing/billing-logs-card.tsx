import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";

import type { BillingTranslate } from "./billing-format";

export function BillingLogsCard({ t }: { t: BillingTranslate }) {
  return (
    <Card variant="outlined" className="border-divider bg-surface-200/70">
      <CardContent className="space-y-3 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="type-label-medium text-foreground">{t("logsTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("logsDesc")}</p>
          </div>
          <Button asChild variant="secondary" className="w-full sm:w-auto">
            <Link href="/logs">{t("logsAction")}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
