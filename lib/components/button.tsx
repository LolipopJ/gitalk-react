import React from "react";

export interface ButtonProps extends React.HTMLAttributes<HTMLButtonElement> {
  text: string;
  isLoading?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  text,
  isLoading = false,
  className = "",
  ...restProps
}) => (
  <button className={`gt-btn ${className}`} disabled={isLoading} {...restProps}>
    <span className="gt-btn-text">{text}</span>
    {isLoading && <span className="gt-btn-loading gt-spinner" />}
  </button>
);

export default Button;
