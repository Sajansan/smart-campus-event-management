import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api, roleLabels } from '../lib/api'
import type { Result, User } from '../lib/api'
import Icon from './Icon'
import Modal from './Modal'

const invitationLabels = { pending: 'Sending email', sent: 'Link sent', failed: 'Email failed', expired: 'Link expired' }

export default function StaffAccess({ token }: { token: string }) {
  const [staff, setStaff] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    api<Result<User[]>>('/auth/users', { token, signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setStaff(result.data)
    }).catch(error => {
      if (!controller.signal.aborted) setLoadError(error.message)
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [token, revision])

  function openEditor(user: User | 'new') {
    setError('')
    setNotice(null)
    setEditing(user)
  }

  function record(result: Result<User>) {
    const updated = result.data
    setStaff(previous => [...previous.filter(user => user.id !== updated.id), updated].sort((a, b) => a.name.localeCompare(b.name)))
    if (editing) setEditing(null)
    setNotice({ message: result.message, error: updated.invitationStatus === 'failed' })
  }

  async function sendSetupLink(user: User) {
    setBusy(true)
    setError('')
    setNotice(null)
    try {
      const result = await api<Result<User>>(`/auth/users/${user.id}/invite`, { token, method: 'POST' })
      record(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The link could not be sent.'
      if (editing) setError(message)
      else setNotice({ message, error: true })
    } finally {
      setBusy(false)
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const creating = editing === 'new'
    if (!editing) return
    const assignment = { role: form.get('role'), department: form.get('department') }
    const body = creating
      ? { ...assignment, name: form.get('name'), email: form.get('email') }
      : { ...assignment, status: form.get('status') }
    setBusy(true)
    setError('')
    try {
      const result = await api<Result<User>>(creating ? '/auth/users' : `/auth/users/${editing.id}`, { token, method: creating ? 'POST' : 'PATCH', body })
      record(result)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Staff access could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const existing = editing && editing !== 'new' ? editing : null

  return <section className="events-section" aria-label="Staff accounts">
    <div className="section-heading">
      <h2>Staff accounts</h2>
      <button className="button primary" disabled={loading || busy || Boolean(loadError)} onClick={() => openEditor('new')}><Icon name="plus" size={18}/> Add staff member</button>
    </div>
    {notice ? <p className={notice.error ? 'form-error' : 'muted'} role={notice.error ? 'alert' : 'status'}>{notice.message}</p> : null}
    {loadError ? <div className="empty-state" role="alert"><p>{loadError}</p><button className="button secondary" onClick={() => { setLoadError(''); setLoading(true); setRevision(value => value + 1) }}>Try again</button></div>
      : loading ? <p className="muted" role="status">Loading staff accounts…</p>
      : staff.length ? <div className="table-scroll"><table className="event-table">
        <thead><tr><th>Staff member</th><th>Role</th><th>Department</th><th>Access</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{staff.map(user => <tr key={user.id}>
          <td><div><b>{user.name}</b><small>{user.email}</small></div></td>
          <td>{roleLabels[user.role]}</td><td>{user.department || 'Unassigned'}</td>
          <td><span className="capacity-pill">{user.status === 'suspended' ? 'Suspended' : user.staffVerified && !user.mustChangePassword ? 'Active' : 'Pending setup'}</span>
            {user.invitationStatus ? <small>{invitationLabels[user.invitationStatus]}</small> : null}</td>
          <td><div className="table-actions">
            {user.status === 'active' && (!user.staffVerified || user.mustChangePassword) ? <button className="button secondary" disabled={busy} onClick={() => sendSetupLink(user)}>{user.invitationStatus ? 'Resend invite' : 'Send invite'}</button> : null}
            <button className="icon-button" disabled={busy} onClick={() => openEditor(user)} aria-label={`Edit staff access for ${user.name}`}><Icon name="edit" size={18}/></button>
          </div></td>
        </tr>)}</tbody>
      </table></div> : <div className="empty-state"><h3>No staff accounts yet</h3><p>Add an organizer and a coordinator for a department to get started.</p></div>}
    {editing ? <Modal title={existing ? 'EDIT STAFF ACCESS' : 'ADD STAFF MEMBER'} onClose={() => { if (!busy) setEditing(null) }}>
      <form className="event-form" onSubmit={save}>
        {existing ? <><h2>{existing.name}</h2><p className="muted">{existing.email}</p></> : <>
          <label>Full name<input name="name" autoComplete="name" maxLength={100} required/></label>
          <label>Work email<input name="email" type="email" autoComplete="email" maxLength={150} required/></label>
        </>}
        <label>Role<select name="role" aria-label="Role" defaultValue={existing?.role || 'organizer'}><option value="organizer">Event Organizer</option><option value="coordinator">Department Coordinator</option></select></label>
        <label>Department<input name="department" list="staff-departments" maxLength={100} defaultValue={existing?.department || ''} required/></label>
        <datalist id="staff-departments">{[...new Set(staff.map(user => user.department).filter(Boolean))].map(department => <option key={department} value={department || ''}/>)}</datalist>
        {existing ? <>
          <label>Account access<select name="status" aria-label="Account access" defaultValue={existing.status || 'active'}><option value="active">Allowed</option><option value="suspended">Suspended</option></select></label>
          {existing.status === 'active' && existing.staffVerified && !existing.mustChangePassword ? <button type="button" className="text-button" disabled={busy} onClick={() => sendSetupLink(existing)}>Email password reset link</button> : null}
        </> : <p className="muted">We’ll email them a one-time link to set their password. The link expires in 24 hours.</p>}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="form-actions"><button type="button" className="button secondary" onClick={() => setEditing(null)} disabled={busy}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Working…' : existing ? 'Save access' : 'Send invite'}</button></div>
      </form>
    </Modal> : null}
  </section>
}
