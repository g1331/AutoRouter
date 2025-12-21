"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Topbar } from "@/components/admin/topbar";
import { LogsTable } from "@/components/admin/logs-table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { useRequestLogs } from "@/hooks/use-request-logs";

/**
 * Cassette Futurism Request Logs Page
 *
 * Terminal-style log viewer with:
 * - Amber text on dark background
 * - Glowing borders and indicators
 * - Mono font for data display
 */
export default function LogsPage() {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const t = useTranslations("logs");
  const tCommon = useTranslations("common");

  const { data, isLoading } = useRequestLogs(page, pageSize);

  return (
    <>
      <Topbar title={t("pageTitle")} />
      <div className="p-6 lg:p-8 space-y-6 bg-surface-100 min-h-screen">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ScrollText className="w-5 h-5 text-amber-500" aria-hidden="true" />
              <h3 className="font-mono text-lg font-medium tracking-wide text-amber-500 cf-glow-text">
                {t("management")}
              </h3>
            </div>
            <p className="font-sans text-sm text-amber-700">{t("managementDesc")}</p>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-2 border-amber-700 border-t-amber-500 rounded-full animate-spin" />
              <p className="font-mono text-sm text-amber-700">{tCommon("loading")}</p>
            </div>
          </div>
        ) : (
          <>
            <LogsTable logs={data?.items || []} />

            {/* Pagination */}
            {data && data.total_pages > 1 && (
              <div className="flex items-center justify-between bg-surface-200 rounded-cf-sm px-6 py-4 border border-divider">
                <div className="font-mono text-sm text-amber-700">
                  {tCommon("items")}{" "}
                  <span className="text-amber-500 font-display">{data.total}</span> ,{" "}
                  {tCommon("page")} <span className="text-amber-500">{data.page}</span>{" "}
                  {tCommon("of")} <span className="text-amber-500">{data.total_pages}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    {tCommon("previous")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page === data.total_pages}
                    className="gap-1"
                  >
                    {tCommon("next")}
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
