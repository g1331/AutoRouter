"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { KeyRound, Plug, Radio, Waves } from "lucide-react";

import { cn } from "@/lib/utils";
import { IconBox } from "@/components/ui/icon-box";
import { StatusLed } from "@/components/ui/status-led";

import styles from "./landing.module.css";
import { CopyButton } from "./copy-button";
import { Reveal } from "./effects/reveal";
import { SpotlightCard } from "./effects/spotlight-card";
import { useRevealState } from "./effects/use-reveal-state";

/** 服务端渲染时还不知道访问域名，先用占位符，水合后换成实际 origin。 */
export const GATEWAY_ORIGIN_PLACEHOLDER = "https://<your-gateway>";

export type SnippetId = "curl" | "python" | "node" | "claude";

/** 由站点 origin 推出代理 Base URL 与各客户端示例；所有 SDK 共用 `/api/proxy/v1`。 */
export function buildGatewayEndpoints(origin: string) {
  const baseUrl = `${origin.replace(/\/+$/, "")}/api/proxy/v1`;
  const snippets: Record<SnippetId, string> = {
    curl: [
      `curl ${baseUrl}/chat/completions \\`,
      `  -H "Authorization: Bearer sk-auto-..." \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{`,
      `    "model": "gpt-4o",`,
      `    "messages": [{ "role": "user", "content": "Hello" }],`,
      `    "stream": true`,
      `  }'`,
    ].join("\n"),
    python: [
      `from openai import OpenAI`,
      ``,
      `client = OpenAI(`,
      `    base_url="${baseUrl}",`,
      `    api_key="sk-auto-...",`,
      `)`,
      ``,
      `reply = client.chat.completions.create(`,
      `    model="gpt-4o",`,
      `    messages=[{"role": "user", "content": "Hello"}],`,
      `)`,
    ].join("\n"),
    node: [
      `import OpenAI from "openai";`,
      ``,
      `const client = new OpenAI({`,
      `  baseURL: "${baseUrl}",`,
      `  apiKey: "sk-auto-...",`,
      `});`,
      ``,
      `const reply = await client.chat.completions.create({`,
      `  model: "gpt-4o",`,
      `  messages: [{ role: "user", content: "Hello" }],`,
      `});`,
    ].join("\n"),
    claude: [
      `export ANTHROPIC_BASE_URL=${baseUrl}`,
      `export ANTHROPIC_API_KEY=sk-auto-...`,
      ``,
      `claude "hello"`,
    ].join("\n"),
  };
  return { baseUrl, snippets };
}

const TABS: { id: SnippetId; label: string }[] = [
  { id: "curl", label: "cURL" },
  { id: "python", label: "Python" },
  { id: "node", label: "Node.js" },
  { id: "claude", label: "Claude Code" },
];

const KEYWORDS =
  /\b(from|import|const|await|new|export|curl|claude|def|return)\b|(--?[a-zA-Z]+)(?=\s)/g;

