import assert from "node:assert/strict";
import test from "node:test";

import { loadSource } from "./helpers/source.mjs";

test("mentions match only a token at the caret, preserving surrounding text", () => {
  const { findMention, replaceMention } = loadSource("utils/mentions.ts");
  const text = "Hello @al, next @bob";
  const mention = findMention(text, 9, 9);
  assert.equal(mention.query, "al");
  const result = replaceMention(text, mention, "alice");
  assert.equal(result.value, "Hello @alice, next @bob");
  assert.equal(result.caret, 12);
  const middle = findMention("@albert suffix", 3, 3);
  assert.equal(
    replaceMention("@albert suffix", middle, "alice").value,
    "@alice suffix",
  );
  for (const [value, start, end] of [
    ["a@b", 3, 3],
    ["@a", 0, 0],
    ["@a", 1, 2],
    ["@a b", 4, 4],
  ]) {
    assert.equal(findMention(value, start, end), null);
  }
});

test("mention candidates are unique loaded authors, matched without case sensitivity", () => {
  const { mentionCandidates } = loadSource("utils/mentions.ts");
  const comments = ["Alice", "alice", "Alfred", "bob"].map((login) => ({
    user: { login },
  }));
  assert.deepEqual(Array.from(mentionCandidates(comments, "AL")), [
    "Alice",
    "Alfred",
  ]);
});
