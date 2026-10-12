// A heading at `level` in the course structure: h1–h6, then an ARIA heading for the levels HTML has no element
// for, so concepts and lessons keep their place in the heading outline.
export default function LevelHeading({ level, ...props }) {
  if (level <= 6) {
    const Heading = `h${level}`
    return <Heading {...props} />
  }
  return <p role="heading" aria-level={level} {...props} />
}
