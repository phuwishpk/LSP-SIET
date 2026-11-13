'use client'

/**
 * Slide-in panel built on the same Radix Dialog as `dialog.tsx`.
 *
 * Added for the community feed: its left column is a desktop sidebar, and on a
 * phone that column was simply hidden, which took course rooms, the library and
 * the AI tools with it. A sheet gives that column somewhere to live on small
 * screens without duplicating it.
 */

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close
const SheetPortal = DialogPrimitive.Portal

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className
      )}
      {...props}
    />
  )
}

/**
 * Radix portals a nested dialog to `document.body`, so a click inside it counts
 * as "outside" this sheet and would close it — taking the sheet's children, and
 * therefore that dialog's own state, down with it. Anything that lives in
 * another floating layer is not really outside.
 */
function isInsideFloatingLayer(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest(
      '[data-slot="dialog-content"],[data-slot="alert-dialog-content"],[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[data-radix-popper-content-wrapper]'
    )
  )
}

function SheetContent({
  className,
  children,
  side = 'left',
  title,
  description,
  onInteractOutside,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  side?: 'left' | 'right'
  /** Read out by screen readers; Radix requires a title on every dialog. */
  title: string
  description?: string
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed inset-y-0 z-50 flex h-full w-[86%] max-w-[320px] flex-col gap-0 border-border bg-background shadow-lg transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:animate-in data-[state=open]:duration-300',
          side === 'left'
            ? 'left-0 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left'
            : 'right-0 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
          className
        )}
        onInteractOutside={(event) => {
          if (isInsideFloatingLayer(event.target)) {
            event.preventDefault()
            return
          }
          onInteractOutside?.(event)
        }}
        {...props}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <DialogPrimitive.Title className="text-sm font-semibold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close
            className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            aria-label="ปิดเมนู"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </div>
        {description && (
          <DialogPrimitive.Description className="sr-only">
            {description}
          </DialogPrimitive.Description>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      </DialogPrimitive.Content>
    </SheetPortal>
  )
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetOverlay, SheetPortal }
