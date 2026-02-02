/* eslint-disable @typescript-eslint/no-explicit-any */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

// Global logging toggle - can be controlled via environment variable
const LOGGING_ENABLED = process.env.DISABLE_LOGS !== 'true';

export class Logger {
  private serviceName: string;
  private minLevel: LogLevel;

  constructor(serviceName: string, minLevel: LogLevel = LogLevel.INFO) {
    this.serviceName = serviceName;
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    if (!LOGGING_ENABLED) return false;
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  private formatMessage(level: LogLevel, message: string, meta?: Record<string, any>): string {
    const timestamp = new Date().toISOString();
    const baseLog = {
      timestamp,
      level,
      service: this.serviceName,
      message,
      ...meta,
    };
    return JSON.stringify(baseLog);
  }

  debug(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage(LogLevel.DEBUG, message, meta));
    }
  }

  info(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage(LogLevel.INFO, message, meta));
    }
  }

  warn(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(LogLevel.WARN, message, meta));
    }
  }

  error(message: string, error?: Error | any, meta?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(
        this.formatMessage(LogLevel.ERROR, message, {
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          } : error,
          ...meta,
        })
      );
    }
  }
}

// Factory function to create logger instances
export function createLogger(serviceName: string, level?: string): Logger {
  const logLevel = (level?.toLowerCase() as LogLevel) || LogLevel.INFO;
  return new Logger(serviceName, logLevel);
}
