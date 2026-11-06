// Crayon-style artwork: an SVG "wax crayon" texture filter, the logo, a hand-drawn
// Bengaluru skyline for the home page, and small doodles.

/** Shared SVG filters. Rendered once at the app root. */
export function CrayonDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {/* waxy, grainy fill with slightly wobbly edges – like a crayon on paper */}
        <filter id="crayon" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="1.15" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="wobble" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 2.05" result="grain" />
          <feComposite in="wobble" in2="grain" operator="in" />
        </filter>
        {/* lighter version for small things like the logo */}
        <filter id="crayon-soft" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="2" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" xChannelSelector="R" yChannelSelector="G" result="wobble" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.75" result="grain" />
          <feComposite in="wobble" in2="grain" operator="in" />
        </filter>
      </defs>
    </svg>
  );
}

/** Crayon map-pin logo. */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo-mark">
      <g filter="url(#crayon-soft)">
        <circle cx="32" cy="32" r="29" fill="#ffcd38" />
        <path d="M32 9c-9 0-16 7-16 15.6C16 36.5 32 55 32 55s16-18.5 16-30.4C48 16 41 9 32 9z" fill="#e2453c" />
        <circle cx="32" cy="25" r="7.5" fill="#fffaf0" />
      </g>
      <path d="M32 9c-9 0-16 7-16 15.6C16 36.5 32 55 32 55s16-18.5 16-30.4C48 16 41 9 32 9z" fill="none" stroke="#2b2733" strokeWidth="2.6" strokeLinejoin="round" />
      <circle cx="32" cy="25" r="7.5" fill="none" stroke="#2b2733" strokeWidth="2.2" />
    </svg>
  );
}

/** Hand-drawn Bengaluru street: sun, clouds, skyline with a domed civic building,
 *  trees, and a road with a pothole being photographed on a phone. */
