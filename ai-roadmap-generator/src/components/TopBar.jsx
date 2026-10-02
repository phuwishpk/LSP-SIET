import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { returnUrl } from '@/lib/workspace'
import { useWorkspace } from '@/lib/workspace-context'
import { ArrowLeft, Coin, Route } from './icons'

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return parts
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join('')
}

/** Sticky bar on every page: back to Community, balance, who is signed in. */
export default function TopBar() {
  const { user, balance, exempt } = useWorkspace()
  const atHome = useRouter().pathname === '/'
  // The back target lives in sessionStorage, so resolve it after mount.
  const [back, setBack] = useState('#')
  useEffect(() => setBack(returnUrl()), [])
  const name = user?.display_name || user?.username || ''

  return (
    <header className="topbar">
      <div className="topbar-group">
        <a className="back-button" href={back}>
          <span className="siet-mark">S</span>
          <ArrowLeft />
          <span>
            <span className="back-long">กลับ </span>Community
          </span>
        </a>
        <span className="topbar-divider" />
        <Link
          className="app-name"
          href="/"
          aria-current={atHome ? 'page' : undefined}
          title={atHome ? undefined : 'หน้าหลัก Roadmap'}
        >
          <Route />
          AI Roadmap
        </Link>
      </div>
      <div className="topbar-group">
        <span className="balance-chip" title="แต้มคงเหลือ">
          <Coin />
          {exempt ? 'ไม่ตัดแต้ม' : `${balance} แต้ม`}
        </span>
        <span className="who">
          <span className="avatar">{initials(name)}</span>
          <span className="who-name">{name}</span>
        </span>
      </div>
    </header>
  )
}
