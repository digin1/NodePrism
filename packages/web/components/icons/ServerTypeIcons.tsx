import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

/**
 * cPanel logo — stylized "cP" swoosh mark (orange)
 */
export function CpanelIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"
        fill="#FF6C2C"
        opacity="0.15"
      />
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"
        stroke="#FF6C2C"
        strokeWidth="1.5"
        fill="none"
      />
      <text
        x="12"
        y="16.5"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        fill="#FF6C2C"
      >
        cP
      </text>
    </svg>
  );
}

/**
 * KVM logo — kernel virtual machine chip icon (teal/blue)
 */
export function KvmIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Chip body */}
      <rect x="5" y="5" width="14" height="14" rx="2" fill="#0EA5E9" opacity="0.15" stroke="#0EA5E9" strokeWidth="1.5" />
      {/* Pins - top */}
      <line x1="9" y1="2" x2="9" y2="5" stroke="#0EA5E9" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="15" y1="2" x2="15" y2="5" stroke="#0EA5E9" strokeWidth="1.5" strokeLinecap="round" />
      {/* Pins - bottom */}
      <line x1="9" y1="19" x2="9" y2="22" stroke="#0EA5E9" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="15" y1="19" x2="15" y2="22" stroke="#0EA5E9" strokeWidth="1.5" strokeLinecap="round" />
      {/* Pins - left */}
      <line x1="2" y1="9" x2="5" y2="9" stroke="#0EA5E9" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="15" x2="5" y2="15" stroke="#0EA5E9" strokeWidth="1.5" strokeLinecap="round" />
      {/* Pins - right */}
      <line x1="19" y1="9" x2="22" y2="9" stroke="#0EA5E9" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="19" y1="15" x2="22" y2="15" stroke="#0EA5E9" strokeWidth="1.5" strokeLinecap="round" />
      {/* Inner circuit lines */}
      <path d="M9 9h6v6H9z" stroke="#0EA5E9" strokeWidth="1" fill="#0EA5E9" opacity="0.3" rx="0.5" />
    </svg>
  );
}

/**
 * OpenVZ logo — container stack icon (blue/indigo)
 */
export function OpenVZIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Bottom container */}
      <rect x="3" y="15" width="18" height="6" rx="1.5" fill="currentColor" opacity="0.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6.5" cy="18" r="1" fill="currentColor" />
      {/* Middle container */}
      <rect x="3" y="8.5" width="18" height="6" rx="1.5" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6.5" cy="11.5" r="1" fill="currentColor" />
      {/* Top container */}
      <rect x="3" y="2" width="18" height="6" rx="1.5" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6.5" cy="5" r="1" fill="currentColor" />
    </svg>
  );
}

const typeIconMap: Record<string, React.FC<IconProps>> = {
  KVM: KvmIcon,
  cPanel: CpanelIcon,
  OpenVZ: OpenVZIcon,
};

const typeColorMap: Record<string, string> = {
  KVM: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  cPanel: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  OpenVZ: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
};

/**
 * Renders a server type badge with icon and label.
 */
export function ServerTypeBadge({ type }: { type: string }) {
  const IconComponent = typeIconMap[type];
  const colors = typeColorMap[type] || 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${colors}`}>
      {IconComponent && <IconComponent size={14} />}
      {type}
    </span>
  );
}

export const SERVER_TYPE_TAGS = ['KVM', 'cPanel', 'OpenVZ'] as const;

export function isServerTypeTag(tag: string): boolean {
  return (SERVER_TYPE_TAGS as readonly string[]).includes(tag);
}
