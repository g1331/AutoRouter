import pino from "pino";
import { config } from "./config";

const isProduction = config.nodeEnv === "production";

const level = config.logLevel ?? (isProduction ? "info" : "debug");

export const logger = pino({
  level,
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            sync: true,
          },
        },
      }),
});

/**
 * Create a child logger with a module name bound to the `module` field.
 *
 * @example
 * const log = createLogger("proxy-client");
 * log.info({ requestId }, "upstream request");
 */
export function createLogger(name: string) {
  return logger.child({ module: name });
}
