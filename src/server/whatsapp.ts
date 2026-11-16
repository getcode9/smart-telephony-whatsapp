import pino from 'pino'
import QRCode from 'qrcode'
import { hasReplied, listHistoryAnchors, listUnanswered, markReplied, saveText, setChatName, userRepliedAfter } from './db.ts'
import { extractText, messageTimeIso } from './logic.ts'
import { draftReply, learnReplyPattern } from './reply.ts'

export type WaStatus = {
  connection: 'starting' | 'qr' | 'open' | 'close' | 'error'
  qrDataUrl: string | null
  error: string | null
}

type Listener = (status: WaStatus) => void

const listeners = new Set<Listener>()
let status: WaStatus = { connection: 'starting', qrDataUrl: null, error: null }
let socket: any = null
let restartTimer: NodeJS.Timeout | null = null
let connecting = false
let learnTimer: NodeJS.Timeout | null = null
let catchUpTimer: NodeJS.Timeout | null = null
const replying = new Set<string>()
const autoIds = new Set<string>()
const autoBodies = new Map<string, { body: string, until: number }>()

export function whatsAppStatus() {
  return status
}

export function subscribeWhatsApp(listener: Listener) {
  listeners.add(listener)
  listener(status)
  return () => listeners.delete(listener)
}

export function startWhatsApp() {
  void connect()
}

function publish(next: WaStatus, extra?: { type: string }) {
  status = next
  const event = extra ? { ...next, ...extra } : next
  for (const listener of listeners) listener(event as WaStatus)
}

async function connect() {
  if (connecting) return
  connecting = true
  publish({ connection: 'starting', qrDataUrl: null, error: null })
  try {
    const baileys = await import('baileys')
    const { state, saveCreds } = await baileys.useMultiFileAuthState('data/baileys-auth')
    let version: number[] | undefined
    try {
      version = await Promise.race([
        baileys.fetchLatestBaileysVersion().then((result) => result.version),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 8000)),
      ])
    } catch {
      version = undefined
    }
    const sock: any = baileys.default({
      ...(version ? { version: version as [number, number, number] } : {}),
      auth: state,
      logger: pino({ level: 'silent' }),
    })
    socket = sock
    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', (update: { connection?: string, qr?: string, lastDisconnect?: { error?: any } }) => {
      console.log('[WhatsApp Update]', {
        connection: update.connection,
        hasQr: Boolean(update.qr),
        statusCode: update.lastDisconnect?.error?.output?.statusCode,
        error: update.lastDisconnect?.error?.message || update.lastDisconnect?.error,
      })
      void onConnection(update)
    })
    sock.ev.on('messages.upsert', (upsert: { type?: string, messages?: IncomingMessage[] }) => onMessages(upsert))
    sock.ev.on('messaging-history.set', (history: { messages?: IncomingMessage[] }) => {
      onMessages({ type: 'append', messages: history.messages })
      scheduleLearn()
      scheduleCatchUp()
    })
    sock.ev.on('chats.upsert', (chats: { id?: string | null, name?: string | null }[]) => onChats(chats))
    sock.ev.on('chats.update', (chats: { id?: string | null, name?: string | null }[]) => onChats(chats))
  } catch (error) {
    publish({
      connection: 'error',
      qrDataUrl: null,
      error: error instanceof Error ? error.message : 'WhatsApp failed to start.',
    })
  } finally {
    connecting = false
  }
}

