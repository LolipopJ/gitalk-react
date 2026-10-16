import { createRoot } from "react-dom-latest/client";

import BrowserGitalk from "./browser-root";
import type { GitalkProps } from "./gitalk";

export default class Gitalk extends BrowserGitalk {
  constructor(options: GitalkProps) {
    super(options, createRoot);
  }
}
