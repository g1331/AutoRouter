export interface UpstreamQueueStateSnapshot {
  activeCount: number;
  queueLength: number;
  waitingRequestIds: string[];
}

export type UpstreamQueueAdmissionSnapshot = Record<string, UpstreamQueueStateSnapshot>;

export interface TryReserveImmediateInput {
  upstreamId: string;
  maxConcurrency: number | null | undefined;
}

export interface TryReserveImmediateResult {
  reserved: boolean;
  activeCount: number;
  maxConcurrency: number | null;
  queueLength: number;
}

export interface QueueWaitGrant {
  upstreamId: string;
  requestId: string;
  waitDurationMs: number;
  activeCount: number;
  queueLengthRemaining: number;
}

export interface EnqueueWaitInput {
  upstreamId: string;
  requestId: string;
  maxQueueLength: number | null | undefined;
}

export type EnqueueWaitResult =
  | {
      accepted: true;
      reason: "queued";
      position: number;
      queueLength: number;
      waitPromise: Promise<QueueWaitGrant>;
    }
  | {
      accepted: false;
      reason: "queue_full";
      position: null;
      queueLength: number;
      waitPromise: null;
    };

export interface ReleaseReservationResult {
  released: boolean;
  handedOff: boolean;
  resumedRequestId: string | null;
  activeCount: number;
  queueLength: number;
}

interface WaitingRequestEntry {
  requestId: string;
  enqueuedAt: number;
  resolve: (grant: QueueWaitGrant) => void;
}

interface UpstreamQueueState {
  activeCount: number;
  queue: WaitingRequestEntry[];
}

function normalizePositiveLimit(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

export class UpstreamQueueAdmissionService {
  private states = new Map<string, UpstreamQueueState>();

  getActiveCount(upstreamId: string): number {
    return this.states.get(upstreamId)?.activeCount ?? 0;
  }

  getActiveCountsSnapshot(): Record<string, number> {
    return Object.fromEntries(
      [...this.states.entries()]
        .filter(([, state]) => state.activeCount > 0)
        .map(([upstreamId, state]) => [upstreamId, state.activeCount])
    );
  }

  getSnapshot(): UpstreamQueueAdmissionSnapshot {
    return Object.fromEntries(
      [...this.states.entries()].map(([upstreamId, state]) => [
        upstreamId,
        {
          activeCount: state.activeCount,
          queueLength: state.queue.length,
          waitingRequestIds: state.queue.map((entry) => entry.requestId),
        },
      ])
    );
  }

  tryReserveImmediate(input: TryReserveImmediateInput): TryReserveImmediateResult {
    const state = this.getOrCreateState(input.upstreamId);
    const maxConcurrency = normalizePositiveLimit(input.maxConcurrency);

    if (maxConcurrency !== null && state.activeCount >= maxConcurrency) {
      return {
        reserved: false,
        activeCount: state.activeCount,
        maxConcurrency,
        queueLength: state.queue.length,
      };
    }

    state.activeCount += 1;

    return {
      reserved: true,
      activeCount: state.activeCount,
      maxConcurrency,
      queueLength: state.queue.length,
    };
  }

  enqueueWait(input: EnqueueWaitInput): EnqueueWaitResult {
    const state = this.getOrCreateState(input.upstreamId);
    const maxQueueLength = normalizePositiveLimit(input.maxQueueLength);

    if (maxQueueLength !== null && state.queue.length >= maxQueueLength) {
      return {
        accepted: false,
        reason: "queue_full",
        position: null,
        queueLength: state.queue.length,
        waitPromise: null,
      };
    }

    let resolveWait!: (grant: QueueWaitGrant) => void;
    const waitPromise = new Promise<QueueWaitGrant>((resolve) => {
      resolveWait = resolve;
    });

    state.queue.push({
      requestId: input.requestId,
      enqueuedAt: Date.now(),
      resolve: resolveWait,
    });

    return {
      accepted: true,
      reason: "queued",
      position: state.queue.length,
      queueLength: state.queue.length,
      waitPromise,
    };
  }

  releaseReservation(upstreamId: string): ReleaseReservationResult {
    const state = this.states.get(upstreamId);
    if (!state || state.activeCount <= 0) {
      this.cleanupIdleState(upstreamId, state);
      return {
        released: false,
        handedOff: false,
        resumedRequestId: null,
        activeCount: state?.activeCount ?? 0,
        queueLength: state?.queue.length ?? 0,
      };
    }

    state.activeCount = Math.max(0, state.activeCount - 1);

    if (state.queue.length === 0) {
      this.cleanupIdleState(upstreamId, state);
      return {
        released: true,
        handedOff: false,
        resumedRequestId: null,
        activeCount: state.activeCount,
        queueLength: state.queue.length,
      };
    }

    const next = state.queue.shift() as WaitingRequestEntry;
    state.activeCount += 1;
    next.resolve({
      upstreamId,
      requestId: next.requestId,
      waitDurationMs: Math.max(0, Date.now() - next.enqueuedAt),
      activeCount: state.activeCount,
      queueLengthRemaining: state.queue.length,
    });
    this.cleanupIdleState(upstreamId, state);

    return {
      released: true,
      handedOff: true,
      resumedRequestId: next.requestId,
      activeCount: state.activeCount,
      queueLength: state.queue.length,
    };
  }

  reset(): void {
    this.states.clear();
  }

  private getOrCreateState(upstreamId: string): UpstreamQueueState {
    const existing = this.states.get(upstreamId);
    if (existing) {
      return existing;
    }

    const state: UpstreamQueueState = {
      activeCount: 0,
      queue: [],
    };
    this.states.set(upstreamId, state);
    return state;
  }

  private cleanupIdleState(upstreamId: string, state: UpstreamQueueState | undefined): void {
    if (!state) {
      return;
    }

    if (state.activeCount === 0 && state.queue.length === 0) {
      this.states.delete(upstreamId);
    }
  }
}

export const upstreamQueueAdmission = new UpstreamQueueAdmissionService();
