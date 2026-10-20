'use client'

import dynamic from 'next/dynamic'

const ProWorkbench = dynamic(
  () => import('./react-flow-pro-page').then((module) => module.ReactFlowProPage),
  {
    ssr: false,
    loading: () => (
      <div className="workbench-loading" role="status">
        正在加载 React Flow 示例…
      </div>
    ),
  },
)

export function ProWorkbenchLoader() {
  return <ProWorkbench />
}