/** 极简着色：字符串、注释、关键字三类，足以让示例有层次又不引入高亮库。 */
function highlight(line: string): ReactNode {
  if (/^\s*(#|\/\/)/.test(line)) {
    return <span className="text-muted-foreground">{line}</span>;
  }
  const parts: ReactNode[] = [];
  const pattern = /("[^"]*"|'[^']*')/g;
  let cursor = 0;
  let key = 0;
  const pushPlain = (text: string) => {
    let last = 0;
    text.replace(KEYWORDS, (match, _keyword, _flag, offset: number) => {
      if (offset > last) parts.push(text.slice(last, offset));
      parts.push(
        <span key={key++} className="text-status-info">
          {match}
        </span>
      );
      last = offset + match.length;
      return match;
    });
    if (last < text.length) parts.push(text.slice(last));
  };
  for (const match of line.matchAll(pattern)) {
    pushPlain(line.slice(cursor, match.index));
    parts.push(
      <span key={key++} className="text-amber-600 dark:text-amber-300">
        {match[0]}
      </span>
    );
    cursor = (match.index ?? 0) + match[0].length;
  }
  pushPlain(line.slice(cursor));
  return parts;
}

function subscribeToNothing() {
  return () => undefined;
}

const POINTS = [
  { key: "protocols", icon: Plug, tone: "amber" },
  { key: "streaming", icon: Waves, tone: "info" },
  { key: "keys", icon: KeyRound, tone: "success" },
] as const;

/** 接入区：本实例的真实 Base URL，以及几种常见客户端的接入示例。 */
export function ConnectSection() {
  const t = useTranslations("landing.connect");
  const origin = useSyncExternalStore(
    subscribeToNothing,
    () => window.location.origin,
    () => GATEWAY_ORIGIN_PLACEHOLDER
  );
  const { baseUrl, snippets } = buildGatewayEndpoints(origin);

  const [tab, setTab] = useState<SnippetId>("curl");
  const tabRefs = useRef<Partial<Record<SnippetId, HTMLButtonElement | null>>>({});
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const codeRef = useRef<HTMLDivElement>(null);
  const codeReveal = useRevealState(codeRef, { threshold: 0.3, rootMargin: "0px" });
  const [typedTab, setTypedTab] = useState<SnippetId | null>(null);

  // 胶囊指示器跟随选中标签滑动。
  useLayoutEffect(() => {
    const element = tabRefs.current[tab];
    const indicator = indicatorRef.current;
    if (!element || !indicator) return;
    indicator.style.width = `${element.offsetWidth}px`;
    indicator.style.transform = `translateX(${element.offsetLeft}px)`;
    indicator.style.opacity = "1";
  }, [tab]);

  // 进入视口后逐行打出；切换标签时 typedTab 落后于 tab，新行先处于待打出状态再播放。
  useEffect(() => {
    if (codeReveal !== "shown") return;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setTypedTab(tab)));
    return () => cancelAnimationFrame(frame);
  }, [codeReveal, tab]);

  const code = snippets[tab];

  return (
    <section id="connect" aria-labelledby="landing-connect-title" className="scroll-mt-24">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12 lg:px-8">
        <Reveal className="flex min-w-0 flex-col">
          <p className="type-label flex items-center gap-2 text-amber-600 dark:text-amber-500">
            <Radio className="h-3.5 w-3.5" aria-hidden="true" />
            {t("label")}
          </p>
          <h2
            id="landing-connect-title"
            className="mt-3 font-display text-3xl font-semibold leading-tight tracking-[-0.015em] text-foreground sm:text-4xl"
          >
            {t("title")}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{t("description")}</p>

          <SpotlightCard className="mt-7 rounded-cf-md border border-border/70 bg-surface-200/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="type-label-small flex items-center gap-2 text-muted-foreground">
                <StatusLed tone="ok" pulse />
                {t("baseUrl")}
              </span>
              <CopyButton value={baseUrl} target={t("baseUrl")} className="-my-1 -mr-1.5" />
            </div>
            <p
              className="mt-2 break-all font-mono text-[15px] text-foreground"
              data-testid="gateway-base-url"
            >
              {baseUrl}
            </p>
            <p className="type-caption mt-1.5 text-muted-foreground">{t("baseUrlHint")}</p>
          </SpotlightCard>

          <ul className="mt-6 flex flex-col gap-4">
            {POINTS.map(({ key, icon: Icon, tone }) => (
              <li key={key} className="flex gap-3">
                <IconBox size="sm" tone={tone}>
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </IconBox>
                <div className="min-w-0">
                  <p className="type-title-small text-foreground">{t(`points.${key}.title`)}</p>
                  <p className="type-body-small mt-0.5 text-muted-foreground">
                    {t(`points.${key}.desc`)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={120} className="min-w-0">
          <div
            ref={codeRef}
            className="overflow-hidden rounded-cf-md border border-border/70 bg-surface-200/90 shadow-[0_30px_80px_-40px_color-mix(in_srgb,var(--vr-accent-500)_40%,transparent),var(--vr-shadow-md)]"
          >
            <div className="flex items-center justify-between gap-2 border-b border-divider px-2 py-2">
              <div
                role="tablist"
                aria-label={t("example")}
                className="relative flex min-w-0 overflow-x-auto"
              >
                <span
                  ref={indicatorRef}
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 rounded-cf-md bg-surface-400 opacity-0 transition-[transform,width,opacity] duration-500 ease-cf-standard"
                />
                {TABS.map(({ id, label }) => (
                  <button
                    key={id}
                    ref={(element) => {
                      tabRefs.current[id] = element;
                    }}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={cn(
                      "relative z-10 whitespace-nowrap rounded-cf-md px-3 py-1.5 font-mono text-xs transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <CopyButton value={code} target={t("example")} className="shrink-0" />
            </div>

            <div className="relative grid grid-cols-[auto_minmax(0,1fr)] overflow-x-auto py-4 font-mono text-[12.5px] leading-[1.75]">
              <div
                aria-hidden="true"
                className="select-none border-r border-divider pl-4 pr-3 text-right text-muted-foreground/50"
              >
                {code.split("\n").map((_, index) => (
                  <span key={index} className="block">
                    {index + 1}
                  </span>
                ))}
              </div>
              <pre
                tabIndex={0}
                role="tabpanel"
                aria-label={TABS.find((item) => item.id === tab)?.label}
                data-typing={
                  codeReveal === "idle" ? undefined : typedTab === tab ? "done" : "pending"
                }
                className="min-w-0 px-4 text-foreground focus-visible:outline-none"
              >
                <code>
                  {code.split("\n").map((line, index) => (
                    <span
                      key={`${tab}-${index}`}
                      className={styles.codeLine}
                      style={{ "--i": index } as CSSProperties}
                    >
                      {line ? highlight(line) : " "}
                    </span>
                  ))}
                </code>
              </pre>
            </div>
            <p className="type-caption flex items-center gap-2 border-t border-divider px-4 py-2.5 text-muted-foreground">
              <span className={cn(styles.blink, "h-3 w-1.5 bg-amber-500")} aria-hidden="true" />
              {t("exampleNote")}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
