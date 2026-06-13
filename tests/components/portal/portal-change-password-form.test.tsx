import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PortalChangePasswordForm } from "@/components/portal/portal-change-password-form";

const changePasswordMutateAsyncMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock("@/hooks/use-portal-account", () => ({
  useChangeOwnPassword: () => ({
    mutateAsync: changePasswordMutateAsyncMock,
    isPending: false,
  }),
}));

function fillField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("PortalChangePasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits the current and new password", async () => {
    changePasswordMutateAsyncMock.mockResolvedValue(undefined);

    render(<PortalChangePasswordForm />);

    fillField("portal.password.currentLabel", "oldpassword1");
    fillField("portal.password.newLabel", "newpassword1");
    fillField("portal.password.confirmLabel", "newpassword1");
    fireEvent.click(screen.getByRole("button", { name: "portal.password.submit" }));

    await waitFor(() => {
      expect(changePasswordMutateAsyncMock).toHaveBeenCalledWith({
        current_password: "oldpassword1",
        new_password: "newpassword1",
      });
    });
  });

  it("rejects a confirmation that does not match the new password", async () => {
    render(<PortalChangePasswordForm />);

    fillField("portal.password.currentLabel", "oldpassword1");
    fillField("portal.password.newLabel", "newpassword1");
    fillField("portal.password.confirmLabel", "different1");
    fireEvent.click(screen.getByRole("button", { name: "portal.password.submit" }));

    await waitFor(() => {
      expect(screen.getByText("portal.password.confirmMismatch")).toBeInTheDocument();
    });
    expect(changePasswordMutateAsyncMock).not.toHaveBeenCalled();
  });

  it("rejects a new password shorter than 8 characters", async () => {
    render(<PortalChangePasswordForm />);

    fillField("portal.password.currentLabel", "oldpassword1");
    fillField("portal.password.newLabel", "short");
    fillField("portal.password.confirmLabel", "short");
    fireEvent.click(screen.getByRole("button", { name: "portal.password.submit" }));

    await waitFor(() => {
      expect(screen.getByText("portal.password.newTooShort")).toBeInTheDocument();
    });
    expect(changePasswordMutateAsyncMock).not.toHaveBeenCalled();
  });
});
