'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { AlertCircle, FlaskConical } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { authApi } from '@siet/platform/lib/api/auth'
import { getApiUrl } from '@/lib/config'
import { useAuthStore } from '@/lib/stores/auth-store'

export default function GoogleMockPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <LoadingSpinner />
        </div>
      }
    >
      <GoogleMock />
    </Suspense>
  )
}

const PRESETS = [
  { label: 'นักศึกษา 67030001', email: '67030001@kmitl.ac.th', name: 'นวพล ทดสอบ' },
  { label: 'นักศึกษา 67030002', email: '67030002@kmitl.ac.th', name: 'พรพรม ทดสอบ' },
  { label: 'อาจารย์ somchai.su', email: 'somchai.su@kmitl.ac.th', name: 'อ.สมชาย สุขใจ' },
  // Admin only when this address is listed in WORKSPACE_ADMIN_EMAILS (.env)
  { label: 'แอดมิน', email: 'admin@siet.test', name: 'ผู้ดูแลระบบ (ทดสอบ)' },
]

function GoogleMock() {
  const params = useSearchParams()
  const router = useRouter()
  const state = params.get('state') || ''
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!email.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const apiUrl = await getApiUrl()
      const exchange = (s: string) =>
        authApi.googleExchange(apiUrl, {
          state: s,
          mock_email: email.trim(),
          mock_name: name.trim() || undefined,
        })
      let data
      try {
        data = await exchange(state)
      } catch (err) {
        // The signed state lives 10 minutes; a page left open longer gets a fresh one instead of a dead end
        if (!/OAuth state/.test((err as { detail?: string })?.detail || '')) throw err
        const fresh = await authApi.googleStart(apiUrl, '/community')
        data = await exchange(fresh.state)
      }
      useAuthStore.getState().setSession(data.access_token, data.user)
      if (data.welcome_granted) {
        toast.success(`ยินดีต้อนรับสู่ SIET Space! รับแต้มเริ่มต้น ${data.user.points_balance ?? 20} แต้ม 🎁`)
      }
      router.replace(data.next || '/community')
    } catch (err) {
      const detail = (err as { detail?: string; message?: string })?.detail
      setError(detail || (err as Error)?.message || 'เข้าสู่ระบบไม่สำเร็จ')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            <FlaskConical className="h-6 w-6" />
          </div>
          <CardTitle>Google Sign-in (โหมดจำลอง)</CardTitle>
          <CardDescription>
            ยังไม่ได้ตั้งค่า Google OAuth Client ระบบจึงจำลองหน้าเลือกบัญชี Google ให้ทดสอบ
            ใส่อีเมล @kmitl.ac.th ใดก็ได้ (รหัสนักศึกษา 8 หลัก = นักศึกษา, อาจารย์ที่อยู่ในรายชื่อ = อาจารย์,
            อีเมลใน WORKSPACE_ADMIN_EMAILS = แอดมิน, อื่น ๆ = รออนุมัติ)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!state && (
            <p className="mb-3 text-sm text-red-600 dark:text-red-300">ไม่มี state กรุณาเริ่มจากหน้าเข้าสู่ระบบ</p>
          )}
          <div className="mb-4 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.email}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEmail(p.email)
                  setName(p.name)
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="mock-email">อีเมลสถาบัน</Label>
              <Input
                id="mock-email"
                type="email"
                placeholder="67030xxx@kmitl.ac.th"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mock-name">ชื่อ-นามสกุล (ไม่บังคับ)</Label>
              <Input id="mock-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-300">
                <AlertCircle className="h-4 w-4" /> {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={busy || !email.trim() || !state}>
              {busy ? 'กำลังเข้าสู่ระบบ…' : 'ดำเนินการต่อในชื่อบัญชีนี้'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              <Link href="/login" className="hover:underline">
                ← กลับไปหน้าเข้าสู่ระบบ
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
