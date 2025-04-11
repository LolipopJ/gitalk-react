class Logger {
  prefix = "%c Gitalk";

  i(...infos: unknown[]) {
    console.info(
      `${this.prefix} [INFO] `,
      "color:#333 ;background-color: #fff;",
      ...infos,
    );
  }

  w(...warnings: unknown[]) {
    console.warn(
      `${this.prefix} [WARNING] `,
      "color:#111 ;background-color:#ffa500;",
      ...warnings,
    );
  }

  e(...errors: unknown[]) {
    console.error(
      `${this.prefix} [ERROR] `,
      "color:#111 ;background-color:#ff0000;",
      ...errors,
    );
  }
}

const logger = new Logger();

export default logger;
