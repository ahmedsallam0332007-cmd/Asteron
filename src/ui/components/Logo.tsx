export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id="lg-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#EBDDFF" />
          <stop offset=".5" stopColor="#B58BE8" />
          <stop offset="1" stopColor="#7B3FE4" />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="50" rx="46" ry="18" fill="none" stroke="url(#lg-a)" strokeWidth="4" transform="rotate(-25 50 50)" />
      <path d="M50 12 L57 43 L88 50 L57 57 L50 88 L43 57 L12 50 L43 43Z" fill="url(#lg-a)" />
    </svg>
  )
}
