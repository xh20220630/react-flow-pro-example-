import { createServer } from 'node:http'
import { parseArgs } from 'node:util'
import next from 'next'
import { attachCollaborationServer } from './collaboration.ts'

const { values } = parseArgs({
  options: {
    dev: { type: 'boolean', default: false },
    hostname: { type: 'string', default: process.env.HOST ?? '0.0.0.0' },
    port: { type: 'string', default: process.env.PORT ?? '3000' },
  },
})
const port = Number(values.port)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('无效的服务端口')
// Node 24 直接运行可擦除类型的 TS；Next.js 仍负责 App Router、浏览器编译和开发热更新。
Object.assign(process.env, { NODE_ENV: values.dev ? 'development' : 'production' })
const app = next({ dev: values.dev, hostname: values.hostname, port })
const handleRequest = app.getRequestHandler()
await app.prepare()

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error: unknown) => {
    console.error('HTTP request failed:', error)
    if (!response.headersSent) response.writeHead(500)
    response.end('Internal Server Error')
  })
})
const closeCollaboration = attachCollaborationServer(server)
// 非协作路径的 upgrade 由 Next 的自定义服务器处理，保留开发环境的 HMR 连接。
server.listen(port, values.hostname, () => {
  console.log(
    `React Flow Pro: http://${values.hostname}:${port} (${values.dev ? 'dev' : 'production'})`,
  )
})
server.on('error', (error) => {
  console.error('Server failed:', error)
  process.exitCode = 1
  void shutdown()
})

let stopping = false
async function shutdown() {
  if (stopping) return
  stopping = true
  closeCollaboration()
  server.closeAllConnections()
  await Promise.all([new Promise<void>((resolve) => server.close(() => resolve())), app.close()])
}
process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
