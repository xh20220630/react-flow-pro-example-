import { Doc } from 'yjs'
import { WebsocketProvider } from 'y-websocket'

export type CollaborationStatus = 'connecting' | 'connected' | 'disconnected'

export interface CollaborationSession {
  doc: Doc
  provider: WebsocketProvider
  whenSynced: Promise<void>
  destroy: () => void
}

/**
 * 每个房间使用官方 y-websocket 协议连接当前站点的协作服务。
 * 显式关闭 BroadcastChannel，确保独立浏览器、不同设备和同浏览器标签页走同一条服务端链路。
 * HTTP 页面使用 ws，HTTPS 页面使用 wss，不把开发机器地址或独立端口写进功能包。
 */
export function createCollaborationSession(
  room: string,
  onStatus: (status: CollaborationStatus) => void,
): CollaborationSession {
  const doc = new Doc()
  const endpoint = new URL('/collaboration', window.location.href)
  endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:'
  const provider = new WebsocketProvider(endpoint.toString(), room, doc, {
    connect: false,
    disableBc: true,
    maxBackoffTime: 3000,
  })
  let destroyed = false
  let cancelSync: () => void = () => {}
  const handleStatus = ({ status }: { status: CollaborationStatus }) => onStatus(status)
  provider.on('status', handleStatus)

  // 只有收到服务端同步回复才算加入成功，不能用固定延迟把空房间当作已同步。
  const whenSynced = new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeout)
      provider.off('sync', handleSync)
      provider.off('connection-error', handleError)
    }
    const handleSync = (synced: boolean) => {
      if (!synced) return
      cleanup()
      resolve()
    }
    const handleError = () => {
      cleanup()
      reject(new Error('无法连接协作服务，请稍后重试。'))
    }
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('加入房间超时，请检查连接后重试。'))
    }, 10000)
    cancelSync = () => {
      cleanup()
      reject(new DOMException('已取消房间连接', 'AbortError'))
    }
    provider.on('sync', handleSync)
    provider.on('connection-error', handleError)
  })

  return {
    doc,
    provider,
    whenSynced,
    destroy: () => {
      if (destroyed) return
      destroyed = true
      cancelSync()
      provider.off('status', handleStatus)
      // Awareness 只承载在线状态，主动离开时立即移除光标和连接草稿。
      provider.awareness.setLocalState(null)
      provider.destroy()
      doc.destroy()
    },
  }
}
