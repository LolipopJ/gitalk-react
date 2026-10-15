import type {
  Gitalk as Component,
  GitalkProps as Props,
} from "./gitalk.d.mts" with { "resolution-mode": "import" };

declare const Gitalk: typeof Component & {
  Gitalk: typeof Component;
};

declare namespace Gitalk {
  type GitalkProps = Props;
}

export = Gitalk;
