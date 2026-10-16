import ReactDOM from "react-dom";

import BrowserGitalk, { type BrowserRoot } from "./browser-root";
import type { GitalkProps } from "./gitalk";

export default class Gitalk extends BrowserGitalk {
  constructor(options: GitalkProps) {
    super(options, (container) => {
      const runtime = ReactDOM as typeof ReactDOM & {
        createRoot?: (container: HTMLElement) => BrowserRoot;
      };
      if (typeof runtime.createRoot === "function") {
        return runtime.createRoot(container);
      }

      return {
        render: (element) => {
          ReactDOM.render(element, container);
        },
        unmount: () => {
          ReactDOM.unmountComponentAtNode(container);
        },
      };
    });
  }
}
