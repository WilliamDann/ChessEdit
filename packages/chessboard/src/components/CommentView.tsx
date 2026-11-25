import { memo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

import "./comment.css"

type Props = {
  text: string
}

// Render markdown inline with the move list: block constructs map to
// inline spans, so a short comment ("Inaccuracy. c4 was best.") stays
// on the move's line. Paragraphs, headings, quotes and list items
// separate themselves with line breaks; tables/pre stay block.
const components: Components = {
  p: ({ children }) => <span className="md-p">{children}</span>,
  h1: ({ children }) => <strong className="md-h">{children}</strong>,
  h2: ({ children }) => <strong className="md-h">{children}</strong>,
  h3: ({ children }) => <strong className="md-h">{children}</strong>,
  h4: ({ children }) => <strong className="md-h">{children}</strong>,
  h5: ({ children }) => <strong className="md-h">{children}</strong>,
  h6: ({ children }) => <strong className="md-h">{children}</strong>,
  ul: ({ children }) => <span>{children}</span>,
  ol: ({ children }) => <span>{children}</span>,
  li: ({ children }) => <span className="md-li">• {children}</span>,
  blockquote: ({ children }) => <em className="md-quote">{children}</em>,
}

/**
 * Renders a PGN comment as markdown (GFM tables/strikethrough,
 * single newlines preserved). Memoized because the move tree
 * re-renders on every change while comment text rarely changes.
 *
 * Markdown strips leading/trailing newlines from its source, so
 * they're split off and rendered literally — newlines typed in the
 * comment editor (especially at the edges) show up in the tree.
 */
const CommentView = memo(function CommentView({ text }: Props) {
  if (!text) return null

  const match = text.match(/^(\n*)([\s\S]*?)(\n*)$/)
  const lead = match?.[1] ?? ''
  const body = match?.[2] ?? ''
  const trail = body ? match?.[3] ?? '' : ''

  return (
    <span className="comment chess-markdown">
      {lead && <span className="md-newlines">{lead}</span>}
      <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {body}
      </Markdown>
      {trail && <span className="md-newlines">{trail}</span>}
    </span>
  )
})

export default CommentView
