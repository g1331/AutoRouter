export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  openDuration: number;
  probeInterval: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  openDuration: 5 * 60_000,
  probeInterval: 30_000,
};
