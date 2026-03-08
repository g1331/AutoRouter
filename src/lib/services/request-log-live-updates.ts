export interface RequestLogLiveUpdate {
  type: "request-log-changed";
  logId: string;
  statusCode: number | null;
  occurredAt: string;
}

type RequestLogLiveUpdateListener = (event: RequestLogLiveUpdate) => void;

const listeners = new Set<RequestLogLiveUpdateListener>();

/**
 * Subscribe to in-process request-log live updates and return an unsubscribe callback.
 */
export function subscribeRequestLogLiveUpdates(listener: RequestLogLiveUpdateListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Publish a request-log live update to all active in-process listeners.
 */
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
