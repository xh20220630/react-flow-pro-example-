import type { IncomingMessage, Server } from 'node:http'
import { docs, getYDoc, setupWSConnection } from '@y/websocket-server/utils'
import { WebSocketServer } from 'ws'
import type { Node } from '@xyflow/react'

/**
 * 为应用同一 HTTP 端口挂载官方 y-websocket 服务，房间名称对应一份服务端 Y.Doc。
 * 初始化在服务端同步完成，两个客户端同时加入新房间也只会得到同一对初始节点。
 * 文档在当前服务进程内存中保留，刷新和重新加入不会覆盖已有图；服务重启后清空。
 */
export function attachCollaborationServer(server: Server) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    if (!pathname.startsWith('/collaboration/')) return
    const room = pathname.slice('/collaboration/'.length)
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(room)) {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
      return
    }

    sockets.handleUpgrade(request, socket, head, (connection) => {
      const doc = getYDoc(room)
      const meta = doc.getMap<boolean>('meta')
      if (!meta.get('initialized')) {
        doc.transact(() => {
          const nodes = doc.getMap<Node>('nodes')
          nodes.set('text-1', {
            id: 'text-1',
            type: 'text',
            position: { x: 0, y: 100 },
            data: { label: 'Text Input', text: '', placeholder: 'Enter text...' },
          })
          nodes.set('checkbox-1', {
            id: 'checkbox-1',
            type: 'checkbox',
            position: { x: 101, y: 0 },
            data: { label: 'New Checkbox', checked: false },
          })
          meta.set('initialized', true)
        })
      }
      setupWSConnection(connection, request, { docName: room })
    })
  })

  return () => {
    for (const connection of sockets.clients) connection.terminate()
    sockets.close()
    for (const doc of docs.values()) doc.destroy()
    docs.clear()
  }
}
