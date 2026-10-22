/**
 * 多人协作：Zustand 保存视图，Yjs 文档同步图和表单，Awareness 同步在线光标及连接草稿。
 * 每个画布实例通过 createExampleScope 创建独立作用域，避免缓存、store 和可变初始数据跨实例共享。
 */
import * as React from 'react'
import { createDemoId } from '../runtime/create-id'
import { copyText } from '../runtime/copy-text'
import {
  Position,
  getBezierPath,
  useReactFlow,
  useStore,
  useNodesInitialized,
  ReactFlow,
  ViewportPortal,
  MiniMap,
  ReactFlowProvider,
  Panel,
  Controls,
  BaseEdge,
  Background,
  Handle,
  useConnection,
} from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { createStore } from 'zustand/vanilla'
import { useStore as useZustandStore } from 'zustand'
import {
  Square as SquareIcon,
  Type as TypeIcon,
  Grip as GripIcon,
  LoaderCircle as LoaderCircleIcon,
  MousePointer2 as MousePointerIcon,
  Share2 as ShareIcon,
  X as CloseIcon,
} from 'lucide-react'
import { Doc as YDoc } from 'yjs'
import { PerfectCursor as SplineInterpolator } from 'perfect-cursors'
import type { Awareness } from 'y-protocols/awareness'
import {
  createCollaborationSession,
  type CollaborationSession,
  type CollaborationStatus,
} from '../collaboration/websocket-provider'
import type {
  Connection,
  Edge,
  GetBezierPathParams,
  HandleType,
  Node,
  NodeChange,
  EdgeChange,
  NodeProps,
  ReactFlowInstance,
  XYPosition,
} from '@xyflow/react'
import type { StateCreator, StoreApi } from 'zustand'

