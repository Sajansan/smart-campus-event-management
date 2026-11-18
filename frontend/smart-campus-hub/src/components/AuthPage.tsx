import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../lib/api'
import type { Session } from '../lib/api'
import Icon from './Icon'
import ThemeToggle from './ThemeToggle'

export default function AuthPage({ onLogin, setupSession, onSignOut, invitation, onLeaveInvitation }: { onLogin: (session: Session) => void; setupSession?: Session; onSignOut?: () => void; invitation?: string; onLeaveInvitation?: (message?: string) => void }) {
  const [signup, setSignup] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const body = { 
      name: String(form.get('name') || ''), 
      studentId: String(form.get('studentId') || ''), 
      email: String(form.get('email') || ''), 
      password: String(form.get('password') || ''),
      department: String(form.get('department') || ''),
      academicYear: String(form.get('academicYear') || ''),
    }
    setBusy(true); setError('')
    try {
      if (invitation !== undefined || setupSession) {
        if (body.password !== form.get('confirmPassword')) throw new Error('Passwords must match.')
      }
      if (invitation !== undefined) {
        const result = await api<{ message: string }>('/auth/staff-invitations/accept', { method: 'POST', body: { token: invitation, password: body.password } })
        onLeaveInvitation?.(result.message)
        return
      }
      if (setupSession) {
        const updated = await api<Session>('/auth/password/setup', { method: 'POST', token: setupSession.token, body: { password: body.password } })
        onLogin(updated)
        return
      }
      if (signup) await api('/auth/register', { method: 'POST', body })
      const session = await api<Session>('/auth/login', { method: 'POST', body: { email: body.email, password: body.password } })
      onLogin(session)
    } catch (error) { setError(error instanceof Error ? error.message : 'Please try again.') }
    finally { setBusy(false) }
  }
  return <main className="auth-layout">
    <section className="auth-story" aria-label="Welcome to DBIT Campus">
      <a href="#" className="brand"><span className="brand-mark"><Icon name="leaf" size={25}/></span><span>DBIT<span className="brand-sub">CAMPUS LIFE</span></span></a>
      <div className="auth-headline"><span className="eyebrow"><span className="live-dot"/> A LITTLE MORE THAN A CAMPUS</span><h1>Good people.<br/>Great ideas.<br/><em>Your next<br/>chapter.</em></h1><p>The workshops, the connections, the moments<br className="desktop-only"/> that make your time at Don Bosco your own.</p></div>
      <div className="auth-art" aria-hidden="true">
        <div className="art-label">LEARN. CONNECT. BELONG.</div>
        <span className="art-caption">A campus.<br/>A community.<br/>A world of possibility.</span>
        <div className="auth-campus-pass">
          <div className="pass-pill-header">
            <span className="pass-dot" />
            <span className="pass-brand-text">CAMPUS ACCESS</span>
            <span className="pass-serial">№ 2026</span>
          </div>
          <div className="pass-content">
            <span className="pass-title">Don Bosco Info Tech</span>
            <span className="pass-desc">Official Student &amp; Event Portal</span>
            <div className="pass-tags">
              <span>Workshops</span>
              <span>Hackathons</span>
              <span>Fests</span>
            </div>
          </div>
          <div className="pass-perforated">
            <span className="pass-notch notch-left" />
            <span className="pass-dash" />
            <span className="pass-notch notch-right" />
          </div>
          <div className="pass-footer">
            <div className="pass-barcode">
              <span/><span/><span/><span/><span/><span/><span/><span/><span/>
            </div>
            <span className="pass-valid">VERIFIED STUDENT</span>
          </div>
        </div>
      </div>
      <footer className="auth-footer"><span>DON BOSCO INFO TECH</span><span>Made for campus moments ↗</span></footer>
    </section>
    <section className="auth-form-area"><div className="auth-theme-toggle"><ThemeToggle/></div><div className="auth-mobile-brand">DBIT / CAMPUS LIFE</div><div className="auth-form-wrap">
      {invitation !== undefined || setupSession ? <>
        <h2>Set your password</h2>
        <p className="muted">{setupSession ? `Choose a private password for ${setupSession.user.email}.` : 'Choose a password for your DBIT staff account.'}</p>
        <form onSubmit={submit}>
          <label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} required/></label>
          <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required/></label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button primary auth-submit" disabled={busy}>{busy ? 'Saving…' : 'Set password'}<Icon name="arrow"/></button>
          <button type="button" className="text-button" onClick={() => invitation !== undefined ? onLeaveInvitation?.() : onSignOut?.()} disabled={busy}>{invitation !== undefined ? 'Back to sign in' : 'Sign out'}</button>
        </form>
      </> : <>
      <span className="eyebrow">YOUR CAMPUS, CONNECTED</span><h2>{signup ? 'Find your place.' : 'Welcome back.'}</h2><p className="muted">{signup ? 'One account. A whole campus of possibilities.' : 'A good campus day starts here.'}</p>
      <div className="auth-tabs" aria-label="Account access"><button type="button" className={!signup ? 'active' : ''} onClick={() => { setSignup(false); setError('') }}>Sign in</button><button type="button" className={signup ? 'active' : ''} onClick={() => { setSignup(true); setError('') }}>Create account</button></div>
      <form onSubmit={submit} key={signup ? 'signup' : 'login'}>
        {signup ? <>
          <div className="form-row">
            <label>Full name<input name="name" autoComplete="name" placeholder="Your full name" maxLength={100} required/></label>
            <label>Student ID<input name="studentId" placeholder="e.g. DBIT001" maxLength={50} required/></label>
          </div>
          <div className="form-row">
            <label>Department<input name="department" placeholder="e.g. Computing, Engineering" maxLength={100}/></label>
            <label>Academic year<input name="academicYear" type="number" min={1} max={5} placeholder="Optional"/></label>
          </div>
        </> : null}
        <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={150} required/></label>
        <label>Password<span className="password-field"><input name="password" aria-label="Password" type={showPassword ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? 'At least 6 characters' : 'Enter your password'} minLength={signup ? 6 : undefined} required/><button className="icon-button" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}><Icon name={showPassword ? 'eyeOff' : 'eye'}/></button></span></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="button primary auth-submit" disabled={busy}>{busy ? 'Just a moment…' : signup ? 'Create student account' : 'Step inside'}<Icon name="arrow"/></button>
      </form>
      <div className="auth-note"><Icon name="shield" size={18}/><p>{signup ? 'Student accounts are for DBIT students. Ask the campus administrator for staff access.' : 'Students and staff sign in here. Your account takes you to the right place.'}</p></div>
      </>}
    </div><p className="auth-bottom">A little curiosity can take you a long way.</p></section>
  </main>
}
