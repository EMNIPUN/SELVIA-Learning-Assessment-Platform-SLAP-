import { useId, useRef, useState } from 'react'
import { ACTIVITY_TYPES } from '../constants/activityTypes.js'
import { trackActivity } from '../services/activityTracking.js'
import { formatEnumLabel } from '../utils/formatters.js'
import CodeBlock from './CodeBlock.jsx'
import MarkdownContent from './MarkdownContent.jsx'

// The worked content is revealed on request, so opening it is a clear sign the student looked at the example.
// EXAMPLE_VIEWED is recorded the first time it is opened while the lesson page is shown.
export default function ExampleCard({ example, position }) {
  const [open, setOpen] = useState(false)
  const viewRecorded = useRef(false)
  const bodyId = useId()

  function toggle() {
    if (!open && !viewRecorded.current) {
      viewRecorded.current = true
      trackActivity(ACTIVITY_TYPES.EXAMPLE_VIEWED, example.id)
    }
    setOpen(!open)
  }

  return (
    <article className="card example-card">
      <div className="example-card-header">
        <span className="example-card-label">Example {position}</span>
        <span className="content-type">{formatEnumLabel(example.exampleType)}</span>
      </div>
      <div className="example-card-body">
        <h3 className="content-card-title">{example.title}</h3>

        {example.problemStatement && (
          <div className="example-part">
            <h4 className="example-part-title">Problem</h4>
            <MarkdownContent source={example.problemStatement} />
          </div>
        )}

        <button
          type="button"
          className="button button-secondary button-small"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
        >
          {open ? 'Hide example' : 'Show example'}
        </button>

        {open && (
          <div id={bodyId} className="example-body">
            {example.content?.trim() && (
              <div className="example-part">
                <h4 className="example-part-title">Worked example</h4>
                <MarkdownContent source={example.content} />
              </div>
            )}

            {example.codeSnippet && (
              <div className="example-part">
                <h4 className="example-part-title">Code</h4>
                <CodeBlock code={example.codeSnippet} language={example.programmingLanguage} />
              </div>
            )}

            {example.explanation && (
              <div className="example-part">
                <h4 className="example-part-title">Explanation</h4>
                <MarkdownContent source={example.explanation} />
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
