'use client'

/**
 * CSV import.
 *
 * Creating forty course rooms by hand is not a thing anyone will do, so the
 * registrar's export goes straight in. Every import can be run as a dry run
 * first, and a row that already exists is reported rather than failing the lot.
 */
import { useRef, useState } from 'react'
import { CheckCircle2, FileUp, SkipForward, Upload, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { useCsvImport } from '@/lib/hooks/use-admin'
import type { ImportResult } from '@/lib/api/admin'

export function ImportPanel() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ImportCard
        kind="courses"
        title="นำเข้ารายวิชา"
        description="สร้างห้องวิชาหลายห้องพร้อมกัน ห้องที่รหัสซ้ำจะถูกข้าม"
        columns="code,name,description"
        sample={`code,name,description
CS401,Software Engineering,วิศวกรรมซอฟต์แวร์ ภาคต้น
CS402,Database Systems,ระบบฐานข้อมูล
CS403,Computer Vision,`}
      />
      <ImportCard
        kind="users"
        title="นำเข้าผู้ใช้"
        description="สร้างบัญชีแบบรหัสผ่านทีละหลายคน · บัญชีนักศึกษาได้ 20 แต้มต้อนรับ"
        columns="username,password,display_name,role,student_id"
        sample={`username,password,display_name,role,student_id
somsri.kw,ChangeMe123,อ.สมศรี ขวัญเมือง,teacher,
67030101,ChangeMe123,สมชาย ใจดี,student,67030101
67030102,ChangeMe123,มานี รักเรียน,student,67030102`}
      />
    </div>
  )
}

function ImportCard({
  kind,
  title,
  description,
  columns,
  sample,
}: {
  kind: 'courses' | 'users'
  title: string
  description: string
  columns: string
  sample: string
}) {
  const [csv, setCsv] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const run = useCsvImport(kind)

  const submit = (dryRun: boolean) => {
    if (!csv.trim()) return
    run.mutate({ csv, dryRun }, { onSuccess: (data) => setResult(data) })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md bg-muted/60 p-2 text-[11px] leading-relaxed text-muted-foreground">
          คอลัมน์: <code className="font-mono text-foreground">{columns}</code>
          <br />
          มีหรือไม่มีบรรทัดหัวตารางก็ได้ — ถ้าไม่มี ระบบจะอ่านตามลำดับคอลัมน์ข้างบน
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setCsv(await file.text())
              setResult(null)
              e.target.value = ''
            }}
          />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-4 w-4" /> เลือกไฟล์ CSV
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => {
              setCsv(sample)
              setResult(null)
            }}
          >
            ใส่ตัวอย่าง
          </Button>
        </div>

        <Textarea
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value)
            setResult(null)
          }}
          rows={7}
          placeholder={sample}
          className="font-mono text-xs"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!csv.trim() || run.isPending}
            onClick={() => submit(true)}
          >
            ตรวจก่อน (ไม่บันทึก)
          </Button>
          <Button size="sm" className="gap-1.5" disabled={!csv.trim() || run.isPending} onClick={() => submit(false)}>
            <Upload className="h-4 w-4" /> นำเข้า
          </Button>
        </div>

        {result && (
          <div className="space-y-2 rounded-lg border p-3 text-xs">
            <p className="font-medium">
              {result.dry_run ? 'ผลการตรวจ (ยังไม่บันทึก)' : 'ผลการนำเข้า'}
            </p>
            <ResultList
              icon={CheckCircle2}
              tone="text-emerald-600"
              label={result.dry_run ? 'จะเพิ่ม' : 'เพิ่มแล้ว'}
              rows={result.created}
            />
            <ResultList icon={SkipForward} tone="text-amber-600" label="ข้าม" rows={result.skipped} />
            <ResultList icon={XCircle} tone="text-destructive" label="ผิดพลาด" rows={result.errors} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ResultList({
  icon: Icon,
  tone,
  label,
  rows,
}: {
  icon: React.ComponentType<{ className?: string }>
  tone: string
  label: string
  rows: ImportResult['created']
}) {
  if (rows.length === 0) return null
  return (
    <div>
      <p className={`flex items-center gap-1 font-medium ${tone}`}>
        <Icon className="h-3.5 w-3.5" /> {label} {rows.length} รายการ
      </p>
      <ul className="mt-0.5 max-h-28 space-y-0.5 overflow-y-auto pl-5 text-muted-foreground">
        {rows.slice(0, 40).map((r, i) => (
          <li key={`${r.line}-${i}`}>
            บรรทัด {r.line}: {r.code || r.username || r.name}
            {r.reason ? ` — ${r.reason}` : ''}
          </li>
        ))}
        {rows.length > 40 && <li>…และอีก {rows.length - 40} รายการ</li>}
      </ul>
    </div>
  )
}
