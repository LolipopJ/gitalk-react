import React from "react";

export interface ButtonProps
  extends React.DetailedHTMLProps<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  > {
  text: string;
  isLoading?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  text,
  isLoading = false,
  className = "",
  disabled,
  ...restProps
}) => (
  <button
    className={`gt-btn ${className}`}
    disabled={disabled !== undefined ? disabled : isLoading}
    {...restProps}
  >
    <span className="gt-btn-text">{text}</span>
    {isLoading && <span className="gt-btn-loading gt-spinner" />}
  </button>
);

export default Button;
