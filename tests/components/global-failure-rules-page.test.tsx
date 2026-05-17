import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import GlobalFailureRulesPage from "@/app/[locale]/(dashboard)/system/failure-rules/page";

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock("@/components/admin/topbar", () => ({
  Topbar: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@/components/admin/upstream-failure-rules-editor", () => ({
  UpstreamFailureRulesEditor: ({ scope }: { scope: string }) => (
    <div data-testid="failure-rules-editor">{scope}</div>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, className, ...props }: { children: React.ReactNode; className?: string }) => (
    <div className={className} {...props}>
      {children}
    </div>
  ),
  CardContent: ({
    children,
    className,
    ...props
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div className={className} {...props}>
      {children}
    </div>
  ),
}));

vi.mock("lucide-react", () => ({
  ShieldAlert: () => <svg data-testid="icon-shield-alert" />,
}));

describe("GlobalFailureRulesPage", () => {
  it("renders global failure rule management content", () => {
    render(<GlobalFailureRulesPage />);

    expect(screen.getAllByText("upstreamFailureRules.title").length).toBeGreaterThan(0);
    expect(screen.getByText("upstreamFailureRules.description")).toBeInTheDocument();
    expect(screen.getByText("upstreamFailureRules.editorTitle")).toBeInTheDocument();
    expect(screen.getByText("upstreamFailureRules.editorDescription")).toBeInTheDocument();
    expect(screen.getByTestId("failure-rules-editor")).toHaveTextContent("global");
  });
});
