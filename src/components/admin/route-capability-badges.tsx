"use client";

import { Check, CircleHelp } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
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

const OPENAI_BLOSSOM_PATH =
  "M249.176 323.434V298.276C249.176 296.158 249.971 294.569 251.825 293.509L302.406 264.381C309.29 260.409 317.5 258.555 325.973 258.555C357.75 258.555 377.877 283.185 377.877 309.399C377.877 311.253 377.877 313.371 377.611 315.49L325.178 284.771C322.001 282.919 318.822 282.919 315.645 284.771L249.176 323.434ZM367.283 421.415V361.301C367.283 357.592 365.694 354.945 362.516 353.092L296.048 314.43L317.763 301.982C319.617 300.925 321.206 300.925 323.058 301.982L373.639 331.112C388.205 339.586 398.003 357.592 398.003 375.069C398.003 395.195 386.087 413.733 367.283 421.412V421.415ZM233.553 368.452L211.838 355.742C209.986 354.684 209.19 353.095 209.19 350.975V292.718C209.19 264.383 230.905 242.932 260.301 242.932C271.423 242.932 281.748 246.641 290.49 253.26L238.321 283.449C235.146 285.303 233.555 287.951 233.555 291.659V368.455L233.553 368.452ZM280.292 395.462L249.176 377.985V340.913L280.292 323.436L311.407 340.913V377.985L280.292 395.462ZM300.286 475.968C289.163 475.968 278.837 472.259 270.097 465.64L322.264 435.449C325.441 433.597 327.03 430.949 327.03 427.239V350.445L349.011 363.155C350.865 364.213 351.66 365.802 351.66 367.922V426.179C351.66 454.514 329.679 475.965 300.286 475.965V475.968ZM237.525 416.915L186.944 387.785C172.378 379.31 162.582 361.305 162.582 343.827C162.582 323.436 174.763 305.164 193.563 297.485V357.861C193.563 361.571 195.154 364.217 198.33 366.071L264.535 404.467L242.82 416.915C240.967 417.972 239.377 417.972 237.525 416.915ZM234.614 460.343C204.689 460.343 182.71 437.833 182.71 410.028C182.71 407.91 182.976 405.792 183.238 403.672L235.405 433.863C238.582 435.715 241.763 435.715 244.938 433.863L311.407 395.466V420.622C311.407 422.742 310.612 424.331 308.758 425.389L258.179 454.519C251.293 458.491 243.083 460.343 234.611 460.343H234.614ZM300.286 491.854C332.329 491.854 359.073 469.082 365.167 438.892C394.825 431.211 413.892 403.406 413.892 375.073C413.892 356.535 405.948 338.529 391.648 325.552C392.972 319.991 393.766 314.43 393.766 308.87C393.766 271.003 363.048 242.666 327.562 242.666C320.413 242.666 313.528 243.723 306.644 246.109C294.725 234.457 278.307 227.042 260.301 227.042C228.258 227.042 201.513 249.815 195.42 280.004C165.761 287.685 146.694 315.49 146.694 343.824C146.694 362.362 154.638 380.368 168.938 393.344C167.613 398.906 166.819 404.467 166.819 410.027C166.819 447.894 197.538 476.231 233.024 476.231C240.172 476.231 247.058 475.173 253.943 472.788C265.859 484.441 282.278 491.854 300.286 491.854Z";

function OpenAILogo({ className }: BrandIconProps) {
  return (
    <svg
      viewBox="146 227 267 265"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="OpenAI"
      className={className}
    >
      <path d={OPENAI_BLOSSOM_PATH} />
    </svg>
  );
}

function AnthropicLogo({ className }: BrandIconProps) {
  return (
    <svg
      viewBox="0 0 92 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Anthropic"
      className={className}
    >
      <path d="M66.4915 0H52.5029L78.0115 64H92.0001L66.4915 0Z" fill="currentColor" />
      <path
        d="M26.08 0L0.571472 64H14.8343L20.0512 50.56H46.7374L51.9543 64H66.2172L40.7086 0H26.08ZM24.6647 38.6743L33.3943 16.1829L42.1239 38.6743H24.6647Z"
        fill="currentColor"
      />
    </svg>
  );
}

function GeminiLogo({ className }: BrandIconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="https://www.gstatic.com/marketing-cms/assets/images/7e/a4/253561a944f4a8f5e6dec4f5f26f/gemini.webp=s48-fcrop64=1,00000000ffffffff-rw"
      aria-label="Gemini"
      alt="Gemini"
      className={className}
      loading="lazy"
      decoding="async"
    />
  );
}

function CodexCliLogo({ className }: BrandIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Codex CLI"
      className={className}
    >
      <rect
        x="2.25"
        y="3.25"
        width="19.5"
        height="17.5"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M7 9.25 9.75 12 7 14.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11.5 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <g transform="translate(13.25 4.65) scale(0.0225)">
        <path d={OPENAI_BLOSSOM_PATH} fill="currentColor" />
      </g>
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
  messages_square: {
    render: (className) => <AnthropicLogo className={className} />,
    iconColorClass: "text-[#141413] dark:text-[#FAF9F5]",
    iconContainerClass: "border-divider bg-surface-300",
  },
  terminal: {
    render: (className) => <CodexCliLogo className={className} />,
    iconColorClass: "text-foreground",
    iconContainerClass: "border-divider bg-surface-300",
  },
  message_circle: {
    render: (className) => <OpenAILogo className={className} />,
    iconColorClass: "text-foreground",
    iconContainerClass: "border-divider bg-surface-300",
  },
  blocks: {
    render: (className) => <OpenAILogo className={className} />,
    iconColorClass: "text-foreground",
    iconContainerClass: "border-divider bg-surface-300",
  },
  sparkles: {
    render: (className) => <GeminiLogo className={className} />,
    iconColorClass: "",
    iconContainerClass: "border-divider bg-surface-300",
  },
  wrench: {
    render: (className) => <GeminiLogo className={className} />,
    iconColorClass: "",
    iconContainerClass: "border-divider bg-surface-300",
  },
  circle_help: {
    render: (className) => <CircleHelp className={className} />,
    iconColorClass: "text-muted-foreground",
    iconContainerClass: "border-divider bg-surface-300",
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
    <Badge variant="neutral" className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded-cf-sm border",
          iconMeta.iconContainerClass
        )}
      >
        {iconMeta.render(cn("h-3.5 w-3.5", iconMeta.iconColorClass))}
      </span>
      <span>{label}</span>
    </Badge>
  );
}

interface RouteCapabilityBadgesProps {
  capabilities: readonly string[] | null | undefined;
  className?: string;
}

export function RouteCapabilityBadges({ capabilities, className }: RouteCapabilityBadgesProps) {
  if (!capabilities || capabilities.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {capabilities.map((capability) => (
        <RouteCapabilityBadge key={capability} capability={capability} />
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
              <span className="ml-auto inline-flex shrink-0 items-center rounded-cf-sm border border-divider px-1.5 py-0.5 text-[10px] text-muted-foreground max-sm:ml-0 max-sm:mt-1">
                {t("select")}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
