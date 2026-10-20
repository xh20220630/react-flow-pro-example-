import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '@react-flow-pro-example/core/style.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'React Flow Pro Examples',
  description: '15 个独立运行的 React Flow Pro 功能示例，使用 Next.js 与 TypeScript。',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
