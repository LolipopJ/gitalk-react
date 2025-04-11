import logger from "./logger";

export const isSupportsCSSVariables = () => {
  const testKey = "--supports-css-variables";
  const testValue = "1rem";

  try {
    const testElement = document.createElement("div");
    testElement.style.setProperty(testKey, testValue);

    return testElement.style.getPropertyValue(testKey) === testValue;
  } catch (error) {
    logger.e(
      `An error occurred while checking browser compatibility with CSS variables:`,
      error,
    );
    return false;
  }
};

export const isSupportsES2020 = () => {
  try {
    return (
      typeof BigInt !== "undefined" &&
      typeof Promise.allSettled === "function" &&
      typeof String.prototype.matchAll === "function"
    );
  } catch (error) {
    logger.e(
      `An error occurred while checking browser compatibility with ES2020:`,
      error,
    );
    return false;
  }
};
