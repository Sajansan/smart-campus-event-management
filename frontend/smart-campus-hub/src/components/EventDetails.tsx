import { useEffect, useState } from 'react'
import type { Attendee, CampusEvent, Result, Session } from '../lib/api'
import { api, cleanTitle, dateLabel, registrationClosed, timeLabel } from '../lib/api'
import { EventPoster } from './EventCard'
import Icon from './Icon'
export default function EventDetails({ event, session, registered, onRegister, onEdit, onDelete }: { event: CampusEvent; session: Session; registered: boolean; onRegister: () => Promise<void>; onEdit: () => void; onDelete: () => void }) {
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [loading, setLoading] = useState(session.user.role === 'admin')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const closed = registrationClosed(event)
  useEffect(() => {
    if (session.user.role !== 'admin') return
    const controller = new AbortController()
    api<Result<Attendee[]>>(`/registrations/event/${event.id}`, { token: session.token, signal: controller.signal }).then(result => { setAttendees(result.data); setLoading(false) }).catch(error => { if (!controller.signal.aborted) { setError(error.message); setLoading(false) } })
    return () => controller.abort()
  }, [event.id, session.token, session.user.role])
  async function register() {
    setBusy(true); setError('')
    try { await onRegister() } catch (error) { setError(error instanceof Error ? error.message : 'Could not register.') }
    finally { setBusy(false) }
  }
  return <div className="event-details"><EventPoster event={event}/><div className="detail-content"><span className="eyebrow">{event.category || 'CAMPUS EVENT'}</span><h2>{cleanTitle(event)}</h2><p className="detail-description">{event.description || 'Join your campus community for this event. Find the key details below.'}</p>
    <div className="detail-facts"><div><Icon name="calendar"/><span><small>WHEN</small>{dateLabel(event.event_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div><div><Icon name="clock"/><span><small>TIME</small>{timeLabel(event.start_time)}{event.end_time ? ` – ${timeLabel(event.end_time)}` : ''}</span></div><div><Icon name="pin"/><span><small>WHERE</small>{event.location || 'Location to be announced'}</span></div><div><Icon name="users"/><span><small>CAPACITY</small>{event.capacity === null ? 'Open to everyone' : `${event.capacity} places`}</span></div></div>
    {event.registration_deadline ? <p className="deadline-note">Registration closes {dateLabel(event.registration_deadline)} at {timeLabel(event.registration_deadline.slice(11))} · Sri Lanka time</p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {session.user.role === 'student' ? <div className="detail-cta"><button className={`button ${registered ? 'registered-button' : 'primary'}`} disabled={busy || registered || closed || event.capacity === 0} onClick={register}>{busy ? 'Reserving your place…' : registered ? 'You’re on the list' : closed ? 'Registration closed' : event.capacity === 0 ? 'No places available' : 'Count me in'}<Icon name={registered ? 'check' : 'arrow'}/></button><p>{registered ? 'Find this event in My events. See you there!' : 'Your place is confirmed as soon as you register.'}</p></div> : <><div className="admin-detail-actions"><button className="button primary" onClick={onEdit}><Icon name="edit" size={17}/> Edit event</button><button className="button danger-outline" onClick={onDelete}><Icon name="trash" size={17}/> Delete event</button></div><div className="attendees"><div className="section-heading"><h3>On the guest list</h3><span className="count-chip">{attendees.length} students</span></div>{loading ? <p className="muted">Loading registrations…</p> : attendees.length ? <div className="attendee-list">{attendees.map(student => <div className="attendee" key={student.registration_id}><span className="avatar">{student.name.slice(0, 1)}</span><div><b>{student.name}</b><small>{student.student_id} · {student.email}</small></div><span>{dateLabel(student.registered_at)}</span></div>)}</div> : <p className="muted">No registrations yet. Give students something to look forward to.</p>}</div></>}
  </div></div>
}
