import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { QueryStatus } from "@/components/ui/query-status";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

it("区分首次失败与旧数据刷新失败，重试由调用方执行", () => {
  const retry = vi.fn();
  const { rerender } = render(<QueryStatus error={new Error("failed")} onRetry={retry} />);
  expect(screen.getByRole("alert")).toHaveTextContent("loadFailed");
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  expect(retry).toHaveBeenCalledOnce();
  rerender(<QueryStatus error={new Error("failed")} hasData fetching onRetry={retry} />);
  expect(screen.getByRole("alert")).toHaveTextContent("refreshFailed");
  expect(screen.getByRole("button")).toBeDisabled();
  rerender(<QueryStatus hasData fetching />);
  expect(screen.getByRole("status")).toHaveTextContent("refreshing");
  rerender(<QueryStatus />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
