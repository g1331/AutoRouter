"use client";

import { useEffect, useRef, useState, type RefObject, type UIEvent } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import type { UpstreamModelCatalogEntry } from "@/types/api";

/**
 * Virtualized model-catalog picker shared by the upstream model-routing surface.
 * Extracted verbatim from `upstream-form-dialog.tsx` so the dialog and the
 * detail-page model-routing section render the (potentially large) catalog list
 * with the same windowing behavior.
 */

const MODEL_ROW_HEIGHT = 42;
const MODEL_LIST_OVERSCAN = 8;
const DEFAULT_MODEL_LIST_HEIGHT = 436;

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

export function VirtualCatalogEntryList({
  entries,
  selectedModels,
  onToggle,
}: {
  entries: UpstreamModelCatalogEntry[];
  selectedModels: ReadonlySet<string>;
  onToggle: (model: string, checked: boolean) => void;
}) {
  const resetKey = entries
    .map((entry) => `${entry.model}:${entry.source}`)
    .join(String.fromCharCode(0));
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
