interface Props {
  className?: string;
  size?: number;
}

export default function Logo({ className = "", size = 40 }: Props) {
  return (
    <img
      src="/logo.png"
      alt="ShortForge"
      width={size}
      height={size}
      className={`object-contain ${className}`}
    />
  );
}
