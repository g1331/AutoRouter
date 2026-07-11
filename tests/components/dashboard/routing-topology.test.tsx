import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import enMessages from "@/messages/en.json";
import zhCNMessages from "@/messages/zh-CN.json";
import { RoutingTopology } from "@/components/dashboard/routing-topology";
import type { UpstreamResponse } from "@/types/api";

// 数据 hooks 全部 mock，组件测试无需 QueryClient / AuthProvider；
// i18n 用真实 next-intl + 真实消息文件做契约测试（mock 抓不到 namespace 写错）。
const useUpstreamsMock = vi.fn();
const useUpstreamHealthMock = vi.fn();
vi.mock("@/hooks/use-upstreams", () => ({
  useUpstreams: (...args: unknown[]) => useUpstreamsMock(...args),
  useUpstreamHealth: (...args: unknown[]) => useUpstreamHealthMock(...args),
}));

const useLivePulseMock = vi.fn();
vi.mock("@/hooks/use-live-pulse", () => ({
  useLivePulse: () => useLivePulseMock(),
}));

function makeUpstream(
  overrides: Partial<UpstreamResponse> & { id: string; name: string }
): UpstreamResponse {
  return {
    priority: 1,
    weight: 1,
    is_active: true,
    circuit_breaker: null,
    ...overrides,
  } as UpstreamResponse;
}

function mockUpstreams(items: UpstreamResponse[], isLoading = false) {
  useUpstreamsMock.mockReturnValue({
    data: isLoading
      ? undefined
      : { items, total: items.length, page: 1, page_size: 50, total_pages: 1 },
    isLoading,
  });
}

function renderTopology(locale: "en" | "zh-CN" = "en") {
  const messages = locale === "en" ? enMessages : zhCNMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <RoutingTopology />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpstreams([]);
  useUpstreamHealthMock.mockReturnValue({ data: undefined });
  useLivePulseMock.mockReturnValue({ snapshot: null, connectionState: "connecting" });
});

