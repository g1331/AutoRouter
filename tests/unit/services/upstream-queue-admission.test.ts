import { describe, expect, it, vi } from "vitest";
import {
  UpstreamQueueAdmissionService,
  UpstreamQueueWaitAbortedError,
  UpstreamQueueWaitTimeoutError,
} from "@/lib/services/upstream-queue-admission";

describe("UpstreamQueueAdmissionService", () => {
  it("tracks immediate reservations per upstream", () => {
    const service = new UpstreamQueueAdmissionService();

    expect(service.tryReserveImmediate({ upstreamId: "u1", maxConcurrency: 2 })).toEqual({
      reserved: true,
      activeCount: 1,
      maxConcurrency: 2,
      queueLength: 0,
    });
    expect(service.tryReserveImmediate({ upstreamId: "u1", maxConcurrency: 2 })).toEqual({
      reserved: true,
      activeCount: 2,
      maxConcurrency: 2,
      queueLength: 0,
    });
    expect(service.tryReserveImmediate({ upstreamId: "u1", maxConcurrency: 2 })).toEqual({
      reserved: false,
      activeCount: 2,
      maxConcurrency: 2,
      queueLength: 0,
    });

    expect(service.getActiveCount("u1")).toBe(2);
    expect(service.getActiveCountsSnapshot()).toEqual({ u1: 2 });
  });

  it("supports unlimited immediate reservations when max concurrency is empty", () => {
    const service = new UpstreamQueueAdmissionService();

    expect(service.tryReserveImmediate({ upstreamId: "u1", maxConcurrency: null }).reserved).toBe(
      true
    );
    expect(
      service.tryReserveImmediate({ upstreamId: "u1", maxConcurrency: undefined }).reserved
    ).toBe(true);
    expect(service.getActiveCount("u1")).toBe(2);
  });

  it("queues waiting requests and enforces max queue length", () => {
    const service = new UpstreamQueueAdmissionService();

    const first = service.enqueueWait({
      upstreamId: "u1",
      requestId: "req-1",
      maxQueueLength: 2,
    });
    const second = service.enqueueWait({
      upstreamId: "u1",
      requestId: "req-2",
      maxQueueLength: 2,
    });
    const third = service.enqueueWait({
      upstreamId: "u1",
      requestId: "req-3",
      maxQueueLength: 2,
    });

    expect(first).toMatchObject({
      accepted: true,
      reason: "queued",
      position: 1,
      queueLength: 1,
    });
    expect(second).toMatchObject({
      accepted: true,
      reason: "queued",
      position: 2,
      queueLength: 2,
    });
    expect(third).toEqual({
      accepted: false,
      reason: "queue_full",
      position: null,
      queueLength: 2,
      waitPromise: null,
    });

    expect(service.getSnapshot()).toEqual({
      u1: {
        activeCount: 0,
        queueLength: 2,
        waitingRequestIds: ["req-1", "req-2"],
      },
    });
  });

  it("hands released capacity to waiting requests in FIFO order", async () => {
    const service = new UpstreamQueueAdmissionService();

    service.tryReserveImmediate({ upstreamId: "u1", maxConcurrency: 1 });
    const firstWait = service.enqueueWait({
      upstreamId: "u1",
      requestId: "req-1",
      maxQueueLength: null,
    });
    const secondWait = service.enqueueWait({
      upstreamId: "u1",
      requestId: "req-2",
      maxQueueLength: null,
    });

    if (!firstWait.accepted || !secondWait.accepted) {
      throw new Error("expected queued requests");
    }

    expect(service.releaseReservation("u1")).toEqual({
      released: true,
      handedOff: true,
      resumedRequestId: "req-1",
      activeCount: 1,
      queueLength: 1,
    });
    await expect(firstWait.waitPromise).resolves.toMatchObject({
      upstreamId: "u1",
      requestId: "req-1",
      activeCount: 1,
      queueLengthRemaining: 1,
    });
    expect(service.getSnapshot()).toEqual({
      u1: {
        activeCount: 1,
        queueLength: 1,
        waitingRequestIds: ["req-2"],
      },
    });

    expect(service.releaseReservation("u1")).toEqual({
      released: true,
      handedOff: true,
      resumedRequestId: "req-2",
      activeCount: 1,
      queueLength: 0,
    });
    await expect(secondWait.waitPromise).resolves.toMatchObject({
      upstreamId: "u1",
      requestId: "req-2",
      activeCount: 1,
      queueLengthRemaining: 0,
    });
  });

  it("times out queued requests and removes them from the snapshot", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));

    const service = new UpstreamQueueAdmissionService();
    const queued = service.enqueueWait({
      upstreamId: "u1",
      requestId: "req-1",
      maxQueueLength: null,
      timeoutMs: 50,
    });

    if (!queued.accepted) {
      throw new Error("expected queued request");
    }

    await vi.advanceTimersByTimeAsync(50);

    await expect(queued.waitPromise).rejects.toBeInstanceOf(UpstreamQueueWaitTimeoutError);
    expect(service.getSnapshot()).toEqual({});

    vi.useRealTimers();
  });

  it("aborts queued requests when the caller signal is cancelled", async () => {
    const service = new UpstreamQueueAdmissionService();
    const controller = new AbortController();
    const queued = service.enqueueWait({
      upstreamId: "u1",
      requestId: "req-1",
      maxQueueLength: null,
      signal: controller.signal,
    });

    if (!queued.accepted) {
      throw new Error("expected queued request");
    }

    controller.abort();

    await expect(queued.waitPromise).rejects.toBeInstanceOf(UpstreamQueueWaitAbortedError);
    expect(service.getSnapshot()).toEqual({});
  });

  it("hands off to the next live waiter after the head request times out", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));

    const service = new UpstreamQueueAdmissionService();
    service.tryReserveImmediate({ upstreamId: "u1", maxConcurrency: 1 });

    const timedOut = service.enqueueWait({
      upstreamId: "u1",
      requestId: "req-1",
      maxQueueLength: null,
      timeoutMs: 50,
    });
    const live = service.enqueueWait({
      upstreamId: "u1",
      requestId: "req-2",
      maxQueueLength: null,
      timeoutMs: 500,
    });

    if (!timedOut.accepted || !live.accepted) {
      throw new Error("expected queued requests");
    }

    await vi.advanceTimersByTimeAsync(50);
    await expect(timedOut.waitPromise).rejects.toBeInstanceOf(UpstreamQueueWaitTimeoutError);

    expect(service.releaseReservation("u1")).toEqual({
      released: true,
      handedOff: true,
      resumedRequestId: "req-2",
      activeCount: 1,
      queueLength: 0,
    });
    await expect(live.waitPromise).resolves.toMatchObject({
      upstreamId: "u1",
      requestId: "req-2",
      activeCount: 1,
      queueLengthRemaining: 0,
    });

    vi.useRealTimers();
  });

  it("releases active reservations and removes idle upstream state", () => {
    const service = new UpstreamQueueAdmissionService();

    service.tryReserveImmediate({ upstreamId: "u1", maxConcurrency: 3 });

    expect(service.releaseReservation("u1")).toEqual({
      released: true,
      handedOff: false,
      resumedRequestId: null,
      activeCount: 0,
      queueLength: 0,
    });
    expect(service.getSnapshot()).toEqual({});
    expect(service.releaseReservation("u1")).toEqual({
      released: false,
      handedOff: false,
      resumedRequestId: null,
      activeCount: 0,
      queueLength: 0,
    });
  });

  it("reset clears active and queued state", () => {
    const service = new UpstreamQueueAdmissionService();

    service.tryReserveImmediate({ upstreamId: "u1", maxConcurrency: 1 });
    service.enqueueWait({
      upstreamId: "u1",
      requestId: "req-1",
      maxQueueLength: null,
    });
    service.tryReserveImmediate({ upstreamId: "u2", maxConcurrency: 1 });

    expect(service.getSnapshot()).toEqual({
      u1: {
        activeCount: 1,
        queueLength: 1,
        waitingRequestIds: ["req-1"],
      },
      u2: {
        activeCount: 1,
        queueLength: 0,
        waitingRequestIds: [],
      },
    });

    service.reset();

    expect(service.getSnapshot()).toEqual({});
    expect(service.getActiveCountsSnapshot()).toEqual({});
  });
});
