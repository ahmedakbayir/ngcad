import * as React from 'react';
import { cn, initials } from '@/lib/utils';

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  name?: string;
  size?: number;
}

export function Avatar({ src, name, size = 36, className, ...props }: AvatarProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground font-medium',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      {...props}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name ?? ''} className="h-full w-full object-cover" />
      ) : (
        <span>{initials(name ?? '?')}</span>
      )}
    </div>
  );
}
