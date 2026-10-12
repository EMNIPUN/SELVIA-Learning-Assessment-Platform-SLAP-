import { toSafeExternalUrl } from '../utils/safeUrl.js'

// Opens in a new tab without giving the target page access to SELVIA. Unsafe URLs render as plain text.
// `onOpen` runs when the student opens the link by click, keyboard or middle click; it never delays or
// prevents the navigation itself.
export default function ExternalLink({ href, className, onOpen, children }) {
  const safeHref = toSafeExternalUrl(href)
  if (!safeHref) return <span className={className}>{children}</span>

  return (
    <a
      href={safeHref}
      className={className}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onOpen}
      onAuxClick={onOpen && ((event) => event.button === 1 && onOpen(event))}
    >
      {children}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  )
}
