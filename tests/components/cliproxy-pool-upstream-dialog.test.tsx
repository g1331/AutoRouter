import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const createMutateAsync = vi.fn();

vi.mock("@/hooks/use-cliproxy", () => ({
  useCreateCliproxyPoolUpstream: () => ({
    mutateAsync: createMutateAsync,
    isPending: false,
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { CliproxyPoolUpstreamDialog } from "@/components/admin/cliproxy-pool-upstream-dialog";

describe("CliproxyPoolUpstreamDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("渲染标题与创建按钮", () => {
    render(<CliproxyPoolUpstreamDialog instanceId="instance-1" open onClose={vi.fn()} />);
    expect(screen.getByText("poolUpstreamDialogTitle")).toBeInTheDocument();
    expect(screen.getByText("createUpstream")).toBeInTheDocument();
  });

  it("点击创建以默认服务商发起创建", async () => {
    createMutateAsync.mockResolvedValueOnce({ id: "upstream-1" });
    const onClose = vi.fn();
    render(<CliproxyPoolUpstreamDialog instanceId="instance-1" open onClose={onClose} />);

    fireEvent.click(screen.getByText("createUpstream"));

    await waitFor(() =>
      expect(createMutateAsync).toHaveBeenCalledWith({
        instanceId: "instance-1",
        provider: "codex",
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("点击取消调用 onClose", () => {
    const onClose = vi.fn();
    render(<CliproxyPoolUpstreamDialog instanceId="instance-1" open onClose={onClose} />);
    fireEvent.click(screen.getByText("cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
