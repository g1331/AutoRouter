import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { BackgroundSyncTasksPanel } from "@/components/admin/background-sync-tasks-panel";

const useBackgroundSyncTasksMock = vi.fn();
const runMutateMock = vi.fn();
const updateMutateMock = vi.fn();
const useRunBackgroundSyncTaskMock = vi.fn();
const useUpdateBackgroundSyncTaskMock = vi.fn();

vi.mock("next-intl", () => ({
  useLocale: () => "en-US",
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (values && "count" in values) return `${key}:${values.count}`;
    if (values && "duration" in values) return `${key}:${values.duration}`;
    return key;
  },
}));

vi.mock("@/hooks/use-background-sync", () => ({
  useBackgroundSyncTasks: () => useBackgroundSyncTasksMock(),
  useRunBackgroundSyncTask: () => useRunBackgroundSyncTaskMock(),
  useUpdateBackgroundSyncTask: () => useUpdateBackgroundSyncTaskMock(),
}));

describe("BackgroundSyncTasksPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRunBackgroundSyncTaskMock.mockReturnValue({
      mutate: runMutateMock,
      isPending: false,
    });
    useUpdateBackgroundSyncTaskMock.mockReturnValue({
      mutate: updateMutateMock,
      isPending: false,
    });
  });

  it("shows task status, schedule and failure summary", () => {
    useBackgroundSyncTasksMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        items: [
          {
            task_name: "upstream_model_catalog_sync",
            display_name: "Model catalog auto refresh",
            enabled: true,
            interval_seconds: 86400,
            startup_delay_seconds: 60,
            is_running: false,
            last_started_at: "2026-04-25T00:00:00.000Z",
            last_finished_at: "2026-04-25T00:00:01.000Z",
            last_success_at: null,
            last_failed_at: "2026-04-25T00:00:01.000Z",
            last_status: "partial",
            last_error: "OpenAI: HTTP 500",
            last_duration_ms: 1200,
            last_success_count: 2,
            last_failure_count: 1,
            next_run_at: "2026-04-26T00:00:01.000Z",
            updated_at: "2026-04-25T00:00:01.000Z",
          },
        ],
        total: 1,
      },
    });

    render(<BackgroundSyncTasksPanel />);

    expect(screen.getByText("panelTitle")).toBeInTheDocument();
    expect(screen.getAllByText("taskUpstreamModelCatalogSync").length).toBeGreaterThan(0);
    expect(screen.getAllByText("taskUpstreamModelCatalogSyncDesc").length).toBeGreaterThan(0);
    expect(screen.getAllByText("status_partial").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OpenAI: HTTP 500").length).toBeGreaterThan(0);
    expect(screen.getAllByText("successCount:2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("failureCount:1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("intervalShort").length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue("1").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/intervalDisplay_day:1/).length).toBeGreaterThan(0);
  });

  it("runs a task from the panel action", () => {
    useBackgroundSyncTasksMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        items: [
          {
            task_name: "billing_price_catalog_sync",
            display_name: "Price catalog sync",
            enabled: true,
            interval_seconds: 86400,
            startup_delay_seconds: 60,
            is_running: false,
            last_started_at: null,
            last_finished_at: null,
            last_success_at: null,
            last_failed_at: null,
            last_status: null,
            last_error: null,
            last_duration_ms: null,
            last_success_count: 0,
            last_failure_count: 0,
            next_run_at: null,
            updated_at: null,
          },
        ],
        total: 1,
      },
    });

    render(<BackgroundSyncTasksPanel />);

    fireEvent.click(screen.getAllByText("runNow")[0]);

    expect(runMutateMock).toHaveBeenCalledWith("billing_price_catalog_sync");
  });

  it("updates task scheduling config from the panel", () => {
    useBackgroundSyncTasksMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        items: [
          {
            task_name: "billing_price_catalog_sync",
            display_name: "Price catalog sync",
            enabled: true,
            interval_seconds: 86400,
            startup_delay_seconds: 60,
            is_running: false,
            last_started_at: null,
            last_finished_at: null,
            last_success_at: null,
            last_failed_at: null,
            last_status: null,
            last_error: null,
            last_duration_ms: null,
            last_success_count: 0,
            last_failure_count: 0,
            next_run_at: null,
            updated_at: null,
          },
        ],
        total: 1,
      },
    });

    render(<BackgroundSyncTasksPanel />);

    fireEvent.change(screen.getAllByDisplayValue("1")[0], {
      target: { value: "2" },
    });
    fireEvent.click(screen.getAllByLabelText("saveConfig")[0]);

    expect(updateMutateMock).toHaveBeenCalledWith({
      taskName: "billing_price_catalog_sync",
      data: { enabled: true, interval_seconds: 172800 },
    });
  });
});
