import { type ReactNode } from 'react'
import { LevaPanel, useCreateStore } from 'leva'
import { LayoutControlsContext, useLayoutControlStore } from './layout-controls-context'

/** Use Leva's public API to give each canvas its own parameter store. */
export function LayoutControlsProvider({ children }: { children: ReactNode }) {
  const store = useCreateStore()
  return <LayoutControlsContext.Provider value={store}>{children}</LayoutControlsContext.Provider>
}

export function LayoutControlsPanel() {
  const store = useLayoutControlStore()
  return (
    <div className="rf-pro-controls">
      <LevaPanel store={store} fill />
    </div>
  )
}
