/** 供启动探针确认 Next.js 应用已经能够处理请求。 */
export function GET() {
  return Response.json({ status: 'ok' })
}
