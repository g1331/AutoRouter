"use client";

import { useState, KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface TagInputProps {
  placeholder?: string;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
}

export function TagInput({ placeholder, tags, onTagsChange }: TagInputProps) {
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && inputValue === "" && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  const addTag = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onTagsChange([...tags, trimmed]);
      setInputValue("");
    }
  };

  const removeTag = (index: number) => {
    const newTags = tags.filter((_, i) => i !== index);
    onTagsChange(newTags);
  };

  return (
    <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-background min-h-[40px]">
      {tags.map((tag, index) => (
        <Badge key={index} variant="secondary" className="gap-1">
          {tag}
          <button
            type="button"
            onClick={() => removeTag(index)}
            className="ml-1 hover:text-destructive focus:outline-none"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Input
        type="text"
        placeholder={tags.length === 0 ? placeholder : undefined}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addTag}
        className="flex-1 min-w-[120px] border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-1 h-7"
      />
    </div>
  );
}
