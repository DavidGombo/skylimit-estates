// Skylimit Estates brand mark — double-chevron icon.
// `color` controls the chevron fill; defaults to currentColor so it adapts to context.
export function BrandMark({ className = "", color }: { className?: string; color?: string }) {
  const c = color || "currentColor";
  return (
    <svg viewBox="0 0 100 112" className={className} fill="none" aria-label="Skylimit Estates" role="img">
      {/* top chevron band (open) */}
      <path d="M16 60 L16 42 L50 19 L84 42 L84 54 L50 31 L16 54 Z" fill={c} />
      {/* bottom chevron band (thicker, with inner notch) */}
      <path
        d="M16 95 L16 66 L50 43 L84 66 L84 95 L50 72 L16 95 Z M28 73 L28 84 L50 69 L72 84 L72 73 L50 58 Z"
        fill={c}
        fillRule="evenodd"
      />
    </svg>
  );
}
