import { Doc, applyUpdate, encodeStateAsUpdate, encodeStateVector } from 'yjs'
import { createDemoId } from '../runtime/create-id.js'

type EventName = 'sync' | 'connection-error'
type Listener = (value: unknown) => void
type RoomMessage = {
  kind: 'request-state' | 'initial-state' | 'update'
  sender: string
  recipient?: string
  payload: Uint8Array
}

function isRoomMessage(value: unknown): value is RoomMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<RoomMessage>
  return (
    ['request-state', 'initial-state', 'update'].includes(message.kind ?? '') &&
    typeof message.sender === 'string' &&
    (message.recipient === undefined || typeof message.recipient === 'string') &&
    message.payload instanceof Uint8Array
  )
}

/**
 * Browser-only Yjs transport. Each room uses one same-origin BroadcastChannel.
 * A joining tab requests the missing state, then exchanges incremental updates.
 * No WebSocket server or Yjs provider internals are involved.
 */
export class LocalProvider {
  readonly doc: Doc
  readonly peerId = createDemoId()
  synced = false
  private destroyed = false
  private readonly channel: BroadcastChannel
  private readonly listeners = new Map<EventName, Set<Listener>>()
  private syncTimer: number | undefined

  constructor(room: string, doc: Doc) {
    this.doc = doc
    this.channel = new BroadcastChannel(`react-flow-pro-example:${room}`)
    this.channel.onmessage = this.receive
    this.channel.onmessageerror = (error) => this.emit('connection-error', error)
    doc.on('update', this.publishUpdate)
    doc.on('destroy', this.destroy)
    this.send({ kind: 'request-state', payload: encodeStateVector(doc) })
    // An empty room has no peer to answer. Its creator can initialize after
    // this discovery window; existing rooms usually answer before the timer.
    this.syncTimer = window.setTimeout(() => this.finishSync(), 100)
  }

  once(event: EventName, listener: Listener) {
    if (this.destroyed) return
    if (event === 'sync' && this.synced) {
      queueMicrotask(() => {
        if (!this.destroyed) listener(true)
      })
      return
    }
    const callbacks = this.listeners.get(event) ?? new Set<Listener>()
    callbacks.add(listener)
    this.listeners.set(event, callbacks)
  }

  private emit(event: EventName, value: unknown) {
    const callbacks = this.listeners.get(event)
    this.listeners.delete(event)
    callbacks?.forEach((callback) => callback(value))
  }

  private send(message: Omit<RoomMessage, 'sender'>) {
    if (!this.destroyed) this.channel.postMessage({ ...message, sender: this.peerId })
  }

  private finishSync() {
    if (this.destroyed || this.synced) return
    window.clearTimeout(this.syncTimer)
    this.synced = true
    this.emit('sync', true)
  }

  private publishUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin !== this) this.send({ kind: 'update', payload: update })
  }

  private receive = (event: MessageEvent<unknown>) => {
    if (this.destroyed || !isRoomMessage(event.data)) return
    const message = event.data
    if (message.sender === this.peerId || (message.recipient && message.recipient !== this.peerId))
      return
    if (message.kind === 'request-state') {
      this.send({
        kind: 'initial-state',
        recipient: message.sender,
        payload: encodeStateAsUpdate(this.doc, message.payload),
      })
      return
    }
    applyUpdate(this.doc, message.payload, this)
    if (message.kind === 'initial-state') this.finishSync()
  }

  destroy = () => {
    if (this.destroyed) return
    this.destroyed = true
    window.clearTimeout(this.syncTimer)
    this.doc.off('update', this.publishUpdate)
    this.doc.off('destroy', this.destroy)
    this.channel.close()
    this.listeners.clear()
    // The canvas may leave while its initial join is still pending.
    if (!this.doc.isDestroyed) this.doc.destroy()
  }
}
