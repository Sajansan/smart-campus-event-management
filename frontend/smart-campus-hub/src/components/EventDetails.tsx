import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Attendee, CampusEvent, Result, ReviewDecision, Session } from '../lib/api'
import { api, cleanTitle, dateLabel, editableProposal, eventStatus, registrationClosed, timeLabel } from '../lib/api'
import { EventPoster } from './EventCard'
import Icon from './Icon'

type Props = {
  event: CampusEvent
  session: Session
  registered: boolean
  onRegister: () => Promise<void>
  onEdit: () => void
  onDelete: () => void
  onWorkflow: (decision?: ReviewDecision, reason?: string) => Promise<void>
}

export default function EventDetails({ event, session, registered, onRegister, onEdit, onDelete, onWorkflow }: Props) {
  const { token, user } = session
  const admin = user.role === 'admin'
  const owned = user.role === 'organizer' && user.id === event.created_by && user.department?.toLowerCase() === event.department?.toLowerCase()
  const published = event.status === 'published'
  const canSubmit = owned && editableProposal(event)
  const canEdit = canSubmit || (admin && published && !event.approved_by)
  const canReview = user.role === 'coordinator' && event.status === 'pending_approval' && event.created_by !== user.id
  const showRoster = admin || (owned && published)
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [loading, setLoading] = useState(showRoster)
  const [rosterError, setRosterError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const closed = registrationClosed(event)

  useEffect(() => {
    if (!showRoster) return
    const controller = new AbortController()
    api<Result<Attendee[]>>(`/registrations/event/${event.id}`, { token, signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setAttendees(result.data)
    }).catch(error => {
      if (!controller.signal.aborted) setRosterError(error.message)
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [event.id, token, showRoster])

  useEffect(() => {
    if (!canReview || !event.location || !event.start_time || !event.end_time) return
    const controller = new AbortController()
    const query = new URLSearchParams({ location: event.location, eventDate: event.event_date,
      startTime: event.start_time, endTime: event.end_time, excludeId: String(event.id) })
    api<{ hasConflict: boolean }>(`/events/check-conflict?${query}`, { token, signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setConflict(result.hasConflict) })
      .catch(() => { /* The server checks conflicts again when saving approval. */ })
    return () => controller.abort()
  }, [canReview, event.id, event.location, event.event_date, event.start_time, event.end_time, token])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await action() }
    catch (error) { setError(error instanceof Error ? error.message : 'Please try again.') }
    finally { setBusy(false) }
  }

  function review(submission: FormEvent<HTMLFormElement>) {
    submission.preventDefault()
    const form = new FormData(submission.currentTarget)
    void run(() => onWorkflow(form.get('decision') as ReviewDecision, String(form.get('reason') || '')))
  }

  return <div className="event-details"><EventPoster event={event}/><div className="detail-content">
    <span className="eyebrow">{event.category || 'CAMPUS EVENT'}</span>
    <h2>{cleanTitle(event)}</h2>
    <p className="detail-description">{event.description || 'Find the key details below.'}</p>
    <div className="detail-facts">
      <div><Icon name="calendar"/><span><small>WHEN</small>{dateLabel(event.event_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
      <div><Icon name="clock"/><span><small>TIME</small>{timeLabel(event.start_time)}{event.end_time ? ` – ${timeLabel(event.end_time)}` : ''}</span></div>
      <div><Icon name="pin"/><span><small>WHERE</small>{event.location || 'Location to be announced'}</span></div>
      <div><Icon name="users"/><span><small>CAPACITY</small>{event.capacity === null ? 'No seat limit' : `${event.capacity} places`}</span></div>
    </div>
    {event.registration_deadline ? <p className="deadline-note">Registration closes {dateLabel(event.registration_deadline)} at {timeLabel(event.registration_deadline.slice(11))} · Sri Lanka time</p> : null}
    {event.department || event.target_year ? <p className="deadline-note">{[event.department, event.target_year ? `Year ${event.target_year}` : null].filter(Boolean).join(' · ')}</p> : null}
    {user.role !== 'student' ? <p className="deadline-note"><strong>{eventStatus(event)}</strong>{event.rejection_reason ? ` · ${event.rejection_reason}` : ''}</p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {user.role === 'student' ? <div className="detail-cta">
      <button className={`button ${registered ? 'registered-button' : 'primary'}`} disabled={busy || registered || closed || event.capacity === 0} onClick={() => run(onRegister)}>
        {busy ? 'Reserving your place…' : registered ? 'You’re on the list' : closed ? 'Registration closed' : event.capacity === 0 ? 'No places available' : 'Count me in'}<Icon name={registered ? 'check' : 'arrow'}/>
      </button>
      <p>{registered ? 'Find this event in My events. See you there!' : 'Your place is confirmed as soon as you register.'}</p>
    </div> : null}
    {canSubmit || canEdit || admin ? <div className="admin-detail-actions">
      {canSubmit ? <button className="button primary" disabled={busy} onClick={() => run(() => onWorkflow())}>{busy ? 'Submitting…' : 'Submit for review'}</button> : null}
      {canEdit ? <button className="button secondary" disabled={busy} onClick={onEdit}><Icon name="edit" size={17}/> Edit {canSubmit ? 'proposal' : 'event'}</button> : null}
      {admin || canSubmit ? <button className="button danger-outline" disabled={busy} onClick={onDelete}><Icon name="trash" size={17}/> Delete</button> : null}
    </div> : null}
    {canReview ? <form className="proposal-review" onSubmit={review}>
      <h3>Review proposal</h3>
      {conflict ? <p className="form-error" role="status">This venue is already booked at that time. You can request a schedule change.</p> : null}
      <label>Decision<select name="decision" aria-label="Decision" defaultValue="" required>
        <option value="" disabled>Choose a decision</option>
        <option value="approved">Approve and publish</option>
        <option value="revision_requested">Request changes</option>
        <option value="rejected">Reject</option>
      </select></label>
      <label>Reason<textarea name="reason" required maxLength={1000} rows={3}/></label>
      <button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save decision'}</button>
    </form> : null}
    {showRoster ? <div className="attendees">
      <div className="section-heading"><h3>On the guest list</h3>{!loading && !rosterError ? <span className="count-chip">{attendees.length} students</span> : null}</div>
      {loading ? <p className="muted">Loading registrations…</p> : rosterError ? <p className="form-error" role="alert">{rosterError}</p>
        : attendees.length ? <div className="attendee-list">{attendees.map(student => <div className="attendee" key={student.registration_id}>
          <span className="avatar">{student.name.slice(0, 1)}</span><div><b>{student.name}</b><small>{student.student_id} · {student.email}</small></div><span>{dateLabel(student.registered_at)}</span>
        </div>)}</div> : <p className="muted">No registrations yet.</p>}
    </div> : null}
  </div></div>
}
