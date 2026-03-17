interface LogoSVGProps {
  width?: number;
  height?: number;
  variant?: 'mark' | 'full' | 'mono';
  className?: string;
}

export default function LogoSVG({
  width = 48,
  height = 48,
  variant = 'mark',
  className = ''
}: LogoSVGProps) {

  if (variant === 'mark') {
    return (
      <svg
        width={width}
        height={height}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        <defs>
          <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00D1FF" />
            <stop offset="100%" stopColor="#2F6BFF" />
          </linearGradient>
          <filter id="innerGlow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Hexagon outline */}
        <path
          d="M100 20 L170 60 L170 140 L100 180 L30 140 L30 60 Z"
          fill="none"
          stroke="url(#logoGradient)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Removed 'A' and Arrow as per user request */}
      </svg>
    );
  }

  if (variant === 'mono') {
    return (
      <svg
        width={width}
        height={height}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        {/* Hexagon outline */}
        <path
          d="M100 20 L170 60 L170 140 L100 180 L30 140 L30 60 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // Full logo with text
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 500 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="logoGradientFull" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00D1FF" />
          <stop offset="100%" stopColor="#2F6BFF" />
        </linearGradient>
        <filter id="innerGlowFull">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Hexagon mark */}
      <path
        d="M100 20 L170 60 L170 140 L100 180 L30 140 L30 60 Z"
        fill="none"
        stroke="url(#logoGradientFull)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* SentinelPay text */}
      <text
        x="210"
        y="120"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="48"
        fontWeight="700"
        fill="#E6E9EF"
        letterSpacing="-1"
      >
        SentinelPay
      </text>
    </svg>
  );
}