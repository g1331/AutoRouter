import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CliproxyInstance } from "@/types/cliproxy";

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
const testMutateAsync = vi.fn();

vi.mock("@/hooks/use-cliproxy", () => ({
  useCreateCliproxyInstance: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateCliproxyInstance: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  useTestCliproxyConnection: () => ({ mutateAsync: testMutateAsync, isPending: false }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { CliproxyInstanceFormDialog } from "@/components/admin/cliproxy-instance-form-dialog";

const sampleInstance: CliproxyInstance = {
  id: "instance-1",
  name: "local-dev",
  mode: "external",
  base_url: "http://localhost:8317",
  management_url: "http://localhost:8317",
  has_client_api_key: true,
  has_management_key: true,
  enabled: true,
  description: null,
  created_at: "2026-05-21T00:00:00Z",
  updated_at: "2026-05-21T00:00:00Z",
};

describe("CliproxyInstanceFormDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("创建模式渲染创建标题与名称字段", () => {
    render(<CliproxyInstanceFormDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByText("createInstanceTitle")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("fieldNamePlaceholder")).toBeInTheDocument();
  });

  it("编辑模式渲染编辑标题并回填实例名称", () => {
    render(<CliproxyInstanceFormDialog instance={sampleInstance} open onOpenChange={vi.fn()} />);
    expect(screen.getByText("editInstanceTitle")).toBeInTheDocument();
    expect(screen.getByDisplayValue("local-dev")).toBeInTheDocument();
  });

  it("点击取消调用 onOpenChange(false)", () => {
    const onOpenChange = vi.fn();
    render(<CliproxyInstanceFormDialog open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByText("cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("预检测按钮在管理地址与密钥为空时禁用", () => {
    render(<CliproxyInstanceFormDialog open onOpenChange={vi.fn()} />);
    const testButton = screen.getByText("testConnection").closest("button");
    expect(testButton).toBeDisabled();
  });

  it("模式字段下方展示 localhost 陷阱提示", () => {
    render(<CliproxyInstanceFormDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByText("fieldModeHint")).toBeInTheDocument();
    expect(screen.getByText("fieldBaseUrlHint")).toBeInTheDocument();
    expect(screen.getByText("fieldManagementUrlHint")).toBeInTheDocument();
  });
});
