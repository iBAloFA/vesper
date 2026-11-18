import { useMemo } from "react";
import { buildSigil } from "../lib/sigil";

interface SigilProps {
  seed: string;
  size?: number;
  className?: string;
  title?: string;
}

export function Sigil({ seed, size = 220, className = "", title = "Vesper sigil" }: SigilProps) {
  const geometry = useMemo(() => buildSigil(seed), [seed]);
  const [primary, secondary] = geometry.colors;

  return (
    <svg
      className={`sigil ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <g fill="none" strokeLinecap="round">
        <circle cx="100" cy="100" r="96" stroke={primary} strokeWidth="0.6" opacity="0.18" />
        {geometry.rings.map((ring, index) => (
          <circle
            key={`ring-${index}`}
            cx="100"
            cy="100"
            r={ring.radius}
            stroke={primary}
            strokeWidth={ring.width}
            strokeDasharray={ring.dash}
            opacity={ring.opacity}
            transform={`rotate(${ring.rotation} 100 100)`}
          />
        ))}
        {geometry.lines.map((line, index) => (
          <line
            key={`line-${index}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={secondary}
            strokeWidth={line.width}
            opacity={line.opacity}
          />
        ))}
      </g>
      {geometry.dots.map((dot, index) => (
        <circle
          key={`dot-${index}`}
          cx={dot.cx}
          cy={dot.cy}
          r={dot.r}
          fill={secondary}
          opacity={dot.opacity}
        />
      ))}
      <g
        transform={`rotate(${geometry.centerRotation} 100 100)`}
        stroke={primary}
        strokeLinecap="round"
        fill="none"
      >
        <circle cx="100" cy="100" r="13" opacity="0.7" strokeWidth="1.2" />
        <path d="M100 76 L100 124" opacity="0.6" strokeWidth="1" />
        <path d="M84 100 L116 100" opacity="0.35" strokeWidth="0.7" />
      </g>
    </svg>
  );
}