async function onConnection(update: { connection?: string, qr?: string, lastDisconnect?: { error?: { output?: { statusCode?: number } } } }) {
  if (update.qr) {
    const qrDataUrl = await QRCode.toDataURL(update.qr, { margin: 1, width: 280 })
    publish({ connection: 'qr', qrDataUrl, error: null })
  }
  if (update.connection === 'open') {
    publish({ connection: 'open', qrDataUrl: null, error: null })
    void pullHistory()
    scheduleCatchUp()
  }
  if (update.connection !== 'close') return
  const code = update.lastDisconnect?.error?.output?.statusCode
  socket = null
  if (code === 401) {
    console.log('[WhatsApp] 401 Unauthorized / Logged out. Clearing credentials and generating fresh QR...')
    try {
      const fs = await import('node:fs')
      fs.rmSync('data/baileys-auth', { recursive: true, force: true })
      fs.mkdirSync('data/baileys-auth', { recursive: true })
    } catch {}
    publish({
      connection: 'close',
      qrDataUrl: null,
      error: 'WhatsApp session expired. Generating fresh QR code...',
    })
    if (restartTimer) clearTimeout(restartTimer)
    restartTimer = setTimeout(() => {
      void connect()
    }, 2000)
    return
  }
  publish({ connection: 'close', qrDataUrl: null, error: 'WhatsApp disconnected. Reconnecting.' })
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = setTimeout(() => {
    void connect()
  }, 2000)
}

function onMessages(upsert: { type?: string, messages?: IncomingMessage[] }) {
  if (upsert.type !== 'notify' && upsert.type !== 'append') return
  let saved = false
  for (const message of upsert.messages ?? []) {
    const jid = message.key?.remoteJid
    const id = message.key?.id
    if (!jid || !id || jid === 'status@broadcast' || jid.endsWith('@broadcast')) continue
    const text = extractText(message.message)
    if (!text) continue
    const fromMe = Boolean(message.key?.fromMe)
    const source = fromMe && isAutomatic(jid, id, text) ? 'auto' : 'user'
    const timestamp = messageTimeIso(message.messageTimestamp)
    const inserted = saveText({
      waMessageId: id,
      chatJid: jid,
      sender: fromMe ? 'me' : message.key?.participant || jid,
      pushName: fromMe ? null : message.pushName ?? null,
      body: text,
      timestamp,
      displayName: fromMe || jid.endsWith('@g.us') ? null : message.pushName ?? null,
      fromMe,
      source,
    })
    if (!inserted) continue
    saved = true
    if (fromMe && source === 'user') scheduleLearn()
    const age = Date.now() - Date.parse(timestamp)
    if (!fromMe && !jid.endsWith('@g.us') && Math.abs(age) < 15 * 60 * 1000) {
      console.log(`[Auto-Reply] Scheduling reply for ${jid}: "${text}"`)
      scheduleAutoReply(jid, id, text, timestamp)
    }
  }
  if (saved) publish(status, { type: 'message' })
}

function scheduleLearn() {
  if (learnTimer) clearTimeout(learnTimer)
  learnTimer = setTimeout(() => {
    learnReplyPattern().catch((error) => {
      console.error(error instanceof Error ? error.message : error)
    })
  }, 4000)
}

function scheduleCatchUp() {
  if (catchUpTimer) clearTimeout(catchUpTimer)
  catchUpTimer = setTimeout(() => {
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const pending = listUnanswered(since)
    if (pending.length) {
      console.log(`[Auto-Reply] Catch-up processing ${pending.length} unanswered messages...`)
    }
    for (const message of pending) {
      void sendAutoReply(message.chat_jid, message.wa_message_id, message.body, message.timestamp)
    }
  }, 2000)
}

async function pullHistory() {
  if (!socket?.fetchMessageHistory) return
  for (const anchor of listHistoryAnchors()) {
    try {
      await socket.fetchMessageHistory(40, {
        remoteJid: anchor.chat_jid,
        id: anchor.wa_message_id,
        fromMe: anchor.from_me === 1,
      }, Date.parse(anchor.timestamp))
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
    }
  }
}

function scheduleAutoReply(jid: string, inboundId: string, text: string, timestamp: string) {
  setTimeout(() => {
    void sendAutoReply(jid, inboundId, text, timestamp)
  }, 3000)
}

