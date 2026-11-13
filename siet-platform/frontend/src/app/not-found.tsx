import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function NotFound() {
  return (
    <main className="theme-siet flex min-h-screen items-center justify-center bg-[#FAF7F9] p-4">
      <Card className="w-full max-w-md rounded-2xl border-[#EAE6EA] shadow-[0_4px_16px_rgba(32,33,36,0.04)]">
        <CardHeader className="items-center justify-items-center text-center">
          <SearchX aria-hidden="true" className="h-9 w-9 text-[#ED4988]" />
          <CardTitle>ไม่พบหน้านี้</CardTitle>
          <CardDescription>ลิงก์อาจไม่ถูกต้อง หรือเนื้อหานี้ถูกย้ายแล้ว</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button asChild className="min-h-11 rounded-xl">
            <Link href="/community">กลับหน้าชุมชน</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
