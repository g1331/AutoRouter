import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RecordingJsonBlock,
  collectExpandedJsonPaths,
  getJsonBranchEntries,
  getJsonBranchSummary,
  isJsonBranch,
} from "@/components/admin/recording-json-block";

const writeTextMock = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

Object.assign(navigator, {
  clipboard: {
    writeText: writeTextMock,
  },
});

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    "aria-label"?: string;
  }) => (
    <button type="button" onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  ),
}));

describe("recording-json-block helpers", () => {
  it("isJsonBranch identifies objects and arrays only", () => {
    expect(isJsonBranch({})).toBe(true);
    expect(isJsonBranch([])).toBe(true);
    expect(isJsonBranch(null)).toBe(false);
    expect(isJsonBranch("text")).toBe(false);
    expect(isJsonBranch(42)).toBe(false);
    expect(isJsonBranch(undefined)).toBe(false);
  });

  it("getJsonBranchEntries returns indexed entries for arrays and key/value pairs for objects", () => {
    expect(getJsonBranchEntries(["a", "b"])).toEqual([
      ["0", "a"],
      ["1", "b"],
    ]);
    expect(getJsonBranchEntries({ foo: 1, bar: 2 })).toEqual([
      ["foo", 1],
      ["bar", 2],
    ]);
  });

  it("getJsonBranchSummary reports array vs object size", () => {
    expect(getJsonBranchSummary(["a", "b", "c"])).toBe("Array(3)");
    expect(getJsonBranchSummary({ foo: 1, bar: 2 })).toBe("Object(2)");
  });

  it("collectExpandedJsonPaths returns root + nested branches respecting maxDepth", () => {
    const value = { a: { b: { c: 1 } }, d: [1, 2] };

    const full = collectExpandedJsonPaths(value);
    expect(full.has("$")).toBe(true);
    expect(full.has("$.a")).toBe(true);
    expect(full.has("$.a.b")).toBe(true);
    expect(full.has("$.d")).toBe(true);

    const shallow = collectExpandedJsonPaths(value, 1);
    expect(shallow.has("$")).toBe(true);
    expect(shallow.has("$.a")).toBe(true);
    expect(shallow.has("$.a.b")).toBe(false);
  });
});

describe("RecordingJsonBlock component", () => {
  beforeEach(() => {
    writeTextMock.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("renders primitive root value without crashing", () => {
    render(<RecordingJsonBlock value="hello" />);
    expect(screen.getByText('"hello"')).toBeInTheDocument();
  });

  it("renders null root value as literal null", () => {
    render(<RecordingJsonBlock value={null} />);
    expect(screen.getByText("null")).toBeInTheDocument();
  });

  it("renders object root with depth-1 branches expanded by default", () => {
    render(<RecordingJsonBlock value={{ outer: { inner: { leaf: 1 } } }} />);

    expect(screen.getByText('"outer":')).toBeInTheDocument();
    expect(screen.getByText('"inner":')).toBeInTheDocument();
    expect(screen.getByText("Object(1)")).toBeInTheDocument();
  });

  it("expand-all reveals deeper branches that start collapsed", () => {
    render(<RecordingJsonBlock value={{ outer: { inner: { leaf: 1 } } }} />);

    expect(screen.queryByText('"leaf":')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("common.expand"));

    expect(screen.getByText('"leaf":')).toBeInTheDocument();
  });

  it("collapse-all hides every branch", () => {
    render(<RecordingJsonBlock value={{ outer: { inner: { leaf: 1 } } }} />);

    fireEvent.click(screen.getByText("common.expand"));
    expect(screen.getByText('"leaf":')).toBeInTheDocument();

    fireEvent.click(screen.getByText("common.collapse"));
    expect(screen.queryByText('"leaf":')).not.toBeInTheDocument();
  });

  it("copy button writes the formatted JSON text to clipboard and toasts success", async () => {
    writeTextMock.mockResolvedValueOnce(undefined);
    const value = { foo: "bar" };
    render(<RecordingJsonBlock value={value} />);

    const copyButton = screen.getByRole("button", { name: "common.copy" });
    fireEvent.click(copyButton);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(writeTextMock).toHaveBeenCalledWith(JSON.stringify(value, null, 2));
    expect(toastSuccess).toHaveBeenCalledWith("common.copied");
  });

  it("copy button reports failure via toast when clipboard rejects", async () => {
    writeTextMock.mockRejectedValueOnce(new Error("clipboard blocked"));
    render(<RecordingJsonBlock value={{ foo: "bar" }} />);

    fireEvent.click(screen.getByRole("button", { name: "common.copy" }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(toastError).toHaveBeenCalledWith("common.error");
  });

  it("clicking a branch toggle collapses an already expanded node", () => {
    render(<RecordingJsonBlock value={{ outer: { inner: 1 } }} />);

    const toggle = screen.getByRole("button", { name: /collapse outer/i });
    fireEvent.click(toggle);

    const container = toggle.parentElement?.parentElement as HTMLElement;
    expect(within(container).getByText("Object(1)")).toBeInTheDocument();
  });
});
