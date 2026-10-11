/** Minimal structured logger port; infrastructure decides where logs go. */
export interface Logger {
  warn(message: string, context?: Readonly<Record<string, unknown>>): void;
}

export const noopLogger: Logger = { warn: () => undefined };
