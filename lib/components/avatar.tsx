import React, { useState } from "react";

import { DEFAULT_AVATAR } from "../constants";

export interface AvatarProps
  extends React.DetailedHTMLProps<
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
  const [imgSrc, setImgSrc] = useState<string>(src ?? defaultSrc);

  return (
    <a
      className={`gt-avatar ${className}`}
      target="_blank"
      rel="noopener noreferrer"
      {...restProps}
    >
      <img
        src={imgSrc}
        alt={`@${alt}`}
        onError={() => {
          setImgSrc(defaultSrc);
        }}
      />
    </a>
  );
};

export default Avatar;
