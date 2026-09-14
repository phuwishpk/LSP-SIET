'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { authApi } from '@/lib/api/auth'
import { getApiUrl } from '@/lib/config'
import { useAuthStore } from '@/lib/stores/auth-store'

export default function GoogleCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <LoadingSpinner />
        </div>
      }
    >
      <GoogleCallback />
    </Suspense>
  )
}

function GoogleCallback() {
  const params = useSearchParams()
  const router = useRouter()
  const ran = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const code = params.get('code')
    const state = params.get('state')
    const oauthError = params.get('error')

    if (oauthError) {
      setError(
        oauthError === 'access_denied'
          ? 'คุณยกเลิกการเข้าสู่ระบบด้วย Google'
          : `Google ส่งข้อผิดพลาดกลับมา: ${oauthError}`
      )
      return
    }
    if (!code || !state) {
      setError('ลิงก์ไม่สมบูรณ์ (ไม่มี code/state) กรุณาลองเข้าสู่ระบบใหม่')
      return
    }

    ;(async () => {
      try {
        const apiUrl = await getApiUrl()
        const data = await authApi.googleExchange(apiUrl, { code, state })
        useAuthStore.getState().setSession(data.access_token, data.user)
        if (data.welcome_granted) {
          toast.success(`ยินดีต้อนรับสู่ SIET Space! รับแต้มเริ่มต้น ${data.user.points_balance ?? 20} แต้ม 🎁`)
        }
        router.replace(data.next || '/community')
      } catch (err) {
        const detail = (err as { detail?: string; message?: string })?.detail
        setError(detail || (err as Error)?.message || 'เข้าสู่ระบบไม่สำเร็จ')
      }
    })()
  }, [params, router])

  if (!error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-muted-foreground">กำลังยืนยันบัญชี @kmitl.ac.th ของคุณ…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>เข้าสู่ระบบไม่สำเร็จ</CardTitle>
          <CardDescription>ไม่สามารถยืนยันตัวตนกับ Google Workspace ได้</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 text-sm text-red-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button asChild className="w-full">
            <Link href="/login">กลับไปหน้าเข้าสู่ระบบ</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
