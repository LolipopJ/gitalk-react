import React, { createRef } from "react";

interface Props {
  children: React.ReactElement[];
}

interface State {
  children: React.ReactElement[];
  items: React.ReactElement[];
  entering: Set<React.Key | null>;
}

type Positions = Map<string, number>;

// CSS handles the animation. Retain exiting rows and measure positions before
// React changes the DOM so reordered rows can transition from their old places.
class AnimatedComments extends React.Component<Props, State, Positions> {
  container = createRef<HTMLDivElement>();

  override state: State = {
    children: this.props.children,
    items: this.props.children,
    entering: new Set(this.props.children.map((child) => child.key)),
  };

  static getDerivedStateFromProps({ children }: Props, state: State) {
    if (children === state.children) return null;
    const keys = new Set(children.map((child) => child.key));
    const previousKeys = new Set(state.children.map((child) => child.key));
    return {
      children,
      items: [
        ...children,
        ...state.items.filter((item) => !keys.has(item.key)),
      ],
      entering: new Set([
        ...state.entering,
        ...children
          .filter((child) => !previousKeys.has(child.key))
          .map((child) => child.key),
      ]),
    };
  }

  override getSnapshotBeforeUpdate(): Positions {
    const container = this.container.current;
    if (!container) return new Map();
    const top = container.getBoundingClientRect().top;
    return new Map(
      Array.from(container.children, (child) => {
        const row = child as HTMLDivElement;
        return [row.dataset["key"]!, row.getBoundingClientRect().top - top];
      }),
    );
  }

  override componentDidUpdate(
    _previousProps: Props,
    _previousState: State,
    positions: Positions,
  ) {
    const container = this.container.current;
    if (!container) return;
    const keys = new Set(this.props.children.map((child) => String(child.key)));
    const moving: HTMLDivElement[] = [];
    for (const child of Array.from(container.children)) {
      const row = child as HTMLDivElement;
      const key = row.dataset["key"]!;
      const previousTop = positions.get(key);
      if (!keys.has(key)) {
        row.style.top = `${previousTop ?? 0}px`;
        row.inert = true;
      } else if (previousTop !== undefined) {
        row.inert = false;
        const delta = previousTop - row.offsetTop;
        if (delta) {
          row.style.transition = "none";
          row.style.transform = `translateY(${delta}px)`;
          moving.push(row);
        }
      }
    }
    if (moving.length) {
      // Commit the inverted positions before CSS transitions to the new layout.
      void container.offsetHeight;
      for (const row of moving) {
        row.style.transition = "";
        row.style.transform = "";
      }
    }
  }

  override render() {
    const keys = new Set(this.props.children.map((child) => child.key));
    return (
      <div className="gt-comment-list" ref={this.container}>
        {this.state.items.map((item) => {
          const leaving = !keys.has(item.key);
          return (
            <div
              key={item.key}
              data-key={item.key}
              className={`gt-comment-item${leaving ? " gt-comment-item--leaving" : this.state.entering.has(item.key) ? " gt-comment-item--entering" : ""}`}
              aria-hidden={leaving || undefined}
              onAnimationEnd={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.animationName === "gt-comment-enter") {
                  this.setState((state) => {
                    const entering = new Set(state.entering);
                    entering.delete(item.key);
                    return { entering };
                  });
                  return;
                }
                if (event.animationName !== "gt-comment-leave") return;
                this.setState((state) => ({
                  items: state.items.filter(
                    (child) =>
                      child.key !== item.key ||
                      state.children.some(
                        (current) => current.key === item.key,
                      ),
                  ),
                  entering: new Set(
                    [...state.entering].filter((key) => key !== item.key),
                  ),
                }));
              }}
            >
              <div>{item}</div>
            </div>
          );
        })}
      </div>
    );
  }
}

export default AnimatedComments;
