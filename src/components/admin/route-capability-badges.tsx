"use client";

import { Check, CircleHelp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ROUTE_CAPABILITY_DEFINITIONS,
  type RouteCapability,
  type RouteCapabilityDefinition,
} from "@/lib/route-capabilities";

interface BrandIconProps {
  className?: string;
}

// 品牌图形一律取各家官方标志（来源 simple-icons），viewBox 统一 0 0 24 24。
// 之前的自绘版本（裁切过的 OpenAI 花瓣、Anthropic 的 "A\" 字标、指向 gstatic 的
// 远程 Gemini 图片）要么变形，要么外网不可达时渲染成空方块。

function OpenAILogo({ className }: BrandIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="OpenAI"
      className={className}
    >
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  );
}

// Claude 官方星芒，取代此前的 "A\" 字标
function AnthropicLogo({ className }: BrandIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Claude"
      className={className}
    >
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  );
}

const GEMINI_STAR_PATH =
  "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81";

// Google Gemini 官方四角星，用品牌蓝→紫→红渐变。
// 渐变 id 必须逐实例唯一：一个页面上会同时出现多个 Gemini 徽标（sparkles / wrench，
// 且上游列表里每行都有一份），写死 id 会在文档里造出重复 id。
function GeminiLogo({ className }: BrandIconProps) {
  // useId 的取值带 «» / : 等分隔符，剥掉后再拼进 url(#…)，避免落进 CSS 选择器时报错。
  const gradientId = `gemini-brand-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Gemini"
      className={className}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="0"
          x2="24"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#4285F4" />
          <stop offset="0.52" stopColor="#9B72CB" />
          <stop offset="1" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path d={GEMINI_STAR_PATH} fill={`url(#${gradientId})`} />
    </svg>
  );
}

interface RouteCapabilityIconMeta {
  render: (className?: string) => ReactNode;
  iconColorClass: string;
  iconContainerClass: string;
}

export const ROUTE_CAPABILITY_ICON_META: Record<
  RouteCapabilityDefinition["iconKey"],
  RouteCapabilityIconMeta
> = {
  // 一律用各厂家的官方品牌色，同厂家的不同接口共用同一个标志与颜色——
  // 接口之间的区分交给文字标签，图标只负责「这是哪家」。
  // iconContainerClass 保持透明 = 不套外框，图标直接落在底色上。

  // Anthropic Messages / Claude Code Messages — Claude 品牌陶土橙
  messages_square: {
    render: (className) => <AnthropicLogo className={className} />,
    iconColorClass: "text-[#D97757]",
    iconContainerClass: "border-transparent bg-transparent",
  },
  terminal_anthropic: {
    render: (className) => <AnthropicLogo className={className} />,
    iconColorClass: "text-[#D97757]",
    iconContainerClass: "border-transparent bg-transparent",
  },
  // OpenAI 系（Responses / Chat Compatible / Codex CLI / Extended）——
  // 官方单色标志：深色底走白、浅色底走黑
  message_circle: {
    render: (className) => <OpenAILogo className={className} />,
    iconColorClass: "text-[#0D0D0D] dark:text-[#FFFFFF]",
    iconContainerClass: "border-transparent bg-transparent",
  },
  terminal: {
    render: (className) => <OpenAILogo className={className} />,
    iconColorClass: "text-[#0D0D0D] dark:text-[#FFFFFF]",
    iconContainerClass: "border-transparent bg-transparent",
  },
  blocks: {
    render: (className) => <OpenAILogo className={className} />,
    iconColorClass: "text-[#0D0D0D] dark:text-[#FFFFFF]",
    iconContainerClass: "border-transparent bg-transparent",
  },
  // Gemini 系 — 品牌蓝→紫→红渐变
  sparkles: {
    render: (className) => <GeminiLogo className={className} />,
    iconColorClass: "",
    iconContainerClass: "border-transparent bg-transparent",
  },
  wrench: {
    render: (className) => <GeminiLogo className={className} />,
    iconColorClass: "",
    iconContainerClass: "border-transparent bg-transparent",
  },
  circle_help: {
    render: (className) => <CircleHelp className={className} />,
    iconColorClass: "text-muted-foreground",
    iconContainerClass: "border-transparent bg-transparent",
  },
};

