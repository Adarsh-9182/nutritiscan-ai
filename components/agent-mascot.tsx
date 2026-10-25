/** Nutri, the NutritiScan agent: a small animated mascot. Pure SVG and CSS (see .nl-mascot in globals.css). */
export function AgentMascot() {
  return (
    <div className="nl-mascot" role="img" aria-label="Nutri, the NutritiScan agent, waving">
      <svg viewBox="0 0 160 170" width="132" height="140" aria-hidden="true">
        <defs>
          <linearGradient id="nl-m-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d9ff7a" />
            <stop offset="1" stopColor="#6fe8b4" />
          </linearGradient>
        </defs>
        <ellipse className="nl-m-shadow" cx="80" cy="160" rx="38" ry="6" fill="#000" opacity=".4" />
        <g className="nl-m-float">
          <g className="nl-m-antenna">
            <path d="M80 32 V16" stroke="#6fe8b4" strokeWidth="4" strokeLinecap="round" />
            <circle className="nl-m-bulb" cx="80" cy="12" r="6" fill="#c9fa63" />
          </g>
          <rect x="38" y="30" width="84" height="76" rx="26" fill="url(#nl-m-body)" />
          <rect x="48" y="40" width="64" height="44" rx="17" fill="#07130c" />
          <g className="nl-m-eyes">
            <rect x="60" y="53" width="11" height="17" rx="5.5" fill="#c9fa63" />
            <rect x="89" y="53" width="11" height="17" rx="5.5" fill="#c9fa63" />
          </g>
          <path d="M72 77 q8 6 16 0" stroke="#6fe8b4" strokeWidth="3" strokeLinecap="round" fill="none" />
          <rect x="62" y="104" width="36" height="28" rx="12" fill="url(#nl-m-body)" />
          <path className="nl-m-plus" d="M80 111 v14 M73 118 h14" stroke="#07130c" strokeWidth="4.5" strokeLinecap="round" />
          <rect className="nl-m-arm-l" x="30" y="108" width="14" height="9" rx="4.5" fill="#6fe8b4" />
          <g className="nl-m-arm-r">
            <rect x="116" y="108" width="14" height="9" rx="4.5" fill="#6fe8b4" />
          </g>
          <rect x="66" y="130" width="11" height="12" rx="5" fill="#6fe8b4" />
          <rect x="83" y="130" width="11" height="12" rx="5" fill="#6fe8b4" />
        </g>
        <g className="nl-m-spark" fill="#c9fa63">
          <path className="nl-m-spark-a" d="M138 40 l3 -9 l3 9 l9 3 l-9 3 l-3 9 l-3 -9 l-9 -3z" />
          <path className="nl-m-spark-b" d="M20 66 l2 -6 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2z" />
        </g>
      </svg>
    </div>
  );
}
