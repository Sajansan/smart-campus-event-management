import { useState } from 'react'
import type { FormEvent } from 'react'
import type { CampusEvent, EventInput } from '../lib/api'
import Icon from './Icon'
export default function EventForm({ event, onSave, onCancel }: { event?: CampusEvent; onSave: (input: EventInput) => Promise<void>; onCancel: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('')
    const data = new FormData(e.currentTarget)
    const value = (key: string) => String(data.get(key) || '').trim()
    const input: EventInput = { title: value('title'), description: value('description'), category: value('category'), location: value('location'), eventDate: value('eventDate'), startTime: value('startTime') || null, endTime: value('endTime') || null, registrationDeadline: value('registrationDeadline') ? `${value('registrationDeadline').replace('T', ' ')}:00` : null, capacity: value('capacity') === '' ? null : Number(value('capacity')) }
    try { await onSave(input) } catch (error) { setError(error instanceof Error ? error.message : 'Could not save event.'); setBusy(false) }
  }
  return <form className="event-form" onSubmit={submit}><h2>{event ? 'Make it even better.' : 'Bring campus together.'}</h2><p className="muted">{event ? 'Update the details below. Students will see your changes.' : 'A great event starts with the details.'}</p>
    <label>Event title<input name="title" placeholder="Give your event a memorable name" defaultValue={event?.title} maxLength={150} required/></label>
    <label>Description<textarea name="description" placeholder="What can students look forward to?" defaultValue={event?.description || ''} rows={3} maxLength={16000}/></label>
    <div className="form-row"><label>Category<input name="category" aria-label="Category" list="categories" placeholder="e.g. Workshop" defaultValue={event?.category || ''} maxLength={100}/><datalist id="categories"><option>Workshop</option><option>Seminar</option><option>Sports</option><option>Culture</option><option>Community</option></datalist></label><label>Location<input name="location" placeholder="e.g. Main Hall" defaultValue={event?.location || ''} maxLength={150}/></label></div>
    <div className="form-row three"><label>Event date<input type="date" name="eventDate" defaultValue={event?.event_date} required/></label><label>Starts at<input type="time" name="startTime" defaultValue={event?.start_time?.slice(0, 5)}/></label><label>Ends at<input type="time" name="endTime" defaultValue={event?.end_time?.slice(0, 5)}/></label></div>
    <div className="form-row"><label>Registration closes<input type="datetime-local" name="registrationDeadline" defaultValue={event?.registration_deadline?.replace(' ', 'T').slice(0, 16)}/></label><label>Capacity<input type="number" name="capacity" min={0} step={1} placeholder="Leave empty for unlimited" defaultValue={event?.capacity ?? ''}/></label></div>
    {error ? <p role="alert" className="form-error">{error}</p> : null}<div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={onCancel}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : event ? 'Save changes' : 'Publish event'}<Icon name="arrow" size={17}/></button></div>
  </form>
}