function getDefinition(capability: string): RouteCapabilityDefinition | null {
  return ROUTE_CAPABILITY_DEFINITIONS.find((item) => item.value === capability) ?? null;
}

function getIconMeta(iconKey: RouteCapabilityDefinition["iconKey"] | null) {
  if (!iconKey) {
    return ROUTE_CAPABILITY_ICON_META.circle_help;
  }
  return ROUTE_CAPABILITY_ICON_META[iconKey] ?? ROUTE_CAPABILITY_ICON_META.circle_help;
}

interface RouteCapabilityBadgeProps {
  capability: string;
  className?: string;
}

export function RouteCapabilityBadge({ capability, className }: RouteCapabilityBadgeProps) {
  const t = useTranslations("upstreams");
  const definition = getDefinition(capability);
  const iconMeta = getIconMeta(definition?.iconKey ?? "circle_help");
  const label = definition ? t(definition.labelKey) : capability;

  return (
    <Badge
      variant="neutral"
      className={cn("inline-flex min-w-0 max-w-full items-center gap-1.5", className)}
      title={label}
    >
      <span
        className={cn(
          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-cf-sm border",
          iconMeta.iconContainerClass
        )}
      >
        {iconMeta.render(cn("h-3.5 w-3.5", iconMeta.iconColorClass))}
      </span>
      <span className="min-w-0 overflow-hidden text-clip whitespace-nowrap">{label}</span>
    </Badge>
  );
}

interface RouteCapabilityBadgesProps {
  capabilities: readonly string[] | null | undefined;
  className?: string;
  badgeClassName?: string;
}

export function RouteCapabilityBadges({
  capabilities,
  className,
  badgeClassName,
}: RouteCapabilityBadgesProps) {
  if (!capabilities || capabilities.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex min-w-0 max-w-full flex-wrap gap-1.5 overflow-visible", className)}>
      {capabilities.map((capability) => (
        <RouteCapabilityBadge key={capability} capability={capability} className={badgeClassName} />
      ))}
    </div>
  );
}

interface RouteCapabilityMultiSelectProps {
  selected: RouteCapability[];
  onChange: (next: RouteCapability[]) => void;
}

export function RouteCapabilityMultiSelect({
  selected,
  onChange,
}: RouteCapabilityMultiSelectProps) {
  const t = useTranslations("upstreams");

  const selectedSet = new Set(selected);

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 [&>*]:min-w-0">
      {ROUTE_CAPABILITY_DEFINITIONS.map((definition) => {
        const isSelected = selectedSet.has(definition.value);
        const iconMeta = getIconMeta(definition.iconKey);
        const description = t(definition.descriptionKey, { model: "{model}" });

        return (
          <Button
            key={definition.value}
            type="button"
            variant="outline"
            onClick={() => {
              if (isSelected) {
                onChange(selected.filter((item) => item !== definition.value));
                return;
              }
              onChange([...selected, definition.value]);
            }}
            className={cn(
              "h-auto w-full min-w-0 flex-wrap items-start justify-start gap-3 px-3 py-2.5 text-left whitespace-normal",
              isSelected && "border-status-info bg-status-info-muted"
            )}
          >
            <span
              className={cn(
                "mt-0.5 shrink-0 rounded-cf-sm border p-1",
                iconMeta.iconContainerClass
              )}
            >
              {iconMeta.render(cn("h-3.5 w-3.5", iconMeta.iconColorClass))}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
              <span className="text-xs font-medium leading-snug break-words">
                {t(definition.labelKey)}
              </span>
              <span className="text-[11px] leading-snug text-muted-foreground break-words">
                {description}
              </span>
            </span>
            {isSelected ? (
              <span className="ml-auto inline-flex shrink-0 items-center rounded-cf-sm border border-status-info bg-status-info-muted px-1.5 py-0.5 text-[10px] font-medium text-status-info max-sm:ml-0 max-sm:mt-1">
                <Check className="mr-1 h-3 w-3" />
                {t("selected")}
              </span>
            ) : (
              <span className="ml-auto inline-flex shrink-0 items-center rounded-cf-sm border border-transparent px-1.5 py-0.5 text-[10px] text-muted-foreground max-sm:ml-0 max-sm:mt-1 bg-surface-400">
                {t("select")}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
