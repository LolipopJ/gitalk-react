import assert from "node:assert/strict";
import test from "node:test";

import { loadSource } from "./helpers/source.mjs";

test("all eight REST reaction counts become independent anonymous states", () => {
  const { REACTIONS, reactionsFromRest } = loadSource("utils/reactions.ts");
  assert.equal(REACTIONS.length, 8);
  const counts = Object.fromEntries(
    REACTIONS.map((r, i) => [r.restKey, i + 1]),
  );
  const states = reactionsFromRest(counts);
  REACTIONS.forEach((r, i) => {
    assert.equal(states[r.content].totalCount, i + 1);
    assert.equal(states[r.content].viewerHasReacted, false);
  });
});

test("GraphQL batches all reaction groups with viewer state and parameterized mutations", () => {
  const { REACTIONS, reactionsFromGroups } = loadSource("utils/reactions.ts");
  const { getIssueCommentsQL, getCommentReactionMutationQL } = loadSource(
    "services/graphql/comment.ts",
  );
  const query = getIssueCommentsQL({ pagerDirection: "last" });
  assert.match(query, /reactionGroups\s*\{/);
  assert.match(query, /viewerHasReacted/);
  assert.match(query, /reactors\(first: 1\)/);
  const states = reactionsFromGroups(
    REACTIONS.map((r, i) => ({
      content: r.content,
      viewerHasReacted: i % 2 === 0,
      reactors: { totalCount: 150 + i },
    })),
  );
  REACTIONS.forEach((r, i) => {
    assert.equal(states[r.content].totalCount, 150 + i);
    assert.equal(states[r.content].viewerHasReacted, i % 2 === 0);
  });
  for (const add of [true, false]) {
    const mutation = getCommentReactionMutationQL(add);
    assert.match(mutation, /\$content: ReactionContent!/);
    assert.match(mutation, /content: \$content/);
    assert.match(mutation, new RegExp(add ? "addReaction" : "removeReaction"));
    assert.match(mutation, /reactionGroups/);
  }
});
