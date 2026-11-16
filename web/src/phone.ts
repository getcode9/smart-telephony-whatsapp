type TelnyxCall = {
  id?: string
  state?: string
  cause?: string
  hangupCause?: string
  hangup?: () => void
  options?: { destinationNumber?: string; callerNumber?: string }
  telnyxIDs?: { telnyxSessionId?: string; telnyxLegId?: string; telnyxCallControlId?: string }
}

type RtcClient = {
  remoteElement: string
  connect: () => void
  newCall: (options: { destinationNumber: string; callerNumber: string }) => TelnyxCall
  on: (event: string, handler: (value: unknown) => void) => void
}

const listeners = new Set<(call: TelnyxCall) => void>()
const times = new Map<string, { startedAt: string; answeredAt?: string; endedAt?: string }>()
const serverCallIds = new Map<string, number>()

let client: RtcClient | null = null
let callerNumber = ''
let connecting: Promise<void> | null = null

// Recording State
let mediaRecorder: MediaRecorder | null = null
let recordedChunks: Blob[] = []
let activeRecordingId: string | null = null
let autoRecordCalls = true

export function setAutoRecord(enabled: boolean) {
  autoRecordCalls = enabled
}

export function isAutoRecord() {
  return autoRecordCalls
}

export function isCurrentlyRecording() {
  return mediaRecorder !== null && mediaRecorder.state === 'recording'
}

export function onCallUpdate(listener: (call: TelnyxCall) => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function placeCall(destination: string) {
  await ensureClient()
  return client!.newCall({ destinationNumber: destination, callerNumber })
}

export function hangUp(call: TelnyxCall | null) {
  call?.hangup?.()
}

async function ensureClient() {
  if (client && connecting) {
    await connecting
    return
  }
  const response = await fetch('/api/telephony/token', { method: 'POST' })
  const body = (await response.json()) as { token?: string; callerNumber?: string; error?: string }
  if (!response.ok || !body.token || !body.callerNumber) {
    throw new Error(body.error || 'Telnyx login failed.')
  }
  callerNumber = body.callerNumber
  const sdk = await import('@telnyx/webrtc')
  const TelnyxRTC = sdk.TelnyxRTC as new (options: { login_token: string }) => RtcClient
  client = new TelnyxRTC({ login_token: body.token })
  client.remoteElement = 'remote-audio'
  connecting = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error('Telnyx did not register. Check the connection id and caller number.')),
      20000
    )
    client!.on('telnyx.ready', () => {
      window.clearTimeout(timeout)
      resolve()
    })
    client!.on('telnyx.error', (error: unknown) => {
      window.clearTimeout(timeout)
      reject(error instanceof Error ? error : new Error('Telnyx rejected the login.'))
    })
    client!.on('telnyx.notification', (notification: unknown) => {
      const update = notification as { type?: string; call?: TelnyxCall }
      if (update.type === 'callUpdate' && update.call) track(update.call)
    })
  })
  try {
    client.connect()
    await connecting
  } catch (error) {
    client = null
    connecting = null
    throw error
  }
}

async function startCallAudioRecording(callId: string) {
  if (!autoRecordCalls || mediaRecorder) return
  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const destination = audioContext.createMediaStreamDestination()

    // 1. Capture microphone
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const micSource = audioContext.createMediaStreamSource(micStream)
      micSource.connect(destination)
    } catch (e) {
      console.warn('Microphone capture skipped:', e)
    }

    // 2. Capture remote audio element stream
    const remoteEl = document.getElementById('remote-audio') as HTMLAudioElement | null
    if (remoteEl) {
      try {
        if (remoteEl.srcObject instanceof MediaStream) {
          const remoteSource = audioContext.createMediaStreamSource(remoteEl.srcObject)
          remoteSource.connect(destination)
        } else if ((remoteEl as unknown as { captureStream?: () => MediaStream }).captureStream) {
          const remoteStream = (remoteEl as unknown as { captureStream: () => MediaStream }).captureStream()
          const remoteSource = audioContext.createMediaStreamSource(remoteStream)
          remoteSource.connect(destination)
        }
      } catch (e) {
        console.warn('Remote stream capture skipped:', e)
      }
    }

    recordedChunks = []
    activeRecordingId = callId

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    const recorder = new MediaRecorder(destination.stream, { mimeType })
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data)
      }
    }

    recorder.onstop = async () => {
      if (!recordedChunks.length) return
      const blob = new Blob(recordedChunks, { type: 'audio/webm' })
      recordedChunks = []
      const cId = activeRecordingId
      activeRecordingId = null

      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64data = (reader.result as string)?.split(',')[1]
        if (!base64data || !cId) return

        // Retry helper to get server call id if sync response is pending
        let sId = serverCallIds.get(cId)
        if (!sId) {
          for (let i = 0; i < 6; i++) {
            await new Promise((r) => setTimeout(r, 500))
            sId = serverCallIds.get(cId)
            if (sId) break
          }
        }

        if (sId) {
          await fetch(`/api/calls/${sId}/recording`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: base64data }),
          }).catch((err) => console.error('Failed to upload recording:', err))
        }
      }
      reader.readAsDataURL(blob)
    }

    recorder.start(1000)
    mediaRecorder = recorder
  } catch (err) {
    console.error('Recording initialization error:', err)
  }
}

function stopCallAudioRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop()
    } catch {}
  }
  mediaRecorder = null
}

function track(call: TelnyxCall) {
  const id = call.id || 'current'
  const now = new Date().toISOString()
  const row = times.get(id) ?? { startedAt: now }
  const status = mapState(call.state)

  if (status === 'answered' && !row.answeredAt) {
    row.answeredAt = now
    void startCallAudioRecording(id)
  }

  if ((status === 'hangup' || status === 'failed') && !row.endedAt) {
    row.endedAt = now
    stopCallAudioRecording()
  }

  times.set(id, row)
  for (const listener of listeners) listener(call)

  const ids = call.telnyxIDs ?? {}
  void fetch('/api/calls/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientCallId: call.id ?? null,
      callSessionId: ids.telnyxSessionId ?? null,
      callLegId: ids.telnyxLegId ?? null,
      callControlId: ids.telnyxCallControlId ?? null,
      direction: 'outbound',
      from: call.options?.callerNumber ?? callerNumber,
      to: call.options?.destinationNumber ?? null,
      status,
      startedAt: row.startedAt,
      answeredAt: row.answeredAt ?? null,
      endedAt: row.endedAt ?? null,
      hangupCause: call.cause || call.hangupCause || null,
    }),
  })
    .then(async (response) => {
      if (response.ok) {
        const body = (await response.json()) as { id?: number }
        if (body.id) serverCallIds.set(id, body.id)
      }
    })
    .catch(() => undefined)
}

export function mapState(state: string | undefined) {
  if (state === 'active' || state === 'answered' || state === 'held') return 'answered'
  if (state === 'hangup' || state === 'destroy' || state === 'purge') return 'hangup'
  if (state === 'ringing' || state === 'early' || state === 'answering') return 'ringing'
  if (state === 'failed' || state === 'busy' || state === 'rejected') return 'failed'
  return 'initiated'
}

export function stateLabel(state: string | undefined) {
  const status = mapState(state)
  if (!state) return 'Idle'
  if (status === 'answered') return 'On the call'
  if (status === 'ringing') return 'Ringing'
  if (status === 'hangup') return 'Call ended'
  if (status === 'failed') return 'Call failed'
  return 'Placing the call'
}
