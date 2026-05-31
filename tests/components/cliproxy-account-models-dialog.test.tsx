import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const useCliproxyAccountModelsMock = vi.fn();

vi.mock("@/hooks/use-cliproxy", () => ({
  useCliproxyAccountModels: (...args: unknown[]) => useCliproxyAccountModelsMock(...args),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { CliproxyAccountModelsDialog } from "@/components/admin/cliproxy-account-models-dialog";

describe("CliproxyAccountModelsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("加载中展示 loading", () => {
    useCliproxyAccountModelsMock.mockReturnValue({ data: undefined, isLoading: true });

    render(
      <CliproxyAccountModelsDialog
        instanceId="instance-1"
        authFileName="codex-a.json"
        open
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("加载失败展示错误信息", () => {
    useCliproxyAccountModelsMock.mockReturnValue({ data: undefined, isError: true });

    render(
      <CliproxyAccountModelsDialog
        instanceId="instance-1"
        authFileName="codex-a.json"
        open
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("accountModelsLoadFailed")).toBeInTheDocument();
  });

  it("空列表展示空提示", () => {
    useCliproxyAccountModelsMock.mockReturnValue({ data: [], isLoading: false });

    render(
      <CliproxyAccountModelsDialog
        instanceId="instance-1"
        authFileName="codex-a.json"
        open
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("accountModelsEmpty")).toBeInTheDocument();
  });

  it("非空列表渲染模型 ID 与显示名", () => {
    useCliproxyAccountModelsMock.mockReturnValue({
      data: [{ id: "gpt-5", display_name: "GPT-5" }, { id: "gpt-5-codex" }],
      isLoading: false,
    });

    render(
      <CliproxyAccountModelsDialog
        instanceId="instance-1"
        authFileName="codex-a.json"
        open
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("gpt-5")).toBeInTheDocument();
    expect(screen.getByText("GPT-5")).toBeInTheDocument();
    expect(screen.getByText("gpt-5-codex")).toBeInTheDocument();
  });
});
