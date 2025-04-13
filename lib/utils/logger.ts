class Logger {
  prefix = "%c Gitalk";

  i(...infos: unknown[]) {
    console.info(
      `${this.prefix} [INFO] `,
      "color:#111 ;background-color: #f9fafb;",
      ...infos,
    );
  }

  s(...successes: unknown[]) {
    console.info(
      `${this.prefix} [INFO] `,
      "color:#111 ;background-color: #84cc16;",
      ...successes,
    );
  }

  w(...warnings: unknown[]) {
    console.warn(
      `${this.prefix} [WARNING] `,
      "color:#eee ;background-color:#c2410c;",
      ...warnings,
    );
  }

  e(...errors: unknown[]) {
    console.error(
      `${this.prefix} [ERROR] `,
      "color:#eee ;background-color:#dc2626;",
      ...errors,
    );
  }
}

const logger = new Logger();

export default logger;
