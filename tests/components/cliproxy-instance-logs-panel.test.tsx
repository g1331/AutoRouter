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
      data: [],
      isLoading: false,
      refetch: vi.fn(),
      isFetching: false,
    });
    render(<CliproxyInstanceLogsPanel instance={instance} />);
    expect(screen.getByText("logsEmpty")).toBeInTheDocument();
  });

  it("渲染日志条目", () => {
    useCliproxyInstanceLogsMock.mockReturnValue({
      data: [
        { timestamp: "2025-05-31T10:00:00Z", level: "info", message: "started" },
        { timestamp: "2025-05-31T10:00:01Z", level: "warn", message: "slow request" },
      ],
      isLoading: false,
      refetch: vi.fn(),
      isFetching: false,
    });
    render(<CliproxyInstanceLogsPanel instance={instance} />);
    expect(screen.getByText("started")).toBeInTheDocument();
    expect(screen.getByText("slow request")).toBeInTheDocument();
    expect(screen.getByText("[INFO]")).toBeInTheDocument();
    expect(screen.getByText("[WARN]")).toBeInTheDocument();
  });

  it("关键词过滤后只保留匹配条目", () => {
    useCliproxyInstanceLogsMock.mockReturnValue({
      data: [
        { timestamp: "2025-05-31T10:00:00Z", level: "info", message: "started" },
        { timestamp: "2025-05-31T10:00:01Z", level: "warn", message: "slow request" },
      ],
      isLoading: false,
      refetch: vi.fn(),
      isFetching: false,
    });
    render(<CliproxyInstanceLogsPanel instance={instance} />);

    fireEvent.change(screen.getByPlaceholderText("logsSearchPlaceholder"), {
      target: { value: "slow" },
    });

    expect(screen.queryByText("started")).not.toBeInTheDocument();
    expect(screen.getByText("slow request")).toBeInTheDocument();
  });
});
