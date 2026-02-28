"use client";

interface TopbarProps {
  title: string;
}

export function Topbar({ title }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 hidden w-full border-b border-divider bg-surface-200/88 backdrop-blur md:block">
      <div className="flex h-14 items-center justify-between px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="hidden text-xs tracking-[0.08em] text-muted-foreground sm:inline">
            {">>"}
          </span>
          <h1 className="type-title-medium tracking-[0.08em] text-foreground">
            {title.toUpperCase()}
          </h1>
        </div>
      </div>
    </header>
  );
}
