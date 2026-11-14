import * as React from 'react'

// The navbar's icons, drawn here instead of taken from lucide-react: each app
// resolves lucide-react from its own node_modules (AI Roadmap has 1.x, SIET Space
// and AI Quiz 0.525), and 1.x draws Coins, BookOpen, CircleCheck, Menu and Moon
// differently, so the same navbar looked different per app. Shapes and SVG
// attributes are lucide-react 0.525.0's (ISC licence, https://lucide.dev).

type IconNode = [string, Record<string, string>][]
export type NavbarIconProps = React.SVGProps<SVGSVGElement> & { size?: number | string }

function icon(name: string, node: IconNode) {
  const Icon = React.forwardRef<SVGSVGElement, NavbarIconProps>(function NavbarIcon({ size = 24, className, ...rest }, ref) {
    const labelled = rest['aria-label'] !== undefined || rest['aria-labelledby'] !== undefined || rest.role !== undefined
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={['lucide', `lucide-${name}`, className].filter(Boolean).join(' ')}
        {...(labelled ? {} : { 'aria-hidden': true })}
        {...rest}
      >
        {node.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs }))}
      </svg>
    )
  })
  Icon.displayName = name
  return Icon
}

export const Bell = icon('bell', [['path', {d: 'M10.268 21a2 2 0 0 0 3.464 0'}], ['path', {d: 'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326'}]])
export const BookOpen = icon('book-open', [['path', {d: 'M12 7v14'}], ['path', {d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z'}]])
export const ChevronDown = icon('chevron-down', [['path', {d: 'm6 9 6 6 6-6'}]])
export const CircleCheck = icon('circle-check', [['circle', {cx: '12', cy: '12', r: '10'}], ['path', {d: 'm9 12 2 2 4-4'}]])
export const CircleHelp = icon('circle-question-mark', [['circle', {cx: '12', cy: '12', r: '10'}], ['path', {d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'}], ['path', {d: 'M12 17h.01'}]])
export const Coins = icon('coins', [['circle', {cx: '8', cy: '8', r: '6'}], ['path', {d: 'M18.09 10.37A6 6 0 1 1 10.34 18'}], ['path', {d: 'M7 6h1v4'}], ['path', {d: 'm16.71 13.88.7.71-2.82 2.82'}]])
export const GraduationCap = icon('graduation-cap', [['path', {d: 'M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z'}], ['path', {d: 'M22 10v6'}], ['path', {d: 'M6 12.5V16a6 3 0 0 0 12 0v-3.5'}]])
export const InfinityIcon = icon('infinity', [['path', {d: 'M6 16c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8'}]])
export const LogOut = icon('log-out', [['path', {d: 'm16 17 5-5-5-5'}], ['path', {d: 'M21 12H9'}], ['path', {d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'}]])
export const MapIcon = icon('map', [['path', {d: 'M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z'}], ['path', {d: 'M15 5.764v15'}], ['path', {d: 'M9 3.236v15'}]])
export const Menu = icon('menu', [['path', {d: 'M4 12h16'}], ['path', {d: 'M4 18h16'}], ['path', {d: 'M4 6h16'}]])
export const Moon = icon('moon', [['path', {d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'}]])
export const Search = icon('search', [['path', {d: 'm21 21-4.34-4.34'}], ['circle', {cx: '11', cy: '11', r: '8'}]])
export const Settings = icon('settings', [['path', {d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'}], ['circle', {cx: '12', cy: '12', r: '3'}]])
export const Sun = icon('sun', [['circle', {cx: '12', cy: '12', r: '4'}], ['path', {d: 'M12 2v2'}], ['path', {d: 'M12 20v2'}], ['path', {d: 'm4.93 4.93 1.41 1.41'}], ['path', {d: 'm17.66 17.66 1.41 1.41'}], ['path', {d: 'M2 12h2'}], ['path', {d: 'M20 12h2'}], ['path', {d: 'm6.34 17.66-1.41 1.41'}], ['path', {d: 'm19.07 4.93-1.41 1.41'}]])
export const TrendingDown = icon('trending-down', [['path', {d: 'M16 17h6v-6'}], ['path', {d: 'm22 17-8.5-8.5-5 5L2 7'}]])
export const TrendingUp = icon('trending-up', [['path', {d: 'M16 7h6v6'}], ['path', {d: 'm22 7-8.5 8.5-5-5L2 17'}]])
export const UserRound = icon('user-round', [['circle', {cx: '12', cy: '8', r: '5'}], ['path', {d: 'M20 21a8 8 0 0 0-16 0'}]])
export const X = icon('x', [['path', {d: 'M18 6 6 18'}], ['path', {d: 'm6 6 12 12'}]])
