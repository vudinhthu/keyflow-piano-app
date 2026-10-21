// Arrow geometry: Lucide / Feather, ISC/MIT. See public/THIRD_PARTY_NOTICES.md.
export function ControlIcon({ name }: { name: 'up' | 'down' | 'menu' | 'grip' }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'up' ? <path d="m5 12 7-7 7 7M12 5v14" /> : name === 'down' ? <path d="m5 12 7 7 7-7M12 19V5" /> : name === 'menu' ? <path d="M5 6h14M5 12h14M5 18h14" /> : <>{[8, 12, 16].flatMap(y => [9, 15].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1" fill="currentColor" stroke="none" />))}</>}
  </svg>
}
