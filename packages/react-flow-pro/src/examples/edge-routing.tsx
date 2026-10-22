/**
 * 避障连线：将节点映射为 libavoid 障碍物，使用 WASM 计算正交路线并写回边数据。
 * 每个画布实例通过 createExampleScope 创建独立作用域，避免缓存、store 和可变初始数据跨实例共享。
 */
import * as React from 'react'
import {
  getSmoothStepPath,
  Position,
  useEdgesState,
  useReactFlow,
  useStore,
  useNodesInitialized,
  useNodesState,
  ReactFlow,
  ReactFlowProvider,
  BaseEdge,
  Handle,
  addEdge,
} from '@xyflow/react'
import { AvoidLib as AvoidWasm } from 'libavoid-js'
import type {
  Connection,
  Edge,
  EdgeProps,
  HandleType,
  Node,
  NodeProps,
  XYPosition,
} from '@xyflow/react'

/** 每侧可以配置多个连接点，ID 同时用于 React Flow Handle 和 libavoid 引脚。 */
interface RoutingHandle {
  id: string
  type: HandleType
}
type RoutingNode = Node<{ label: string; handles: Partial<Record<Position, RoutingHandle[]>> }>
type RoutingEdge = Edge<{ points: XYPosition[] }>
interface RoutingGraph {
  nodes: RoutingNode[]
  edges: RoutingEdge[]
}
/** 从库的构造器提取 WASM 对象类型，不把 Emscripten 指针混入普通坐标数据。 */
type AvoidApi = ReturnType<typeof AvoidWasm.getInstance>
type AvoidRouter = InstanceType<AvoidApi['Router']>
type AvoidShape = InstanceType<AvoidApi['ShapeRef']>
type AvoidConnector = InstanceType<AvoidApi['ConnRef']>

