'use client'

/**
 * Course categories (ภาควิชา / สาขา / ทั่วไป).
 *
 * One flat list: teachers pick one when they open a course room, students
 * filter by it. Deleting a category never deletes rooms - they just become
 * uncategorised - which is why the confirm says so.
 */
import { useState } from 'react'
import { Check, FolderTree, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { EmptyState } from '@/components/admin/controls'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAdminCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '@/lib/hooks/use-courses'
import type { Category } from '@/lib/api/courses'

export function CategoriesPanel() {
  const { data, isLoading } = useAdminCategories()
  const create = useCreateCategory()
  const remove = useDeleteCategory()
  const [name, setName] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null)
  const items = data?.items ?? []

  const submit = () => {
    if (name.trim().length < 2) return
    create.mutate(
      { name: name.trim(), name_en: nameEn.trim() || undefined, sort_order: items.length },
      {
        onSuccess: () => {
          setName('')
          setNameEn('')
        },
      }
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderTree className="h-4 w-4" /> หมวดหมู่รายวิชา
        </CardTitle>
        <CardDescription>
          ภาควิชา/สาขาที่ห้องวิชาสังกัด ใช้กรองและจัดกลุ่มในหน้าค้นหา — ลบหมวดแล้วห้องไม่หาย แค่กลายเป็นไม่มีหมวด
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ชื่อหมวดหมู่ (ไทย) เช่น ครุศาสตร์วิศวกรรม"
            className="min-w-[220px] flex-1"
            maxLength={128}
          />
          <Input
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder="ชื่ออังกฤษ (ไม่บังคับ)"
            className="min-w-[180px] flex-1"
            maxLength={128}
          />
          <Button type="submit" size="sm" className="gap-1.5" disabled={name.trim().length < 2 || create.isPending}>
            <Plus className="h-4 w-4" /> เพิ่ม
          </Button>
        </form>

        {isLoading && <Skeleton className="h-32 w-full" />}
        {!isLoading && items.length === 0 && <EmptyState>ยังไม่มีหมวดหมู่ — เพิ่มจากฟอร์มด้านบน</EmptyState>}
        {items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">หมวดหมู่</th>
                  <th className="py-2 pr-3 font-medium">รหัส (slug)</th>
                  <th className="py-2 pr-3 text-right font-medium">ลำดับ</th>
                  <th className="py-2 pr-3 text-right font-medium">ห้องวิชา</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((c) => (
                  <CategoryRow key={c.id} category={c} onDelete={() => setPendingDelete(c)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบหมวดหมู่ “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              ห้องวิชา {pendingDelete?.course_count ?? 0} ห้อง
              {(pendingDelete?.archived_count ?? 0) > 0 && ` (และที่เก็บถาวร ${pendingDelete?.archived_count} ห้อง)`}{' '}
              จะกลายเป็น “ไม่ระบุหมวดหมู่” — ไม่มีโพสต์หรือเอกสารถูกลบ
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDelete) return
                remove.mutate(pendingDelete.id)
                setPendingDelete(null)
              }}
            >
              ลบหมวดหมู่
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function CategoryRow({ category, onDelete }: { category: Category; onDelete: () => void }) {
  const update = useUpdateCategory()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [nameEn, setNameEn] = useState(category.name_en ?? '')
  const [order, setOrder] = useState(String(category.sort_order))

  const save = () => {
    update.mutate(
      {
        categoryId: category.id,
        name: name.trim(),
        name_en: nameEn.trim(),
        sort_order: Math.max(0, Number(order) || 0),
      },
      { onSuccess: () => setEditing(false) }
    )
  }

  if (editing) {
    return (
      <tr>
        <td className="py-2 pr-3">
          <div className="flex flex-col gap-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" aria-label="ชื่อหมวดหมู่" />
            <Input
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              className="h-8"
              placeholder="ชื่ออังกฤษ"
              aria-label="ชื่ออังกฤษ"
            />
          </div>
        </td>
        <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{category.slug}</td>
        <td className="py-2 pr-3 text-right">
          <Input
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            className="ml-auto h-8 w-16 text-right"
            inputMode="numeric"
            aria-label="ลำดับ"
          />
        </td>
        <td className="py-2 pr-3 text-right tabular-nums">{category.course_count}</td>
        <td className="py-2 text-right">
          <div className="flex justify-end gap-1">
            <Button size="sm" className="h-8 px-2" disabled={name.trim().length < 2 || update.isPending} onClick={save} aria-label="บันทึก">
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setEditing(false)} aria-label="ยกเลิก">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td className="py-2 pr-3">
        <p className="font-medium">{category.name}</p>
        {category.name_en && <p className="text-xs text-muted-foreground">{category.name_en}</p>}
      </td>
      <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{category.slug}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{category.sort_order}</td>
      <td className="py-2 pr-3 text-right">
        <Badge variant="secondary">{category.course_count}</Badge>
        {category.archived_count > 0 && (
          <span className="ml-1 text-xs text-muted-foreground">+{category.archived_count} เก็บถาวร</span>
        )}
      </td>
      <td className="py-2 text-right">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setEditing(true)} aria-label="แก้ไขหมวดหมู่">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-destructive hover:text-destructive"
            onClick={onDelete}
            aria-label="ลบหมวดหมู่"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  )
}
