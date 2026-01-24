/**
 * Logger utility with environment-aware output
 */
const isDev = typeof process !== 'undefined'
  ? process.env.NODE_ENV === 'development'
  : true;

export const logger = {
  debug(...args: unknown[]): void {
    if (isDev) {
      console.debug('[ContextTools]', ...args);
    }
  },

  info(...args: unknown[]): void {
    console.info('[ContextTools]', ...args);
  },

  warn(...args: unknown[]): void {
    console.warn('[ContextTools]', ...args);
  },

  error(...args: unknown[]): void {
    console.error('[ContextTools]', ...args);
  },
};
