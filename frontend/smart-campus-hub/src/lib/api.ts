export type User = { id: number; studentId: string | null; name: string; email: string; role: 'student' | 'admin' }
export type Session = { token: string; user: User }
export type CampusEvent = { id: number; title: string; description: string | null; category: string | null; location: string | null; event_date: string; start_time: string | null; end_time: string | null; registration_deadline: string | null; capacity: number | null; created_by: number; registered_at?: string; registration_id?: number }
export type Attendee = { registration_id: number; student_user_id: number; student_id: string; name: string; email: string; registered_at: string }
export type Result<T> = { success: boolean; message: string; data: T }
export type EventInput = { title: string; description: string; category: string; location: string; eventDate: string; startTime: string | null; endTime: string | null; registrationDeadline: string | null; capacity: number | null }

const key = 'dbit:session:v1'
export function readSession(): Session | null {
  try {
    const session = JSON.parse(sessionStorage.getItem(key) || 'null')
    return session && typeof session.token === 'string' && typeof session.user?.id === 'number' && ['student', 'admin'].includes(session.user.role) ? session : null
  } catch { return null }
}
export function saveSession(session: Session | null) {
  if (session) sessionStorage.setItem(key, JSON.stringify(session))
  else sessionStorage.removeItem(key)
}
export async function api<T>(route: string, options: { token?: string; method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const base = (import.meta.env.DEV ? '/api' : (import.meta.env.VITE_API_URL || 'https://smart-campus-event-management-production-1133.up.railway.app/api')).replace(/\/$/, '')
  let response: Response
  try {
    response = await fetch(base + route, {
      method: options.method || 'GET',
      headers: { ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error('We couldn’t connect to campus. Check your connection and try again.', { cause: error })
  }
  const result = await response.json().catch(() => ({ message: 'The campus service is temporarily unavailable. Please try again.' }))
  if (!response.ok) {
    if (response.status === 401 && options.token) window.dispatchEvent(new Event('campus:expired'))
    throw new Error(result.message || 'Something went wrong. Please try again.')
  }
  return result as T
}
export function dateLabel(value: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return new Intl.DateTimeFormat('en-GB', options).format(new Date(value.slice(0, 10) + 'T12:00:00'))
}
export function timeLabel(value: string | null) {
  if (!value) return 'Time to be announced'
  const [hour, minute] = value.split(':').map(Number)
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
}
export function cleanTitle(event: CampusEvent) { return event.title.replace(/^DBIT Demo - /, '') }
export function palette(event: CampusEvent) {
  const category = event.category?.toLowerCase() || ''
  return category.includes('sport') ? 'sun' : category.includes('workshop') || category.includes('tech') ? 'moss' : category.includes('seminar') || category.includes('career') ? 'rose' : 'blue'
}
export function registrationClosed(event: CampusEvent) {
  const start = new Date(`${event.event_date}T${event.start_time || '23:59:59'}+05:30`).getTime()
  const deadline = event.registration_deadline ? new Date(event.registration_deadline.replace(' ', 'T') + '+05:30').getTime() : Infinity
  return Date.now() >= Math.min(start, deadline)
}

export function isUpcoming(event: CampusEvent) { return Date.now() < new Date(`${event.event_date}T${event.start_time || "23:59:59"}+05:30`).getTime() }