describe("RoutingTopology", () => {
  it("renders one node per upstream with the gateway core and a text summary", () => {
    mockUpstreams([
      makeUpstream({ id: "u-1", name: "openai-primary", priority: 1, weight: 10 }),
      makeUpstream({ id: "u-2", name: "anthropic", priority: 2, weight: 5 }),
      makeUpstream({ id: "u-3", name: "gemini", priority: 3, weight: 1 }),
    ]);

    const { container } = renderTopology();

    expect(useUpstreamsMock).toHaveBeenCalledWith(1, 50);
    expect(useUpstreamHealthMock).toHaveBeenCalledWith(true);

    // i18n 契约：namespace 解析出真实译文而不是回退 key 路径
    // （标题同时出现在 h2 与 svg <title>，用 role 定位面板标题）
    expect(screen.getByRole("heading", { name: "ROUTING TOPOLOGY" })).toBeInTheDocument();
    expect(screen.queryByText("topology.title")).not.toBeInTheDocument();

    const nodes = screen.getAllByTestId("topology-node");
    expect(nodes).toHaveLength(3);
    expect(screen.getByText("openai-primary")).toBeInTheDocument();
    expect(screen.getByText("AUTOROUTER")).toBeInTheDocument();
    expect(screen.getByText("GATEWAY")).toBeInTheDocument();

    // 全部健康 → 3/3 UP，sr-only 摘要计数一致
    expect(screen.getByText("3/3 UP")).toBeInTheDocument();
    expect(
      screen.getByText("3 upstreams: 3 healthy, 0 half-open, 0 offline, 0 disabled.")
    ).toBeInTheDocument();

    // 每个 ok 节点一个流量包（setup 的 matchMedia 默认 matches:false）
    expect(container.querySelectorAll("animateMotion")).toHaveLength(3);
  });

  it("marks an open breaker or unhealthy upstream as offline: dashed border and no packet", () => {
    mockUpstreams([
      makeUpstream({ id: "u-ok", name: "healthy-up", priority: 1 }),
      makeUpstream({
        id: "u-open",
        name: "broken-up",
        priority: 2,
        circuit_breaker: {
          state: "open",
          failure_count: 5,
          success_count: 0,
          last_failure_at: null,
          opened_at: null,
          config: null,
        },
      }),
      makeUpstream({ id: "u-sick", name: "sick-up", priority: 3 }),
    ]);
    useUpstreamHealthMock.mockReturnValue({
      data: {
        data: [
          {
            upstream_id: "u-sick",
            is_healthy: false,
            last_check_at: null,
            last_success_at: null,
            failure_count: 3,
            latency_ms: null,
            error_message: "timeout",
          },
        ],
        total: 1,
      },
    });

    const { container } = renderTopology();

    const badNodes = container.querySelectorAll('[data-testid="topology-node"][data-state="bad"]');
    expect(badNodes).toHaveLength(2);
    for (const node of badNodes) {
      expect(node.querySelector("rect")?.getAttribute("stroke-dasharray")).toBe("5 4");
    }

    // 仅 ok 节点有流量包；离线节点没有
    expect(container.querySelectorAll("animateMotion")).toHaveLength(1);
    expect(
      screen.getByText("3 upstreams: 1 healthy, 0 half-open, 2 offline, 0 disabled.")
    ).toBeInTheDocument();
  });

  it("renders half-open as warn with a packet and inactive as greyed out without one", () => {
    mockUpstreams([
      makeUpstream({
        id: "u-half",
        name: "recovering-up",
        priority: 1,
        circuit_breaker: {
          state: "half_open",
          failure_count: 2,
          success_count: 1,
          last_failure_at: null,
          opened_at: null,
          config: null,
        },
      }),
      makeUpstream({ id: "u-off", name: "disabled-up", priority: 2, is_active: false }),
    ]);

    const { container } = renderTopology();

    expect(
      container.querySelectorAll('[data-testid="topology-node"][data-state="warn"]')
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('[data-testid="topology-node"][data-state="inactive"]')
    ).toHaveLength(1);
    // warn 节点保留（低频）流量包，inactive 无
    expect(container.querySelectorAll("animateMotion")).toHaveLength(1);
  });

  it("does not render the animateMotion subtree under prefers-reduced-motion", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    try {
      mockUpstreams([makeUpstream({ id: "u-1", name: "openai-primary" })]);

      const { container } = renderTopology();

      expect(screen.getAllByTestId("topology-node")).toHaveLength(1);
      expect(container.querySelectorAll("animateMotion")).toHaveLength(0);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("caps visible nodes at 8 and shows the overflow count", () => {
    mockUpstreams(
      Array.from({ length: 10 }, (_, i) =>
        makeUpstream({ id: `u-${i}`, name: `upstream-${i}`, priority: i })
      )
    );

    renderTopology();

    expect(screen.getAllByTestId("topology-node")).toHaveLength(8);
    expect(screen.getByText("+2")).toBeInTheDocument();
    // 摘要计数覆盖全部 10 个上游，而非仅可见节点
    expect(
      screen.getByText("10 upstreams: 10 healthy, 0 half-open, 0 offline, 0 disabled.")
    ).toBeInTheDocument();
  });

  it("shows the open breaker count from the live pulse snapshot in the header", () => {
    mockUpstreams([makeUpstream({ id: "u-1", name: "openai-primary" })]);
    useLivePulseMock.mockReturnValue({
      snapshot: {
        requestsPerMinute: 60,
        errorRatePct: 0,
        avgLatencyMs: 500,
        tokensPerMinute: 1000,
        sampleCount: 60,
        windowSeconds: 60,
        generatedAt: "2026-01-01T00:00:00.000Z",
        gateway: { healthyUpstreams: 1, totalUpstreams: 2, openCircuitBreakers: 2 },
      },
      connectionState: "live",
    });

    renderTopology();

    expect(screen.getByText("2 OPEN")).toBeInTheDocument();
  });

  it("renders the empty state when no upstreams are configured", () => {
    mockUpstreams([]);

    renderTopology();

    expect(screen.getByText("No upstreams configured")).toBeInTheDocument();
    expect(screen.queryByTestId("topology-node")).not.toBeInTheDocument();
  });

  it("resolves real zh-CN translations", () => {
    mockUpstreams([makeUpstream({ id: "u-1", name: "openai-primary" })]);

    renderTopology("zh-CN");

    expect(screen.getByRole("heading", { name: "路由拓扑" })).toBeInTheDocument();
    expect(screen.getByText("网关")).toBeInTheDocument();
    expect(screen.getByText("1/1 在线")).toBeInTheDocument();
  });
});
