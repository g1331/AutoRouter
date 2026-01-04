"use client";

import dynamic from "next/dynamic";

const VibeKanbanWebCompanion = dynamic(
  () => import("vibe-kanban-web-companion").then((mod) => mod.VibeKanbanWebCompanion),
  { ssr: false }
);

/**
 * Vibe Kanban Provider
 * Renders the VibeKanbanWebCompanion only in development mode
 */
export function VibeKanbanProvider() {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return <VibeKanbanWebCompanion />;
}
