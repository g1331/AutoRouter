import { cn } from "@/lib/utils";
import { StatusLed, type StatusLedTone } from "@/components/ui/status-led";
import type { CircuitBreakerState } from "@/types/api";

const stateConfig: Record<
  CircuitBreakerState,
  { tone: StatusLedTone; label: string; pulse: boolean; className: string }
> = {
  closed: {
    tone: "ok",
    label: "CLOSED",
    pulse: false,
    className: "border-status-success/45 text-status-success",
  },
  half_open: {
    tone: "warn",
    label: "HALF",
    pulse: true,
    className: "border-status-warning/45 text-status-warning",
  },
  open: {
    tone: "bad",
    label: "OPEN",
    pulse: false,
    className: "border-status-error/45 text-status-error",
  },
};

export interface StateChipProps {
  state: CircuitBreakerState;
  /** 覆盖默认状态机文案（CLOSED/HALF/OPEN 为技术术语，默认不翻译）。 */
  label?: string;
  className?: string;
}

/** 熔断状态芯片：LED + mono 大写文字 + 状态色边线，熔断页/拓扑/logs 复用。 */
export function StateChip({ state, label, className }: StateChipProps) {
  const config = stateConfig[state];
  return (
    <span
      data-state={state}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-cf-sm border bg-surface-300/60 px-2 py-0.5",
        "font-mono text-[11px] font-semibold uppercase tracking-[0.08em]",
        config.className,
        className
      )}
    >
      <StatusLed tone={config.tone} pulse={config.pulse} />
      {label ?? config.label}
    </span>
  );
}