/** 创建本示例的组件、算法和局部状态；根组件惰性初始化后在本次挂载中复用。 */
function createExampleScope() {
  const routableEdgeType = 'routable'
  function RoutableEdge({
    sourceX,
    sourceY,
    targetX,
    targetY,
    markerStart,
    markerEnd,
    data,
    style,
  }: EdgeProps<RoutingEdge>) {
    return (
      <BaseEdge
        style={style}
        path={useRoutedEdgePath(data?.points ?? [], sourceX, sourceY, targetX, targetY)}
        {...(markerStart === undefined ? {} : { markerStart })}
        {...(markerEnd === undefined ? {} : { markerEnd })}
      />
    )
  }
  /* 有路由结果时把中间折点连接成 SVG 折线；WASM 尚未就绪时使用无圆角的正交回退路径。 */
  const useRoutedEdgePath = (
    routePoints: XYPosition[],
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number,
  ) =>
    React.useMemo(() => {
      if (routePoints.length === 0) {
        const [fallbackPath] = getSmoothStepPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
          offset: 0,
          borderRadius: 0,
        })
        return fallbackPath
      }
      const sourcePoint = {
        x: sourceX,
        y: sourceY,
      }
      const targetPoint = {
        x: targetX,
        y: targetY,
      }
      const pathPoints = [sourcePoint, ...routePoints, targetPoint]
      let path = ''
      for (const point of pathPoints) {
        const x = point.x.toFixed(2)
        const y = point.y.toFixed(2)
        path += path ? ` L ${x} ${y}` : `M ${x} ${y}`
      }
      return path
    }, [routePoints, sourceX, sourceY, targetX, targetY])
  const routableNodeType = 'example'
  function RoutableNode({ data }: NodeProps<RoutingNode>) {
    const handlesBySide = data?.handles ?? {}
    return (
      <React.Fragment>
        <div>{data.label}</div>
        {Object.entries(handlesBySide).map(([side, handles]) => (
          <RoutableNodeHandles key={side} side={side} handles={handles} />
        ))}
      </React.Fragment>
    )
  }
  function RoutableNodeHandles({ side, handles }: { side: string; handles: RoutingHandle[] }) {
    return (
      <div className="handles" data-side={side}>
        {handles.map((handle) => (
          <Handle key={handle.id} type={handle.type} position={side as Position} id={handle.id} />
        ))}
      </div>
    )
  }
  /* 根据连接点 ID 在节点各侧的配置中查找方向，供 libavoid 创建有方向约束的连接引脚。 */
  const findHandleSide = (nodeData: RoutingNode['data'], handleId: string | null | undefined) => {
    for (const [side, handles] of Object.entries(nodeData.handles))
      if (handles.some((handle) => handle.id === handleId)) {
        return side
      }
    return null
  }
  const initialRoutingNodes: RoutingNode[] = [
    {
      id: '1',
      type: routableNodeType,
      data: {
        label: 'Node 1',
        handles: {
          [Position.Left]: [
            {
              id: '1',
              type: 'target',
            },
            {
              id: '2',
              type: 'target',
            },
          ],
          [Position.Right]: [
            {
              id: '3',
              type: 'source',
            },
            {
              id: '4',
              type: 'source',
            },
            {
              id: '5',
              type: 'source',
            },
          ],
        },
      },
      position: {
        x: 0,
        y: 0,
      },
    },
    {
      id: '2',
      type: routableNodeType,
      data: {
        label: 'Node 2',
        handles: {
          [Position.Left]: [
            {
              id: '1',
              type: 'target',
            },
            {
              id: '2',
              type: 'target',
            },
          ],
          [Position.Right]: [
            {
              id: '3',
              type: 'source',
            },
            {
              id: '4',
              type: 'source',
            },
          ],
        },
      },
      position: {
        x: 150,
        y: -150,
      },
    },
    {
      id: '3',
      type: routableNodeType,
      data: {
        label: 'Node 3',
        handles: {
          [Position.Left]: [
            {
              id: '1',
              type: 'target',
            },
            {
              id: '2',
              type: 'target',
            },
          ],
          [Position.Right]: [
            {
              id: '3',
              type: 'source',
            },
            {
              id: '4',
              type: 'source',
            },
          ],
        },
      },
      position: {
        x: 150,
        y: -75,
      },
    },
    {
      id: '4',
      type: routableNodeType,
      data: {
        label: 'Node 4',
        handles: {
          [Position.Right]: [
            {
              id: '1',
              type: 'source',
            },
            {
              id: '2',
              type: 'source',
            },
          ],
        },
      },
      position: {
        x: 150,
        y: 0,
      },
    },
    {
      id: '5',
      type: routableNodeType,
      data: {
        label: 'Node 5',
        handles: {
          [Position.Left]: [
            {
              id: '1',
              type: 'target',
            },
            {
              id: '2',
              type: 'target',
            },
            {
              id: '3',
              type: 'target',
            },
          ],
          [Position.Right]: [
            {
              id: '4',
              type: 'source',
            },
            {
              id: '5',
              type: 'source',
            },
          ],
        },
      },
      position: {
        x: 300,
        y: 0,
      },
    },
  ]
  const initialRoutingEdges: RoutingEdge[] = [
    {
      id: '1:3->2:1',
      type: routableEdgeType,
      source: '1',
      sourceHandle: '3',
      target: '2',
      targetHandle: '1',
    },
    {
      id: '1:4->3:1',
      type: routableEdgeType,
      source: '1',
      sourceHandle: '4',
      target: '3',
      targetHandle: '1',
    },
    {
      id: '1:5->5:3',
      type: routableEdgeType,
      source: '1',
      sourceHandle: '5',
      target: '5',
      targetHandle: '3',
    },
    {
      id: '2:3->5:1',
      type: routableEdgeType,
      source: '2',
      sourceHandle: '3',
      target: '5',
      targetHandle: '1',
    },
    {
      id: '3:3->5:2',
      type: routableEdgeType,
      source: '3',
      sourceHandle: '3',
      target: '5',
      targetHandle: '2',
    },
    {
      id: '4:1->3:2',
      type: routableEdgeType,
      source: '4',
      sourceHandle: '1',
      target: '3',
      targetHandle: '2',
    },
    {
      id: '5:4->1:2',
      type: routableEdgeType,
      source: '5',
      sourceHandle: '4',
      target: '1',
      targetHandle: '2',
    },
  ]
  function useRoutingGraph() {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialRoutingNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialRoutingEdges)
    return {
      nodes,
      setNodes,
      onNodesChange,
      edges,
      setEdges,
      onEdgesChange,
    }
  }
  const libavoidWasmUrl = new URL(
    '../../node_modules/libavoid-js/dist/libavoid.wasm?no-inline',
    import.meta.url,
  ).href
  /**
   * 协调 React Flow 图状态与 libavoid 的 WASM 路由对象。
   * 第一阶段等待节点尺寸初始化并加载 WASM，设置避障缓冲与共享路径的路由参数。
   * 第二阶段同步矩形障碍物：移除失效 shape，新增或移动存活 shape，并建立有方向的 Handle 引脚。
   * 第三阶段同步边端点和 connector，执行一次 processTransaction，读取中间折点写回 edge.data.points。
   * nodeShapeIdsRef 为字符串节点 ID 分配数值索引；各 Map 只属于当前画布实例。
   * 临时 Point、Rectangle、ConnEnd 用完后调用 Avoid.destroy，持久 shape/connector 则复用。
   */
  function useAvoidRouting() {
    const [router, setRouter] = React.useState<AvoidRouter | null>(null)
    const nodeShapeIdsRef = React.useRef(new Map<string, number>())
    const nextShapeIdRef = React.useRef(1)
    const shapeRefs = React.useRef(new Map<number, AvoidShape>())
    const connectorRefs = React.useRef(new Map<string, AvoidConnector>())
    const { setEdges } = useReactFlow<RoutingNode, RoutingEdge>()
    const nodesInitialized = useNodesInitialized()
    // useStore 的公开签名只提供基础 Node/Edge 类型；当前 Provider 只注册本文件的图类型。
    // 在这个入口收窄集合类型，让后续路由逻辑持续使用具体节点与折点数据。
    const graph = useStore<RoutingGraph>(
      (storeState) => ({
        nodes: storeState.nodes as RoutingNode[],
        edges: storeState.edges as RoutingEdge[],
      }),
      equalRoutingGraph,
    )
    const nodeLookup = useStore((storeState) => storeState.nodeLookup)
    const loadingRef = React.useRef(false)
    React.useEffect(() => {
      if (!nodesInitialized || loadingRef.current) {
        return
      }
      if (!router) {
        loadingRef.current = true
        AvoidWasm.load(libavoidWasmUrl)
          .then(() => {
            const Avoid = AvoidWasm.getInstance()
            const createdRouter = new Avoid.Router(Avoid.PolyLineRouting)
            createdRouter.setRoutingParameter(Avoid.shapeBufferDistance, 10)
            createdRouter.setRoutingParameter(Avoid.idealNudgingDistance, 10)
            createdRouter.setRoutingOption(Avoid.nudgeSharedPathsWithCommonEndPoint, false)
            createdRouter.setRoutingOption(Avoid.performUnifyingNudgingPreprocessingStep, true)
            setRouter(createdRouter)
          })
          .finally(() => {
            loadingRef.current = false
          })
        return
      }
      const Avoid = AvoidWasm.getInstance()
      const activeShapeIds = new Set(
        graph.nodes.flatMap((node) => nodeShapeIdsRef.current.get(node.id) ?? []),
      )
      console.log('activeShapeIds', activeShapeIds)
      for (const [shapeId, shapeRef] of shapeRefs.current) {
        if (!activeShapeIds.has(shapeId)) {
          router.deleteShape(shapeRef)
          shapeRefs.current.delete(shapeId)
        }
      }
      for (const node of graph.nodes) {
        const width = node.measured?.width ?? 0
        const height = node.measured?.height ?? 0
        const topLeft = new Avoid.Point(node.position.x, node.position.y)
        const bottomRight = new Avoid.Point(node.position.x + width, node.position.y + height)
        if (!nodeShapeIdsRef.current.has(node.id)) {
          nodeShapeIdsRef.current.set(node.id, nextShapeIdRef.current++)
        }
        const shapeId = nodeShapeIdsRef.current.get(node.id)!
        const rectangle = new Avoid.Rectangle(topLeft, bottomRight)
        if (shapeRefs.current.has(shapeId)) {
          router.moveShape(shapeRefs.current.get(shapeId)!, rectangle)
        } else {
          const shapeRef = new Avoid.ShapeRef(router, rectangle)
          const nodeData = node.data
          const handleBounds = nodeLookup.get(node.id)?.internals.handleBounds
          const sourceHandles = handleBounds?.source ?? []
          const targetHandles = handleBounds?.target ?? []
          console.log('sourceHandles targetHandles', sourceHandles, targetHandles, node.id)
          for (const handle of [...sourceHandles, ...targetHandles]) {
            const pinId = Number(handle.id)
            const side = findHandleSide(nodeData, handle.id)
            new Avoid.ShapeConnectionPin(
              shapeRef,
              pinId,
              handle.x + handle.width / 2,
              handle.y + handle.height / 2,
              false,
              0,
              side === 'top'
                ? Avoid.ConnDirUp
                : side === 'bottom'
                  ? Avoid.ConnDirDown
                  : side === 'left'
                    ? Avoid.ConnDirLeft
                    : Avoid.ConnDirRight,
            ).setExclusive(false)
          }
          shapeRefs.current.set(shapeId, shapeRef)
        }
        Avoid.destroy(rectangle)
        Avoid.destroy(bottomRight)
        Avoid.destroy(topLeft)
      }
      const activeEdgeIds = new Set(graph.edges.map((edge) => edge.id))
      for (const [edgeId, connectorRef] of connectorRefs.current) {
        if (!activeEdgeIds.has(edgeId)) {
          router.deleteConnector(connectorRef)
          connectorRefs.current.delete(edgeId)
        }
      }
      for (const edge of graph.edges) {
        const sourceShapeId = nodeShapeIdsRef.current.get(edge.source)
        const targetShapeId = nodeShapeIdsRef.current.get(edge.target)
        if (!sourceShapeId || !targetShapeId) {
          continue
        }
        const sourceShape = shapeRefs.current.get(sourceShapeId)
        const targetShape = shapeRefs.current.get(targetShapeId)
        if (!sourceShape || !targetShape) {
          continue
        }
        const sourceEndpoint = new Avoid.ConnEnd(sourceShape, Number(edge.sourceHandle))
        const targetEndpoint = new Avoid.ConnEnd(targetShape, Number(edge.targetHandle))
        if (connectorRefs.current.has(edge.id)) {
          const existingConnector = connectorRefs.current.get(edge.id)!
          existingConnector.setSourceEndpoint(sourceEndpoint)
          existingConnector.setDestEndpoint(targetEndpoint)
        } else {
          const connectorRef = new Avoid.ConnRef(router, sourceEndpoint, targetEndpoint)
          connectorRefs.current.set(edge.id, connectorRef)
        }
        Avoid.destroy(sourceEndpoint)
        Avoid.destroy(targetEndpoint)
      }
      router.processTransaction()
      setEdges((edges) =>
        edges.map((edge) => {
          const connectorRef = connectorRefs.current.get(edge.id)
          if (!connectorRef) {
            return edge
          }
          const route = connectorRef.displayRoute()
          const pointCount = route.size()
          const routePoints = []
          for (let pointIndex = 1; pointIndex < pointCount - 1; pointIndex++) {
            const routePoint = route.get_ps(pointIndex)
            routePoints.push({
              x: routePoint.x,
              y: routePoint.y,
            })
          }
          return {
            ...edge,
            data: {
              points: routePoints,
            },
          }
        }),
      )
    }, [router, nodesInitialized, graph, nodeLookup, setEdges])
  }
  /**
   * 只比较节点几何与边连接拓扑，忽略 data.points 与选中状态。
   * 路由结果写入边数据也会触发 store 更新；忽略这些字段可阻止路由反馈循环。
   * 节点位置或测量尺寸改变、边端点或 Handle 改变时才需要重新计算路径。
   */
  function equalRoutingGraph(previousGraph: RoutingGraph, nextGraph: RoutingGraph) {
    return (
      equalNodeGeometry(previousGraph.nodes, nextGraph.nodes) &&
      equalEdgeConnections(previousGraph.edges, nextGraph.edges)
    )
  }
  /* 按数组顺序比较节点尺寸和位置；选中状态等与几何无关的变化不会重新计算路径。 */
  function equalNodeGeometry(previousNodes: RoutingNode[], nextNodes: RoutingNode[]) {
    if (previousNodes.length !== nextNodes.length) {
      return false
    }
    for (let nodeIndex = 0; nodeIndex < previousNodes.length; nodeIndex++) {
      const previousNode = previousNodes[nodeIndex]!
      const nextNode = nextNodes[nodeIndex]
      if (
        !nextNode ||
        previousNode.measured?.width !== nextNode.measured?.width ||
        previousNode.measured?.height !== nextNode.measured?.height ||
        previousNode.position.x !== nextNode.position.x ||
        previousNode.position.y !== nextNode.position.y
      ) {
        return false
      }
    }
    return true
  }
  function equalEdgeConnections(previousEdges: RoutingEdge[], nextEdges: RoutingEdge[]) {
    if (previousEdges.length !== nextEdges.length) {
      return false
    }
    for (let edgeIndex = 0; edgeIndex < previousEdges.length; edgeIndex++) {
      const previousEdge = previousEdges[edgeIndex]!
      const nextEdge = nextEdges[edgeIndex]!
      if (
        previousEdge.source !== nextEdge.source ||
        previousEdge.target !== nextEdge.target ||
        previousEdge?.sourceHandle !== nextEdge?.sourceHandle ||
        previousEdge?.targetHandle !== nextEdge?.targetHandle
      ) {
        return false
      }
    }
    return true
  }
  const routingProOptions = {
    hideAttribution: true,
  }
  const routingNodeTypes = {
    [routableNodeType]: RoutableNode,
  }
  const routingEdgeTypes = {
    [routableEdgeType]: RoutableEdge,
  }
  const routingDefaultEdgeOptions = {
    type: routableEdgeType,
    animated: true,
  }
  /**
   * 受控图变更交给 React Flow，useAvoidRouting 根据必要的几何变化派生连线路径。
   * 每条边未获得路由结果时先画正交回退路径，WASM 就绪后自动使用避障折点。
   * 连接事件沿用标准 addEdge，新增连接器由下一轮路由事务建立。
   */
  function EdgeRoutingExample() {
    const { nodes, onNodesChange, edges, setEdges, onEdgesChange } = useRoutingGraph()
    const onConnect = React.useCallback(
      (connection: Connection) => setEdges((edges) => addEdge(connection, edges)),
      [setEdges],
    )
    useAvoidRouting()
    return (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={routingNodeTypes}
        edgeTypes={routingEdgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        defaultEdgeOptions={routingDefaultEdgeOptions}
        proOptions={routingProOptions}
        zoomOnDoubleClick={false}
        fitView
      />
    )
  }
  const _ExampleContent = () => (
    <ReactFlowProvider>
      <EdgeRoutingExample />
    </ReactFlowProvider>
  )
  const initialElement = (
    <React.StrictMode>
      <_ExampleContent />
    </React.StrictMode>
  )
  return function ExampleRoot() {
    return initialElement
  }
}
function EdgeRoutingCanvas() {
  // 惰性保存组件类型，使普通重渲染沿用同一份图状态；工作台重置时重新挂载。
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { EdgeRoutingCanvas as default }
