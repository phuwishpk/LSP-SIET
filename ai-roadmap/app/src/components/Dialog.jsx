import { useEffect, useRef } from 'react'

/** Modal on the native <dialog>: Esc closes it and focus stays inside. */
export default function Dialog({ title, subtitle, onClose, children, footer }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
    >
      <div className="dialog-body">
        <header>
          <h2 className="h3">{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </header>
        {children}
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </div>
    </dialog>
  )
}
