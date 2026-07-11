"use client";

import { useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  FAILOVER_ERROR_TYPES,
  isKnownFailoverErrorType,
} from "@/lib/constants/failover-error-types";
import { cn } from "@/lib/utils";
import type { FailoverErrorType } from "@/types/api";

export interface FailoverErrorTypeMultiSelectProps {
  value: string[];
  onChange: (next: string[]) => void;
  getLabel: (type: FailoverErrorType) => string;
  placeholder: string;
  selectAllLabel: string;
  clearAllLabel: string;
  unknownTooltip: string;
  removeAriaLabel: string;
  className?: string;
}

export function FailoverErrorTypeMultiSelect({
  value,
  onChange,
  getLabel,
  placeholder,
  selectAllLabel,
  clearAllLabel,
  unknownTooltip,
  removeAriaLabel,
  className,
}: FailoverErrorTypeMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const knownSelected = useMemo(
    () => FAILOVER_ERROR_TYPES.filter((type) => selectedSet.has(type)),
    [selectedSet]
  );
  const unknownSelected = useMemo(
    () => value.filter((entry) => !isKnownFailoverErrorType(entry)),
    [value]
  );
  const allKnownSelected = knownSelected.length === FAILOVER_ERROR_TYPES.length;

  const toggleType = (type: FailoverErrorType, checked: boolean) => {
    if (checked) {
      if (selectedSet.has(type)) return;
      onChange([...value, type]);
    } else {
      onChange(value.filter((entry) => entry !== type));
    }
  };

  const removeEntry = (entry: string) => {
    onChange(value.filter((existing) => existing !== entry));
  };

  const selectAllKnown = () => {
    const merged = [...unknownSelected, ...FAILOVER_ERROR_TYPES];
    onChange(merged);
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-label={placeholder}
            aria-expanded={open}
            className="h-auto min-h-11 w-full justify-between gap-2 px-3 py-2 text-left font-normal"
          >
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {value.length === 0 ? (
                <span className="text-sm text-muted-foreground">{placeholder}</span>
              ) : (
                <>
                  {knownSelected.map((type) => (
                    <Badge
                      key={type}
                      variant="secondary"
                      className="gap-1 px-1.5 py-0.5 text-[11px]"
                    >
                      {getLabel(type)}
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={removeAriaLabel}
                        className="inline-flex cursor-pointer items-center rounded-full hover:text-status-error focus:outline-none"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          removeEntry(type);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            removeEntry(type);
                          }
                        }}
                      >
                        <X className="h-3 w-3" />
                      </span>
                    </Badge>
                  ))}
                  {unknownSelected.map((entry) => (
                    <Badge
                      key={`unknown-${entry}`}
                      variant="error"
                      title={unknownTooltip}
                      className="gap-1 px-1.5 py-0.5 text-[11px]"
                    >
                      {entry}
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={removeAriaLabel}
                        className="inline-flex cursor-pointer items-center rounded-full hover:text-status-error focus:outline-none"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          removeEntry(entry);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            removeEntry(entry);
                          }
                        }}
                      >
                        <X className="h-3 w-3" />
                      </span>
                    </Badge>
                  ))}
                </>
              )}
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(360px,calc(100vw-2rem))] p-0">
          <div className="flex items-center justify-between border-b border-amber-500/40 px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={allKnownSelected ? clearAll : selectAllKnown}
            >
              {allKnownSelected ? clearAllLabel : selectAllLabel}
            </Button>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {FAILOVER_ERROR_TYPES.map((type) => {
              const checked = selectedSet.has(type);
              const inputId = `failover-error-type-${type}`;
              return (
                <label
                  key={type}
                  htmlFor={inputId}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-amber-500/10"
                >
                  <Checkbox
                    id={inputId}
                    checked={checked}
                    onCheckedChange={(next) => toggleType(type, next === true)}
                  />
                  <span className="flex flex-col">
                    <span className="text-foreground">{getLabel(type)}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{type}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