async function sendAutoReply(jid: string, inboundId: string, text: string, timestamp: string) {
  if (!socket || replying.has(inboundId) || hasReplied(inboundId) || userRepliedAfter(jid, timestamp)) return
  replying.add(inboundId)
  try {
    console.log(`[Auto-Reply] Drafting reply for ${jid}...`)
    const reply = await draftReply(jid, text)
    if (!reply || hasReplied(inboundId) || userRepliedAfter(jid, timestamp)) return
    console.log(`[Auto-Reply] Sending reply to ${jid}: "${reply}"`)
    const sent = await socket.sendMessage(jid, { text: reply })
    const sentId = sent?.key?.id || `auto_${Date.now()}`
    autoIds.add(String(sentId))
    autoBodies.set(jid, { body: reply, until: Date.now() + 30_000 })
    markReplied(inboundId)
    saveText({
      waMessageId: String(sentId),
      chatJid: jid,
      sender: 'me',
      pushName: null,
      body: reply,
      timestamp: new Date().toISOString(),
      displayName: null,
      fromMe: true,
      source: 'auto',
    })
    publish(status, { type: 'message' })
    console.log(`[Auto-Reply] Successfully sent auto-reply to ${jid}!`)
  } catch (error) {
    console.error('[Auto-Reply Error]', error instanceof Error ? error.message : error)
  } finally {
    replying.delete(inboundId)
  }
}

function isAutomatic(jid: string, id: string, body: string) {
  if (autoIds.delete(id)) return true
  const recent = autoBodies.get(jid)
  if (recent && recent.body === body && recent.until > Date.now()) {
    autoBodies.delete(jid)
    return true
  }
  return false
}

function onChats(chats: { id?: string | null, name?: string | null }[]) {
  for (const chat of chats ?? []) {
    if (chat.id && chat.name) setChatName(chat.id, chat.name)
  }
}

const recentRecoverySent = new Map<string, number>()

export async function sendWhatsAppMessage(jid: string, body: string) {
  if (!socket || status.connection !== 'open') {
    throw new Error('WhatsApp is not linked. Please connect via QR code first.')
  }
  const cleanDigits = jid.replace(/\D/g, '')
  const cleanJid = jid.includes('@') ? jid : `${cleanDigits}@s.whatsapp.net`
  const sent = await socket.sendMessage(cleanJid, { text: body })
  const sentId = sent?.key?.id || `out_${Date.now()}`
  const now = new Date().toISOString()
  saveText({
    waMessageId: sentId,
    chatJid: cleanJid,
    sender: 'me',
    pushName: null,
    body,
    timestamp: now,
    displayName: null,
    fromMe: true,
    source: 'user',
  })
  publish(status, { type: 'message' })
  return { id: sentId, timestamp: now, body }
}

export async function handleMissedCall(call: { from?: string | null, to?: string | null, direction?: string | null }) {
  if (!socket || status.connection !== 'open') return
  const rawTarget = call.direction === 'inbound' ? call.from : call.to
  if (!rawTarget) return
  const digits = rawTarget.replace(/\D/g, '')
  if (digits.length < 8) return

  const { getSetting } = await import('./db.ts')
  const enabled = getSetting('missed_call_recovery_enabled', 'true') === 'true'
  if (!enabled) return

  const now = Date.now()
  const lastSent = recentRecoverySent.get(digits) ?? 0
  if (now - lastSent < 15 * 60 * 1000) return
  recentRecoverySent.set(digits, now)

  const defaultMsg = 'Hi! We noticed we missed your call on our desk line. How can we assist you today?'
  const message = getSetting('missed_call_recovery_message', defaultMsg) || defaultMsg

  try {
    const jid = `${digits}@s.whatsapp.net`
    await sendWhatsAppMessage(jid, message)
  } catch (error) {
    console.error('[Auto-Recovery] Failed to send WhatsApp message:', error instanceof Error ? error.message : error)
  }
}

type IncomingMessage = {
  key?: { fromMe?: boolean, remoteJid?: string | null, id?: string | null, participant?: string | null }
  pushName?: string | null
  message?: unknown
  messageTimestamp?: unknown
}
