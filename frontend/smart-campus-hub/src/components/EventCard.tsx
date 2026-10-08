import type { CampusEvent } from '../lib/api'
import { cleanTitle, dateLabel, palette, timeLabel } from '../lib/api'
import Icon from './Icon'
export function EventPoster({ event, small = false }: { event: CampusEvent; small?: boolean }) {
  return <div className={`event-poster ${palette(event)} ${small ? 'poster-small' : ''}`} aria-hidden="true"><span className="poster-kicker">DON BOSCO / CAMPUS SERIES</span><span className="poster-shape shape-one"/><span className="poster-shape shape-two"/><span className="poster-shape shape-three"/><span className="poster-word">{palette(event) === 'moss' ? 'New ideas.\nReal impact.' : palette(event) === 'sun' ? 'Bring your\ngame.' : palette(event) === 'rose' ? 'What’s\nnext?' : 'Come\ntogether.'}</span><span className="poster-bottom">{event.category || 'CAMPUS EVENT'}<span>↗</span></span></div>
}
export default function EventCard({ event, registered, onOpen }: { event: CampusEvent; registered?: boolean; onOpen: (event: CampusEvent) => void }) {
  return <article className="event-card"><button className="card-open" onClick={() => onOpen(event)} aria-label={`View ${cleanTitle(event)}`}>
    <div className="poster-wrap"><EventPoster event={event}/><span className="date-stamp"><b>{dateLabel(event.event_date, { day: '2-digit' })}</b><span>{dateLabel(event.event_date, { month: 'short' })}</span></span>{registered ? <span className="registered-stamp"><Icon name="check" size={14}/> YOU’RE IN</span> : null}</div>
    <div className="card-content"><span className={`category-label ${palette(event)}`}><i/>{event.category || 'Campus'}</span><h3>{cleanTitle(event)}</h3><p><Icon name="pin" size={15}/>{event.location || 'Location to be announced'}</p><div className="card-bottom"><span><Icon name="clock" size={15}/>{timeLabel(event.start_time)}</span><span className="card-arrow"><Icon name="arrow" size={18}/></span></div></div>
  </button></article>
}
