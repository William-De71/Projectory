import { useMemo, useRef, useState } from 'react'
import { App, Button, Flex, Image, Input, theme, Typography } from 'antd'
import { CheckSquareOutlined, EditOutlined, EyeOutlined, PaperClipOutlined } from '@ant-design/icons'
import { api } from '../api/client.js'
import { t } from '../i18n/index.js'
import Markdown from './Markdown.jsx'

const IMAGE = /!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g

// Images referenced from the Markdown, without duplicates.
export function markdownImages(text) {
  const seen = new Map()
  for (const m of String(text || '').matchAll(IMAGE)) if (!seen.has(m[2])) seen.set(m[2], m[1])
  return [...seen].map(([src, alt]) => ({ src, alt }))
}

// Markdown for an uploaded file: images are shown inline, other files linked.
export function uploadMarkdown(file, uploaded) {
  const name = (file.name || 'fichier').replace(/[[\]]/g, '')
  return uploaded.image ? `![${name}](${uploaded.url})` : `[📎 ${name}](${uploaded.url})`
}

// Markdown text area accepting pasted, dropped or picked files: each one is
// uploaded and its Markdown inserted at the cursor. Works as a Form.Item child.
// `onCreateItem(selectedText, insertAfterSelection)` adds a button that turns the
// selected text into a task.
export default function MarkdownInput({ value = '', onChange, onCreateItem, ...props }) {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const ref = useRef(null)
  const picker = useRef(null)
  const [uploading, setUploading] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState(false)
  const [hasSelection, setHasSelection] = useState(false)
  const images = useMemo(() => markdownImages(value), [value])

  const textarea = () => ref.current?.resizableTextArea?.textArea

  const insertFiles = async (files) => {
    if (!files.length) return
    const el = textarea()
    // Remember the cursor now: the text may change while uploading.
    const start = el ? el.selectionStart : value.length
    const end = el ? el.selectionEnd : value.length
    setUploading((n) => n + files.length)
    const snippets = []
    for (const file of files) {
      try {
        snippets.push(uploadMarkdown(file, await api.upload(file)))
      } catch (err) {
        message.error(t('{name} : {error}', { name: file.name || t('fichier'), error: err.message }))
      } finally {
        setUploading((n) => n - 1)
      }
    }
    if (!snippets.length) return
    const current = textarea()?.value ?? value
    const before = current.slice(0, start)
    const text = `${before && !before.endsWith('\n') ? '\n' : ''}${snippets.join('\n')}\n`
    onChange?.(before + text + current.slice(end))
    requestAnimationFrame(() => {
      const node = textarea()
      if (!node) return
      node.focus()
      node.setSelectionRange(start + text.length, start + text.length)
    })
  }

  const onPaste = (e) => {
    const files = [...(e.clipboardData?.files || [])]
    if (!files.length) return
    e.preventDefault()
    insertFiles(files)
  }

  const onDrop = (e) => {
    setDragging(false)
    const files = [...(e.dataTransfer?.files || [])]
    if (!files.length) return
    e.preventDefault()
    insertFiles(files)
  }

  const createItem = () => {
    const el = textarea()
    const selected = el ? el.value.slice(el.selectionStart, el.selectionEnd) : ''
    if (!selected.trim()) return
    const end = el.selectionEnd
    onCreateItem(selected, (snippet) => {
      const current = textarea()?.value ?? value
      onChange?.(current.slice(0, end) + snippet + current.slice(end))
    })
  }

  return (
    <Flex vertical gap={4}>
      {preview ? (
        <div style={{ minHeight: 120, padding: '4px 11px', border: `1px solid ${token.colorBorder}`, borderRadius: token.borderRadius }}>
          {value.trim() ? <Markdown>{value}</Markdown> : <Typography.Text type="secondary">{t('Rien à afficher')}</Typography.Text>}
        </div>
      ) : (
      <Input.TextArea
        {...props}
        ref={ref}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onPaste={onPaste}
        onSelect={(e) => setHasSelection(e.target.selectionEnd > e.target.selectionStart)}
        onDrop={onDrop}
        onDragOver={(e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDragging(true) } }}
        onDragLeave={() => setDragging(false)}
        style={{ ...props.style, ...(dragging ? { borderColor: token.colorPrimary, background: token.colorPrimaryBg } : {}) }}
      />
      )}
      {!preview && images.length > 0 && (
        <Image.PreviewGroup>
          <Flex gap={8} wrap>
            {images.map((img) => (
              <Image
                key={img.src}
                src={img.src}
                alt={img.alt}
                width={72}
                height={72}
                style={{ objectFit: 'cover', borderRadius: token.borderRadiusSM, border: `1px solid ${token.colorBorderSecondary}` }}
              />
            ))}
          </Flex>
        </Image.PreviewGroup>
      )}
      <Flex gap={8} align="center" wrap>
        <Button size="small" type="text" icon={preview ? <EditOutlined /> : <EyeOutlined />} onClick={() => setPreview((p) => !p)}>
          {preview ? t('Modifier') : t('Prévisualiser')}
        </Button>
        <Button size="small" type="text" icon={<PaperClipOutlined />} disabled={preview} loading={uploading > 0} onClick={() => picker.current?.click()}>
          {uploading > 0 ? t('Envoi…') : t('Joindre un fichier')}
        </Button>
        {onCreateItem && !preview && (
          <Button size="small" type="text" icon={<CheckSquareOutlined />} disabled={!hasSelection} onClick={createItem}>
            {t('Créer une tâche depuis la sélection')}
          </Button>
        )}
        {!preview && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('ou colle / glisse une capture d’écran ici')}</Typography.Text>}
        <input
          ref={picker}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { insertFiles([...e.target.files]); e.target.value = '' }}
        />
      </Flex>
    </Flex>
  )
}
