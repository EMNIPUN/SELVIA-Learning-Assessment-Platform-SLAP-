// Short answers are compared after Unicode normalisation, trimming and collapsing runs of whitespace, and
// ignoring case unless the exercise or question is case-sensitive.
export function normaliseShortAnswer(text, caseSensitive) {
  const normalised = text.normalize('NFC').trim().replace(/\s+/g, ' ')
  return caseSensitive ? normalised : normalised.toLowerCase()
}
