import type { CSSProperties, ReactNode } from 'react';

/**
 * Ícones próprios, FLAT: formas sólidas de uma cor (currentColor), sem contorno fino, sombra
 * ou gradiente. Grade de 24 px. Recortes por regra par-ímpar; traços, quando existem, têm
 * 2,4 px e pontas redondas (peso visual igual ao das formas cheias).
 */
export type IconName =
  | 'play'
  | 'pause'
  | 'stop'
  | 'mute'
  | 'solo'
  | 'import'
  | 'stems'
  | 'analyze'
  | 'practice'
  | 'export'
  | 'wave'
  | 'sun'
  | 'moon'
  | 'scissors'
  | 'staff'
  | 'tab'
  | 'bass'
  | 'drums'
  | 'guitar'
  | 'piano'
  | 'vocals'
  | 'backing'
  | 'other'
  | 'original'
  | 'check'
  | 'alert'
  | 'library'
  | 'highway'
  | 'metronome'
  | 'loop'
  | 'plus'
  | 'minus'
  | 'back'
  | 'exercise'
  | 'link'
  | 'external'
  | 'midi'
  | 'close'
  | 'trash';

interface Props {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const GLYPHS: Record<IconName, ReactNode> = {
  play: <path d="M7 4.2v15.6a.8.8 0 0 0 1.2.7l12.3-7.8a.8.8 0 0 0 0-1.4L8.2 3.5a.8.8 0 0 0-1.2.7z" />,
  pause: (
    <>
      <rect x="5.5" y="4" width="4.6" height="16" rx="1.4" />
      <rect x="13.9" y="4" width="4.6" height="16" rx="1.4" />
    </>
  ),
  stop: <rect x="5" y="5" width="14" height="14" rx="2.4" />,
  mute: (
    <>
      <path d="M3 9.2h3.8L12 4.6v14.8l-5.2-4.6H3z" />
      <rect x="13.6" y="10.9" width="8.6" height="2.4" rx="1.2" transform="rotate(45 17.9 12.1)" />
      <rect x="13.6" y="10.9" width="8.6" height="2.4" rx="1.2" transform="rotate(-45 17.9 12.1)" />
    </>
  ),
  solo: <path d="M3 12a9 9 0 0 1 18 0v6a2 2 0 0 1-2 2h-2a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h2v-1a7 7 0 0 0-14 0v1h2a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2z" />,
  import: (
    <>
      <path d="M10.8 3h2.4v8.4l3-3 1.7 1.7L12 16 6.1 10.1l1.7-1.7 3 3z" />
      <path d="M3.5 15h2.4v3.1h12.2V15h2.4v5.5h-17z" />
    </>
  ),
  export: (
    <>
      <path d="M10.8 15.5h2.4V7.1l3 3 1.7-1.7L12 2.5 6.1 8.4l1.7 1.7 3-3z" />
      <path d="M3.5 15h2.4v3.1h12.2V15h2.4v5.5h-17z" />
    </>
  ),
  stems: (
    <>
      <rect x="3" y="4" width="18" height="4" rx="2" />
      <rect x="3" y="10" width="13" height="4" rx="2" />
      <rect x="3" y="16" width="8" height="4" rx="2" />
    </>
  ),
  analyze: (
    <>
      <rect x="3" y="12" width="4" height="8" rx="1.2" />
      <rect x="10" y="7" width="4" height="13" rx="1.2" />
      <rect x="17" y="3" width="4" height="17" rx="1.2" />
    </>
  ),
  practice: (
    <>
      <rect x="2.5" y="15" width="4.2" height="5.5" rx="1.2" />
      <rect x="7.8" y="11" width="4.2" height="9.5" rx="1.2" />
      <rect x="13.1" y="7" width="4.2" height="13.5" rx="1.2" />
      <circle cx="19.6" cy="5.4" r="2.4" />
    </>
  ),
  exercise: (
    <>
      <rect x="2.5" y="15" width="4.2" height="5.5" rx="1.2" />
      <rect x="7.8" y="11" width="4.2" height="9.5" rx="1.2" />
      <rect x="13.1" y="7" width="4.2" height="13.5" rx="1.2" />
      <circle cx="19.6" cy="5.4" r="2.4" />
    </>
  ),
  wave: (
    <>
      <rect x="2.6" y="9.5" width="2.4" height="5" rx="1.2" />
      <rect x="6.8" y="6" width="2.4" height="12" rx="1.2" />
      <rect x="11" y="2.5" width="2.4" height="19" rx="1.2" />
      <rect x="15.2" y="7" width="2.4" height="10" rx="1.2" />
      <rect x="19.4" y="10" width="2.4" height="4" rx="1.2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.6" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <rect key={a} x="10.9" y="1" width="2.2" height="3.8" rx="1.1" transform={`rotate(${a} 12 12)`} />
      ))}
    </>
  ),
  moon: <path d="M20.5 14.6A9 9 0 1 1 9.4 3.5a7.2 7.2 0 0 0 11.1 11.1z" />,
  scissors: (
    <path
      fillRule="evenodd"
      d="M6.5 2.8a3.7 3.7 0 1 1 0 7.4 3.7 3.7 0 0 1 0-7.4zm0 2a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zM6.5 13.8a3.7 3.7 0 1 1 0 7.4 3.7 3.7 0 0 1 0-7.4zm0 2a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zM9.3 8.6 21 17.6v2.3L8.3 10.6zM9.3 15.4 21 6.4V4.1L8.3 13.4z"
    />
  ),
  staff: (
    <>
      {[5, 9, 13, 17].map((y) => (
        <rect key={y} x="2.5" y={y} width="19" height="1.8" rx="0.9" />
      ))}
      <ellipse cx="9" cy="15.9" rx="3" ry="2.3" transform="rotate(-20 9 15.9)" />
      <rect x="10.9" y="4" width="1.8" height="12" rx="0.9" />
    </>
  ),
  tab: (
    <path d="M4 3h3v18H4zM10.5 6H20v2.6h-3.4V20h-2.7V8.6h-3.4z" />
  ),
  highway: (
    <path d="M9.5 3h2v18h-6zM12.5 3h2l4 18h-6z" />
  ),
  bass: (
    <>
      <path d="M8.9 10.6c-1.4-1-3.5-.8-4.7.5-1 1-1.1 2.3-.5 3.2-1 .9-1.6 2.4-.8 3.8.9 1.7 3.1 2.4 4.8 1.6 1.3-.6 2.1-1.9 2.1-3.1 1.4 0 2.6-.8 2.9-2.2.2-1-.3-2-1.2-2.5z" />
      <path d="M10.2 13.2 18.7 4.7l1.6 1.6-8.5 8.5z" />
      <path d="M17.6 3.6 19.9 1.3l2.8 2.8-2.3 2.3z" />
    </>
  ),
  guitar: (
    <>
      <circle cx="8" cy="16" r="5.4" />
      <circle cx="11.2" cy="12.8" r="3.6" />
      <path d="M11.4 12.6 18.4 5.6l1.6 1.6-7 7z" />
      <path d="M17.4 4.6 19.7 2.3l2.4 2.4-2.3 2.3z" />
    </>
  ),
  drums: (
    <>
      <ellipse cx="12" cy="9.6" rx="8.5" ry="2.9" />
      <path d="M3.5 11.6c1.5 1.3 4.8 2.2 8.5 2.2s7-.9 8.5-2.2V17c0 1.7-3.8 3-8.5 3s-8.5-1.3-8.5-3z" />
      <rect x="3.4" y="3.6" width="8.2" height="2" rx="1" transform="rotate(35 7.5 4.6)" />
      <rect x="12.4" y="3.6" width="8.2" height="2" rx="1" transform="rotate(-35 16.5 4.6)" />
    </>
  ),
  piano: (
    <>
      <path fillRule="evenodd" d="M4.5 4h15A2.5 2.5 0 0 1 22 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5v-11A2.5 2.5 0 0 1 4.5 4zM4 6v12h4.7V6zm6.6 0v12h4.7V6zm6.6 0v12H20V6z" />
      <rect x="7.4" y="6" width="2.6" height="7" rx="0.6" />
      <rect x="14" y="6" width="2.6" height="7" rx="0.6" />
    </>
  ),
  vocals: (
    <>
      <rect x="8.6" y="2" width="6.8" height="11.4" rx="3.4" />
      <path d="M5.2 10.6h2a4.8 4.8 0 0 0 9.6 0h2a6.8 6.8 0 0 1-5.8 6.7V20h3.2v2H7.8v-2H11v-2.7a6.8 6.8 0 0 1-5.8-6.7z" />
    </>
  ),
  backing: (
    <>
      <rect x="3" y="3" width="5.4" height="9" rx="2.7" />
      <rect x="15.6" y="3" width="5.4" height="9" rx="2.7" />
      <path d="M4.7 13.4h2v7.1h-2zM17.3 13.4h2v7.1h-2z" />
      <rect x="9.6" y="6.5" width="4.8" height="8" rx="2.4" />
      <path d="M11 15.6h2v4.9h-2z" />
    </>
  ),
  other: (
    <>
      <circle cx="5" cy="12" r="2.4" />
      <circle cx="12" cy="12" r="2.4" />
      <circle cx="19" cy="12" r="2.4" />
    </>
  ),
  original: <path fillRule="evenodd" d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zm0 6.6a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8z" />,
  check: <path d="M9.4 17.2 3.9 11.7l1.8-1.8 3.7 3.7 8.9-8.9 1.8 1.8z" />,
  alert: <path fillRule="evenodd" d="M10.3 3.4a2 2 0 0 1 3.4 0l8.4 14.6a2 2 0 0 1-1.7 3H3.6a2 2 0 0 1-1.7-3zM10.9 8.5v6.2h2.2V8.5zm0 7.9v2.2h2.2v-2.2z" />,
  library: (
    <>
      <rect x="3" y="4" width="4" height="16" rx="1" />
      <rect x="8.5" y="4" width="4" height="16" rx="1" />
      <rect x="15.2" y="4.2" width="4" height="16" rx="1" transform="rotate(-14 17.2 12.2)" />
    </>
  ),
  metronome: <path fillRule="evenodd" d="M9.6 2h4.8a1.5 1.5 0 0 1 1.45 1.1L20.3 20a1.5 1.5 0 0 1-1.45 2H5.15A1.5 1.5 0 0 1 3.7 20L8.15 3.1A1.5 1.5 0 0 1 9.6 2zm4.6 6.1-3.1 9.6 1.7.5 3.1-9.6z" />,
  loop: (
    <>
      <path {...S} d="M4 12.5V12a5.5 5.5 0 0 1 5.5-5.5h7.5" />
      <path d="M15.8 2.4 21 6.5l-5.2 4.1z" />
      <path {...S} d="M20 11.5v.5a5.5 5.5 0 0 1-5.5 5.5H7" />
      <path d="M8.2 13.4 3 17.5l5.2 4.1z" />
    </>
  ),
  plus: <path d="M10.8 4h2.4v6.8H20v2.4h-6.8V20h-2.4v-6.8H4v-2.4h6.8z" />,
  minus: <rect x="4" y="10.8" width="16" height="2.4" rx="1.2" />,
  trash: <path fillRule="evenodd" d="M9 3h6l.8 1.6H20v2.2H4V4.6h4.2zM5.6 8.4h12.8l-.9 11.2a1.6 1.6 0 0 1-1.6 1.4H8.1a1.6 1.6 0 0 1-1.6-1.4zm4 2.4v7.6h1.8v-7.6zm3 0v7.6h1.8v-7.6z" />,
  close: <path d="m6.2 4.5 5.8 5.8 5.8-5.8 1.7 1.7-5.8 5.8 5.8 5.8-1.7 1.7-5.8-5.8-5.8 5.8-1.7-1.7 5.8-5.8-5.8-5.8z" />,
  back: <path d="M15.3 3.5 17 5.2 10.2 12l6.8 6.8-1.7 1.7L6.8 12z" />,
  link: (
    <>
      <path {...S} d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1 1" />
      <path {...S} d="M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1-1" />
    </>
  ),
  external: (
    <>
      <path d="M13 3h8v8l-3-3-6.3 6.3-2-2L16 6z" />
      <path d="M5.5 5H11v2.4H5.9v10.7h10.7V13H19v5.5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
    </>
  ),
  midi: (
    <path
      fillRule="evenodd"
      d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zM11 4.6v2.2h2V4.6zM6.4 9.4a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zm11.2 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zM8.3 14.6a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zm7.4 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zM12 15.8a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z"
    />
  ),
};

export function Icon({ name, size = 20, className, style }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true" focusable="false">
      {GLYPHS[name]}
    </svg>
  );
}

/** Ícone de cada fonte separada. */
export function stemIcon(key: string): IconName {
  switch (key) {
    case 'bass':
    case 'drums':
    case 'guitar':
    case 'piano':
    case 'vocals':
    case 'other':
    case 'backing':
      return key;
    case 'lead':
      return 'vocals';
    default:
      return 'original';
  }
}
