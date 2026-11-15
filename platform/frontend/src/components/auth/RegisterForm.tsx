'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/hooks/use-auth'
import { useAuthStore } from '@/lib/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AlertCircle, UserPlus } from 'lucide-react'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'

export function RegisterForm() {
  const router = useRouter()
  const { register, isLoading, error, registrationEnabled } = useAuth()
  const { checkAuthRequired, hasHydrated, authRequired } = useAuthStore()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!hasHydrated) return
    checkAuthRequired()
      .catch(() => {})
      .finally(() => setReady(true))
  }, [hasHydrated, checkAuthRequired])

  if (!hasHydrated || !ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    )
  }

  if (authRequired === false) {
    router.replace('/notebooks')
    return null
  }

  if (registrationEnabled === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>ปิดรับสมัครสมาชิก</CardTitle>
            <CardDescription>
              ผู้ดูแลระบบปิดการสมัครสมาชิกเองไว้ กรุณาติดต่อผู้ดูแลเพื่อขอบัญชี
              หรือเข้าสู่ระบบด้วยบัญชี Google ของ KMITL
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/login"
              className="text-primary hover:underline text-sm"
            >
              ← กลับไปหน้าเข้าสู่ระบบ
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    if (!username.trim() || !password) return
    if (password !== confirm) {
      setLocalError('รหัสผ่านทั้งสองช่องไม่ตรงกัน')
      return
    }
    if (password.length < 6) {
      setLocalError('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร')
      return
    }
    const success = await register(
      username.trim(),
      password,
      displayName.trim() || undefined
    )
    if (!success) return
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-1">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <UserPlus className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>สมัครสมาชิก SIET Space</CardTitle>
          <CardDescription>
            หนึ่งบัญชีใช้ได้ทั้งชุมชน AI Quiz และ AI Roadmap · รับ 20 แต้มทันที
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">ชื่อผู้ใช้</Label>
              <Input
                id="username"
                autoComplete="username"
                autoFocus
                placeholder="เช่น somchai"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                required
              />
              <p className="text-xs text-muted-foreground">
                3-32 ตัวอักษร · ใช้ตัวอักษร ตัวเลข จุด ขีดล่าง หรือขีดกลาง
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="displayName">ชื่อที่แสดง (ไม่บังคับ)</Label>
              <Input
                id="displayName"
                placeholder="สมชาย ใจดี"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">รหัสผ่าน</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="อย่างน้อย 6 ตัวอักษร"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">ยืนยันรหัสผ่าน</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            <div className="rounded-md border border-dashed bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
              บัญชีที่สมัครทางนี้จะเป็น <b className="text-foreground">นักศึกษา</b> เสมอ
              <br />
              อาจารย์ให้เข้าสู่ระบบด้วย <b className="text-foreground">Google ของ KMITL</b>{' '}
              (อีเมลที่ไม่ใช่รหัสนักศึกษา 8 หลักจะได้สิทธิ์อาจารย์อัตโนมัติ)
              หรือให้ผู้ดูแลเปลี่ยนสิทธิ์ให้ในหน้าจัดการระบบ
            </div>

            {(localError || error) && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle className="h-4 w-4" />
                {localError || error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={
                isLoading || !username.trim() || !password || password !== confirm
              }
            >
              {isLoading ? 'กำลังสร้างบัญชี…' : 'สมัครสมาชิก'}
            </Button>

            <div className="text-center text-sm text-muted-foreground pt-2 border-t">
              มีบัญชีอยู่แล้ว?{' '}
              <Link href="/login" className="text-primary hover:underline">
                เข้าสู่ระบบ
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
