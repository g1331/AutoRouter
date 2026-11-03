import { useTranslations } from "next-intl";
import { Braces, SquareTerminal, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import styles from "./landing.module.css";

const CLIENTS: { name: string; icon: LucideIcon }[] = [
  { name: "OpenAI SDK", icon: Braces },
  { name: "Anthropic SDK", icon: Braces },
  { name: "Google GenAI SDK", icon: Braces },
  { name: "Claude Code", icon: SquareTerminal },
  { name: "Codex CLI", icon: SquareTerminal },
  { name: "Gemini CLI", icon: SquareTerminal },
  { name: "cURL", icon: SquareTerminal },
];

function Track({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul className="flex shrink-0 items-center gap-3 pr-3" aria-hidden={hidden || undefined}>
      {CLIENTS.map(({ name, icon: Icon }) => (
        <li
          key={name}
          className="flex items-center gap-2 whitespace-nowrap rounded-full border border-border/60 bg-surface-200/60 px-4 py-2 font-mono text-[13px] text-muted-foreground"
        >
          <Icon className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
          {name}
        </li>
      ))}
    </ul>
  );
}

/** 兼容客户端跑马灯：两份相同轨道首尾相接，悬停暂停。 */
export function ClientsMarquee() {
  const t = useTranslations("landing.clients");
  return (
    <section aria-label={t("label")} className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
      <p className="type-label text-center text-muted-foreground">{t("label")}</p>
      <div className={cn(styles.marquee, "mt-5 overflow-hidden")}>
        <div className={styles.marqueeTrack}>
          <Track />
          <Track hidden />
        </div>
      </div>
    </section>
  );
}
