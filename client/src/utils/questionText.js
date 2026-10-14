// A one-line plain-text version of a question's Markdown, to name it in lists, headings and dialogs.
export function questionExcerpt(text, maxLength = 140) {
  const plain = (text ?? '')
    .replace(/```[\s\S]*?(```|$)/g, ' [code] ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!plain) return 'Untitled question'
  return plain.length > maxLength ? `${plain.slice(0, maxLength - 1).trimEnd()}…` : plain
}
