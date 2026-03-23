import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { api } from './api'

const COMMANDS = [
  { key: 'Heading 1', value: '# ' },
  { key: 'Heading 2', value: '## ' },
  { key: 'Heading 3', value: '### ' },
  { key: 'Bullet list', value: '- ' },
  { key: 'Checklist', value: '- [ ] ' },
  { key: 'Quote', value: '> ' },
  { key: 'Code block', value: '```\n\n```' },
  { key: 'Divider', value: '\n---\n' },
]

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function countWords(text) {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

function sidebarGroups(notes) {
  return {
    pinned: notes.filter((n) => n.is_pinned),
    others: notes.filter((n) => !n.is_pinned),
  }
}

function buildGraphLayout(data) {
  const width = 860
  const height = 560
  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(width, height) * 0.34
  const nodes = data.nodes || []
  const positioned = nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1) - Math.PI / 2
    const x = cx + radius * Math.cos(angle)
    const y = cy + radius * Math.sin(angle)
    return { ...node, x, y }
  })
  const byId = new Map(positioned.map((node) => [node.id, node]))
  const edges = (data.edges || [])
    .map((edge) => ({ ...edge, from: byId.get(edge.from_note_id), to: byId.get(edge.to_note_id) }))
    .filter((edge) => edge.from && edge.to)
  return { width, height, nodes: positioned, edges }
}

