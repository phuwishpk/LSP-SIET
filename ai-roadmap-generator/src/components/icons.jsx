const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export const ArrowLeft = () => (
  <svg {...base}>
    <path d="M13 8H3M7 4L3 8l4 4" />
  </svg>
)

export const Coin = () => (
  <svg {...base} strokeWidth={1.6}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 5v6M6 8h4" />
  </svg>
)

export const Share = () => (
  <svg {...base}>
    <path d="M8 10V2M5 5l3-3 3 3M3 9v4h10V9" />
  </svg>
)

export const Download = () => (
  <svg {...base}>
    <path d="M8 2v8M5 7l3 3 3-3M3 13h10" />
  </svg>
)

export const Plus = () => (
  <svg {...base}>
    <path d="M8 3v10M3 8h10" />
  </svg>
)

export const Close = () => (
  <svg {...base}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
)

export const External = () => (
  <svg {...base}>
    <path d="M9 3h4v4M13 3L7 9M11 9v4H3V5h4" />
  </svg>
)
