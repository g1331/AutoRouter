import { cn } from "@/lib/utils";

export type StatusLedTone = "ok" | "warn" | "bad" | "neutral";

const toneClasses: Record<StatusLedTone, string> = {
  ok: "bg-status-success text-status-success",
  warn: "bg-status-warning text-status-warning",
  bad: "bg-status-error text-status-error",
  neutral: "bg-muted-foreground text-muted-foreground",
};

export interface StatusLedProps {
  tone: StatusLedTone;
  /** 呼吸动画（LIVE 等持续状态）；reduced-motion 下常亮。 */
  pulse?: boolean;
  className?: string;
}

/**
 * LED 状态灯：暗色带同色辉光，亮色为纯色点。
 * 纯装饰元素（aria-hidden），语义文字由调用方提供。
 */
export function StatusLed({ tone, pulse = false, className }: StatusLedProps) {
  return (
    <span
      aria-hidden="true"
      data-tone={tone}
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        toneClasses[tone],
        "dark:shadow-[0_0_8px_color-mix(in_srgb,currentColor_65%,transparent)]",
        pulse && "animate-led-breathe motion-reduce:animate-none",
        className
      )}
    />
  );
}
