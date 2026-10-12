// Code is shown as text only; it is never run.
export default function CodeBlock({ code, language }) {
  return (
    <figure className="code-block">
      {language && <figcaption className="code-block-language">{language}</figcaption>}
      <pre>
        <code>{code}</code>
      </pre>
    </figure>
  )
}
