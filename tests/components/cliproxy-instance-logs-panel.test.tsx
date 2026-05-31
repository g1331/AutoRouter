import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const useCliproxyInstanceLogsMock = vi.fn();

vi.mock("@/hooks/use-cliproxy", () => ({
  useCliproxyInstanceLogs: (...args: unknown[]) => useCliproxyInstanceLogsMock(...args),
  CLIPROXY_LOGS_DEFAULT_LIMIT: 200,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { CliproxyInstanceLogsPanel } from "@/components/admin/cliproxy-instance-logs-panel";
import type { CliproxyInstance } from "@/types/cliproxy";

const instance: CliproxyInstance = {
  id: "instance-1",
  name: "local-dev",
  mode: "managed",
  base_url: "http://cliproxyapi:8317",
  management_url: "http://cliproxyapi:8317",
  has_client_api_key: true,
  has_management_key: true,
  enabled: true,
  description: null,
  created_at: "2025-05-30T12:00:00.000Z",
  updated_at: "2025-05-30T12:00:00.000Z",
};

function logsResult(lines: string[]) {
  return {
    lines,
    line_count: lines.length,
    latest_timestamp: lines.length ? 1748685600 : 0,
  };
}

describe("CliproxyInstanceLogsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("加载中展示骨架", () => {
    useCliproxyInstanceLogsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      refetch: vi.fn(),
      isFetching: false,
    });
    render(<CliproxyInstanceLogsPanel instance={instance} />);
    expect(screen.getByText("logsTitle")).toBeInTheDocument();
  });

  it("加载失败展示错误", () => {
    useCliproxyInstanceLogsMock.mockReturnValue({
      data: undefined,
      isError: true,
      refetch: vi.fn(),
      isFetching: false,
    });
    render(<CliproxyInstanceLogsPanel instance={instance} />);
    expect(screen.getByText("logsLoadFailed")).toBeInTheDocument();
  });

  it("空日志展示提示", () => {
    useCliproxyInstanceLogsMock.mockReturnValue({
      data: logsResult([]),
      isLoading: false,
      refetch: vi.fn(),
      isFetching: false,
    });
    render(<CliproxyInstanceLogsPanel instance={instance} />);
    expect(screen.getByText("logsEmpty")).toBeInTheDocument();
  });

  it("渲染原始日志行字符串", () => {
    useCliproxyInstanceLogsMock.mockReturnValue({
      data: logsResult([
        "2026-05-31 10:00:00 INFO server started",
        "2026-05-31 10:00:01 WARN slow upstream request",
      ]),
      isLoading: false,
      refetch: vi.fn(),
      isFetching: false,
    });
    render(<CliproxyInstanceLogsPanel instance={instance} />);
    expect(screen.getByText("2026-05-31 10:00:00 INFO server started")).toBeInTheDocument();
    expect(screen.getByText("2026-05-31 10:00:01 WARN slow upstream request")).toBeInTheDocument();
  });

  it("hook 使用默认 limit 调用，便于上游裁剪行数", () => {
    useCliproxyInstanceLogsMock.mockReturnValue({
      data: logsResult([]),
      isLoading: false,
      refetch: vi.fn(),
      isFetching: false,
    });
    render(<CliproxyInstanceLogsPanel instance={instance} />);
    expect(useCliproxyInstanceLogsMock).toHaveBeenCalledWith("instance-1", { limit: 200 });
  });

  it("关键词过滤后只保留匹配的日志行", () => {
    useCliproxyInstanceLogsMock.mockReturnValue({
      data: logsResult([
        "2026-05-31 10:00:00 INFO server started",
        "2026-05-31 10:00:01 WARN slow upstream request",
      ]),
      isLoading: false,
      refetch: vi.fn(),
      isFetching: false,
    });
    render(<CliproxyInstanceLogsPanel instance={instance} />);

    fireEvent.change(screen.getByPlaceholderText("logsSearchPlaceholder"), {
      target: { value: "slow" },
    });

    expect(screen.queryByText("2026-05-31 10:00:00 INFO server started")).not.toBeInTheDocument();
    expect(screen.getByText("2026-05-31 10:00:01 WARN slow upstream request")).toBeInTheDocument();
  });

  it("有日志但全部被过滤掉时展示 logsNoMatches", () => {
    useCliproxyInstanceLogsMock.mockReturnValue({
      data: logsResult(["2026-05-31 10:00:00 INFO server started"]),
      isLoading: false,
      refetch: vi.fn(),
      isFetching: false,
    });
    render(<CliproxyInstanceLogsPanel instance={instance} />);

    fireEvent.change(screen.getByPlaceholderText("logsSearchPlaceholder"), {
      target: { value: "no-such-token" },
    });

    expect(screen.getByText("logsNoMatches")).toBeInTheDocument();
  });
});
