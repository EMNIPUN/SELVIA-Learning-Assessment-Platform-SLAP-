import { useEffect } from 'react'

// While `active`, asks before the student leaves the page: the browser's own prompt on reload, closing the tab or
// leaving the site, and `message` in a confirmation when a link inside the app is followed. The browser's back
// and forward buttons cannot be intercepted with BrowserRouter, so they are not covered.
export function useLeaveWarning(active, message) {
  useEffect(() => {
    if (!active) return undefined

    function handleBeforeUnload(event) {
      event.preventDefault()
      event.returnValue = ''
    }

    // Runs in the capture phase, before the router handles the click; a cancelled click is ignored by the router.
    function handleClick(event) {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return
      if (link.href === window.location.href) return
      if (!window.confirm(message)) event.preventDefault()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('click', handleClick, true)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('click', handleClick, true)
    }
  }, [active, message])
}
