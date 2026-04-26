"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PaginationControlsProps {
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  actionPrefix?: ReactNode;
  className?: string;
}

function clampPage(value: number, totalPages: number) {
  return Math.min(Math.max(Math.trunc(value), 1), totalPages);
}

export function PaginationControls({
  total,
  page,
  totalPages,
  onPageChange,
  actionPrefix,
  className,
}: PaginationControlsProps) {
  const tCommon = useTranslations("common");
  const currentPage = clampPage(page, totalPages);
  const [pageDraft, setPageDraft] = useState(String(currentPage));

  useEffect(() => {
    setPageDraft(String(currentPage));
  }, [currentPage]);

  const parsedDraft = Number(pageDraft);
  const canSubmit = Number.isFinite(parsedDraft) && pageDraft.trim() !== "";
  const normalizedDraftPage = canSubmit ? clampPage(parsedDraft, totalPages) : currentPage;

  const changePage = (nextPage: number) => {
    const normalizedPage = clampPage(nextPage, totalPages);
    setPageDraft(String(normalizedPage));
    if (normalizedPage !== page) {
      onPageChange(normalizedPage);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      setPageDraft(String(currentPage));
      return;
    }
    changePage(normalizedDraftPage);
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="type-body-small text-muted-foreground">
        {tCommon("items")} <span className="font-semibold text-foreground">{total}</span> ·{" "}
        {tCommon("page")} <span className="font-semibold text-foreground">{currentPage}</span>{" "}
        {tCommon("of")} <span className="font-semibold text-foreground">{totalPages}</span>
      </div>

      <form
        className="flex flex-wrap items-center gap-2 sm:justify-end"
        onSubmit={handleSubmit}
        noValidate
      >
        {actionPrefix}

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{tCommon("jumpToPage")}</span>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={totalPages}
            value={pageDraft}
            onChange={(event) => setPageDraft(event.target.value)}
            onBlur={() => {
              if (!canSubmit) {
                setPageDraft(String(currentPage));
              }
            }}
            className="h-9 w-20 px-2 text-center"
            aria-label={tCommon("jumpToPageAria")}
          />
          {tCommon("pageSuffix") && (
            <span className="text-xs text-muted-foreground">{tCommon("pageSuffix")}</span>
          )}
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={!canSubmit || normalizedDraftPage === currentPage}
          >
            {tCommon("goToPage")}
          </Button>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => changePage(currentPage - 1)}
          disabled={currentPage === 1}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {tCommon("previousPage")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => changePage(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="gap-1"
        >
          {tCommon("nextPage")}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}