export function CrayonCity({ className }: { className?: string }) {
  const ink = '#2b2733';
  return (
    <svg className={className} viewBox="0 0 360 230" role="img" aria-label="Crayon drawing of a Bengaluru street with a pothole being photographed on a phone">
      {/* sky scribbles */}
      <g filter="url(#crayon)" opacity="0.55">
        <path d="M6 18 L60 8 L20 30 L96 12 L40 42 L132 16 L70 48 L170 14 L110 50 L210 16 L150 52 L250 18" fill="none" stroke="#8fd0f5" strokeWidth="9" strokeLinejoin="round" strokeLinecap="round" />
      </g>
      {/* sun */}
      <g filter="url(#crayon)">
        <circle cx="306" cy="42" r="24" fill="#ffcd38" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line key={a} x1={306 + Math.cos((a * Math.PI) / 180) * 31} y1={42 + Math.sin((a * Math.PI) / 180) * 31} x2={306 + Math.cos((a * Math.PI) / 180) * 41} y2={42 + Math.sin((a * Math.PI) / 180) * 41} stroke="#f5862a" strokeWidth="5" strokeLinecap="round" />
        ))}
      </g>
      <circle cx="306" cy="42" r="24" fill="none" stroke={ink} strokeWidth="2" />
      {/* clouds */}
      <g filter="url(#crayon-soft)">
        <path d="M44 70c-10 0-14-12-4-16 2-10 16-12 21-4 8-6 20 0 17 9 9 2 8 11-1 11z" fill="#ffffff" stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M196 56c-8 0-11-9-3-12 2-8 13-9 17-3 6-5 16 0 13 7 7 2 6 8-1 8z" fill="#ffffff" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
      </g>
      {/* skyline */}
      <g filter="url(#crayon)">
        <rect x="16" y="104" width="44" height="76" fill="#f472a8" />
        <rect x="62" y="84" width="40" height="96" fill="#3d85e6" />
        <rect x="246" y="92" width="42" height="88" fill="#43a047" />
        <rect x="290" y="114" width="52" height="66" fill="#f5862a" />
        {/* domed civic building */}
        <rect x="118" y="120" width="112" height="60" fill="#ffe7a3" />
        <rect x="140" y="102" width="68" height="20" fill="#ffe7a3" />
        <path d="M150 102a24 22 0 0 1 48 0z" fill="#8a63d2" />
        <rect x="171" y="68" width="6" height="14" fill="#8a63d2" />
      </g>
      <g fill="none" stroke={ink} strokeWidth="2" strokeLinejoin="round">
        <rect x="16" y="104" width="44" height="76" />
        <rect x="62" y="84" width="40" height="96" />
        <rect x="246" y="92" width="42" height="88" />
        <rect x="290" y="114" width="52" height="66" />
        <path d="M118 180V120h22v-18h68v18h22v60" />
        <path d="M150 102a24 22 0 0 1 48 0" />
        <path d="M174 68v12" />
        {[128, 146, 164, 182, 200, 218].map((x) => (
          <path key={x} d={`M${x} 132v38`} />
        ))}
      </g>
      {/* windows */}
      <g fill="#fff6c8" stroke={ink} strokeWidth="1.4">
        {[
          [24, 114], [40, 114], [24, 134], [40, 134], [24, 154], [40, 154],
          [70, 96], [86, 96], [70, 118], [86, 118], [70, 140], [86, 140],
          [254, 104], [270, 104], [254, 126], [270, 126], [254, 148], [270, 148],
          [300, 126], [318, 126], [300, 148], [318, 148],
        ].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="10" height="12" />
        ))}
      </g>
      {/* trees */}
      <g filter="url(#crayon)">
        <rect x="104" y="150" width="6" height="30" fill="#8d5a3b" />
        <circle cx="107" cy="146" r="14" fill="#43a047" />
        <rect x="236" y="154" width="6" height="26" fill="#8d5a3b" />
        <circle cx="239" cy="150" r="12" fill="#2e9e5b" />
      </g>
      {/* road */}
      <g filter="url(#crayon)">
        <rect x="0" y="180" width="360" height="50" fill="#8f8a94" />
      </g>
      <path d="M0 180H360" stroke={ink} strokeWidth="2.4" />
      <g stroke="#fffaf0" strokeWidth="4" strokeLinecap="round" strokeDasharray="16 14">
        <path d="M6 206H352" />
      </g>
      {/* pothole + cone */}
      <g filter="url(#crayon-soft)">
        <ellipse cx="128" cy="210" rx="30" ry="9" fill="#3b3540" />
        <path d="M188 214l9-28 9 28z" fill="#f5862a" />
        <rect x="191" y="196" width="12" height="4" fill="#fffaf0" />
      </g>
      <ellipse cx="128" cy="210" rx="30" ry="9" fill="none" stroke={ink} strokeWidth="2" />
      <path d="M186 214h22M188 214l9-28 9 28" fill="none" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
      {/* phone taking a photo */}
      <g transform="rotate(-12 64 196)">
        <rect x="44" y="160" width="40" height="66" rx="7" fill="#2b2733" />
        <rect x="48" y="166" width="32" height="50" rx="3" fill="#8fd0f5" />
        <ellipse cx="64" cy="200" rx="10" ry="3.5" fill="#3b3540" />
        <circle cx="64" cy="221" r="2.4" fill="#fffaf0" />
      </g>
      {/* camera flash */}
      <g filter="url(#crayon-soft)">
        <path d="M100 168l5 9 10 1-8 6 3 10-10-6-9 6 3-10-8-6 10-1z" fill="#ffcd38" stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** A small crayon star doodle used as a decoration. */
export function CrayonStar({ size = 22, color = '#ffcd38' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="crayon-star">
      <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z" fill={color} stroke="#2b2733" strokeWidth="1.6" strokeLinejoin="round" filter="url(#crayon-soft)" />
    </svg>
  );
}
