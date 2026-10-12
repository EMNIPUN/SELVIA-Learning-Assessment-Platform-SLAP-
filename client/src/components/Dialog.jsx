import { useId, useLayoutEffect, useRef } from 'react'

// A modal on the native <dialog> element: the browser moves focus into it, keeps keyboard focus inside and
// makes the page behind it inert. Render it to open it and stop rendering it to close it; focus then returns
// to the control that opened it, if that control still exists.
// Escape calls `onClose`, except while `busy`, so a request in progress cannot be abandoned half-way.
export default function Dialog({ title, onClose, busy = false, size, children }) {
  const dialogRef = useRef(null)
  const titleId = useId()

  // A layout effect, so the dialog is closed while it is still in the document. Focus is restored once the
  // update that closed the dialog has been applied, because that update may move the opener, for example when
  // a saved item is re-sorted, and moving an element drops its focus.
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const opener = document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      queueMicrotask(() => {
        if (opener?.isConnected) opener.focus()
      })
    }
  }, [])

  function requestClose(event) {
    event.preventDefault()
    if (!busy) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className={size ? `dialog dialog-${size}` : 'dialog'}
      aria-labelledby={titleId}
      onCancel={requestClose}
      onKeyDown={(event) => event.key === 'Escape' && requestClose(event)}
    >
      <h2 id={titleId} className="dialog-title">
        {title}
      </h2>
      {children}
    </dialog>
  )
}
