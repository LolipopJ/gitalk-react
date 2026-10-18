export const readStored = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const writeStored = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The active session can continue without persistent storage.
  }
};

export const removeStored = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage failure must not interrupt clearing the active session.
  }
};
