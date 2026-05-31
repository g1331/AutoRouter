import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const toggleEnabledMutate = vi.fn();
const useToggleCliproxyInstanceEnabledMock = vi.fn();

vi.mock("@/hooks/use-cliproxy", () => ({
  useToggleCliproxyInstanceEnabled: () => useToggleCliproxyInstanceEnabledMock(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { CliproxyInstancesTable } from "@/components/admin/cliproxy-instances-table";
import type { CliproxyInstance } from "@/types/cliproxy";

function makeInstance(id: string, overrides: Partial<CliproxyInstance> = {}): CliproxyInstance {
  return {
    id,
    name: `cpa-${id}`,
    mode: "managed",
    base_url: `http://cliproxyapi-${id}:8317`,
    management_url: `http://cliproxyapi-${id}:8317`,
    has_client_api_key: true,
    has_management_key: true,
    enabled: true,
    description: null,
    created_at: "2026-05-30T12:00:00.000Z",
    updated_at: "2026-05-30T12:00:00.000Z",
    ...overrides,
  };
}

describe("CliproxyInstancesTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useToggleCliproxyInstanceEnabledMock.mockReturnValue({
      mutate: toggleEnabledMutate,
      isPending: false,
      variables: undefined,
    });
  });

  it("点击行调用 onSelect", () => {
    const onSelect = vi.fn();
    render(
      <CliproxyInstancesTable
        instances={[makeInstance("a")]}
        selectedInstanceId={null}
        onSelect={onSelect}
        onEdit={vi.fn()}
        onTest={vi.fn()}
        onCreatePoolUpstream={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("cpa-a"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe("a");
  });

  it("切换 Switch 调用 toggleEnabled.mutate 且不冒泡 onSelect", () => {
    const onSelect = vi.fn();
    render(
      <CliproxyInstancesTable
        instances={[makeInstance("a", { enabled: false })]}
        selectedInstanceId={null}
        onSelect={onSelect}
        onEdit={vi.fn()}
        onTest={vi.fn()}
        onCreatePoolUpstream={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);
    expect(toggleEnabledMutate).toHaveBeenCalledWith({ id: "a", enabled: true });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("当前正在切换的行 Switch 被禁用，其余行 Switch 仍可用", () => {
    useToggleCliproxyInstanceEnabledMock.mockReturnValue({
      mutate: toggleEnabledMutate,
      isPending: true,
      variables: { id: "a", enabled: true },
    });

    render(
      <CliproxyInstancesTable
        instances={[makeInstance("a"), makeInstance("b")]}
        selectedInstanceId={null}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onTest={vi.fn()}
        onCreatePoolUpstream={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    const switches = screen.getAllByRole("switch");
    expect(switches[0]).toBeDisabled();
    expect(switches[1]).not.toBeDisabled();
  });

  it("没有进行中的切换时所有 Switch 都可用", () => {
    render(
      <CliproxyInstancesTable
        instances={[makeInstance("a"), makeInstance("b")]}
        selectedInstanceId={null}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onTest={vi.fn()}
        onCreatePoolUpstream={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    const switches = screen.getAllByRole("switch");
    expect(switches[0]).not.toBeDisabled();
    expect(switches[1]).not.toBeDisabled();
  });
});