/** 表单字段存入共享节点 data；测量尺寸与 selected 只保留在当前标签页。 */
type CollaborativeNode = Node<{
  label: string
  checked?: boolean
  text?: string
  placeholder?: string
}>
type NodeTemplate = Omit<CollaborativeNode, 'id'>
/** 共享指针与连接草稿属于 Awareness 在线状态，由协议的心跳和离线检测清理。 */
interface CursorState {
  position: XYPosition
  dragging: boolean
}
interface RemoteCursorState extends CursorState {
  user: string
  color: string
}
interface ConnectionDraft {
  source: string
  sourceType: HandleType
  sourceHandle: string | undefined
  target: string | undefined
  targetType: HandleType | undefined
  targetHandle: string | undefined
  position: XYPosition
}
interface RemoteConnectionState extends ConnectionDraft {
  user: string
  color: string
}
interface GraphSlice {
  nodes: CollaborativeNode[]
  edges: Edge[]
  setYjsNodes: () => void
  setYjsEdges: () => void
  onNodesChange: (changes: NodeChange<CollaborativeNode>[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  addNode: (nodeTemplate: NodeTemplate) => Promise<void>
  addEdge: (edgeTemplate: Omit<Edge, 'id'>) => Promise<void>
  updateNodeData: (nodeId: string, dataPatch: Partial<CollaborativeNode['data']>) => void
}
interface CursorSlice {
  cursors: RemoteCursorState[]
  setYjsCursors: () => void
  updateCursor: (cursor: CursorState) => void
}
interface ConnectionSlice {
  connections: RemoteConnectionState[]
  setYjsConnections: () => void
  updateConnection: (connection: ConnectionDraft | undefined) => void
}
interface AppState extends GraphSlice, CursorSlice, ConnectionSlice {
  yDoc?: YDoc | undefined
  awareness?: Awareness | undefined
  connectionStatus: CollaborationStatus
  onlineUsers: number
  activeFlowId: string | undefined
  userId: string | null | undefined
  isLoading: boolean
  error: string | null
  getUserColor: (userId: string) => string
  joinFlow: (flowId: string) => Promise<boolean>
  createFlow: () => Promise<boolean>
  exitFlow: () => void
}
interface ProjectionEntry<Remote, Local> {
  remote: Remote
  local: Local
}
interface ProjectionOptions<Remote, Local> {
  getId: (remote: Remote) => string
  deriveLocal: (remote: Remote) => Local
  isRemoteEqual?: (previous: Remote, next: Remote) => boolean
}

/** 创建本示例的组件、算法和局部状态；根组件惰性初始化后在本次挂载中复用。 */
function createExampleScope() {
  /** Awareness 是短暂在线状态，不写入长期 Y.Doc；断线时服务器会移除对应用户。 */
  interface Presence {
    user: { id: string; color: string }
    cursor?: CursorState
    connection?: ConnectionDraft
  }
  function remotePresences(awareness: Awareness | undefined): Presence[] {
    return Array.from(awareness?.getStates().values() ?? []).flatMap((value: unknown) => {
      if (!value || typeof value !== 'object') return []
      const presence = value as Partial<Presence>
      if (typeof presence.user?.id !== 'string' || typeof presence.user.color !== 'string')
        return []
      return [presence as Presence]
    })
  }
  const createConnectionsSlice: StateCreator<AppState, [], [], ConnectionSlice> = (
    setState,
    getState,
  ) => ({
    connections: [],
    setYjsConnections: () => {
      const { awareness, userId } = getState()
      setState({
        connections: remotePresences(awareness).flatMap(({ user, connection }) =>
          user.id !== userId && connection
            ? [{ ...connection, user: user.id, color: user.color }]
            : [],
        ),
      })
    },
    updateConnection: (connection) => {
      getState().awareness?.setLocalStateField('connection', connection ?? null)
    },
  })
  /** 光标坐标属于画布坐标系；使用 Awareness 的心跳和离线清理，无需在文档里保留过期记录。 */
  const createCursorsSlice: StateCreator<AppState, [], [], CursorSlice> = (setState, getState) => ({
    cursors: [],
    setYjsCursors: () => {
      const { awareness, userId } = getState()
      const presences = remotePresences(awareness)
      setState({
        onlineUsers: presences.length,
        cursors: presences.flatMap(({ user, cursor }) =>
          user.id !== userId && cursor ? [{ ...cursor, user: user.id, color: user.color }] : [],
        ),
      })
    },
    updateCursor: (cursor) => {
      getState().awareness?.setLocalStateField('cursor', cursor)
    },
  })
  /**
   * 在共享对象与本地对象之间维护稳定引用，避免远端同步清掉本机 UI 状态。
   * 同一远端引用未变化时直接复用 local；远端变化时用新共享字段覆盖旧 local。
   * 没有共享到远端的测量尺寸与选中状态仍保留，节点/边删除后同步清理旧缓存。
   * Remote 与 Local 分别泛型化，使缓存合并、读取和局部更新都保留具体数据类型。
   */
  const RemoteProjectionCache = class<Remote extends object, Local extends object> {
    entriesById: Map<string, ProjectionEntry<Remote, Local>>
    getId: ProjectionOptions<Remote, Local>['getId']
    deriveLocal: ProjectionOptions<Remote, Local>['deriveLocal']
    isRemoteEqual: NonNullable<ProjectionOptions<Remote, Local>['isRemoteEqual']>
    constructor(options: ProjectionOptions<Remote, Local>) {
      this.getId = options.getId
      this.deriveLocal = options.deriveLocal
      this.isRemoteEqual =
        options.isRemoteEqual ?? ((previousRemote, nextRemote) => previousRemote === nextRemote)
      this.entriesById = new Map()
    }
    /* 先标记旧缓存，再遍历远端数据恢复存活项；已改变的远端对象覆盖共享字段，保留仅存在于本地的测量和选中状态。 */
    merge(remoteValues: Remote[]): Local[] {
      const staleEntries = new Map(this.entriesById)
      const localValues = remoteValues.map((remoteValue) => {
        const entryId = this.getId(remoteValue)
        staleEntries.delete(entryId)
        const cachedEntry = this.entriesById.get(entryId)
        if (cachedEntry && this.isRemoteEqual(cachedEntry.remote, remoteValue)) {
          return cachedEntry.local
        }
        const localValue = {
          ...cachedEntry?.local,
          ...this.deriveLocal(remoteValue),
        }
        this.entriesById.set(entryId, {
          remote: remoteValue,
          local: localValue,
        })
        return localValue
      })
      staleEntries.forEach((_staleEntry, entryId) => {
        this.entriesById.delete(entryId)
      })
      return localValues
    }
    get(entryId: string) {
      return this.entriesById.get(entryId)
    }
    delete(entryId: string) {
      return this.entriesById.delete(entryId)
    }
    set(entryId: string, remoteValue: Remote, localValue: Local) {
      const cacheEntry = {
        remote: remoteValue,
        local: localValue,
      }
      this.entriesById.set(entryId, cacheEntry)
      return cacheEntry
    }
  }
  /**
   * 把共享图数据与 React Flow 的本地投影衔接起来，节点和边分别使用独立缓存。
   * 位置、增删、替换写入 Yjs Map，由观察器刷新画布；测量尺寸与选择状态只更新本地缓存。
   * 新增节点和边先生成唯一 ID，表单修改以浅合并 data 的方式写回对应节点。
   * 所有 Map 都明确声明值类型，节点、边、光标和连接草稿不能互相混写。
   */
  const createGraphSlice: StateCreator<AppState, [], [], GraphSlice> = (setState, getState) => {
    const nodeCache = new RemoteProjectionCache<CollaborativeNode, CollaborativeNode>({
      getId: (node) => node.id,
      deriveLocal: (node) => node,
    })
    const edgeCache = new RemoteProjectionCache<Edge, Edge>({
      getId: (edge) => edge.id,
      deriveLocal: (edge) => edge,
    })
    function getNodesMap() {
      return getState().yDoc?.getMap<CollaborativeNode>('nodes')
    }
    function getEdgesMap() {
      return getState().yDoc?.getMap<Edge>('edges')
    }
    return {
      nodes: [],
      edges: [],
      setYjsNodes: () => {
        const nodesMap = getNodesMap()
        const remoteNodes = Array.from(nodesMap?.values() || [])
        setState({
          nodes: nodeCache.merge(remoteNodes),
        })
      },
      setYjsEdges: () => {
        const edgesMap = getEdgesMap()
        const remoteEdges = Array.from(edgesMap?.values() || [])
        setState({
          edges: edgeCache.merge(remoteEdges),
        })
      },
      onNodesChange:
        /* 位置、增删和替换写回共享节点 Map；dimensions 与 select 只更新本地缓存，再刷新当前视图。 */ (
          changes,
        ) => {
          let localCacheChanged = false
          const nodesMap = getNodesMap()
          if (nodesMap) {
            for (const change of changes)
              switch (change.type) {
                case 'position': {
                  const remoteNode = nodesMap.get(change.id)
                  if (remoteNode && change.position) {
                    nodesMap.set(change.id, {
                      ...remoteNode,
                      position: change.position,
                    })
                  }
                  break
                }
                case 'dimensions': {
                  const cachedNode = nodeCache.get(change.id)
                  if (cachedNode && change.dimensions) {
                    nodeCache.set(change.id, cachedNode.remote, {
                      ...cachedNode.local,
                      measured: change.dimensions,
                    })
                    localCacheChanged = true
                  }
                  break
                }
                case 'select': {
                  const cachedNode = nodeCache.get(change.id)
                  if (cachedNode) {
                    nodeCache.set(change.id, cachedNode.remote, {
                      ...cachedNode.local,
                      selected: change.selected,
                    })
                    localCacheChanged = true
                  }
                  break
                }
                case 'add':
                  nodesMap.set(change.item.id, change.item)
                  break
                case 'remove':
                  nodesMap.delete(change.id)
                  break
                case 'replace':
                  nodesMap.set(change.item.id, change.item)
                  break
              }
            if (localCacheChanged) {
              getState().setYjsNodes()
            }
          }
        },
      onEdgesChange: /* 边的增删、替换进入共享 Map，边的选中状态仅在本地投影中保留。 */ (
        changes,
      ) => {
        let localCacheChanged = false
        const edgesMap = getEdgesMap()
        if (edgesMap) {
          for (const change of changes)
            switch (change.type) {
              case 'select': {
                const cachedEdge = edgeCache.get(change.id)
                if (cachedEdge) {
                  edgeCache.set(change.id, cachedEdge.remote, {
                    ...cachedEdge.local,
                    selected: change.selected,
                  })
                  localCacheChanged = true
                }
                break
              }
              case 'add':
                edgesMap.set(change.item.id, change.item)
                break
              case 'remove':
                edgesMap.delete(change.id)
                break
              case 'replace':
                edgesMap.set(change.item.id, change.item)
                break
            }
          if (localCacheChanged) {
            getState().setYjsEdges()
          }
        }
      },
      onConnect: (connection) => {
        const edgesMap = getEdgesMap()
        if (!edgesMap) {
          return
        }
        const edgeId = createDemoId()
        edgesMap.set(edgeId, {
          ...connection,
          id: edgeId,
        })
      },
      addNode: async (nodeTemplate) => {
        const nodesMap = getNodesMap()
        if (!nodesMap) {
          return
        }
        const nodeId = createDemoId()
        nodesMap.set(nodeId, {
          ...nodeTemplate,
          id: nodeId,
        })
      },
      addEdge: async (edgeTemplate) => {
        const edgesMap = getEdgesMap()
        if (!edgesMap) {
          return
        }
        const edgeId = createDemoId()
        edgesMap.set(edgeId, {
          ...edgeTemplate,
          id: edgeId,
        })
      },
      updateNodeData:
        /* 节点 data 使用浅合并后整体写回共享 Map，沿用原实现的节点级冲突与同步粒度。 */ (
          nodeId,
          dataPatch,
        ) => {
          const nodesMap = getNodesMap()
          if (!nodesMap) {
            return
          }
          const remoteNode = nodesMap.get(nodeId)
          if (remoteNode) {
            nodesMap.set(nodeId, {
              ...remoteNode,
              data: {
                ...remoteNode.data,
                ...dataPatch,
              },
            })
          }
        },
    }
  }
  const USER_COLORS = [
    '#DA702C',
    '#D0A215',
    '#879A39',
    '#3AA99F',
    '#4385BE',
    '#D14D41',
    '#8B7EC8',
    '#CE5D97',
  ]
  const appStore = createStore<AppState>((setState, getState, storeApi) => {
    const userColors = new Map<string, string>()
    let nextColorIndex = Math.floor(Math.random() * USER_COLORS.length)
    const localUserId = createDemoId()
    let session: CollaborationSession | undefined
    // 序号与 session 引用共同隔离异步加入，已退出/已切换房间的回复不能重新激活旧画布。
    let connectionVersion = 0
    function disconnectFlow() {
      connectionVersion += 1
      session?.destroy()
      session = undefined
      const currentUrl = new URL(window.location.href)
      currentUrl.searchParams.delete('flow')
      window.history.replaceState({}, '', currentUrl)
      setState({
        yDoc: undefined,
        awareness: undefined,
        activeFlowId: undefined,
        userId: null,
        nodes: [],
        edges: [],
        cursors: [],
        connections: [],
        connectionStatus: 'disconnected',
        onlineUsers: 0,
        isLoading: false,
      })
    }
    /**
     * 建立真实的 y-websocket 连接，等服务端 Y.Doc 同步后再显示画布。
     * 初始节点由服务器一次性创建；客户端加入只读取现有图，不重新播种数据。
     * 失败或离开房间时对称销毁 Provider、Awareness 和文档，避免旧请求覆盖新房间。
     */
    async function connectFlow(input: string): Promise<boolean> {
      let flowId = input.trim()
      try {
        if (/^https?:/i.test(flowId)) flowId = new URL(flowId).searchParams.get('flow') ?? ''
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(flowId))
          throw new Error('请输入有效的房间 ID 或分享链接。')
      } catch (error) {
        setState({ error: error instanceof Error ? error.message : '无效的分享链接。' })
        return false
      }
      disconnectFlow()
      const version = connectionVersion
      setState({ isLoading: true, error: null, connectionStatus: 'connecting' })
      const currentSession = createCollaborationSession(flowId, (status) => {
        if (session === currentSession) setState({ connectionStatus: status })
      })
      session = currentSession
      try {
        currentSession.provider.connect()
        await currentSession.whenSynced
        if (version !== connectionVersion || session !== currentSession) return false
        currentSession.provider.awareness.setLocalStateField('user', {
          id: localUserId,
          color: getState().getUserColor(localUserId),
        })
        const currentUrl = new URL(window.location.href)
        currentUrl.searchParams.set('flow', flowId)
        currentUrl.hash = 'collaborative'
        window.history.replaceState({}, '', currentUrl)
        setState({
          yDoc: currentSession.doc,
          awareness: currentSession.provider.awareness,
          activeFlowId: flowId,
          userId: localUserId,
          isLoading: false,
        })
        return true
      } catch (error) {
        if (version !== connectionVersion || session !== currentSession) return false
        currentSession.destroy()
        session = undefined
        setState({
          isLoading: false,
          connectionStatus: 'disconnected',
          error: error instanceof Error ? error.message : '加入房间失败，请重试。',
        })
        return false
      }
    }
    return {
      activeFlowId: undefined,
      userId: undefined,
      connectionStatus: 'disconnected',
      onlineUsers: 0,
      isLoading: false,
      error: null,
      getUserColor: (userId) => {
        if (!userColors.has(userId)) {
          userColors.set(userId, USER_COLORS[nextColorIndex++ % USER_COLORS.length]!)
        }
        return userColors.get(userId)!
      },
      joinFlow: connectFlow,
      createFlow: () => connectFlow(createDemoId()),
      exitFlow: () => {
        disconnectFlow()
      },
      ...createGraphSlice(setState, getState, storeApi),
      ...createConnectionsSlice(setState, getState, storeApi),
      ...createCursorsSlice(setState, getState, storeApi),
    }
  })
  const AppStoreContext = React.createContext<StoreApi<AppState> | null>(null)
  function useAppStore<Selected>(selector: (state: AppState) => Selected): Selected {
    const store = React.useContext(AppStoreContext)
    if (!store) {
      throw Error('AppStoreContext not found')
    }
    return useZustandStore(store, useShallow(selector))
  }
  function NodeDragGrip() {
    return (
      <div
        className={
          'not-in-[.selected]:hidden absolute -top-4 -right-3 text-teal-500 cursor-grab active:cursor-grabbing border-2 rounded-md border-teal-500 p-1 bg-white dark:bg-stone-900'
        }
      >
        <GripIcon className="w-4 h-4" />
      </div>
    )
  }
  const selectCheckboxActions = (appState: AppState) => ({
    updateNodeData: appState.updateNodeData,
  })
  /* 复选框先用 React 乐观状态即时响应，再更新共享节点 data，远端同步后由新 props 接管。 */
  function CheckboxNode({ id: nodeId, data }: NodeProps<CollaborativeNode>) {
    const { updateNodeData } = useAppStore(useShallow(selectCheckboxActions))
    const [optimisticChecked, setOptimisticChecked] = React.useOptimistic(
      data.checked,
      (_previousChecked: boolean | undefined, nextChecked: boolean) => nextChecked,
    )
    const updateChecked = React.useCallback(
      (checked: boolean) => {
        React.startTransition(() => {
          setOptimisticChecked(checked)
        })
        updateNodeData(nodeId, {
          checked,
        })
      },
      [updateNodeData, nodeId, setOptimisticChecked],
    )
    return (
      <div
        className={
          'in-[.selected]:border-teal-500! in-[.selected]:shadow-lg cursor-default rounded-md border-2 border-stone-400 bg-white shadow-md dark:border-stone-700 dark:bg-stone-900'
        }
      >
        <NodeDragGrip />
        <div className="nodrag flex items-center space-x-24 p-4">
          <input
            type="checkbox"
            id={`checkbox-${nodeId}`}
            checked={optimisticChecked}
            onChange={(changeEvent) => updateChecked(changeEvent.target.checked)}
            className={
              'form-checkbox h-4 w-4 cursor-pointer rounded border-gray-300 bg-white text-teal-500 focus:ring-2 focus:ring-teal-500 focus:ring-offset-0 dark:border-stone-600 dark:bg-stone-800'
            }
          />
        </div>
        <Handle type="target" position={Position.Top} className="bg-teal-500! w-2! h-2!" />
        <Handle type="source" position={Position.Bottom} className="bg-teal-500! w-2! h-2!" />
      </div>
    )
  }
  const selectTextActions = (appState: AppState) => ({
    updateNodeData: appState.updateNodeData,
  })
  /* 文字输入以乐观状态即时显示，同时将 text 写回共享节点 data；保留原实现按节点字段同步的方式。 */
  function TextNode({ id: nodeId, data }: NodeProps<CollaborativeNode>) {
    const { updateNodeData } = useAppStore(useShallow(selectTextActions))
    const [optimisticText, setOptimisticText] = React.useOptimistic(
      data.text || '',
      (_previousText: string, nextText: string) => nextText,
    )
    const updateText = React.useCallback(
      (text: string) => {
        React.startTransition(() => {
          setOptimisticText(text)
        })
        updateNodeData(nodeId, {
          text,
        })
      },
      [updateNodeData, nodeId, setOptimisticText],
    )
    return (
      <div
        className={
          'text-foreground in-[.selected]:border-teal-500! in-[.selected]:shadow-lg relative min-w-[250px] rounded-md border-2 border-stone-400 bg-white shadow-md dark:border-stone-700 dark:bg-stone-900'
        }
      >
        <NodeDragGrip />
        <div className="nodrag w-full overflow-hidden rounded-b-md">
          <input
            value={optimisticText}
            onChange={(changeEvent) => updateText(changeEvent.target.value)}
            placeholder="Enter text..."
            className={
              'nodrag form-input text-foreground placeholder:text-muted-foreground w-full min-w-0 rounded-none rounded-b-md border-0 bg-transparent px-4 py-3 shadow-none ring-0 focus:border-0 focus:ring-0'
            }
          />
        </div>
        <Handle type="target" position={Position.Top} className="bg-teal-500! w-2! h-2!" />
        <Handle type="source" position={Position.Bottom} className="bg-teal-500! w-2! h-2!" />
      </div>
    )
  }
  const selectAddNodeAction = (appState: AppState) => ({
    addNode: appState.addNode,
  })
  function AddNodeMenu({
    visible,
    x: menuX,
    y: menuY,
    onHide,
  }: {
    visible: boolean
    x: number
    y: number
    onHide: () => void
  }) {
    const { addNode } = useAppStore(useShallow(selectAddNodeAction))
    const { screenToFlowPosition } = useReactFlow<CollaborativeNode, Edge>()
    if (!visible) {
      return null
    }
    const addCheckbox = (screenPosition: XYPosition) => {
      addNode({
        type: 'checkbox',
        position: screenToFlowPosition(screenPosition),
        data: {
          label: 'New Checkbox',
          checked: false,
        },
      })
    }
    const addText = (screenPosition: XYPosition) => {
      addNode({
        type: 'text',
        position: screenToFlowPosition(screenPosition),
        data: {
          label: 'Text Input',
          text: '',
          placeholder: 'Enter text...',
        },
      })
    }
    return (
      <div
        className="fixed z-50 flex gap-2"
        style={{
          left: menuX,
          top: menuY,
        }}
        onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
      >
        <button
          className={
            'bg-green-50 hover:bg-green-100 border-green-200 text-green-700 shadow-lg\n        cursor-pointer p-2 rounded-md flex items-center gap-2'
          }
          onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
          onPointerUp={() => {
            addCheckbox({
              x: menuX,
              y: menuY,
            })
            onHide()
          }}
        >
          <SquareIcon className="h-4 w-4" />
          {'Add Checkbox'}
        </button>
        <button
          className={
            'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700 shadow-lg\n        cursor-pointer p-2 rounded-md flex items-center gap-2'
          }
          onPointerUp={() => {
            addText({
              x: menuX,
              y: menuY,
            })
            onHide()
          }}
          onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
        >
          <TypeIcon className="h-4 w-4" />
          {'Add Text'}
        </button>
      </div>
    )
  }
  /**
   * 以参数元组泛型包装任意回调，保持输入参数类型与原始回调完全一致。
   * 超过 delay 时立即执行，间隔内取消旧定时器并只保留最后一组参数。
   * 返回的第二个回调立即提交最终状态，用于指针抬起时清除远端 dragging。
   * 组件卸载时取消待执行定时器，避免离开画布后继续发布位置。
   */
  function useThrottle<Args extends unknown[]>(
    callback: (...args: Args) => void,
    { delay }: { delay: number },
  ): [(...args: Args) => void, (...args: Args) => void] {
    const lastCallTimeRef = React.useRef(0)
    const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const pendingArgsRef = React.useRef<Args | null>(null)
    const throttledCallback = React.useCallback(
      (...args: Args) => {
        const currentTime = Date.now()
        pendingArgsRef.current = args
        if (currentTime - lastCallTimeRef.current >= delay) {
          lastCallTimeRef.current = currentTime
          callback(...args)
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
          }
        } else {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
          }
          timeoutRef.current = setTimeout(
            () => {
              if (pendingArgsRef.current) {
                lastCallTimeRef.current = Date.now()
                callback(...pendingArgsRef.current)
                timeoutRef.current = null
              }
            },
            delay - (currentTime - lastCallTimeRef.current),
          )
        }
      },
      [callback, delay],
    )
    const immediateCallback = React.useCallback(
      (...args: Args) => {
        pendingArgsRef.current = null
        lastCallTimeRef.current = Date.now()
        callback(...args)
      },
      [callback],
    )
    React.useEffect(
      () => () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
      },
      [],
    )
    return [throttledCallback, immediateCallback]
  }
  /* 每次挂载创建一个插值器，接收离散坐标并输出平滑中间位置，卸载时释放其计时器。 */
  function useSpline(onPoint: (point: number[]) => void, initialPoint?: number[]) {
    const [spline] = React.useState(() => new SplineInterpolator(onPoint))
    React.useLayoutEffect(() => {
      if (initialPoint) {
        spline.addPoint(initialPoint)
      }
      return () => spline.dispose()
    }, [spline])
    return React.useCallback((point: number[]) => spline.addPoint(point), [spline])
  }
  /* 远端光标通过样条插值直接更新 SVG transform，避免每一帧触发 React 状态更新；拖动节点时隐藏指针。 */
  function RemoteCursor({
    point,
    color,
    dragging,
  }: {
    point: XYPosition
    color: string
    dragging: boolean
  }) {
    const cursorRef = React.useRef<SVGSVGElement | null>(null)
    const addSplinePoint = useSpline(
      React.useCallback((interpolatedPoint: number[]) => {
        const cursorElement = cursorRef.current
        if (cursorElement) {
          cursorElement.style.setProperty(
            'transform',
            `translate(${interpolatedPoint[0]}px, ${interpolatedPoint[1]}px)`,
          )
        }
      }, []),
    )
    React.useLayoutEffect(() => addSplinePoint([point.x, point.y]), [addSplinePoint, point])
    if (dragging) {
      return null
    } else {
      return (
        <MousePointerIcon
          className="absolute collaboration-remote-cursor"
          aria-label="远端用户光标"
          style={{
            color,
          }}
          size={15}
          ref={cursorRef}
        />
      )
    }
  }
  const selectCursorState = (appState: AppState) => ({
    cursors: appState.cursors,
    updateCursor: appState.updateCursor,
  })
  /* 把 DOM 指针坐标换算为画布坐标，以 64 毫秒节流写入共享光标；pointerup 立即发布非拖动状态。 */
  function RemoteCursors() {
    const flowDomNode = useStore(useShallow((flowState) => flowState.domNode))
    const { screenToFlowPosition } = useReactFlow<CollaborativeNode, Edge>()
    const { cursors, updateCursor } = useAppStore(useShallow(selectCursorState))
    const [updateCursorThrottled, updateCursorImmediately] = useThrottle(updateCursor, {
      delay: 64,
    })
    React.useEffect(() => {
      if (!flowDomNode) {
        return
      }
      function handlePointerMove(pointerEvent: PointerEvent) {
        updateCursorThrottled({
          position: screenToFlowPosition({
            x: pointerEvent.clientX,
            y: pointerEvent.clientY,
          }),
          dragging: pointerEvent.pressure > 0,
        })
      }
      function handlePointerUp(pointerEvent: PointerEvent) {
        updateCursorImmediately({
          position: screenToFlowPosition({
            x: pointerEvent.clientX,
            y: pointerEvent.clientY,
          }),
          dragging: false,
        })
      }
      flowDomNode.addEventListener('pointermove', handlePointerMove)
      flowDomNode.addEventListener('pointerup', handlePointerUp)
      return () => {
        flowDomNode.removeEventListener('pointermove', handlePointerMove)
        flowDomNode.removeEventListener('pointerup', handlePointerUp)
      }
    }, [flowDomNode, screenToFlowPosition, updateCursorThrottled, updateCursorImmediately])
    return (
      <ViewportPortal>
        {cursors.map((cursor) => (
          <RemoteCursor
            key={cursor.user}
            point={cursor.position}
            color={cursor.color}
            dragging={cursor.dragging}
          />
        ))}
      </ViewportPortal>
    )
  }
  function oppositePosition(position: Position): Position {
    switch (position) {
      case Position.Top:
        return Position.Bottom
      case Position.Bottom:
        return Position.Top
      case Position.Left:
        return Position.Right
      case Position.Right:
        return Position.Left
      default:
        return position
    }
  }
  /* 目标吸附到 Handle 时使用节点绝对坐标加 Handle 中心坐标；未吸附时使用远端指针坐标及与源相反的方向。 */
  function resolveRemoteTarget(
    getInternalNode: ReactFlowInstance<CollaborativeNode>['getInternalNode'],
    sourcePosition: Position,
    targetNodeId: string | undefined,
    targetHandleType: HandleType | undefined,
    targetHandleId: string | undefined,
    pointerPosition: XYPosition,
  ) {
    const targetNode = getInternalNode(targetNodeId || '')
    if (!targetNode || !targetHandleType) {
      return {
        targetX: pointerPosition?.x ?? 0,
        targetY: pointerPosition?.y ?? 0,
        targetPosition: oppositePosition(sourcePosition),
      }
    }
    const targetHandle = targetNode.internals.handleBounds?.[targetHandleType]?.find(
      (handle) => handle.id === (targetHandleId ?? null),
    )
    if (targetHandle) {
      return {
        targetX:
          targetHandle.width * 0.5 + targetHandle.x + targetNode.internals.positionAbsolute.x,
        targetY:
          targetHandle.height * 0.5 + targetHandle.y + targetNode.internals.positionAbsolute.y,
        targetPosition: targetHandle.position,
      }
    } else {
      return {
        targetX: pointerPosition?.x ?? 0,
        targetY: pointerPosition?.y ?? 0,
        targetPosition: oppositePosition(sourcePosition),
      }
    }
  }
  /* 从共享连线状态还原源 Handle 和目标坐标，在视口图层中绘制其他用户尚未提交的连线。 */
  function RemoteConnection({ connection }: { connection: RemoteConnectionState }) {
    const { getInternalNode } = useReactFlow<CollaborativeNode, Edge>()
    const {
      source: sourceNodeId,
      target: targetNodeId,
      sourceType: sourceHandleType,
      sourceHandle: sourceHandleId,
      targetHandle: targetHandleId,
      targetType: targetHandleType,
      position: pointerPosition,
    } = connection
    const sourceNode = getInternalNode(sourceNodeId)
    if (!sourceNode) {
      return null
    }
    const sourceHandle = sourceNode.internals.handleBounds?.[sourceHandleType]?.find(
      (handle) => handle.id === (sourceHandleId ?? null),
    )
    if (!sourceHandle) {
      return null
    }
    const targetPathProps = resolveRemoteTarget(
      getInternalNode,
      Position.Bottom,
      targetNodeId,
      targetHandleType,
      targetHandleId,
      pointerPosition,
    )
    return (
      <svg className="overflow-visible" aria-label="远端用户连线">
        <AnimatedConnectionPath
          pathProps={{
            sourceX:
              sourceHandle.width * 0.5 + sourceHandle.x + sourceNode.internals.positionAbsolute.x,
            sourceY:
              sourceHandle.height * 0.5 + sourceHandle.y + sourceNode.internals.positionAbsolute.y,
            sourcePosition: sourceHandle.position,
            ...targetPathProps,
          }}
          color={connection.color}
        />
      </svg>
    )
  }
  /* 对远端目标点插值，再重新计算贝塞尔路径，使网络离散更新显示为连续的连线移动。 */
  function AnimatedConnectionPath({
    pathProps,
    color,
  }: {
    pathProps: GetBezierPathParams
    color: string
  }) {
    const [animatedTarget, setAnimatedTarget] = React.useState({
      x: pathProps.targetX,
      y: pathProps.targetY,
    })
    const addSplinePoint = useSpline(
      React.useCallback((interpolatedPoint: number[]) => {
        setAnimatedTarget({
          x: interpolatedPoint[0]!,
          y: interpolatedPoint[1]!,
        })
      }, []),
    )
    React.useLayoutEffect(() => {
      addSplinePoint([pathProps.targetX, pathProps.targetY])
    }, [addSplinePoint, pathProps.targetX, pathProps.targetY])
    const [path] = getBezierPath({
      ...pathProps,
      targetX: animatedTarget.x,
      targetY: animatedTarget.y,
    })
    return (
      <BaseEdge
        path={path}
        style={{
          stroke: color,
        }}
        className="opacity-80"
      />
    )
  }
  const selectConnectionState = (appState: AppState) => ({
    connections: appState.connections,
    updateConnection: appState.updateConnection,
  })
  /**
   * 读取本机 React Flow 的连接状态，把内部节点/Handle 引用转成可同步的 ID。
   * 连接中每 64ms 至多发布一次草稿，结束后清空本机 Awareness 中的连接字段。
   * 其它用户的草稿在 ViewportPortal 内还原几何，目标点经样条插值平滑显示。
   */
  function RemoteConnections() {
    const localConnection = useConnection()
    const { connections, updateConnection } = useAppStore(useShallow(selectConnectionState))
    const [updateConnectionThrottled] = useThrottle(updateConnection, {
      delay: 64,
    })
    React.useEffect(() => {
      updateConnectionThrottled(
        localConnection.inProgress
          ? {
              source: localConnection.fromNode.id,
              sourceType: localConnection.fromHandle.type,
              sourceHandle: localConnection.fromHandle.id || undefined,
              target: localConnection.toNode?.id || undefined,
              targetType: localConnection.toHandle?.type || undefined,
              targetHandle: localConnection.toHandle?.id || undefined,
              position: localConnection.to,
            }
          : undefined,
      )
    }, [localConnection])
    return (
      <ViewportPortal>
        {connections.map((connection) => (
          <RemoteConnection key={connection.user} connection={connection} />
        ))}
      </ViewportPortal>
    )
  }
  const NODE_TYPES = {
    checkbox: CheckboxNode,
    text: TextNode,
  }
  const selectFlowState = (appState: AppState) => ({
    activeFlowId: appState.activeFlowId,
    nodes: appState.nodes,
    edges: appState.edges,
    exitFlow: appState.exitFlow,
    connectionStatus: appState.connectionStatus,
    onlineUsers: appState.onlineUsers,
    onNodesChange: appState.onNodesChange,
    onEdgesChange: appState.onEdgesChange,
    onConnect: appState.onConnect,
  })
  /* 每个房间首次完成节点测量后仅 fitView 一次，避免远端同步或局部编辑持续重置视口。 */
  function FitViewOnFlowLoad() {
    const { fitView } = useReactFlow<CollaborativeNode, Edge>()
    const nodesInitialized = useNodesInitialized()
    const fittedFlowIdRef = React.useRef<string | null>(null)
    const activeFlowId = useAppStore((appState: AppState) => appState.activeFlowId)
    const nodes = useAppStore((appState: AppState) => appState.nodes)
    React.useEffect(() => {
      if (
        activeFlowId &&
        nodesInitialized &&
        nodes.length > 0 &&
        fittedFlowIdRef.current !== activeFlowId
      ) {
        fittedFlowIdRef.current = activeFlowId
        fitView({
          padding: 0.1,
        })
      }
    }, [activeFlowId, nodesInitialized, nodes.length, fitView])
    return null
  }
  function CollaborativeFlow() {
    const {
      nodes,
      edges,
      activeFlowId,
      exitFlow,
      connectionStatus,
      onlineUsers,
      onNodesChange,
      onEdgesChange,
      onConnect,
    } = useAppStore(useShallow(selectFlowState))
    const [nodeMenu, setNodeMenu] = React.useState({
      x: 0,
      y: 0,
      visible: false,
    })
    const hideNodeMenu = () => {
      setNodeMenu({
        x: 0,
        y: 0,
        visible: false,
      })
    }
    const [shareButtonText, setShareButtonText] = React.useState('Share')
    const [shareUrl, setShareUrl] = React.useState('')
    React.useEffect(() => {
      if (activeFlowId) {
        const currentUrl = new URL(window.location.href)
        currentUrl.searchParams.set('flow', activeFlowId)
        setShareUrl(currentUrl.toString())
      }
    }, [activeFlowId])
    return (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onPointerDown={(pointerEvent) => {
          if (pointerEvent.button !== 2) {
            hideNodeMenu()
          }
        }}
        onPaneContextMenu={(mouseEvent) => {
          mouseEvent.preventDefault()
          setNodeMenu({
            x: mouseEvent.clientX - 150,
            y: mouseEvent.clientY - 50,
            visible: true,
          })
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        minZoom={0}
        colorMode="system"
      >
        <FitViewOnFlowLoad />
        <MiniMap />
        <Controls />
        <Background />
        <Panel className="flex h-10 w-full items-center gap-2" position="top-left">
          <button
            className={
              'flex cursor-pointer items-center gap-2 rounded-md border-red-200 bg-red-50 p-2 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-900 dark:text-red-100 dark:hover:bg-red-800'
            }
            onClick={exitFlow}
          >
            <CloseIcon className="h-4 w-4" />
            {'Exit'}
          </button>
          <button
            className={
              'flex cursor-pointer items-center gap-2 rounded-md border-blue-200 bg-blue-50 p-2 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900 dark:text-blue-100 dark:hover:bg-blue-800 dark:hover:text-blue-100'
            }
            onClick={async () => {
              try {
                await copyText(shareUrl.toString())
                setShareButtonText('Copied to clipboard!')
              } catch (copyError) {
                console.error('Failed to copy to clipboard:', copyError)
                setShareButtonText('Failed to copy to clipboard!')
              }
            }}
          >
            <ShareIcon className="h-4 w-4" />
            {shareButtonText}
          </button>
          <span
            className="collaboration-status"
            data-status={connectionStatus}
            role="status"
            aria-label="协作连接状态"
          >
            {connectionStatus === 'connected'
              ? `已连接 · ${onlineUsers} 人在线`
              : '连接已断开，正在重连…'}
          </span>
        </Panel>
        <AddNodeMenu
          visible={nodeMenu.visible}
          x={nodeMenu.x}
          y={nodeMenu.y}
          onHide={hideNodeMenu}
        />
        <RemoteCursors />
        <RemoteConnections />
      </ReactFlow>
    )
  }
  const selectLobbyState = (appState: AppState) => ({
    createFlow: appState.createFlow,
    joinFlow: appState.joinFlow,
    isLoading: appState.isLoading,
    error: appState.error,
  })
  /* 首次加载从 URL 提取 flow 自动加入；手动输入支持房间 ID 或含 flow 参数的分享链接。 */
  function FlowLobby({ title }: { title: string }) {
    const { createFlow, joinFlow, isLoading, error } = useAppStore(useShallow(selectLobbyState))
    const [flowInput, setFlowInput] = React.useState('')
    const [initialJoinAttempted, setInitialJoinAttempted] = React.useState(false)
    React.useEffect(() => {
      const flowIdFromUrl = new URLSearchParams(window.location.search).get('flow')
      if (flowIdFromUrl) {
        joinFlow(flowIdFromUrl)
      }
      setInitialJoinAttempted(true)
    }, [joinFlow])
    const submitJoinFlow = React.useCallback(
      async function () {
        if (flowInput && (await joinFlow(flowInput))) {
          setFlowInput('')
        }
      },
      [flowInput, joinFlow],
    )
    if (isLoading || !initialJoinAttempted) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="flex items-center gap-2 text-muted-foreground">
            <LoaderCircleIcon className="h-4 w-4 animate-spin" />
            <span>{'Connecting...'}</span>
          </div>
        </div>
      )
    } else {
      return (
        <React.Fragment>
          <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="flex flex-col items-center space-y-6 w-full max-w-md px-6">
              <h1 className="text-2xl font-bold text-muted-foreground">
                {'Multiplayer Flow with '}
                {title}
              </h1>
              <button
                className={
                  'w-full bg-primary text-primary-foreground cursor-pointer p-2 rounded-md'
                }
                onClick={createFlow}
                disabled={isLoading}
              >
                {'Create new flow'}
              </button>
              <React.Fragment>
                <div className="text-muted-foreground text-sm font-medium">{'or'}</div>
                <div className="w-full space-y-2 flex gap-2">
                  <input
                    placeholder={isLoading ? 'Loading...' : 'Type in ID or URL'}
                    className={
                      'form-input flex-1 h-10 rounded-md border-input bg-background px-3 py-2 text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:ring-ring'
                    }
                    value={flowInput}
                    onChange={(changeEvent) => {
                      setFlowInput(changeEvent.target.value.trim())
                    }}
                    onKeyDown={(keyboardEvent) => {
                      if (keyboardEvent.key === 'Enter' && !isLoading) {
                        submitJoinFlow()
                      }
                    }}
                    aria-invalid={!!error}
                    disabled={isLoading}
                  />
                  <button
                    className={
                      'bg-primary text-primary-foreground cursor-pointer px-4 py-2 rounded-md h-10 whitespace-nowrap'
                    }
                    onClick={submitJoinFlow}
                    disabled={isLoading || !flowInput}
                  >
                    {'Join flow'}
                  </button>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </React.Fragment>
            </div>
          </div>
        </React.Fragment>
      )
    }
  }
  const selectActiveFlowId = (appState: AppState) => appState.activeFlowId
  function CollaborativeApp({ store, title }: { store: StoreApi<AppState>; title: string }) {
    const activeFlowId = useZustandStore(store, selectActiveFlowId)
    return (
      <AppStoreContext.Provider value={store}>
        {activeFlowId ? (
          <ReactFlowProvider>
            <CollaborativeFlow />
          </ReactFlowProvider>
        ) : (
          <FlowLobby title={title} />
        )}
      </AppStoreContext.Provider>
    )
  }
  const selectYjsBindings = (appState: AppState) => ({
    yjsDoc: appState.yDoc,
    setYjsNodes: appState.setYjsNodes,
    setYjsEdges: appState.setYjsEdges,
    setYjsCursors: appState.setYjsCursors,
    setYjsConnections: appState.setYjsConnections,
    awareness: appState.awareness,
  })
  /**
   * 监听共享节点/边 Map 及 Awareness 在线状态，每种数据只刷新对应 store 切片。
   * 文档同步后立即投影现有图和在线用户，断线时 Awareness 会移除远端临时状态。
   * 文档切换或卸载时解绑旧观察器，防止不同房间之间混入更新。
   * 全程只同步普通数据，React Flow 的内部节点、DOM 和本地选择状态不进入共享文档。
   */
  function YjsBindings({ children }: { children: React.ReactNode }) {
    const { yjsDoc, awareness, setYjsNodes, setYjsEdges, setYjsCursors, setYjsConnections } =
      useZustandStore(appStore, useShallow(selectYjsBindings))
    React.useEffect(() => {
      if (!yjsDoc || !awareness) return
      const nodesMap = yjsDoc.getMap<CollaborativeNode>('nodes')
      const edgesMap = yjsDoc.getMap<Edge>('edges')
      const updatePresence = () => {
        setYjsCursors()
        setYjsConnections()
      }
      nodesMap.observe(setYjsNodes)
      edgesMap.observe(setYjsEdges)
      awareness.on('change', updatePresence)
      setYjsNodes()
      setYjsEdges()
      updatePresence()
      return () => {
        nodesMap.unobserve(setYjsNodes)
        edgesMap.unobserve(setYjsEdges)
        awareness.off('change', updatePresence)
      }
    }, [yjsDoc, awareness, setYjsNodes, setYjsEdges, setYjsCursors, setYjsConnections])
    return <React.Fragment>{children}</React.Fragment>
  }
  const initialElement = (
    <React.StrictMode>
      <YjsBindings>
        <CollaborativeApp store={appStore} title="yjs" />
      </YjsBindings>
    </React.StrictMode>
  )
  let mountedRoots = 0
  return function ExampleRoot() {
    React.useEffect(() => {
      mountedRoots += 1
      return () => {
        mountedRoots -= 1
        queueMicrotask(() => {
          if (mountedRoots === 0) {
            appStore.getState().exitFlow()
          }
        })
      }
    }, [])
    return initialElement
  }
}
function CollaborativeCanvas() {
  // 惰性保存组件类型，使普通重渲染沿用同一份图状态；工作台重置时重新挂载。
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { CollaborativeCanvas as default }
