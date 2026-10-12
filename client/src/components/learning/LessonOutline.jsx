import { useEffect, useState } from 'react'
import { LESSON_SECTION_IDS } from '../../constants/lessonSections.js'
import { focusById } from '../../utils/focus.js'

// How far below the top of the window a section heading counts as the one being read.
const READING_LINE = 140

// The section being read: the last one whose heading has scrolled up to the reading line, or the last
// section once the page is scrolled to the bottom. Reading position only; it records nothing.
function useCurrentSection(keys) {
  const [current, setCurrent] = useState(keys[0])
  const keyList = keys.join(' ')

  useEffect(() => {
    const sectionKeys = keyList.split(' ')
    let frame = 0
    function update() {
      frame = 0
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
      let active = sectionKeys[0]
      for (const key of sectionKeys) {
        const heading = document.getElementById(LESSON_SECTION_IDS[key])
        if (heading && heading.getBoundingClientRect().top <= READING_LINE) active = key
      }
      setCurrent(atBottom ? sectionKeys.at(-1) : active)
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [keyList])

  return current
}

// In-page links to each part of the lesson, in the order it is meant to be studied.
export default function LessonOutline({ hasContent }) {
  const steps = [
    hasContent && ['content', 'Lesson content'],
    ['materials', 'Learning materials'],
    ['examples', 'Examples'],
    ['practice', 'Practice'],
    ['next', "What's next"],
  ].filter(Boolean)
  const current = useCurrentSection(steps.map(([key]) => key))

  // Moving focus here (rather than following the #hash) keeps the route state that carries the lesson context.
  function goTo(event, key) {
    event.preventDefault()
    focusById(LESSON_SECTION_IDS[key])
  }

  return (
    <nav className="lesson-outline" aria-labelledby="lesson-outline-title">
      <h2 id="lesson-outline-title" className="lesson-outline-title">
        On this page
      </h2>
      <ol>
        {steps.map(([key, label], index) => (
          <li key={key}>
            <a
              href={`#${LESSON_SECTION_IDS[key]}`}
              aria-current={current === key ? 'location' : undefined}
              onClick={(event) => goTo(event, key)}
            >
              <span className="lesson-outline-step" aria-hidden="true">
                {index + 1}
              </span>
              {label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
