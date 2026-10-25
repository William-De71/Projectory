import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { App } from 'antd'
import { api } from '../api/client.js'
import { ItemForm } from './ItemsPanel.jsx'
import ForumReplyModal, { needsForumReply } from './ForumReplyModal.jsx'

const ItemPanelContext = createContext({ openItem: () => {}, newItem: () => {}, offerForumReply: () => {} })

// openItem(item or id) shows an item in the side panel, newItem(defaults) a blank
// one; offerForumReply(updated) drafts the forum answer once a reported bug is fixed.
export const useItemPanel = () => useContext(ItemPanelContext)

// True when a dialog or a side panel is open: page shortcuts must stand aside.
export const overlayOpen = () => !!document.querySelector('.ant-modal-wrap:not([style*="display: none"]), .ant-drawer-open')

// The one side panel for every bug / task of the app. An existing item lives in
// the URL (?item=<id>: it can be shared, and Back closes it); a new one in state.
export function ItemPanelProvider({ children }) {
  const { message } = App.useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  const itemId = Number(searchParams.get('item')) || null
  const [loaded, setLoaded] = useState(null)
  const [draft, setDraft] = useState(null)
  const [replyTo, setReplyTo] = useState(null)

  const close = useCallback(() => {
    setDraft(null)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('item')
      return next
    }, { replace: true })
  }, [setSearchParams])

  useEffect(() => {
    // Closed (or left by navigation): the next opening fetches a fresh copy.
    if (!itemId) return setLoaded(null)
    if (loaded?.id === itemId) return
    let cancelled = false
    api.get(`/items/${itemId}`)
      .then((it) => { if (!cancelled) setLoaded(it) })
      .catch((err) => { if (!cancelled) { message.error(err.message); close() } })
    return () => { cancelled = true }
  }, [itemId, loaded, message, close])

  const value = useMemo(() => ({
    // A full row (from a list) shows at once; an id is fetched first.
    openItem: (itemOrId) => {
      const id = typeof itemOrId === 'object' ? itemOrId.id : Number(itemOrId)
      if (!id) return
      setLoaded(typeof itemOrId === 'object' ? itemOrId : null)
      setDraft(null)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('item', id)
        return next
      })
    },
    newItem: (defaults = {}) => setDraft({ ...defaults }),
    offerForumReply: (updated) => { if (needsForumReply(updated)) setReplyTo(updated) },
  }), [setSearchParams])

  const item = draft || (itemId && loaded?.id === itemId ? loaded : null)
  return (
    <ItemPanelContext.Provider value={value}>
      {children}
      <ItemForm item={item} onClose={close} onSaved={close} />
      <ForumReplyModal item={replyTo} onClose={() => setReplyTo(null)} />
    </ItemPanelContext.Provider>
  )
}
