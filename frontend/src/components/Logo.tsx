import { useId } from "react";

interface Props {
  className?: string;
  size?: number;
}

export default function Logo({ className = "", size = 28 }: Props) {
  const id = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF8A57" />
          <stop offset="0.55" stopColor="#FF4D7E" />
          <stop offset="1" stopColor="#8B6CFF" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id})`} />
      <rect x="10.5" y="5" width="11" height="22" rx="2.5" fill="none" stroke="#fff" strokeWidth="1.8" />
      <path d="M13.5 20.5 18.5 11.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
