import React from "react";

export interface ActionProps
  extends React.DetailedHTMLProps<
    React.AnchorHTMLAttributes<HTMLAnchorElement>,
    HTMLAnchorElement
  > {
  text: string;
}

const Action: React.FC<ActionProps> = ({
  text,
  className = "",
  ...restProps
}) => (
  <a className={`gt-action ${className}`} {...restProps}>
    <span className="gt-action-text">{text}</span>
  </a>
);

export default Action;
