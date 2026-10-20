import { createContext, useContext } from 'react'
import { useControls, type useCreateStore } from 'leva'

type ControlsSchema = Exclude<Parameters<typeof useControls>[0], string | (() => unknown)>
export const LayoutControlsContext = createContext<ReturnType<typeof useCreateStore> | null>(null)

export function useLayoutControlStore() {
  const store = useContext(LayoutControlsContext)
  if (!store) throw new Error('Layout controls require LayoutControlsProvider')
  return store
}

/** Register parameters in the closest canvas, rather than the global Leva store. */
export function useLayoutControls(schema: ControlsSchema, dependencies: unknown[] = []) {
  const store = useLayoutControlStore()
  return useControls(schema, { store }, dependencies)
}
