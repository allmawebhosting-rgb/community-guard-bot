const SAFE_MARKER_COLOR = /^#[\da-f]{6}$/i;

/** Shared animated map-pin artwork for public emergency facilities. */
export function nearbyMarkerDataUrl(kind: string, color: string) {
  const markerColor = SAFE_MARKER_COLOR.test(color) ? color : "#64748b";
  const symbol =
    kind === "police"
      ? '<path d="M24 12 33 16v6c0 6-3.5 10-9 13-5.5-3-9-7-9-13v-6l9-4Z" fill="white"/><path d="M24 18v10m-5-5h10" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round"/>'
      : kind === "fire"
        ? '<path d="M25 13c1 5-4 7-2 11 1-2 3-3 4-5 4 4 6 7 4 11a8 8 0 0 1-15-3c0-4 3-8 9-14Z" fill="white"/>'
        : kind === "other"
          ? '<circle cx="24" cy="24" r="4" fill="white"/>'
          : '<path d="M22 16h4v6h6v4h-6v6h-4v-6h-6v-4h6z" fill="white"/>';

  const svg = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle class="pulse" cx="24" cy="24" r="8" fill="${markerColor}" fill-opacity=".32">
      <animate attributeName="r" values="8;22" dur="1.7s" repeatCount="indefinite"/>
      <animate attributeName="fill-opacity" values=".35;0" dur="1.7s" repeatCount="indefinite"/>
    </circle>
    <circle cx="24" cy="24" r="10" fill="${markerColor}" stroke="#fff" stroke-width="3"/>
    ${symbol}
  </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
