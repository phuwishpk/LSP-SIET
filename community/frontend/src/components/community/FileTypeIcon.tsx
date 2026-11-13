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

type FileKind = 'image' | 'video' | 'slides' | 'sheet' | 'archive' | 'pdf' | 'document'

/** One classification for the icon and the label (from the extension, else the MIME type). */
export function fileKind(name: string, mime?: string | null): FileKind {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  const mimeType = mime?.toLowerCase() ?? ''
  if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)) return 'image'
  if (mimeType.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v'].includes(extension)) return 'video'
  if (['ppt', 'pptx', 'key', 'odp'].includes(extension) || mimeType.includes('presentation')) return 'slides'
  if (['xls', 'xlsx', 'csv', 'ods'].includes(extension) || mimeType.includes('spreadsheet')) return 'sheet'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension) || mimeType.includes('zip')) return 'archive'
  if (mimeType.includes('pdf') || extension === 'pdf') return 'pdf'
  return 'document'
}

const KIND_LABEL: Record<FileKind, string> = {
  image: 'รูปภาพ',
  video: 'วิดีโอ',
  slides: 'สไลด์',
  sheet: 'ตาราง',
  archive: 'ไฟล์บีบอัด',
  pdf: 'PDF',
  document: 'เอกสาร',
}

/** A short type label for an attachment row (never the raw MIME string). */
export function fileTypeLabel(name: string, mime?: string | null): string {
  return KIND_LABEL[fileKind(name, mime)]
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
