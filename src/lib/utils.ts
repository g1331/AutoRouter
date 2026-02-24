import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const VISUAL_STYLE_CHECKLIST = [
  "Large containers should use neutral surfaces (bg-surface-* / bg-background).",
  "Do not use high-saturation blue/purple solids for page-scale backgrounds.",
  "Do not use flashy blue/purple gradients (from/via/to for blue, indigo, violet, purple).",
  "Use accent color on CTA, status, and focus feedback only.",
] as const;

const FORBIDDEN_BLUE_PURPLE_STYLE_PATTERNS = [
  /\bbg-(?:blue|indigo|violet|purple)-(?:[4-9]00|950)\b/,
  /\b(?:from|via|to)-(?:blue|indigo|violet|purple)-(?:[3-9]00|950)\b/,
  /\b(?:bg|from|via|to)-\[[^\]]*(?:#(?:3b82f6|6366f1|8b5cf6|a855f7)|rgb\([^\)]*(?:59,130,246|99,102,241|139,92,246|168,85,247))[^\]]*\]\b/i,
];

export function warnIfForbiddenVisualStyle(componentName: string, className?: string): void {
  if (process.env.NODE_ENV === "production" || !className) {
    return;
  }

  const matched = FORBIDDEN_BLUE_PURPLE_STYLE_PATTERNS.some((pattern) => pattern.test(className));
  if (!matched) {
    return;
  }

  console.warn(
    `[visual-checklist] ${componentName} received className with potential blue/purple large-area style: "${className}".`,
    VISUAL_STYLE_CHECKLIST
  );
}
