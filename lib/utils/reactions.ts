export const REACTIONS = [
  { content: "THUMBS_UP", restKey: "+1", emoji: "👍", label: "Thumbs up" },
  { content: "THUMBS_DOWN", restKey: "-1", emoji: "👎", label: "Thumbs down" },
  { content: "LAUGH", restKey: "laugh", emoji: "😄", label: "Laugh" },
  { content: "HOORAY", restKey: "hooray", emoji: "🎉", label: "Hooray" },
  { content: "CONFUSED", restKey: "confused", emoji: "😕", label: "Confused" },
  { content: "HEART", restKey: "heart", emoji: "❤️", label: "Heart" },
  { content: "ROCKET", restKey: "rocket", emoji: "🚀", label: "Rocket" },
  { content: "EYES", restKey: "eyes", emoji: "👀", label: "Eyes" },
] as const;

export type ReactionContent = (typeof REACTIONS)[number]["content"];
export type Reactions = Record<
  ReactionContent,
  {
    totalCount: number;
    viewerHasReacted: boolean;
  }
>;
export interface ReactionGroup {
  content: ReactionContent;
  viewerHasReacted: boolean;
  reactors: { totalCount: number };
}

export const reactionsFromRest = (
  counts?: Partial<Record<(typeof REACTIONS)[number]["restKey"], number>>,
): Reactions =>
  Object.fromEntries(
    REACTIONS.map(({ content, restKey }) => [
      content,
      { totalCount: counts?.[restKey] ?? 0, viewerHasReacted: false },
    ]),
  ) as Reactions;

export const reactionsFromGroups = (groups: ReactionGroup[]): Reactions => {
  const reactions = reactionsFromRest();
  for (const group of groups) {
    reactions[group.content] = {
      totalCount: group.reactors.totalCount,
      viewerHasReacted: group.viewerHasReacted,
    };
  }
  return reactions;
};
