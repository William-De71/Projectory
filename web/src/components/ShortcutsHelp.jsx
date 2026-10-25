import { useEffect, useState } from 'react'
import { Flex, Modal, Tag, Typography } from 'antd'
import { isTyping } from './ItemsPanel.jsx'
import { overlayOpen } from './ItemPanel.jsx'
import { t } from '../i18n/index.js'

const MONO = 'ui-monospace, monospace'
const MOD = navigator.platform?.startsWith('Mac') ? '⌘' : 'Ctrl'
const GROUPS = [
  {
    title: 'Partout',
    keys: [
      { keys: [`${MOD} K`], label: 'Aller à, chercher, créer…' },
      { keys: ['n'], label: 'Nouveau bug / tâche' },
      { keys: ['?'], label: 'Afficher cette aide' },
      { keys: [`${MOD} ↵`], label: 'Enregistrer le formulaire ouvert' },
      { keys: ['Esc'], label: 'Fermer le panneau ou la fenêtre' },
    ],
  },
  {
    title: 'Listes de bugs & tâches',
    keys: [
      { keys: ['j', '↓'], label: 'Élément suivant' },
      { keys: ['k', '↑'], label: 'Élément précédent' },
      { keys: ['↵', 'e'], label: 'Ouvrir' },
      { keys: ['s'], label: 'Statut suivant' },
      { keys: ['x'], label: 'Sélectionner' },
      { keys: ['/'], label: 'Rechercher' },
      { keys: ['Esc'], label: 'Tout désélectionner' },
    ],
  },
]

export const openShortcuts = () => window.dispatchEvent(new Event('projectory:shortcuts'))

// Keyboard shortcuts of the app, opened with "?" or from the menus.
export default function ShortcutsHelp() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const show = () => setOpen(true)
    const onKey = (e) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || overlayOpen()) return
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener('projectory:shortcuts', show)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('projectory:shortcuts', show)
      window.removeEventListener('keydown', onKey)
    }
  }, [])
  return (
    <Modal open={open} onCancel={() => setOpen(false)} footer={null} title={t('Raccourcis clavier')} width="min(520px, calc(100vw - 24px))">
      <Flex vertical gap={16}>
        {GROUPS.map((group) => (
          <Flex key={group.title} vertical gap={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>{t(group.title)}</Typography.Text>
            {group.keys.map(({ keys, label }) => (
              <Flex key={label} justify="space-between" align="center" gap={12}>
                <span>{t(label)}</span>
                <Flex gap={4}>{keys.map((k) => <Tag key={k} style={{ marginInlineEnd: 0, fontFamily: MONO }}>{k}</Tag>)}</Flex>
              </Flex>
            ))}
          </Flex>
        ))}
      </Flex>
    </Modal>
  )
}
