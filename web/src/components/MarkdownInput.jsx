import { useRef, useState } from 'react'
import { App, Button, Flex, Input, theme, Typography } from 'antd'
import { PaperClipOutlined } from '@ant-design/icons'
import { api } from '../api/client.js'
import { t } from '../i18n/index.js'

// Markdown for an uploaded file: images are shown inline, other files linked.
export function uploadMarkdown(file, uploaded) {
  const name = (file.name || 'fichier').replace(/[[\]]/g, '')
  return uploaded.image ? `![${name}](${uploaded.url})` : `[📎 ${name}](${uploaded.url})`
}

// Markdown text area accepting pasted, dropped or picked files: each one is
// uploaded and its Markdown inserted at the cursor. Works as a Form.Item child.
export default function MarkdownInput({ value = '', onChange, ...props }) {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const ref = useRef(null)
  const picker = useRef(null)
  const [uploading, setUploading] = useState(0)
  const [dragging, setDragging] = useState(false)

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

  return (
    <Flex vertical gap={4}>
      <Input.TextArea
        {...props}
        ref={ref}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={(e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDragging(true) } }}
        onDragLeave={() => setDragging(false)}
        style={{ ...props.style, ...(dragging ? { borderColor: token.colorPrimary, background: token.colorPrimaryBg } : {}) }}
      />
      <Flex gap={8} align="center" wrap>
        <Button size="small" type="text" icon={<PaperClipOutlined />} loading={uploading > 0} onClick={() => picker.current?.click()}>
          {uploading > 0 ? t('Envoi…') : t('Joindre un fichier')}
        </Button>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('ou colle / glisse une capture d’écran ici')}</Typography.Text>
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
