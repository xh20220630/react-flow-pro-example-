import * as React from 'react'
import { createDemoId } from '../runtime/create-id.js'
import { copyText } from '../runtime/copy-text.js'
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
import { LocalProvider } from '../collaboration/local-provider'
function createExampleScope() {
  const INITIAL_NODE_TEMPLATES = [
    {
      type: 'text',
      position: {
        x: 0,
        y: 100,
      },
      data: {
        label: 'Text Input',
        value: '',
        placeholder: 'Enter text...',
      },
    },
    {
      type: 'checkbox',
      position: {
        x: 101,
        y: 0,
      },
      data: {
        label: 'New Checkbox',
        checked: false,
      },
    },
  ]
  /* 将每个用户的连线预览写入共享 connections Map；投影时排除本机用户和超过 5 秒的记录，结束连线后删除本机记录。 */
  const createConnectionsSlice = (setState, getState) => ({
    connections: [],
    setYjsConnections: () => {
      const { yDoc, userId: localUserId, getUserColor } = getState()
      const connectionsMap = yDoc?.getMap('connections')
      setState({
        connections: Array.from(connectionsMap?.entries() || [])
          .filter(
            ([remoteUserId, connection]) =>
              remoteUserId !== localUserId && Date.now() - connection.timestamp < 5e3,
          )
          .map(([remoteUserId, connection]) => ({
            user: remoteUserId,
            source: connection.source,
            sourceType: connection.sourceType,
            sourceHandle: connection.sourceHandle,
            target: connection.target,
            targetType: connection.targetType,
            targetHandle: connection.targetHandle,
            position: connection.position,
            color: getUserColor(remoteUserId),
          })),
      })
    },
    updateConnection: (connection) => {
      const { yDoc, userId: localUserId } = getState()
      if (!yDoc || !localUserId) {
        return
      }
      const connectionsMap = yDoc.getMap('connections')
      if (connection) {
        connectionsMap.set(localUserId, {
          source: connection.source,
          sourceType: connection.sourceType,
          sourceHandle: connection.sourceHandle,
          target: connection.target,
          targetType: connection.targetType,
          targetHandle: connection.targetHandle,
          position: connection.position,
          timestamp: Date.now(),
        })
      } else {
        connectionsMap.delete(localUserId)
      }
    },
  })
  /* 光标按用户 ID 写入共享 cursors Map，附带时间戳；本地仅展示其他用户最近 10 秒内更新的位置。 */
  const createCursorsSlice = (setState, getState) => ({
    cursors: [],
    setYjsCursors: () => {
      const { yDoc, userId: localUserId, getUserColor } = getState()
      const cursorsMap = yDoc?.getMap('cursors')
      setState({
        cursors: Array.from(cursorsMap?.entries() || [])
          .filter(
            ([remoteUserId, cursor]) =>
              remoteUserId !== localUserId && new Date().getTime() - cursor.timestamp < 1e4,
          )
          .map(([remoteUserId, cursor]) => ({
            user: remoteUserId,
            ...cursor,
            color: getUserColor(remoteUserId),
          })),
      })
    },
    updateCursor: (cursor) => {
      const { yDoc, userId: localUserId } = getState()
      if (!(!yDoc || !localUserId)) {
        yDoc.getMap('cursors').set(localUserId, {
          ...cursor,
          timestamp: Date.now(),
        })
      }
    },
  })
  /* 缓存远端对象与本地投影的对应关系：远端未变化时复用本地引用，远端变化时合并保留本地字段，并清理已删除记录。 */
  const RemoteProjectionCache = class {
    entriesById
    getId
    deriveLocal
    isRemoteEqual
    constructor(options) {
      this.getId = options.getId
      this.deriveLocal = options.deriveLocal
      this.isRemoteEqual =
        options.isRemoteEqual ?? ((previousRemote, nextRemote) => previousRemote === nextRemote)
      this.entriesById = new Map()
    }
    /* 先标记旧缓存，再遍历远端数据恢复存活项；已改变的远端对象覆盖共享字段，保留仅存在于本地的测量和选中状态。 */
    merge(remoteValues) {
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
      staleEntries.forEach((staleEntry, entryId) => {
        this.entriesById.delete(entryId)
      })
      return localValues
    }
    get(entryId) {
      return this.entriesById.get(entryId)
    }
    delete(entryId) {
      return this.entriesById.delete(entryId)
    }
    set(entryId, remoteValue, localValue) {
      const cacheEntry = {
        remote: remoteValue,
        local: localValue,
      }
      this.entriesById.set(entryId, cacheEntry)
      return cacheEntry
    }
  }
  /* 用 Yjs Map 存共享节点和边，用投影缓存存 React Flow 的本地测量、选中状态，避免把本机 UI 状态广播给其他用户。 */
  const createGraphSlice = (setState, getState) => {
    const nodeCache = new RemoteProjectionCache({
      getId: (node) => node.id,
      deriveLocal: (node) => node,
    })
    const edgeCache = new RemoteProjectionCache({
      getId: (edge) => edge.id,
      deriveLocal: (edge) => edge,
    })
    function getNodesMap() {
      return getState().yDoc?.getMap('nodes')
    }
    function getEdgesMap() {
      return getState().yDoc?.getMap('edges')
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
  const appStore = createStore((setState, getState, storeApi) => {
    const userColors = new Map()
    let nextColorIndex = Math.floor(Math.random() * USER_COLORS.length)
    let provider
    /* 退出房间时销毁文档和 Provider，清除 URL 中的 flow，并重置活动房间。 */
    function disconnectFlow() {
      getState().yDoc?.destroy()
      if (provider) {
        provider.destroy()
        provider = undefined
      }
      const currentUrl = new URL(window.location.href)
      currentUrl.searchParams.delete('flow')
      window.history.replaceState({}, '', currentUrl)
      setState({
        yDoc: undefined,
        activeFlowId: undefined,
      })
    }
    /* 先退出旧房间，再新建 Y.Doc 与 Provider，等待首次 sync 后发布状态；仅未初始化房间写入初始节点。 */
    async function connectFlow(flowId) {
      disconnectFlow()
      const yDoc = new YDoc()
      provider = new LocalProvider(flowId, yDoc)
      await new Promise((resolveSync, rejectSync) => {
        provider.once('sync', () => {
          resolveSync(true)
        })
        provider.once('connection-error', (connectionError) => {
          rejectSync(connectionError)
        })
      })
      const initialized = yDoc.getMap('meta').get('initialized')
      const currentUrl = new URL(window.location.href)
      currentUrl.searchParams.set('flow', flowId)
      window.history.replaceState({}, '', currentUrl)
      setState({
        yDoc,
        activeFlowId: flowId,
      })
      if (!initialized) {
        for (const nodeTemplate of INITIAL_NODE_TEMPLATES) getState().addNode(nodeTemplate)
        yDoc.getMap('meta').set('initialized', true)
      }
    }
    return {
      activeFlowId: undefined,
      userId: undefined,
      isLoading: false,
      error: null,
      setActiveFlowId: (flowId) => {
        connectFlow(flowId)
      },
      setUserId: (userId) =>
        setState({
          userId,
        }),
      getUserColor: (userId) => {
        if (!userColors.has(userId)) {
          userColors.set(userId, USER_COLORS[nextColorIndex++ % USER_COLORS.length])
        }
        return userColors.get(userId)
      },
      joinFlow: async (flowId) => {
        setState({
          isLoading: true,
        })
        try {
          await connectFlow(flowId)
        } catch {
          setState({
            error: 'Error joining flow',
          })
        } finally {
          setState({
            isLoading: false,
          })
        }
      },
      createFlow: async () => {
        const flowId = createDemoId()
        try {
          await connectFlow(flowId)
        } catch {
          setState({
            error: 'Error creating flow',
          })
        } finally {
          setState({
            isLoading: false,
          })
        }
      },
      exitFlow: () => {
        disconnectFlow()
      },
      ...createGraphSlice(setState, getState, storeApi),
      ...createConnectionsSlice(setState, getState, storeApi),
      ...createCursorsSlice(setState, getState, storeApi),
    }
  })
  const AppStoreContext = React.createContext(null)
  function useAppStore(selector) {
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
  const selectCheckboxActions = (appState) => ({
    updateNodeData: appState.updateNodeData,
  })
  /* 复选框先用 React 乐观状态即时响应，再更新共享节点 data，远端同步后由新 props 接管。 */
  function CheckboxNode({ id: nodeId, data }) {
    const { updateNodeData } = useAppStore(useShallow(selectCheckboxActions))
    const [optimisticChecked, setOptimisticChecked] = React.useOptimistic(
      data.checked,
      (previousChecked, nextChecked) => nextChecked,
    )
    const updateChecked = React.useCallback(
      (checked) => {
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
  const selectTextActions = (appState) => ({
    updateNodeData: appState.updateNodeData,
  })
  /* 文字输入以乐观状态即时显示，同时将 text 写回共享节点 data；保留原实现按节点字段同步的方式。 */
  function TextNode({ id: nodeId, data }) {
    const { updateNodeData } = useAppStore(useShallow(selectTextActions))
    const [optimisticText, setOptimisticText] = React.useOptimistic(
      data.text || '',
      (previousText, nextText) => nextText,
    )
    const updateText = React.useCallback(
      (text) => {
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
  const selectAddNodeAction = (appState) => ({
    addNode: appState.addNode,
  })
  function AddNodeMenu({ visible, x: menuX, y: menuY, onHide }) {
    const { addNode } = useAppStore(useShallow(selectAddNodeAction))
    const { screenToFlowPosition } = useReactFlow()
    if (!visible) {
      return null
    }
    const addCheckbox = (screenPosition) => {
      addNode({
        type: 'checkbox',
        position: screenToFlowPosition(screenPosition),
        data: {
          label: 'New Checkbox',
          checked: false,
        },
      })
    }
    const addText = (screenPosition) => {
      addNode({
        type: 'text',
        position: screenToFlowPosition(screenPosition),
        data: {
          label: 'Text Input',
          value: '',
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
  /* 首个调用立即执行，间隔内只保留最后一组参数并延后补发；另提供立即执行入口用于抬起指针时提交最终状态。 */
  function useThrottle(callback, { delay }) {
    const lastCallTimeRef = React.useRef(0)
    const timeoutRef = React.useRef(null)
    const pendingArgsRef = React.useRef(null)
    const throttledCallback = React.useCallback(
      (...args) => {
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
      (...args) => {
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
  function useSpline(onPoint, initialPoint) {
    const [spline] = React.useState(() => new SplineInterpolator(onPoint))
    React.useLayoutEffect(() => {
      if (initialPoint) {
        spline.addPoint(initialPoint)
      }
      return () => spline.dispose()
    }, [spline])
    return React.useCallback((point) => spline.addPoint(point), [spline])
  }
  /* 远端光标通过样条插值直接更新 SVG transform，避免每一帧触发 React 状态更新；拖动节点时隐藏指针。 */
  function RemoteCursor({ point, color, dragging }) {
    const cursorRef = React.useRef(null)
    const addSplinePoint = useSpline(
      React.useCallback((interpolatedPoint) => {
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
          className="absolute"
          style={{
            color,
          }}
          size={15}
          ref={cursorRef}
        />
      )
    }
  }
  const selectCursorState = (appState) => ({
    cursors: appState.cursors,
    updateCursor: appState.updateCursor,
  })
  /* 把 DOM 指针坐标换算为画布坐标，以 64 毫秒节流写入共享光标；pointerup 立即发布非拖动状态。 */
  function RemoteCursors() {
    const flowDomNode = useStore(useShallow((flowState) => flowState.domNode))
    const { screenToFlowPosition } = useReactFlow()
    const { cursors, updateCursor } = useAppStore(useShallow(selectCursorState))
    const [updateCursorThrottled, updateCursorImmediately] = useThrottle(updateCursor, {
      delay: 64,
    })
    React.useEffect(() => {
      if (!flowDomNode) {
        return
      }
      function handlePointerMove(pointerEvent) {
        updateCursorThrottled({
          position: screenToFlowPosition({
            x: pointerEvent.clientX,
            y: pointerEvent.clientY,
          }),
          dragging: pointerEvent.pressure > 0,
        })
      }
      function handlePointerUp(pointerEvent) {
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
  function oppositePosition(position) {
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
    getInternalNode,
    sourcePosition,
    targetNodeId,
    targetHandleType,
    targetHandleId,
    pointerPosition,
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
  function RemoteConnection({ connection }) {
    const { getInternalNode } = useReactFlow()
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
      <svg className="overflow-visible">
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
  function AnimatedConnectionPath({ pathProps, color }) {
    const [animatedTarget, setAnimatedTarget] = React.useState({
      x: pathProps.targetX,
      y: pathProps.targetY,
    })
    const addSplinePoint = useSpline(
      React.useCallback((interpolatedPoint) => {
        setAnimatedTarget({
          x: interpolatedPoint[0],
          y: interpolatedPoint[1],
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
  const selectConnectionState = (appState) => ({
    connections: appState.connections,
    updateConnection: appState.updateConnection,
  })
  /* 读取本机 React Flow 正在进行的连线，以 64 毫秒节流广播；结束后写入空状态来移除远端预览。 */
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
  const selectFlowState = (appState) => ({
    activeFlowId: appState.activeFlowId,
    nodes: appState.nodes,
    edges: appState.edges,
    exitFlow: appState.exitFlow,
    joinFlow: appState.joinFlow,
    onNodesChange: appState.onNodesChange,
    onEdgesChange: appState.onEdgesChange,
    onConnect: appState.onConnect,
  })
  /* 每个房间首次完成节点测量后仅 fitView 一次，避免远端同步或局部编辑持续重置视口。 */
  function FitViewOnFlowLoad() {
    const { fitView } = useReactFlow()
    const nodesInitialized = useNodesInitialized()
    const fittedFlowIdRef = React.useRef(null)
    const activeFlowId = useAppStore((appState) => appState.activeFlowId)
    const nodes = useAppStore((appState) => appState.nodes)
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
      joinFlow,
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
          {joinFlow && (
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
          )}
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
  const selectLobbyState = (appState) => ({
    createFlow: appState.createFlow,
    joinFlow: appState.joinFlow,
    isLoading: appState.isLoading,
    error: appState.error,
  })
  /* 首次加载从 URL 提取 flow 自动加入；手动输入支持房间 ID 或含 flow 参数的分享链接。 */
  function FlowLobby({ title }) {
    const { createFlow, joinFlow, isLoading, error } = useAppStore(useShallow(selectLobbyState))
    const [flowInput, setFlowInput] = React.useState('')
    const [initialJoinAttempted, setInitialJoinAttempted] = React.useState(false)
    React.useEffect(() => {
      if (!joinFlow) {
        return
      }
      const flowIdFromUrl = new URLSearchParams(window.location.search).get('flow')
      if (flowIdFromUrl) {
        joinFlow(flowIdFromUrl)
      }
      setInitialJoinAttempted(true)
    }, [joinFlow])
    const submitJoinFlow = React.useCallback(
      async function () {
        let flowId = flowInput
        if (flowInput.startsWith('http')) {
          flowId = new URL(flowInput).searchParams.get('flow') || ''
        }
        if (flowId && (await joinFlow?.(flowId))) {
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
              {joinFlow && (
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
              )}
            </div>
          </div>
        </React.Fragment>
      )
    }
  }
  const selectActiveFlowId = (appState) => appState.activeFlowId
  function CollaborativeApp({ store, title }) {
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
  function createUserId() {
    return createDemoId()
  }
  const selectYjsBindings = (appState) => ({
    yjsDoc: appState.yDoc,
    setYjsNodes: appState.setYjsNodes,
    setYjsEdges: appState.setYjsEdges,
    setYjsCursors: appState.setYjsCursors,
    setYjsConnections: appState.setYjsConnections,
    setUserId: appState.setUserId,
  })
  /* 订阅 nodes、edges、cursors、connections 四个 Yjs Map，变更后刷新相应本地切片；文档切换或卸载时对称解绑。 */
  function YjsBindings({ children }) {
    const { yjsDoc, setYjsNodes, setYjsEdges, setUserId, setYjsCursors, setYjsConnections } =
      useZustandStore(appStore, useShallow(selectYjsBindings))
    const [localUserId] = React.useState(createUserId)
    React.useEffect(() => {
      if (!yjsDoc) {
        setYjsNodes()
        setYjsEdges()
        setYjsCursors()
        setYjsConnections()
        setUserId(null)
        return
      }
      const nodesMap = yjsDoc.getMap('nodes')
      const edgesMap = yjsDoc.getMap('edges')
      const cursorsMap = yjsDoc.getMap('cursors')
      const connectionsMap = yjsDoc.getMap('connections')
      nodesMap.observe(setYjsNodes)
      edgesMap.observe(setYjsEdges)
      cursorsMap.observe(setYjsCursors)
      connectionsMap.observe(setYjsConnections)
      setUserId(localUserId)
      setYjsNodes()
      setYjsEdges()
      return () => {
        nodesMap.unobserve(setYjsNodes)
        edgesMap.unobserve(setYjsEdges)
        cursorsMap.unobserve(setYjsCursors)
        connectionsMap.unobserve(setYjsConnections)
        setUserId(null)
      }
    }, [yjsDoc, setYjsNodes, setYjsEdges, setYjsCursors, setYjsConnections, setUserId])
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
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { CollaborativeCanvas as default }
