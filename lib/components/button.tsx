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
  style,
  disabled: propsDisabled,
  ...restProps
}) => {
  const disabled = propsDisabled !== undefined ? propsDisabled : isLoading;

  return (
    <button
      className={`gt-btn ${className}`}
      style={{ cursor: disabled ? "not-allowed" : undefined, ...style }}
      disabled={disabled}
      {...restProps}
    >
      <span className="gt-btn-text">{text}</span>
      {isLoading && <span className="gt-btn-loading gt-spinner" />}
    </button>
  );
};

export default Button;
