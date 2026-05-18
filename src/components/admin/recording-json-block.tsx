"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, ChevronRight, Copy, FileJson } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function isJsonBranch(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}

export function getJsonBranchEntries(value: Record<string, unknown> | unknown[]) {
  return Array.isArray(value)
    ? value.map((entry, index) => [String(index), entry] as const)
    : Object.entries(value);
}

export function getJsonBranchSummary(value: Record<string, unknown> | unknown[]) {
  const count = getJsonBranchEntries(value).length;
  return Array.isArray(value) ? `Array(${count})` : `Object(${count})`;
}

export function collectExpandedJsonPaths(
  value: unknown,
  maxDepth: number = Number.POSITIVE_INFINITY
) {
  const paths = new Set<string>();

  const visit = (currentValue: unknown, path: string, depth: number) => {
    if (!isJsonBranch(currentValue) || depth > maxDepth) {
      return;
    }

    paths.add(path);
    for (const [key, childValue] of getJsonBranchEntries(currentValue)) {
      visit(childValue, `${path}.${key}`, depth + 1);
    }
  };

  visit(value, "$", 0);
  return paths;
}

export function JsonPrimitiveValue({ value }: { value: unknown }) {
  if (typeof value === "string") {
    return <span className="text-status-success">{JSON.stringify(value)}</span>;
  }

  if (typeof value === "number") {
    return <span className="text-amber-500">{value}</span>;
  }

  if (typeof value === "boolean") {
    return <span className="text-status-info">{String(value)}</span>;
  }

  if (value == null) {
    return <span className="text-muted-foreground">null</span>;
  }

  return <span className="text-muted-foreground">{JSON.stringify(value)}</span>;
}

export function JsonTreeNode({
  label,
  value,
  path,
  depth,
  expandedPaths,
  onToggle,
  expandLabel,
  collapseLabel,
}: {
  label: string | null;
  value: unknown;
  path: string;
  depth: number;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  expandLabel: string;
  collapseLabel: string;
}) {
  const isBranch = isJsonBranch(value);

  if (!isBranch) {
    return (
      <div className="flex min-w-0 items-start gap-1.5 py-0.5">
        <span className="w-4 shrink-0" />
        {label != null ? (
          <span className="shrink-0 text-foreground">{JSON.stringify(label)}:</span>
        ) : null}
        <JsonPrimitiveValue value={value} />
      </div>
    );
  }

  const entries = getJsonBranchEntries(value);
  const isExpanded = expandedPaths.has(path);
  const branchLabel = label ?? "root";
  const openToken = Array.isArray(value) ? "[" : "{";
  const closeToken = Array.isArray(value) ? "]" : "}";

  return (
    <div className={cn(depth > 0 && "border-l border-divider/55 pl-3")}>
      <div className="flex min-w-0 items-center gap-1.5 py-0.5">
        <button
          type="button"
          onClick={() => onToggle(path)}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-cf-sm text-muted-foreground transition-colors hover:bg-surface-400 hover:text-foreground"
          aria-label={`${isExpanded ? collapseLabel : expandLabel} ${branchLabel}`}
          aria-expanded={isExpanded}
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
        {label != null ? (
          <span className="shrink-0 text-foreground">{JSON.stringify(label)}:</span>
        ) : null}
        <span className="text-muted-foreground">{openToken}</span>
        {!isExpanded ? (
          <>
            <span className="text-muted-foreground">{getJsonBranchSummary(value)}</span>
            <span className="text-muted-foreground">{closeToken}</span>
          </>
        ) : null}
      </div>

      {isExpanded ? (
        <>
          {entries.length > 0 ? (
            <div className="ml-4">
              {entries.map(([entryLabel, entryValue]) => (
                <JsonTreeNode
                  key={`${path}.${entryLabel}`}
                  label={entryLabel}
                  value={entryValue}
                  path={`${path}.${entryLabel}`}
                  depth={depth + 1}
                  expandedPaths={expandedPaths}
                  onToggle={onToggle}
                  expandLabel={expandLabel}
                  collapseLabel={collapseLabel}
                />
              ))}
            </div>
          ) : null}
          <div className="flex min-w-0 items-center gap-1.5 py-0.5 text-muted-foreground">
            <span className="w-4 shrink-0" />
            <span>{closeToken}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function RecordingJsonBlock({ value }: { value: unknown }) {
  const tCommon = useTranslations("common");
  const jsonText = useMemo(() => JSON.stringify(value, null, 2), [value]);
  const [expandedPaths, setExpandedPaths] = useState(() => collectExpandedJsonPaths(value, 1));
  const [copied, setCopied] = useState(false);

  const handleToggle = (path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      toast.success(tCommon("copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(tCommon("error"));
    }
  };

  return (
    <div className="overflow-hidden rounded-cf-md border border-divider bg-surface-300/80">
      <div className="flex flex-col gap-2 border-b border-divider bg-surface-300/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <FileJson className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="type-caption truncate">JSON</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setExpandedPaths(collectExpandedJsonPaths(value))}
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            {tCommon("expand")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setExpandedPaths(new Set())}
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            {tCommon("collapse")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => {
              void handleCopy();
            }}
            aria-label={copied ? tCommon("copied") : tCommon("copy")}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-status-success" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copied ? tCommon("copied") : tCommon("copy")}
          </Button>
        </div>
      </div>
      <div className="h-[28rem] overflow-auto p-3 font-mono text-[11px] leading-relaxed [overflow-anchor:none] sm:h-[34rem] xl:h-[42rem]">
        <JsonTreeNode
          label={null}
          value={value}
          path="$"
          depth={0}
          expandedPaths={expandedPaths}
          onToggle={handleToggle}
          expandLabel={tCommon("expand")}
          collapseLabel={tCommon("collapse")}
        />
      </div>
    </div>
  );
}
