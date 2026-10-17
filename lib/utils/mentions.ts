import type { Comment } from "../interfaces";

export interface Mention {
  start: number;
  end: number;
  query: string;
}

export const findMention = (
  value: string,
  start: number,
  end: number,
): Mention | null => {
  if (start !== end) return null;
  const match = /(?:^|\s)@([a-z\d-]*)$/i.exec(value.slice(0, start));
  if (!match) return null;
  // Replace the whole token even when the caret is inside a username.
  const suffix = /^[a-z\d-]*/i.exec(value.slice(start))![0];
  const query = match[1]!;
  return { start: start - query.length - 1, end: start + suffix.length, query };
};

export const mentionCandidates = (
  comments: Comment[],
  query: string,
): string[] => {
  const names = new Map<string, string>();
  for (const { user } of comments) {
    const login = user?.login;
    if (login && !names.has(login.toLowerCase()))
      names.set(login.toLowerCase(), login);
  }
  return [...names.values()].filter((login) =>
    login.toLowerCase().startsWith(query.toLowerCase()),
  );
};

export const replaceMention = (
  value: string,
  mention: Mention,
  login: string,
) => {
  const suffix = value.slice(mention.end);
  const separator = suffix && /^[\s.,!?;:)]/.test(suffix) ? "" : " ";
  const prefix = `${value.slice(0, mention.start)}@${login}${separator}`;
  return { value: prefix + suffix, caret: prefix.length };
};
