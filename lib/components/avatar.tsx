import React, { useState } from "react";

import { DEFAULT_AVATAR } from "../constants";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
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
    <div className={`gt-avatar ${className}`} {...restProps}>
      <img
        src={imgSrc}
        alt={`@${alt}`}
        onError={() => {
          setImgSrc(defaultSrc);
        }}
      />
    </div>
  );
};

export default Avatar;
