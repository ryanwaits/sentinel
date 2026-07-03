export function SentinelMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path
        d="M22,8 A11,11 0 0,0 11,19 L11,45 A11,11 0 0,0 22,56 L22,48 A3,3 0 0,1 19,45 L19,19 A3,3 0 0,1 22,16 Z"
        fill="currentColor"
      />
      <path
        d="M42,8 A11,11 0 0,1 53,19 L53,45 A11,11 0 0,1 42,56 L42,48 A3,3 0 0,0 45,45 L45,19 A3,3 0 0,0 42,16 Z"
        fill="currentColor"
      />
      <circle cx="32" cy="32" r="5" fill="var(--primary)" />
    </svg>
  )
}
