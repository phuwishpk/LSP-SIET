'use client'

/**
 * Create an account by hand.
 *
 * Needed once self-registration is switched off: Google sign-in only ever
 * produces the role its e-mail implies, so without this an admin has no way to
 * give a new teacher an account.
 */
import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCreateUser } from '@/lib/hooks/use-admin'
import type { UserRole } from '@/lib/api/admin'

export function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateUser()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [role, setRole] = useState<UserRole>('teacher')

  const reset = () => {
    setUsername('')
    setPassword('')
    setDisplayName('')
    setStudentId('')
    setRole('teacher')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>สร้างบัญชีใหม่</DialogTitle>
          <DialogDescription>
            ใช้เมื่อปิดการสมัครเองแล้ว หรือต้องการสร้างบัญชีอาจารย์ให้ทันที · บัญชีนักศึกษาจะได้ 20 แต้มต้อนรับ (อาจารย์และผู้ดูแลไม่ถูกตัดแต้มอยู่แล้ว)
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="new-username">ชื่อผู้ใช้</Label>
            <Input
              id="new-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="เช่น somsri.kw"
            />
            <p className="text-[11px] text-muted-foreground">3-32 ตัวอักษร · ตัวอักษร ตัวเลข จุด ขีดล่าง ขีดกลาง</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-password">รหัสผ่านเริ่มต้น</Label>
            <Input
              id="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="อย่างน้อย 6 ตัวอักษร"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-display">ชื่อที่แสดง</Label>
            <Input
              id="new-display"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="อ.สมศรี ขวัญเมือง"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="new-role">สิทธิ์</Label>
              <select
                id="new-role"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                <option value="student">นักศึกษา</option>
                <option value="teacher">อาจารย์</option>
                <option value="admin">ผู้ดูแลระบบ</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-student-id">รหัสนักศึกษา (ถ้ามี)</Label>
              <Input
                id="new-student-id"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="67030101"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            className="gap-1.5"
            disabled={create.isPending || username.trim().length < 3 || password.length < 6}
            onClick={() =>
              create.mutate(
                {
                  username: username.trim(),
                  password,
                  display_name: displayName.trim() || undefined,
                  role,
                  student_id: studentId.trim() || undefined,
                },
                {
                  onSuccess: () => {
                    reset()
                    onOpenChange(false)
                  },
                }
              )
            }
          >
            <UserPlus className="h-4 w-4" /> สร้างบัญชี
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
