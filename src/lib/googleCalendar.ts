// ─── Google Calendar API — Full Read/Write ─────────────────────────────────
// Uses Google Identity Services (GIS) token client — modern, works in Chrome

export const GCAL_SCOPES = [
  'https://www.googleapis.com/auth/calendar',           // full read/write
  'https://www.googleapis.com/auth/calendar.events',    // events CRUD
].join(' ')

const GCLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const GCAL_BASE = 'https://www.googleapis.com/calendar/v3'

// ── Token management ─────────────────────────────────────
let _tokenClient: any = null
let _accessToken: string | null = localStorage.getItem('gcal_access_token')
let _tokenExpiry: number = Number(localStorage.getItem('gcal_token_expiry') || 0)

export function getToken(): string | null {
  if (_accessToken && Date.now() < _tokenExpiry) return _accessToken
  return null
}

function saveToken(token: string, expiresIn: number) {
  _accessToken = token
  _tokenExpiry = Date.now() + (expiresIn - 60) * 1000 // 1min buffer
  localStorage.setItem('gcal_access_token', token)
  localStorage.setItem('gcal_token_expiry', String(_tokenExpiry))
}

export function clearToken() {
  _accessToken = null
  _tokenExpiry = 0
  localStorage.removeItem('gcal_access_token')
  localStorage.removeItem('gcal_token_expiry')
}

// ── Initialize GIS token client ───────────────────────────
function initTokenClient(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!GCLIENT_ID) {
      reject(new Error('הגדר VITE_GOOGLE_CLIENT_ID ב-Vercel'))
      return
    }

    // Load GIS script if not loaded
    const load = () => {
      const g = (window as any).google
      if (!g?.accounts?.oauth2) {
        const s = document.createElement('script')
        s.src = 'https://accounts.google.com/gsi/client'
        s.onload = () => resolve(initClient())
        s.onerror = () => reject(new Error('Failed to load Google Identity Services'))
        document.head.appendChild(s)
      } else {
        resolve(initClient())
      }
    }

    const initClient = () => {
      if (_tokenClient) return _tokenClient
      _tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: GCLIENT_ID,
        scope: GCAL_SCOPES,
        callback: '', // set per-request
      })
      return _tokenClient
    }

    load()
  })
}

// ── Request a fresh token (shows Google popup) ────────────
export function requestToken(): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const client = await initTokenClient()
      client.callback = (resp: any) => {
        if (resp.error) {
          reject(new Error(resp.error_description || resp.error))
          return
        }
        saveToken(resp.access_token, resp.expires_in || 3600)
        resolve(resp.access_token)
      }
      // If we have a valid token, no popup needed
      const existing = getToken()
      if (existing) { resolve(existing); return }
      client.requestAccessToken({ prompt: '' }) // no prompt if already authed
    } catch (e) {
      reject(e)
    }
  })
}

// ── Authenticated fetch helper ────────────────────────────
async function gcalFetch(path: string, options: RequestInit = {}): Promise<any> {
  let token = getToken()
  if (!token) token = await requestToken()

  const resp = await fetch(`${GCAL_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (resp.status === 401) {
    // Token expired — get fresh one
    clearToken()
    token = await requestToken()
    const retry = await fetch(`${GCAL_BASE}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    if (!retry.ok) throw new Error(`Google API error: ${retry.status}`)
    return retry.json()
  }

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error?.message || `Google API error: ${resp.status}`)
  }
  if (resp.status === 204) return null
  return resp.json()
}

// ── Calendar CRUD operations ──────────────────────────────

export interface GCalEvent {
  id?: string
  summary: string
  description?: string
  location?: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
  recurrence?: string[]
  conferenceData?: any
  reminders?: { useDefault: boolean; overrides?: Array<{ method: string; minutes: number }> }
  hangoutLink?: string
}

// List events in a date range
export async function listEvents(from: Date, to: Date): Promise<GCalEvent[]> {
  const params = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '200',
  })
  const data = await gcalFetch(`/calendars/primary/events?${params}`)
  return data.items || []
}

// Create a new event
export async function createEvent(event: GCalEvent): Promise<GCalEvent> {
  return gcalFetch('/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(event),
  })
}

// Update an existing event
export async function updateEvent(eventId: string, event: Partial<GCalEvent>): Promise<GCalEvent> {
  return gcalFetch(`/calendars/primary/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(event),
  })
}

// Delete an event
export async function deleteEvent(eventId: string): Promise<void> {
  await gcalFetch(`/calendars/primary/events/${eventId}`, { method: 'DELETE' })
}

// ── Helpers to convert between app format and Google format ──

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

export function toGCalEvent(e: {
  title: string; date: string; start_time?: string; end_time?: string
  all_day?: boolean; description?: string; location?: string; url?: string
  recurring?: string; recurring_until?: string; reminder_minutes?: number
}): GCalEvent {
  const rrules: Record<string, string> = {
    daily: 'RRULE:FREQ=DAILY',
    weekly: 'RRULE:FREQ=WEEKLY',
    monthly: 'RRULE:FREQ=MONTHLY',
    yearly: 'RRULE:FREQ=YEARLY',
  }
  const rrule = e.recurring && e.recurring !== 'none' ? rrules[e.recurring] : undefined
  const until = e.recurring_until ? `;UNTIL=${e.recurring_until.replace(/-/g,'')}T235959Z` : ''

  if (e.all_day) {
    return {
      summary: e.title,
      description: e.description,
      location: e.location,
      start: { date: e.date },
      end: { date: e.date },
      recurrence: rrule ? [`${rrule}${until}`] : undefined,
    }
  }

  const startDT = `${e.date}T${e.start_time || '09:00'}:00`
  const endDT = `${e.date}T${e.end_time || e.start_time || '10:00'}:00`

  return {
    summary: e.title,
    description: [e.description, e.url ? `🎥 ${e.url}` : ''].filter(Boolean).join('\n\n'),
    location: e.location,
    start: { dateTime: startDT, timeZone: TZ },
    end: { dateTime: endDT, timeZone: TZ },
    recurrence: rrule ? [`${rrule}${until}`] : undefined,
    reminders: e.reminder_minutes !== undefined ? {
      useDefault: false,
      overrides: e.reminder_minutes > 0 ? [{ method: 'popup', minutes: e.reminder_minutes }] : [],
    } : { useDefault: true },
  }
}
