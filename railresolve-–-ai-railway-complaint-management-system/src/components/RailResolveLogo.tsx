interface RailResolveLogoProps {
  size?: 'sm' | 'md';
  showWordmark?: boolean;
  tone?: 'dark-bg' | 'light-bg';
}

export function RailResolveLogo({
  size = 'md',
  showWordmark = true,
  tone = 'dark-bg',
}: RailResolveLogoProps) {
  const iconDim = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  const textColor = tone === 'dark-bg' ? 'text-white' : 'text-[#0B1F3A]';

  return (
    <span className="inline-flex items-center gap-2.5 select-none whitespace-nowrap shrink-0">
      <svg
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${iconDim} shrink-0`}
        aria-hidden="true"
      >
        {/* Outer Shield Crest */}
        <path
          d="M20 2.5L35 7.8V19.5C35 28.4 28.6 35.1 20 38C11.4 35.1 5 28.4 5 19.5V7.8L20 2.5Z"
          fill="#0F294D"
          stroke="#F59E0B"
          strokeWidth="1.85"
        />
        {/* Upper Locomotive Arch (Vande Bharat White & Saffron Nose) */}
        <path
          d="M13 13.5C13 11.2909 14.7909 9.5 17 9.5H23C25.2091 9.5 27 11.2909 27 13.5V21C27 22.6569 25.6569 24 24 24H16C14.3431 24 13 22.6569 13 21V13.5Z"
          fill="#FFFFFF"
        />
        <path d="M13 18.2H27V19.4H13V18.2Z" fill="#FF9933" />
        {/* Front Windshield */}
        <rect x="15.2" y="11.6" width="9.6" height="4.8" rx="1.2" fill="#0B1F3A" />
        {/* Twin Headlamps */}
        <circle cx="16.5" cy="21.4" r="1.35" fill="#F59E0B" />
        <circle cx="23.5" cy="21.4" r="1.35" fill="#F59E0B" />
        {/* Converging Steel Rails */}
        <path
          d="M15.5 24.5L10.5 32.5M24.5 24.5L29.5 32.5"
          stroke="#F59E0B"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Sleeper Ties (Tricolor Inspired) */}
        <path
          d="M13.5 27.6H26.5"
          stroke="#FF9933"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path
          d="M12.5 29.8H27.5"
          stroke="#FFFFFF"
          strokeOpacity="0.9"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <path
          d="M11.6 32H28.4"
          stroke="#10B981"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>

      {showWordmark && (
        <span
          className={`font-display text-lg font-bold tracking-tight ${textColor}`}
        >
          Rail<span className="text-amber-400">Resolve</span>
        </span>
      )}
    </span>
  );
}
