import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CliproxyAuthAccount } from "@/types/cliproxy";

const updateMutateAsync = vi.fn();

vi.mock("@/hooks/use-cliproxy", () => ({
  useUpdateCliproxyAuthAccountFields: () => ({
    mutateAsync: updateMutateAsync,
    isPending: false,
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { CliproxyAccountFieldsDialog } from "@/components/admin/cliproxy-account-fields-dialog";

const sampleAccount: CliproxyAuthAccount = {
  id: "account-1",
  instance_id: "instance-1",
  auth_file_name: "codex-a.json",
  provider: "codex",
  email: null,
  status: null,
  disabled: false,
  prefix: "team-a",
  model_count: 4,
  priority: 5,
  note: "primary",
  raw_metadata: null,
  last_synced_at: null,
  created_at: "2026-05-21T00:00:00Z",
  updated_at: "2026-05-21T00:00:00Z",
};

describe("CliproxyAccountFieldsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("渲染编辑标题并回填账号已有字段", () => {
    render(
      <CliproxyAccountFieldsDialog
        instanceId="instance-1"
        account={sampleAccount}
        open
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("editAccountFieldsTitle")).toBeInTheDocument();
    expect(screen.getByDisplayValue("team-a")).toBeInTheDocument();
    expect(screen.getByDisplayValue("primary")).toBeInTheDocument();
  });

  it("点击取消调用 onClose", () => {
    const onClose = vi.fn();
    render(
      <CliproxyAccountFieldsDialog
        instanceId="instance-1"
        account={sampleAccount}
        open
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByText("cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
