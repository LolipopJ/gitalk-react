import cn from "classnames";
import React from "react";

export interface ActionProps extends React.DetailedHTMLProps<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  HTMLButtonElement
> {
  text: string;
}

const Action: React.FC<ActionProps> = ({
  text,
  className = "",
  type = "button",
  ...restProps
}) => (
  <button type={type} className={cn("gt-action", className)} {...restProps}>
    <span className="gt-action-text">{text}</span>
  </button>
);

export default Action;
