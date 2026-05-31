import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const useCliproxyLinkedUpstreamsMock = vi.fn();

vi.mock("@/hooks/use-cliproxy", () => ({
  useCliproxyLinkedUpstreams: (...args: unknown[]) => useCliproxyLinkedUpstreamsMock(...args),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { CliproxyLinkedUpstreamsPanel } from "@/components/admin/cliproxy-linked-upstreams-panel";
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

describe("CliproxyLinkedUpstreamsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("无关联上游时展示空提示", () => {
    useCliproxyLinkedUpstreamsMock.mockReturnValue({ data: [], isLoading: false });
    render(<CliproxyLinkedUpstreamsPanel instance={instance} />);
    expect(screen.getByText("linkedUpstreamsEmpty")).toBeInTheDocument();
  });

  it("加载失败展示错误", () => {
    useCliproxyLinkedUpstreamsMock.mockReturnValue({ data: undefined, isError: true });
    render(<CliproxyLinkedUpstreamsPanel instance={instance} />);
    expect(screen.getByText("linkedUpstreamsLoadFailed")).toBeInTheDocument();
  });

  it("有数据时区分池上游与单账号上游", () => {
    useCliproxyLinkedUpstreamsMock.mockReturnValue({
      data: [
        {
          id: "up-1",
          name: "Pool Codex",
          provider: "codex",
          kind: "pool",
          auth_file_name: null,
          is_active: true,
          created_at: "2025-05-30T12:00:00.000Z",
        },
        {
          id: "up-2",
          name: "Single Claude",
          provider: "anthropic",
          kind: "single",
          auth_file_name: "claude-a.json",
          is_active: false,
          created_at: "2025-05-30T12:00:00.000Z",
        },
      ],
      isLoading: false,
    });
    render(<CliproxyLinkedUpstreamsPanel instance={instance} />);

    expect(screen.getByText("Pool Codex")).toBeInTheDocument();
    expect(screen.getByText("Single Claude")).toBeInTheDocument();
    expect(screen.getByText("claude-a.json")).toBeInTheDocument();
    expect(screen.getByText("kindPool")).toBeInTheDocument();
    expect(screen.getByText("kindSingle")).toBeInTheDocument();
  });
});
