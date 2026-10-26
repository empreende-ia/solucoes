import React from 'react';
import { cn } from '@/lib/utils';

const SIZES = {
  xs: 'h-6 w-6 rounded-md text-xs',
  sm: 'h-8 w-8 rounded-lg text-xs',
  md: 'h-9 w-9 rounded-lg text-sm',
  lg: 'h-11 w-11 rounded-xl text-base',
} as const;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface InitialsAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  size?: keyof typeof SIZES;
  /** Foto real (ex.: avatar do WhatsApp) — cai pras iniciais se ausente ou falhar */
  src?: string | null;
}

/** Avatar squircle com iniciais (ou foto, quando disponível) — substitui os círculos com gradiente do template. */
export const InitialsAvatar: React.FC<InitialsAvatarProps> = ({ name, size = 'md', src, className, ...props }) => {
  const [imgFailed, setImgFailed] = React.useState(false);
  const showImg = Boolean(src) && !imgFailed;

  return (
    <div
      className={cn(
        'flex shrink-0 select-none items-center justify-center overflow-hidden font-semibold',
        SIZES[size],
        !showImg && 'eia-avatar',
        className
      )}
      {...props}
    >
      {showImg ? (
        <img
          src={src as string}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        initialsOf(name || '?')
      )}
    </div>
  );
};

export default InitialsAvatar;
