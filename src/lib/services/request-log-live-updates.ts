export interface RequestLogLiveUpdate {
  type: "request-log-changed";
  logId: string;
  statusCode: number | null;
  occurredAt: string;
}

type RequestLogLiveUpdateListener = (event: RequestLogLiveUpdate) => void;

const listeners = new Set<RequestLogLiveUpdateListener>();

export function subscribeRequestLogLiveUpdates(listener: RequestLogLiveUpdateListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishRequestLogLiveUpdate(
  event: Omit<RequestLogLiveUpdate, "occurredAt"> & { occurredAt?: string }
): void {
  const payload: RequestLogLiveUpdate = {
    ...event,
    occurredAt: event.occurredAt ?? new Date().toISOString(),
  };

  for (const listener of Array.from(listeners)) {
    try {
      listener(payload);
    } catch {
      // Ignore subscriber errors so one broken stream does not affect others.
    }
  }
}
