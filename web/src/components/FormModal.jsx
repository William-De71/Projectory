import { Button, Flex, Modal, Popconfirm } from 'antd'
import { t } from '../i18n/index.js'

// Centered dialog shared by the project, item and doc forms: the body scrolls,
// the buttons stay visible, and a click outside does not drop unsaved input.
export default function FormModal({ open, onClose, title, width = 760, saving, onSave, onDelete, deleteTitle, children }) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      centered
      width={`min(${width}px, calc(100vw - 24px))`}
      title={title}
      destroyOnHidden
      mask={{ closable: false }}
      styles={{ body: { maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', paddingRight: 8 } }}
      footer={
        <Flex gap={8} justify="space-between">
          {onDelete ? (
            <Popconfirm title={deleteTitle} onConfirm={onDelete}>
              <Button danger>{t('Supprimer')}</Button>
            </Popconfirm>
          ) : <span />}
          <Flex gap={8}>
            <Button onClick={onClose}>{t('Annuler')}</Button>
            <Button type="primary" loading={saving} onClick={onSave}>{t('Enregistrer')}</Button>
          </Flex>
        </Flex>
      }
    >
      {children}
    </Modal>
  )
}