export default function App() {
  const [notes, setNotes] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [selectedNote, setSelectedNote] = useState(null)
  const [draft, setDraft] = useState({ title: '', content: '', is_pinned: false })
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('Ready')
  const [tagInput, setTagInput] = useState('')
  const [linkQuery, setLinkQuery] = useState('')
  const [linkTargetId, setLinkTargetId] = useState('')
  const [linkRelation, setLinkRelation] = useState('related')
  const [showPreview, setShowPreview] = useState(true)
  const [showCommands, setShowCommands] = useState(false)
  const [commandFilter, setCommandFilter] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [view, setView] = useState('editor')
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] })
  const textareaRef = useRef(null)

  const counts = useMemo(() => ({
    words: countWords(draft.content),
    chars: draft.content.length,
  }), [draft.content])

  const filteredCommandList = useMemo(
    () => COMMANDS.filter((c) => c.key.toLowerCase().includes(commandFilter.toLowerCase())),
    [commandFilter],
  )
  const linkCandidates = useMemo(
    () => notes.filter((n) => n.id !== selectedId && n.title.toLowerCase().includes(linkQuery.toLowerCase())),
    [notes, linkQuery, selectedId],
  )
  const groups = useMemo(() => sidebarGroups(notes), [notes])
  const graphLayout = useMemo(() => buildGraphLayout(graphData), [graphData])

  async function refreshGraph() {
    const data = await api.getGraph()
    setGraphData(data)
  }

  async function refreshNotes(useSearch = search) {
    const data = useSearch.trim() ? await api.searchNotes(useSearch.trim()) : await api.listNotes()
    setNotes(data)
    if (!selectedId && data.length > 0) setSelectedId(data[0].id)
  }

  async function syncAll(useSearch = search) {
    await Promise.all([refreshNotes(useSearch), refreshGraph()])
  }

  async function loadNote(id) {
    const data = await api.getNote(id)
    setSelectedNote(data)
    setDraft({ title: data.title, content: data.content, is_pinned: data.is_pinned })
    setTagInput('')
    setLinkTargetId('')
    setLinkQuery('')
  }

  useEffect(() => {
    syncAll().catch((err) => setStatus(err.message))
  }, [])

  useEffect(() => {
    if (selectedId) loadNote(selectedId).catch((err) => setStatus(err.message))
  }, [selectedId])

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        handleSave()
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setDraft((prev) => ({ ...prev, is_pinned: !prev.is_pinned }))
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'g') {
        event.preventDefault()
        setView((prev) => (prev === 'graph' ? 'editor' : 'graph'))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, draft])

  async function handleCreate() {
    try {
      const created = await api.createNote({ title: 'Untitled note', content: '' })
      setSearch('')
      await syncAll('')
      setSelectedId(created.id)
      setView('editor')
      setStatus('Created a new note.')
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function handleSave() {
    if (!selectedId || !draft.title.trim()) return
    try {
      setIsSaving(true)
      const updated = await api.updateNote(selectedId, {
        title: draft.title.trim(),
        content: draft.content,
        is_pinned: draft.is_pinned,
      })
      setSelectedNote(updated)
      await syncAll()
      await loadNote(selectedId)
      setStatus(draft.is_pinned ? 'Saved changes and kept note pinned.' : 'Saved changes.')
    } catch (err) {
      setStatus(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!selectedId) return
    const confirmed = window.confirm('Delete this note? This cannot be undone.')
    if (!confirmed) return
    try {
      await api.deleteNote(selectedId)
      setSelectedId(null)
      setSelectedNote(null)
      setDraft({ title: '', content: '', is_pinned: false })
      setSearch('')
      await syncAll('')
      setStatus('Deleted note.')
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function handleSearch(value) {
    setSearch(value)
    try {
      const data = value.trim() ? await api.searchNotes(value.trim()) : await api.listNotes()
      setNotes(data)
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function handleAddTag() {
    if (!selectedId || !tagInput.trim()) return
    try {
      const updated = await api.addTag(selectedId, tagInput.trim())
      setSelectedNote(updated)
      setTagInput('')
      await syncAll()
      await loadNote(selectedId)
      setStatus('Added tag.')
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function handleRemoveTag(tag) {
    if (!selectedId) return
    try {
      const updated = await api.removeTag(selectedId, tag)
      setSelectedNote(updated)
      await syncAll()
      await loadNote(selectedId)
      setStatus('Removed tag.')
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function handleCreateLink() {
    if (!selectedId || !linkTargetId) return
    try {
      await api.createLink({
        from_note_id: selectedId,
        to_note_id: Number(linkTargetId),
        relation: linkRelation.trim() || 'related',
      })
      await syncAll()
      await loadNote(selectedId)
      setLinkTargetId('')
      setLinkQuery('')
      setStatus('Linked notes.')
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function handleRemoveLink(linkId) {
    try {
      await api.deleteLink(linkId)
      await syncAll()
      await loadNote(selectedId)
      setStatus('Removed link.')
    } catch (err) {
      setStatus(err.message)
    }
  }

  function insertCommand(value) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const next = draft.content.slice(0, start) + value + draft.content.slice(end)
    setDraft((prev) => ({ ...prev, content: next }))
    setShowCommands(false)
    setCommandFilter('')
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + value.length
      el.setSelectionRange(pos, pos)
    })
  }

  function handleEditorChange(value) {
    setDraft((prev) => ({ ...prev, content: value }))
    const el = textareaRef.current
    if (!el) return
    const beforeCursor = value.slice(0, el.selectionStart)
    const line = beforeCursor.split('\n').pop() || ''
    if (line.startsWith('/')) {
      setShowCommands(true)
      setCommandFilter(line.slice(1))
    } else {
      setShowCommands(false)
      setCommandFilter('')
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto flex min-h-[94vh] max-w-[1600px] gap-4 rounded-[30px] border border-[#d2c18f] bg-[#fff8df]/95 p-4 shadow-legal backdrop-blur-sm">
        <aside className="feather-sidebar flex w-[330px] shrink-0 flex-col rounded-[26px] border border-[#ddc98e] bg-[#fffbe9] p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8f6a16]">Atharva's field book</div>
              <h1 className="mt-1 text-[30px] font-semibold tracking-tight text-[#3d2d08]">FeatherGraph</h1>
            </div>
            <button onClick={handleCreate} className="rounded-2xl border border-[#b08d35] bg-[#f1d26d] px-4 py-2 text-sm font-semibold text-[#43310a] transition hover:-translate-y-0.5 hover:bg-[#ebc956]">New</button>
          </div>

          <div className="mb-4 rounded-2xl border border-[#dfcf9e] bg-[#fffdf4] px-3 py-3 shadow-inner-soft">
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search notes, ideas, tags..."
              className="w-full border-none bg-transparent text-sm text-[#4a3910] outline-none placeholder:text-[#9f8a54]"
            />
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
            <StatCard tone="gold" label="Notes" value={notes.length} />
            <StatCard tone="ink" label="Pinned" value={groups.pinned.length} />
          </div>

          <div className="mb-4 flex gap-2 text-sm">
            <button onClick={() => setView('editor')} className={`flex-1 rounded-2xl border px-3 py-2 ${view === 'editor' ? 'border-[#6a5320] bg-[#6a5320] text-[#fff7da]' : 'border-[#dcc78b] bg-[#fffdf3] text-[#5d4817]'}`}>Editor</button>
            <button onClick={() => setView('graph')} className={`flex-1 rounded-2xl border px-3 py-2 ${view === 'graph' ? 'border-[#6a5320] bg-[#6a5320] text-[#fff7da]' : 'border-[#dcc78b] bg-[#fffdf3] text-[#5d4817]'}`}>Graph</button>
          </div>

          <div className="scrollbar-thin flex-1 overflow-y-auto pr-1">
            {groups.pinned.length > 0 && (
              <Section label="Pinned">
                {groups.pinned.map((note) => <NoteItem key={note.id} note={note} selectedId={selectedId} onClick={setSelectedId} />)}
              </Section>
            )}
            <Section label="All Notes">
              {groups.others.map((note) => <NoteItem key={note.id} note={note} selectedId={selectedId} onClick={setSelectedId} />)}
            </Section>
          </div>
        </aside>

        <main className="grid flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
          <section className="rounded-[28px] border border-[#ddc98e] bg-[#fffdf4]/90 p-5">
            {view === 'graph' ? (
              <GraphView graphLayout={graphLayout} selectedId={selectedId} onSelect={setSelectedId} />
            ) : selectedNote ? (
              <>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#e3d6aa] pb-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-[#9d8545]">Legal pad workspace</div>
                    <div className="mt-1 text-sm text-[#76622d]">Saved {fmtDate(selectedNote.updated_at)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setShowPreview((prev) => !prev)} className="rounded-2xl border border-[#ddc98e] px-3 py-2 text-sm text-[#5a4714] hover:bg-[#fff6d8]">{showPreview ? 'Hide preview' : 'Show preview'}</button>
                    <button onClick={() => setDraft((prev) => ({ ...prev, is_pinned: !prev.is_pinned }))} className={`rounded-2xl border px-3 py-2 text-sm ${draft.is_pinned ? 'border-[#b08d35] bg-[#f5df90] text-[#573f08]' : 'border-[#ddc98e] text-[#5a4714] hover:bg-[#fff6d8]'}`}>{draft.is_pinned ? 'Pinned' : 'Pin note'}</button>
                    <button onClick={handleDelete} className="rounded-2xl border border-[#d9b8a8] px-3 py-2 text-sm text-[#8b4830] hover:bg-[#faece6]">Delete</button>
                    <button disabled={isSaving} onClick={handleSave} className="rounded-2xl border border-[#6a5320] bg-[#6a5320] px-4 py-2 text-sm font-semibold text-[#fff7da] hover:bg-[#5b471b] disabled:opacity-60">{isSaving ? 'Saving...' : 'Save'}</button>
                  </div>
                </div>

                <input
                  value={draft.title}
                  onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                  className="mb-4 w-full border-none bg-transparent text-4xl font-semibold tracking-tight text-[#3f2f0d] outline-none placeholder:text-[#c7b57a]"
                  placeholder="Untitled note"
                />

                <div className={`grid gap-4 ${showPreview ? 'lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]' : 'grid-cols-1'}`}>
                  <div className="relative">
                    <textarea
                      ref={textareaRef}
                      value={draft.content}
                      onChange={(e) => handleEditorChange(e.target.value)}
                      placeholder="Start writing... Type / for quick inserts. Markdown is supported."
                      className="legal-page scrollbar-thin min-h-[64vh] w-full resize-none rounded-[24px] border border-[#e1d3a5] bg-[#fffef7] px-8 py-6 text-[15px] leading-8 text-[#4b3910] outline-none transition focus:border-[#c0a55b] focus:ring-4 focus:ring-[#f7e8ac]"
                    />
                    {showCommands && filteredCommandList.length > 0 && (
                      <div className="absolute left-5 top-5 z-20 w-64 rounded-2xl border border-[#ddc98e] bg-[#fffdf4] p-2 shadow-2xl">
                        <div className="px-3 pb-2 pt-1 text-[11px] uppercase tracking-[0.2em] text-[#9d8545]">Quick insert</div>
                        {filteredCommandList.map((command) => (
                          <button key={command.key} onClick={() => insertCommand(command.value)} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-[#5a4714] hover:bg-[#fff6d8]">
                            {command.key}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {showPreview && (
                    <div className="scrollbar-thin min-h-[64vh] overflow-y-auto rounded-[24px] border border-[#e1d3a5] bg-gradient-to-b from-[#fffef8] to-[#f9f1d0] p-6">
                      <div className="mb-3 text-xs uppercase tracking-[0.22em] text-[#9d8545]">Live preview</div>
                      <article className="prose-lite text-[#4b3910]">
                        <ReactMarkdown>{draft.content || '*Nothing to preview yet.*'}</ReactMarkdown>
                      </article>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex min-h-[75vh] items-center justify-center rounded-[24px] border border-dashed border-[#ceb978] bg-[#fffef6] p-8 text-center">
                <div>
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-[#b69342] bg-[#f1d26d] text-2xl font-semibold text-[#47340b]">F</div>
                  <h2 className="text-2xl font-semibold tracking-tight text-[#3f2f0d]">Select a note or create a new one</h2>
                  <p className="mt-2 max-w-md text-[#7b6731]">FeatherGraph now includes a visual graph mode, a pinning workflow that persists, and a cleaner notebook palette you can comfortably keep using.</p>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-4 rounded-[28px] border border-[#ddc98e] bg-[#fffdf4]/90 p-4">
            <Panel title="Session">
              <div className="text-sm text-[#6c5923]">{status}</div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Metric label="Words" value={counts.words} />
                <Metric label="Characters" value={counts.chars} />
              </div>
              <div className="mt-4 space-y-2 text-sm text-[#846f36]">
                <div>⌘/Ctrl + S to save</div>
                <div>⌘/Ctrl + P to pin</div>
                <div>⌘/Ctrl + G to toggle graph view</div>
                <div>Type / in the editor for insert commands</div>
              </div>
            </Panel>

            <Panel title="Tags">
              <div className="mb-3 flex gap-2">
                <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Add tag" className="w-full rounded-2xl border border-[#dfcf9e] bg-[#fffef8] px-3 py-2 text-sm outline-none" />
                <button onClick={handleAddTag} className="rounded-2xl border border-[#6a5320] bg-[#6a5320] px-3 py-2 text-sm text-[#fff7da]">Add</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedNote?.tags?.length ? selectedNote.tags.map((tag) => (
                  <button key={tag} onClick={() => handleRemoveTag(tag)} className="rounded-full border border-[#e0d5ae] bg-[#f5edd0] px-3 py-1 text-sm text-[#5a4714] transition hover:bg-[#faece6] hover:text-[#8b4830]">#{tag}</button>
                )) : <EmptyText text="No tags yet" />}
              </div>
            </Panel>

            <Panel title="Link a note">
              <input value={linkQuery} onChange={(e) => setLinkQuery(e.target.value)} placeholder="Search notes to link" className="mb-3 w-full rounded-2xl border border-[#dfcf9e] bg-[#fffef8] px-3 py-2 text-sm outline-none" />
              <select value={linkTargetId} onChange={(e) => setLinkTargetId(e.target.value)} className="mb-3 w-full rounded-2xl border border-[#dfcf9e] bg-[#fffef8] px-3 py-2 text-sm outline-none">
                <option value="">Choose note</option>
                {linkCandidates.map((note) => <option key={note.id} value={note.id}>{note.title}</option>)}
              </select>
              <input value={linkRelation} onChange={(e) => setLinkRelation(e.target.value)} placeholder="Relation (related, expands, summary...)" className="mb-3 w-full rounded-2xl border border-[#dfcf9e] bg-[#fffef8] px-3 py-2 text-sm outline-none" />
              <button onClick={handleCreateLink} className="w-full rounded-2xl border border-[#6a5320] bg-[#6a5320] px-3 py-2 text-sm text-[#fff7da]">Create link</button>
            </Panel>

            <Panel title="Outgoing links">
              <div className="space-y-2">
                {selectedNote?.outgoing_links?.length ? selectedNote.outgoing_links.map((link) => (
                  <div key={link.id} className="rounded-2xl border border-[#dfcf9e] bg-[#fffef8] px-3 py-3 transition hover:bg-[#fff7dd]">
                    <button onClick={() => { setSelectedId(link.note_id); setView('editor') }} className="w-full text-left">
                      <div className="text-sm font-medium text-[#3f2f0d]">{link.title}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[#9d8545]">{link.relation}</div>
                    </button>
                    <button onClick={() => handleRemoveLink(link.id)} className="mt-3 text-xs text-[#8b4830] hover:underline">Remove link</button>
                  </div>
                )) : <EmptyText text="No outgoing links" />}
              </div>
            </Panel>

            <Panel title="Backlinks">
              <div className="space-y-2">
                {selectedNote?.incoming_links?.length ? selectedNote.incoming_links.map((link) => (
                  <button key={link.id} onClick={() => { setSelectedId(link.note_id); setView('editor') }} className="w-full rounded-2xl border border-[#dfcf9e] bg-[#fffef8] px-3 py-3 text-left transition hover:bg-[#fff7dd]">
                    <div className="text-sm font-medium text-[#3f2f0d]">{link.title}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[#9d8545]">{link.relation}</div>
                  </button>
                )) : <EmptyText text="No backlinks" />}
              </div>
            </Panel>
          </aside>
        </main>
      </div>
    </div>
  )
}

function GraphView({ graphLayout, selectedId, onSelect }) {
  return (
    <div className="flex h-full min-h-[76vh] flex-col rounded-[24px] border border-[#e1d3a5] bg-[#fffef7] p-4">
      <div className="mb-4 flex items-end justify-between gap-4 border-b border-[#eadfb9] pb-4">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-[#9d8545]">Graph view</div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[#3f2f0d]">Relationship map</h2>
          <p className="mt-1 text-sm text-[#7b6731]">Click any node to jump back into the editor. Pinned notes appear larger and darker.</p>
        </div>
        <div className="rounded-2xl border border-[#dfcf9e] bg-[#f5edd0] px-4 py-3 text-sm text-[#5a4714]">
          <div>{graphLayout.nodes.length} notes</div>
          <div>{graphLayout.edges.length} links</div>
        </div>
      </div>
      <div className="graph-paper relative flex-1 overflow-hidden rounded-[22px] border border-[#e1d3a5] bg-[#fffceb]">
        <svg viewBox={`0 0 ${graphLayout.width} ${graphLayout.height}`} className="h-full w-full">
          {graphLayout.edges.map((edge) => (
            <g key={edge.id}>
              <line x1={edge.from.x} y1={edge.from.y} x2={edge.to.x} y2={edge.to.y} stroke="#af9a60" strokeWidth="2" opacity="0.8" />
              <text x={(edge.from.x + edge.to.x) / 2} y={(edge.from.y + edge.to.y) / 2 - 8} textAnchor="middle" fontSize="11" fill="#7c6835">
                {edge.relation}
              </text>
            </g>
          ))}
          {graphLayout.nodes.map((node) => {
            const selected = node.id === selectedId
            const radius = node.is_pinned ? 34 : 28
            return (
              <g key={node.id} transform={`translate(${node.x}, ${node.y})`} onClick={() => onSelect(node.id)} className="cursor-pointer">
                <circle r={radius} fill={selected ? '#6a5320' : node.is_pinned ? '#b08d35' : '#f1d26d'} stroke="#5b471b" strokeWidth="2.2" />
                <text y="5" textAnchor="middle" fontSize="12" fontWeight="600" fill={selected ? '#fff7da' : '#47340b'}>
                  {truncate(node.title, 12)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {graphLayout.nodes.map((node) => (
          <button key={node.id} onClick={() => onSelect(node.id)} className={`rounded-2xl border px-4 py-3 text-left ${node.id === selectedId ? 'border-[#6a5320] bg-[#6a5320] text-[#fff7da]' : 'border-[#dfcf9e] bg-[#fffef8] text-[#3f2f0d]'}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-sm font-semibold">{node.title}</div>
              {node.is_pinned && <span className="text-xs">★</span>}
            </div>
            <div className={`mt-2 text-xs ${node.id === selectedId ? 'text-[#f3e7bf]' : 'text-[#8f7740]'}`}>{node.tags?.length ? node.tags.map((tag) => `#${tag}`).join(' ') : 'No tags'}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function truncate(value, max) {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

function Section({ label, children }) {
  return (
    <div className="mb-5">
      <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9d8545]">{label}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function NoteItem({ note, selectedId, onClick }) {
  const selected = selectedId === note.id
  return (
    <button onClick={() => onClick(note.id)} className={`w-full rounded-2xl border px-3 py-3 text-left transition ${selected ? 'border-[#6a5320] bg-[#6a5320] text-[#fff7da] shadow-lg' : 'border-[#dfcf9e] bg-[#fffef8] text-[#4a3910] hover:bg-[#fff7dd]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{note.title}</div>
          <div className={`mt-1 text-xs ${selected ? 'text-[#f3e7bf]' : 'text-[#967f46]'}`}>{fmtDate(note.updated_at)}</div>
        </div>
        {note.is_pinned && <div className={`text-xs ${selected ? 'text-[#ffd77a]' : 'text-[#b08d35]'}`}>★</div>}
      </div>
      {note.tags?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{note.tags.slice(0, 3).map((tag) => <span key={tag} className={`rounded-full px-2 py-0.5 text-[11px] ${selected ? 'bg-white/12 text-[#fff7da]' : 'bg-[#f6ecd0] text-[#7c6835]'}`}>#{tag}</span>)}</div>}
    </button>
  )
}

function Panel({ title, children }) {
  return (
    <section className="rounded-[24px] border border-[#dfcf9e] bg-[#fffef8] p-4">
      <h3 className="mb-3 text-sm font-semibold text-[#3f2f0d]">{title}</h3>
      {children}
    </section>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-2xl border border-[#e1d3a5] bg-[#f7efd2] p-3">
      <div className="text-[#8a7440]">{label}</div>
      <div className="mt-1 text-lg font-semibold text-[#3f2f0d]">{value}</div>
    </div>
  )
}

function StatCard({ tone, label, value }) {
  const classes = tone === 'gold'
    ? 'border-[#e1d3a5] bg-[#f7efd2] text-[#4a3910]'
    : 'border-[#cbb77d] bg-[#efe0a9] text-[#3f2f0d]'
  return (
    <div className={`rounded-2xl border p-3 ${classes}`}>
      <div className="text-[#8a7440]">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  )
}

function EmptyText({ text }) {
  return <div className="rounded-2xl border border-[#e1d3a5] bg-[#f7efd2] px-3 py-3 text-sm text-[#7c6835]">{text}</div>
}
