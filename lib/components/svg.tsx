import React from "react";

export interface SVGProps extends React.HTMLAttributes<HTMLSpanElement> {
  icon: string;
  text?: string;
}

const Svg: React.FC<SVGProps> = ({ icon, text, className, ...restProps }) => (
  <span className={`gt-ico ${className}`} {...restProps}>
    <span
      className="gt-svg"
      dangerouslySetInnerHTML={{
        __html: icon,
      }}
    />
    {text && <span className="gt-ico-text">{text}</span>}
  </span>
);

export default Svg;
