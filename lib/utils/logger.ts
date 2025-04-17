enum LogLevel {
  INFO,
  SUCCESS,
  WARNING,
  ERROR,
  NO_LOG = Infinity,
}

class Logger {
  prefix = "Gitalk";
  logLevel = import.meta.env.PROD ? LogLevel.WARNING : LogLevel.INFO;

  i(...infos: unknown[]) {
    if (this.logLevel > LogLevel.INFO) return;

    console.info(
      `%c ${this.prefix} [INFO] `,
      "color:#111 ;background-color: #f9fafb;",
      ...infos,
    );
  }

  s(...successes: unknown[]) {
    if (this.logLevel > LogLevel.SUCCESS) return;

    console.info(
      `%c ${this.prefix} [SUCCESS] `,
      "color:#111 ;background-color: #84cc16;",
      ...successes,
    );
  }

  w(...warnings: unknown[]) {
    if (this.logLevel > LogLevel.WARNING) return;

    console.warn(
      `%c ${this.prefix} [WARNING] `,
      "color:#eee ;background-color:#c2410c;",
      ...warnings,
    );
  }

  e(...errors: unknown[]) {
    if (this.logLevel > LogLevel.ERROR) return;

    console.error(
      `%c ${this.prefix} [ERROR] `,
      "color:#eee ;background-color:#dc2626;",
      ...errors,
    );
  }
}

const logger = new Logger();

export default logger;
