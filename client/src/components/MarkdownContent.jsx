import CodeBlock from './CodeBlock.jsx'
import ExternalLink from './ExternalLink.jsx'

// Renders the Markdown subset used in lesson content (headings, paragraphs, lists, quotes, rules, fenced
// code, inline code, bold, italic, links) as React elements. Content is untrusted, so nothing is injected
// as HTML: raw HTML in the source is shown as text and links go through ExternalLink.

const FENCE = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
const UNORDERED = /^\s*[-*+]\s+(.*)$/
const ORDERED = /^\s*\d+[.)]\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/

const isBlockStart = (line) => [FENCE, HEADING, RULE, UNORDERED, ORDERED, QUOTE].some((pattern) => pattern.test(line))

function parseBlocks(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let i = 0

  const collect = (pattern) => {
    const items = []
    while (i < lines.length && pattern.test(lines[i])) items.push(lines[i++].match(pattern)[1])
    return items
  }

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i += 1
      continue
    }

    const fence = line.match(FENCE)
    if (fence) {
      const code = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) code.push(lines[i++])
      i += 1
      blocks.push({ type: 'code', language: fence[2], text: code.join('\n') })
      continue
    }

    const heading = line.match(HEADING)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] })
      i += 1
    } else if (RULE.test(line)) {
      blocks.push({ type: 'rule' })
      i += 1
    } else if (UNORDERED.test(line)) {
      blocks.push({ type: 'list', ordered: false, items: collect(UNORDERED) })
    } else if (ORDERED.test(line)) {
      blocks.push({ type: 'list', ordered: true, items: collect(ORDERED) })
    } else if (QUOTE.test(line)) {
      blocks.push({ type: 'quote', text: collect(QUOTE).join(' ') })
    } else {
      const paragraph = []
      while (i < lines.length && lines[i].trim() && (paragraph.length === 0 || !isBlockStart(lines[i]))) {
        paragraph.push(lines[i++].trim())
      }
      blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
    }
  }
  return blocks
}

// Underscore emphasis needs word boundaries so identifiers such as snake_case_names stay intact.
const INLINE =
  /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s](?:[^*]*[^*\s])?)\*|(?<!\w)_([^_\s](?:[^_]*[^_\s])?)_(?!\w)/g

function renderInline(text) {
  const nodes = []
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    const [whole, code, bold, linkText, linkUrl, star, underscore] = match
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const key = match.index
    if (code !== undefined) nodes.push(<code key={key}>{code}</code>)
    else if (bold !== undefined) nodes.push(<strong key={key}>{renderInline(bold)}</strong>)
    else if (linkText !== undefined) {
      nodes.push(
        <ExternalLink key={key} href={linkUrl}>
          {renderInline(linkText)}
        </ExternalLink>,
      )
    } else nodes.push(<em key={key}>{renderInline(star ?? underscore)}</em>)
    last = match.index + whole.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function Block({ block }) {
  switch (block.type) {
    case 'code':
      return <CodeBlock code={block.text} language={block.language} />
    case 'heading': {
      // The page title is h1 and section titles are h2, so content headings start at h3.
      const Heading = `h${Math.min(block.level + 2, 6)}`
      return <Heading>{renderInline(block.text)}</Heading>
    }
    case 'rule':
      return <hr />
    case 'list': {
      const List = block.ordered ? 'ol' : 'ul'
      return (
        <List>
          {block.items.map((item, index) => (
            <li key={index}>{renderInline(item)}</li>
          ))}
        </List>
      )
    }
    case 'quote':
      return <blockquote>{renderInline(block.text)}</blockquote>
    default:
      return <p>{renderInline(block.text)}</p>
  }
}

export default function MarkdownContent({ source, className = '' }) {
  return (
    <div className={`markdown ${className}`.trim()}>
      {parseBlocks(source ?? '').map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  )
}
