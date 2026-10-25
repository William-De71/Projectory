import { App, Button, Drawer, Flex, Modal, Popconfirm, Tooltip } from 'antd'
import { t } from '../i18n/index.js'

const SAVE_KEYS = navigator.platform?.startsWith('Mac') ? '⌘ ↵' : 'Ctrl + ↵'

// Dialog shared by the project, item and doc forms: the body scrolls, the
// buttons stay visible, Ctrl+Enter saves, and closing with unsaved input
// (Esc, ✕, Fermer) asks first when `isDirty` says so. `drawer` opens it as a
// side panel instead of a centered dialog.
export default function FormModal({ open, onClose, title, width = 760, saving, onSave, onDelete, deleteTitle, isDirty, drawer = false, children }) {
  const { modal } = App.useApp()
  const close = () => {
    if (!isDirty?.()) return onClose()
    modal.confirm({
      title: t('Fermer sans enregistrer ?'),
      content: t('Les modifications non enregistrées seront perdues.'),
      okText: t('Fermer sans enregistrer'),
      okButtonProps: { danger: true },
      cancelText: t('Continuer à modifier'),
      onOk: onClose,
    })
  }
  const onKeyDown = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key !== 'Enter') return
    e.preventDefault()
    if (!saving) onSave()
  }
  const footer = (
    <Flex gap={8} justify="space-between">
      {onDelete ? (
        <Popconfirm title={deleteTitle} onConfirm={onDelete}>
          <Button danger>{t('Supprimer')}</Button>
        </Popconfirm>
      ) : <span />}
      <Flex gap={8}>
        <Button onClick={close}>{t('Fermer')}</Button>
        <Tooltip title={SAVE_KEYS}>
          <Button type="primary" loading={saving} onClick={onSave}>{t('Enregistrer')}</Button>
        </Tooltip>
      </Flex>
    </Flex>
  )
  const body = <div onKeyDown={onKeyDown}>{children}</div>

  if (drawer) {
    return (
      <Drawer open={open} onClose={close} title={title} size={`min(${width}px, 100vw)`} destroyOnHidden footer={footer}>
        {body}
      </Drawer>
    )
  }
  return (
    <Modal
      open={open}
      onCancel={close}
      centered
      width={`min(${width}px, calc(100vw - 24px))`}
      title={title}
      destroyOnHidden
      mask={{ closable: false }}
      styles={{ body: { maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', paddingRight: 8 } }}
      footer={footer}
    >
      {body}
    </Modal>
  )
}
