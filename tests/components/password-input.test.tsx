import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PasswordInput } from "@/components/ui/password-input";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const originalCSS = globalThis.CSS;

afterEach(() => {
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: originalCSS,
  });
});

describe("PasswordInput", () => {
  it("keeps a right-side visibility toggle and switches input visibility", async () => {
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: {
        supports: vi.fn(() => true),
      },
    });

    render(<PasswordInput placeholder="secret value" />);

    const input = screen.getByPlaceholderText("secret value");
    await waitFor(() => {
      expect(input).toHaveAttribute("type", "text");
    });
    expect(input.className).toContain("[-webkit-text-security:disc]");
    expect(input.className).toContain("tracking-[0.22em]");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("data-1p-ignore", "true");
    expect(input).toHaveAttribute("data-lpignore", "true");
    expect(input).toHaveAttribute("data-form-type", "other");

    const showButton = screen.getByRole("button", { name: "showSensitiveInput" });
    expect(showButton.className).toContain("right-1.5");

    fireEvent.click(showButton);
    expect(input).toHaveAttribute("type", "text");
    expect(input.className).not.toContain("[-webkit-text-security:disc]");
    expect(screen.getByRole("button", { name: "hideSensitiveInput" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "hideSensitiveInput" }));
    await waitFor(() => {
      expect(input).toHaveAttribute("type", "text");
    });
    expect(input.className).toContain("[-webkit-text-security:disc]");
  });

  it("falls back to native password type when text security is unavailable", async () => {
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: {
        supports: vi.fn(() => false),
      },
    });

    render(<PasswordInput placeholder="legacy browser" autoComplete="new-password" />);

    const input = screen.getByPlaceholderText("legacy browser");
    await waitFor(() => {
      expect(input).toHaveAttribute("type", "password");
    });
    expect(input.className).not.toContain("[-webkit-text-security:disc]");
    expect(input).toHaveAttribute("autocomplete", "new-password");
  });

  it("allows browser password managers when requested", async () => {
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: {
        supports: vi.fn(() => true),
      },
    });

    render(<PasswordInput placeholder="saved secret" allowPasswordManager />);

    const input = screen.getByPlaceholderText("saved secret");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "current-password");
    expect(input.className).not.toContain("[-webkit-text-security:disc]");
    expect(input).not.toHaveAttribute("data-1p-ignore");
    expect(input).not.toHaveAttribute("data-lpignore");
    expect(input).not.toHaveAttribute("data-form-type");
  });
});
