export const PROJECT_STATUS = {
  idea: { label: 'Idée', color: 'purple' },
  active: { label: 'Actif', color: 'green' },
  maintenance: { label: 'Maintenance', color: 'blue' },
  paused: { label: 'En pause', color: 'orange' },
  archived: { label: 'Archivé', color: 'default' },
}

export const ITEM_KIND = {
  bug: { label: 'Bug', color: 'red' },
  feature: { label: 'Fonctionnalité', color: 'blue' },
  task: { label: 'Tâche', color: 'default' },
  question: { label: 'Question', color: 'gold' },
}

export const ITEM_STATUS = {
  todo: { label: 'À faire', color: 'default' },
  in_progress: { label: 'En cours', color: 'processing' },
  done: { label: 'Terminé', color: 'success' },
  wontfix: { label: 'Abandonné', color: 'default' },
}

export const PRIORITY = {
  low: { label: 'Basse', color: 'default' },
  normal: { label: 'Normale', color: 'blue' },
  high: { label: 'Haute', color: 'orange' },
  critical: { label: 'Critique', color: 'red' },
}

export const SOURCE = {
  manual: { label: 'Manuel', color: 'default' },
  forum: { label: 'Forum', color: 'cyan' },
  github: { label: 'GitHub', color: 'geekblue' },
  version: { label: 'Version', color: 'magenta' },
}

export const DOC_STATUS = {
  draft: { label: 'Brouillon', color: 'default' },
  review: { label: 'À relire', color: 'orange' },
  validated: { label: 'Validée', color: 'green' },
}

export const options = (map) => Object.entries(map).map(([value, { label }]) => ({ value, label }))

export function formatMinutes(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`
}
