import type { ReactNode } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BulkUpstreamVisibilityDialog } from "@/components/admin/bulk-upstream-visibility-dialog";

// next-intl：翻译键透传
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// 批量可见性 mutation 桩
const { bulkMock } = vi.hoisted(() => ({ bulkMock: vi.fn() }));
vi.mock("@/hooks/use-users", () => ({
  useSetUsersUpstreamVisibility: () => ({ mutateAsync: bulkMock, isPending: false }),
}));

// 确认对话框：始终展开渲染内容，两个动作按钮保留 onClick 与 event.preventDefault
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  AlertDialogAction: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: (event: React.MouseEvent) => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BulkUpstreamVisibilityDialog", () => {
  it("“全部隐藏”提交 expose_upstreams=false，不带用户子集", async () => {
    bulkMock.mockResolvedValueOnce({ affected: 3, aligned_keys: 2 });
    render(<BulkUpstreamVisibilityDialog />);

    fireEvent.click(screen.getByRole("button", { name: "bulkVisibilityHideAll" }));

    await waitFor(() => expect(bulkMock).toHaveBeenCalledWith({ expose_upstreams: false }));
  });

  it("“全部可见”提交 expose_upstreams=true", async () => {
    bulkMock.mockResolvedValueOnce({ affected: 3, aligned_keys: 0 });
    render(<BulkUpstreamVisibilityDialog />);

    fireEvent.click(screen.getByRole("button", { name: "bulkVisibilityShowAll" }));

    await waitFor(() => expect(bulkMock).toHaveBeenCalledWith({ expose_upstreams: true }));
  });

  // mutation 失败由 hook 的 onError 提示，这里只保证组件不把错误抛穿导致整页崩溃。
  it("提交失败时不抛出到渲染层", async () => {
    bulkMock.mockRejectedValueOnce(new Error("boom"));
    render(<BulkUpstreamVisibilityDialog />);

    fireEvent.click(screen.getByRole("button", { name: "bulkVisibilityHideAll" }));

    await waitFor(() => expect(bulkMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "bulkVisibilityHideAll" })).toBeInTheDocument();
  });
});
