/**
 * 状态三连 class（border + bg + text 同色组合）的收敛工具。
 *
 * 历史上各处的 alpha 档位自由漂移（border /20–/45、muted bg /10–/35），
 * 统一为两档：
 * - soft：提示块 / 徽章（border /40 + muted 底）
 * - faint：表格内低强度层（border /25 + muted/25 底）
 *
 * Tailwind 按静态字面量扫描类名，映射表必须保持完整字符串，不可模板拼接。
 */

export type StatusTone = "success" | "warning" | "error" | "info";

export type StatusToneVariant = "soft" | "faint";

const SOFT_TONES: Record<StatusTone, string> = {
  success: "border-status-success/40 bg-status-success-muted text-status-success",
  warning: "border-status-warning/40 bg-status-warning-muted text-status-warning",
  error: "border-status-error/40 bg-status-error-muted text-status-error",
  info: "border-status-info/40 bg-status-info-muted text-status-info",
};

const FAINT_TONES: Record<StatusTone, string> = {
  success: "border-status-success/25 bg-status-success-muted/25 text-status-success",
  warning: "border-status-warning/25 bg-status-warning-muted/25 text-status-warning",
  error: "border-status-error/25 bg-status-error-muted/25 text-status-error",
  info: "border-status-info/25 bg-status-info-muted/25 text-status-info",
};

export function statusTone(tone: StatusTone, variant: StatusToneVariant = "soft"): string {
  return variant === "faint" ? FAINT_TONES[tone] : SOFT_TONES[tone];
}
