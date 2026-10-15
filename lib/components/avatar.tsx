import cn from "classnames";
import React, { useState } from "react";

import { DEFAULT_AVATAR } from "../constants";

export interface AvatarProps extends React.DetailedHTMLProps<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  HTMLAnchorElement
> {
  src?: string;
  alt?: string;
  defaultSrc?: string;
}

const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  defaultSrc = DEFAULT_AVATAR,
  className = "",
  ...restProps
}) => {
  const [failedSrc, setFailedSrc] = useState<string>();
  const imgSrc = src === failedSrc ? defaultSrc : (src ?? defaultSrc);

  return (
    <a
      className={cn("gt-avatar", className)}
      target="_blank"
      rel="noopener noreferrer"
      {...restProps}
    >
      <img
        src={imgSrc}
        alt={`@${alt}`}
        onError={() => {
          setFailedSrc(src);
        }}
      />
    </a>
  );
};

export default Avatar;
