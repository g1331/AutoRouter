"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface KeyValueInputProps {
  placeholder?: string;
  entries: Record<string, string>;
  onEntriesChange: (entries: Record<string, string>) => void;
  keyLabel?: string;
  valueLabel?: string;
}

export function KeyValueInput({
  placeholder,
  entries,
  onEntriesChange,
  keyLabel = "Key",
  valueLabel = "Value",
}: KeyValueInputProps) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const addEntry = () => {
    const trimmedKey = newKey.trim();
    const trimmedValue = newValue.trim();
    if (trimmedKey && trimmedValue) {
      onEntriesChange({
        ...entries,
        [trimmedKey]: trimmedValue,
      });
      setNewKey("");
      setNewValue("");
    }
  };

  const removeEntry = (key: string) => {
    const { [key]: _removed, ...rest } = entries;
    void _removed;
    onEntriesChange(rest);
  };

  const entryList = Object.entries(entries);

  return (
    <div className="space-y-3">
      {/* Existing entries */}
      {entryList.length > 0 && (
        <div className="space-y-2">
          {entryList.map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 border rounded-md bg-muted/50 text-sm">{key}</div>
              <div className="text-muted-foreground">→</div>
              <div className="flex-1 px-3 py-2 border rounded-md bg-muted/50 text-sm">{value}</div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeEntry(key)}
                className="h-8 w-8 shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add new entry */}
      <div className="flex items-center gap-2">
        <Input
          placeholder={keyLabel}
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              document.getElementById("kv-value-input")?.focus();
            }
          }}
          className="flex-1"
        />
        <div className="text-muted-foreground">→</div>
        <Input
          id="kv-value-input"
          placeholder={valueLabel}
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addEntry();
            }
          }}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={addEntry}
          disabled={!newKey.trim() || !newValue.trim()}
          className="h-10 w-10 shrink-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {placeholder && entryList.length === 0 && (
        <p className="text-sm text-muted-foreground">{placeholder}</p>
      )}
    </div>
  );
}
