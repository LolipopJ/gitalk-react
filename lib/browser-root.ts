import React from "react";

import GitalkComponent, { type GitalkProps } from "./gitalk";

export interface BrowserRoot {
  render(element: React.ReactElement): void;
  unmount(): void;
}

export default class BrowserGitalk {
  private container: HTMLElement | null = null;
  private root: BrowserRoot | null = null;

  constructor(
    private readonly options: GitalkProps,
    private readonly createRoot: (container: HTMLElement) => BrowserRoot,
  ) {}

  render(containerId: string): void {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Gitalk container not found: ${containerId}`);
    }

    if (this.container !== container) this.destroy();
    this.root ??= this.createRoot(container);
    this.container = container;
    this.root.render(React.createElement(GitalkComponent, this.options));
  }

  destroy(): void {
    this.root?.unmount();
    this.root = null;
    this.container = null;
  }
}
