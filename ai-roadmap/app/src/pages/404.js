import { SearchX } from 'lucide-react'
import { communityUrl } from '@/lib/workspace'

export default function NotFound() {
  return (
    <main className="center-screen">
      <section className="system-state-card" aria-labelledby="not-found-title">
        <SearchX aria-hidden="true" className="system-state-icon system-state-brand" />
        <h1 id="not-found-title" className="h2">ไม่พบหน้านี้</h1>
        <p className="muted">ลิงก์อาจไม่ถูกต้อง หรือเนื้อหานี้ถูกย้ายแล้ว</p>
        <a className="btn btn-primary" href={communityUrl()}>
          กลับไปที่ SIET Space
        </a>
      </section>
    </main>
  )
}
