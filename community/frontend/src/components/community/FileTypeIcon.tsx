import {
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
} from 'lucide-react'

interface FileTypeIconProps {
  name: string
  mime?: string | null
}

export function FileTypeIcon({ name, mime }: FileTypeIconProps) {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  const mimeType = mime?.toLowerCase() ?? ''

  if (
    mimeType.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)
  ) {
    return (
      <span className="community-file-icon" data-file-type="image" role="img" aria-label="ไฟล์รูปภาพ">
        <FileImage className="h-5 w-5" aria-hidden="true" />
      </span>
    )
  }

  if (mimeType.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v'].includes(extension)) {
    return (
      <span className="community-file-icon" data-file-type="video" role="img" aria-label="ไฟล์วิดีโอ">
        <FileVideo className="h-5 w-5" aria-hidden="true" />
      </span>
    )
  }

  if (['ppt', 'pptx', 'key', 'odp'].includes(extension) || mimeType.includes('presentation')) {
    return (
      <span className="community-file-icon" data-file-type="slides" role="img" aria-label="ไฟล์สไลด์">
        <Presentation className="h-5 w-5" aria-hidden="true" />
      </span>
    )
  }

  if (['xls', 'xlsx', 'csv', 'ods'].includes(extension) || mimeType.includes('spreadsheet')) {
    return (
      <span className="community-file-icon" data-file-type="sheet" role="img" aria-label="ไฟล์ตาราง">
        <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
      </span>
    )
  }

  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension) || mimeType.includes('zip')) {
    return (
      <span className="community-file-icon" data-file-type="archive" role="img" aria-label="ไฟล์บีบอัด">
        <FileArchive className="h-5 w-5" aria-hidden="true" />
      </span>
    )
  }

  return (
    <span
      className="community-file-icon"
      data-file-type={mimeType.includes('pdf') || extension === 'pdf' ? 'pdf' : 'document'}
      role="img"
      aria-label={mimeType.includes('pdf') || extension === 'pdf' ? 'ไฟล์ PDF' : 'เอกสาร'}
    >
      <FileText className="h-5 w-5" aria-hidden="true" />
    </span>
  )
}
