import { createContext, useContext } from 'react'
import { useControls, type useCreateStore } from 'leva'

type ControlsSchema = Exclude<Parameters<typeof useControls>[0], string | (() => unknown)>
export const LayoutControlsContext = createContext<ReturnType<typeof useCreateStore> | null>(null)

export function useLayoutControlStore() {
  const store = useContext(LayoutControlsContext)
  if (!store) throw new Error('Layout controls require LayoutControlsProvider')
  return store
}

/**
 * 在当前画布的 Leva store 中注册参数，避免不同示例共享全局面板状态。
 * 保留具体 Schema 泛型，使算法名、方向和间距的返回类型随面板配置推导，
 * 而不是丢失为任意字符串索引的对象。
 */
export function useLayoutControls<Schema extends ControlsSchema>(
  schema: Schema,
  dependencies: unknown[] = [],
): ReturnType<typeof useControls<Schema, Schema, Schema>> {
  const store = useLayoutControlStore()
  return useControls<Schema, Schema, Schema>(schema, { store }, dependencies)
}
