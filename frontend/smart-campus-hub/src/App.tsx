import { useCallback, useEffect, useState } from 'react'
import { api, cleanTitle, dateLabel, isUpcoming, palette, readSession, saveSession, timeLabel } from './lib/api'
import type { CampusEvent, EventInput, Result, Session } from './lib/api'
import AuthPage from './components/AuthPage'
import EventCard from './components/EventCard'
import EventDetails from './components/EventDetails'
import EventForm from './components/EventForm'
import Icon from './components/Icon'
import Modal from './components/Modal'
import ThemeToggle from './components/ThemeToggle'
import './App.css'
import './theme.css'

type View = 'overview' | 'events' | 'mine' | 'manage'
type Notice = { message: string; error?: boolean } | null
function currentView(): View { const hash = location.hash.slice(1); return ['overview', 'events', 'mine', 'manage'].includes(hash) ? hash as View : 'overview' }

function App() {
  const [session, setSession] = useState<Session | null>(readSession)
  const [view, setView] = useState<View>(currentView)
  const [events, setEvents] = useState<CampusEvent[]>([])
  const [mine, setMine] = useState<CampusEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [revision, setRevision] = useState(0)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All events')
  const [date, setDate] = useState('')
  const [selected, setSelected] = useState<CampusEvent | null>(null)
  const [editor, setEditor] = useState<CampusEvent | 'new' | null>(null)
  const [deleting, setDeleting] = useState<CampusEvent | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const admin = session?.user.role === 'admin'
  const token = session?.token
  const role = session?.user.role
  const notify = useCallback((message: string, error = false) => setNotice({ message, error }), [])
  function navigate(next: View) { setView(next); location.hash = next; setMenuOpen(false); setSearch(''); setCategory('All events'); setDate('') }
  function refresh() { setLoading(true); setLoadError(''); setRevision(value => value + 1) }
  function logout() { saveSession(null); setSession(null); setSelected(null); setEditor(null); setDeleting(null); setEvents([]); setMine([]); setMenuOpen(false); location.hash = ''; setView('overview') }
  function login(next: Session) { saveSession(next); setSession(next); setLoading(true); setLoadError(''); navigate('overview') }
  useEffect(() => {
    const onHash = () => setView(currentView())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    const expired = () => { saveSession(null); setSession(null); setSelected(null); setEditor(null); setDeleting(null); setEvents([]); setMine([]); notify('Your session has ended. Please sign in again.', true) }
    window.addEventListener('campus:expired', expired)
    return () => window.removeEventListener('campus:expired', expired)
  }, [notify])
  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    Promise.all([
      api<Result<CampusEvent[]>>(`/events${role === 'admin' ? '?all=true' : ''}`, { token, signal: controller.signal }),
      role === 'student' ? api<Result<CampusEvent[]>>('/registrations/my', { token, signal: controller.signal }) : Promise.resolve({ data: [] as CampusEvent[] }),
    ]).then(([all, registered]) => { setEvents(all.data); setMine(registered.data); setLoading(false) }).catch(error => { if (!controller.signal.aborted) { setLoadError(error.message); setLoading(false) } })
    return () => controller.abort()
  }, [token, role, revision])
  useEffect(() => {
    if (!menuOpen) return
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [menuOpen])
  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(null), 7000)
    return () => window.clearTimeout(timeout)
  }, [notice])
  async function openEvent(event: CampusEvent) {
    try { const result = await api<Result<CampusEvent>>(`/events/${event.id}`, { token }); setSelected(result.data) }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not load the event.', true) }
  }
  async function register() {
    if (!selected || !token) return
    await api(`/registrations/${selected.id}`, { token, method: 'POST' })
    const registered = await api<Result<CampusEvent[]>>('/registrations/my', { token })
    setMine(registered.data); notify('You’re in! Your next campus moment is on the calendar.')
  }
  async function saveEvent(input: EventInput) {
    if (!token || !editor) return
    await api(editor === 'new' ? '/events' : `/events/${editor.id}`, { token, method: editor === 'new' ? 'POST' : 'PUT', body: input })
    notify(editor === 'new' ? 'Your event is live. Let the good moments begin.' : 'Event updated. Everything is up to date.')
    setEditor(null); refresh()
  }
  async function deleteEvent() {
    if (!deleting || !token) return
    setDeleteBusy(true)
    try { await api(`/events/${deleting.id}`, { token, method: 'DELETE' }); setDeleting(null); setSelected(null); notify('Event deleted, along with its registrations.'); refresh() }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not delete event.', true) }
    finally { setDeleteBusy(false) }
  }
  const noticeElement = notice ? <div className={`toast ${notice.error ? 'toast-error' : ''}`} role={notice.error ? 'alert' : 'status'}><Icon name={notice.error ? 'shield' : 'check'}/><span>{notice.message}</span><button className="icon-button" onClick={() => setNotice(null)} aria-label="Dismiss message"><Icon name="close" size={17}/></button></div> : null
  if (!session) return <><AuthPage onLogin={login}/>{noticeElement}</>
  const categories = ['All events', ...new Set(events.map(event => event.category).filter((value): value is string => Boolean(value)))]
  const registeredIds = new Set(mine.map(event => event.id))
  const upcoming = events.filter(isUpcoming)
  const source = view === 'mine' ? mine : view === 'manage' ? events : upcoming
  const visible = source.filter(event => (!search || `${event.title} ${event.description || ''} ${event.location || ''}`.toLowerCase().includes(search.toLowerCase())) && (category === 'All events' || event.category === category) && (!date || event.event_date === date))
  const firstName = session.user.name.split(' ')[0]
  const title = view === 'mine' ? 'Your plans. Your people.' : view === 'manage' ? 'Make great things happen.' : view === 'events' ? 'Find your next thing.' : `Hello, ${firstName}.`
  const subtitle = view === 'mine' ? 'A little collection of things to look forward to.' : view === 'manage' ? 'Create, refine, and keep campus life moving.' : view === 'events' ? 'Follow your curiosity. There’s something here for you.' : admin ? 'A little planning. A lot of campus possibility.' : 'Let’s make this a campus day to remember.'
  const navItems: { view: View; label: string; icon: string }[] = [{ view: 'overview', label: 'Overview', icon: 'grid' }, { view: 'events', label: 'Discover events', icon: 'calendar' }, admin ? { view: 'manage', label: 'Manage events', icon: 'edit' } : { view: 'mine', label: 'My events', icon: 'ticket' }]
  return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a>
    {menuOpen ? <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)}/> : null}
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}><button className="icon-button sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><Icon name="close"/></button><a className="brand" href="#overview" onClick={() => navigate('overview')}><span className="brand-mark"><Icon name="leaf" size={25}/></span><span>DBIT<span className="brand-sub">CAMPUS LIFE</span></span></a>
      <span className="nav-caption">YOUR CAMPUS</span><nav aria-label="Main navigation">{navItems.map(item => <button key={item.view} className={`nav-item ${view === item.view ? 'active' : ''}`} aria-current={view === item.view ? 'page' : undefined} onClick={() => navigate(item.view)}><Icon name={item.icon}/><span>{item.label}</span>{item.view === 'mine' && mine.length ? <span className="nav-count">{mine.length}</span> : null}</button>)}</nav>
      <div className="sidebar-note"><span className="note-symbol">✳</span><h3>More than<br/>a timetable.</h3><p>Find your people.<br/>Try something new.<br/>Make it a good story.</p><span className="small-label">THAT’S CAMPUS LIFE.</span></div>
      <div className="sidebar-bottom"><div className="role-indicator"><Icon name={admin ? 'shield' : 'leaf'} size={16}/>{admin ? 'Administrator workspace' : 'Student workspace'}</div><button className="nav-item logout-button" onClick={logout}><Icon name="exit"/><span>Sign out</span></button><p>DON BOSCO INFO TECH</p></div>
    </aside>
    <div className="main-shell" inert={menuOpen}><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open navigation" aria-expanded={menuOpen}><Icon name="menu"/></button><span>Campus life</span><Icon name="chevron" size={13}/><b>{navItems.find(item => item.view === view)?.label || 'Overview'}</b></div><div className="topbar-right"><ThemeToggle/><span className="topbar-date">{new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Colombo' }).format(new Date())}</span><span className="topbar-divider"/><div className="profile"><span className="avatar">{session.user.name.split(' ').map(word => word[0]).slice(0, 2).join('')}</span><span><b>{session.user.name}</b><small>{admin ? 'Administrator' : session.user.studentId || 'Student'}</small></span></div></div></header>
      <main id="main-content" className="workspace"><div className="page-heading"><div><span className="eyebrow">{view === 'overview' ? 'A GOOD DAY STARTS HERE' : view === 'mine' ? 'SAVED YOU A PLACE' : admin && view === 'manage' ? 'THE CAMPUS EDIT' : 'OUTSIDE THE CLASSROOM'}</span><h1>{title}</h1><p>{subtitle}</p></div>{admin ? <button className="button primary" onClick={() => setEditor('new')}><Icon name="plus" size={18}/> Create event</button> : view === 'mine' ? <button className="button secondary" onClick={() => navigate('events')}>Find something new<Icon name="arrow" size={18}/></button> : <span className="semester-tag"><span className="live-dot"/> CAMPUS IS CALLING</span>}</div>
      {view === 'overview' ? <><section className="campus-hero"><div className="hero-copy"><span className="eyebrow">GOOD THINGS HAPPEN TOGETHER</span><h2>{admin ? <>A little spark.<br/><em>A bigger campus.</em></> : <>Make room for<br/><em>something good.</em></>}</h2><p>{admin ? 'Bring your community together, one thoughtfully planned event at a time.' : 'New skills. Familiar faces. Unexpected connections. Your next great moment might be right here.'}</p><button className="button hero-button" onClick={() => navigate(admin ? 'manage' : 'events')}>{admin ? 'Manage campus events' : 'Explore what’s happening'}<Icon name="arrow" size={18}/></button></div><div className="hero-art" aria-hidden="true"><span className="hero-circle circle-a"/><span className="hero-circle circle-b"/><span className="hero-circle circle-c"/><span className="hero-petal petal-a"/><span className="hero-petal petal-b"/><div className="hero-art-caption">THE BEST PART?<br/><b>YOU’RE PART OF IT.</b></div><span className="hero-star">✳</span></div><span className="hero-edition">DBIT / THE CAMPUS COLLECTIVE</span></section>
      <div className="stat-row"><div><span className="stat-icon"><Icon name="calendar"/></span><span><b>{loading ? '—' : upcoming.length}</b><small>Upcoming events</small></span><span className="stat-hint">Something to look forward to</span></div><div><span className="stat-icon"><Icon name={admin ? 'edit' : 'ticket'}/></span><span><b>{loading ? '—' : admin ? events.length : mine.length}</b><small>{admin ? 'Events on campus' : 'Your registrations'}</small></span><span className="stat-hint">{admin ? 'Ideas brought to life' : 'A place with your name on it'}</span></div><div><span className="stat-icon"><Icon name="grid"/></span><span><b>{loading ? '—' : categories.length - 1}</b><small>Ways to get involved</small></span><span className="stat-hint">Follow your curiosity</span></div></div></> : null}
      <section className="events-section" aria-label={view === 'mine' ? 'Your registered events' : 'Campus events'}><div className="section-heading"><div><h2>{view === 'overview' ? 'On the campus calendar' : view === 'mine' ? 'Your campus moments' : view === 'manage' ? 'All campus events' : 'The campus calendar'}</h2><span className="section-count">{loading ? 'Finding your events…' : `${visible.length} ${visible.length === 1 ? 'event' : 'events'}${view === 'mine' ? ' on your list' : ' to explore'}`}</span></div>{view === 'overview' ? <button className="text-button" onClick={() => navigate('events')}>View all events<Icon name="arrow" size={17}/></button> : <button className="text-button" onClick={refresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh events'}</button>}</div>
        <div className="filter-bar"><div className="search-field"><Icon name="search" size={18}/><input aria-label="Search events" placeholder="Find an event, a topic, a place…" value={search} onChange={e => setSearch(e.target.value)}/>{search ? <button className="icon-button" aria-label="Clear search" onClick={() => setSearch('')}><Icon name="close" size={16}/></button> : null}</div><label className="date-filter"><Icon name="calendar" size={17}/><input type="date" aria-label="Filter by date" value={date} onInput={e => setDate(e.currentTarget.value)} onChange={e => setDate(e.target.value)}/></label></div>
        <div className="category-tabs" aria-label="Event categories">{categories.map(item => <button key={item} className={category === item ? 'active' : ''} aria-pressed={category === item} onClick={() => setCategory(item)}>{item === 'All events' ? <Icon name="grid" size={14}/> : null}{item}</button>)}</div>
        {loadError ? <div className="empty-state" role="alert"><Icon name="shield" size={32}/><h3>Let’s try that again.</h3><p>{loadError}</p><button className="button primary" onClick={refresh}>Try again</button></div> : loading ? <div className="event-grid" aria-busy="true" aria-label="Loading events">{[1, 2, 3].map(item => <div className="skeleton-card" key={item}><div/><span/><span/><span/></div>)}</div> : !visible.length ? <div className="empty-state"><span className="empty-icon"><Icon name={view === 'mine' ? 'ticket' : 'search'} size={30}/></span><h3>{view === 'mine' && !mine.length ? 'Your next chapter is waiting.' : 'Nothing on this page. Yet.'}</h3><p>{search || category !== 'All events' || date ? 'Try another search, category, or date.' : view === 'mine' ? 'Discover an event you love and save yourself a place.' : admin ? 'Create an event to bring your campus together.' : 'New campus events will appear here. Check back soon.'}</p><button className="button secondary" onClick={() => { if (search || category !== 'All events' || date) { setSearch(''); setCategory('All events'); setDate('') } else if (admin) setEditor('new'); else navigate('events') }}>{search || category !== 'All events' || date ? 'Clear filters' : admin ? 'Create event' : 'Discover events'}</button></div> : view === 'manage' ? <div className="table-scroll"><table className="event-table"><thead><tr><th>EVENT</th><th>WHEN & WHERE</th><th>CAPACITY</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map(event => <tr key={event.id}><td><span className={`table-symbol ${palette(event)}`}><Icon name="calendar"/></span><div><button className="table-title" onClick={() => openEvent(event)}>{cleanTitle(event)}</button><small>{event.category || 'Campus event'}</small></div></td><td><b>{dateLabel(event.event_date)}</b><small>{timeLabel(event.start_time)} · {event.location || 'TBA'}</small></td><td><span className="capacity-pill">{event.capacity === null ? 'Unlimited' : `${event.capacity} places`}</span></td><td><div className="table-actions"><button className="icon-button" aria-label={`View registrations for ${cleanTitle(event)}`} onClick={() => openEvent(event)}><Icon name="users" size={18}/></button><button className="icon-button" aria-label={`Edit ${cleanTitle(event)}`} onClick={() => setEditor(event)}><Icon name="edit" size={18}/></button><button className="icon-button" aria-label={`Delete ${cleanTitle(event)}`} onClick={() => setDeleting(event)}><Icon name="trash" size={18}/></button></div></td></tr>)}</tbody></table></div> : <div className="event-grid">{visible.map(event => <EventCard key={event.id} event={event} registered={registeredIds.has(event.id)} onOpen={openEvent}/>)}</div>}
      </section><footer className="workspace-footer"><span>Small moments. Big campus energy.</span><span>DBIT CAMPUS LIFE <span>↗</span></span></footer>
      </main>
    </div>
    {selected ? <Modal title="A CAMPUS MOMENT" onClose={() => setSelected(null)} wide><EventDetails key={selected.id} event={selected} session={session} registered={registeredIds.has(selected.id)} onRegister={register} onEdit={() => { setEditor(selected); setSelected(null) }} onDelete={() => { setDeleting(selected); setSelected(null) }}/></Modal> : null}
    {editor ? <Modal title={editor === 'new' ? 'NEW ON CAMPUS' : 'THE FINISHING TOUCHES'} onClose={() => setEditor(null)} wide><EventForm event={editor === 'new' ? undefined : editor} onSave={saveEvent} onCancel={() => setEditor(null)}/></Modal> : null}
    {deleting ? <Modal title="DELETE EVENT" onClose={() => { if (!deleteBusy) setDeleting(null) }}><div className="delete-dialog"><span className="empty-icon"><Icon name="trash" size={28}/></span><h2>Take it off the calendar?</h2><p><b>{cleanTitle(deleting)}</b> and all its registrations will be permanently removed.</p><div className="form-actions"><button className="button secondary" disabled={deleteBusy} onClick={() => setDeleting(null)}>Keep event</button><button className="button danger" disabled={deleteBusy} onClick={deleteEvent}>{deleteBusy ? 'Deleting…' : 'Yes, delete event'}</button></div></div></Modal> : null}
    {noticeElement}
  </div>
}
export default App
