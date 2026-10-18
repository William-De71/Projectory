import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function Markdown({ children }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
          // Click an image (e.g. a pasted screenshot) to open it full size.
          img: ({ node, ...props }) => <a href={props.src} target="_blank" rel="noreferrer"><img loading="lazy" {...props} /></a>,
        }}>
        {children || ''}
      </ReactMarkdown>
    </div>
  )
}
