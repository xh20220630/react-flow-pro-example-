/**
 * 自动布局：将画布节点和连线交给 Dagre、D3 Hierarchy 或 ELK，统一坐标与连接点方向。
 * 每个画布实例通过 createExampleScope 创建独立作用域，避免缓存、store 和可变初始数据跨实例共享。
 */
import * as React from 'react'
import { LayoutControlsProvider, LayoutControlsPanel } from '../controls/layout-controls'
import { useLayoutControls } from '../controls/layout-controls-context'
import {
  getIncomers,
  Position,
  MarkerType,
  ConnectionLineType,
  useEdgesState,
  useReactFlow,
  useStore,
  useNodesInitialized,
  useNodesState,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
} from '@xyflow/react'
import { button as levaButton } from 'leva'
import dagre from '@dagrejs/dagre'
import { stratify, tree } from 'd3-hierarchy'
import ELK from 'elkjs/lib/elk.bundled.js'
import type { Connection, Edge, Node, ReactFlowState, XYPosition } from '@xyflow/react'
import type { HierarchyPointNode } from 'd3-hierarchy'
import type { ElkNode } from 'elkjs/lib/elk-api'

/** 三种布局共享同一输入输出协议，调用方无需了解各算法的内部图结构。 */
type LayoutNode = Node<{ label?: string }>
type LayoutDirection = 'TB' | 'BT' | 'LR' | 'RL'
type LayoutAlgorithm = 'dagre' | 'd3-hierarchy' | 'elk'
interface LayoutOptions {
  direction: LayoutDirection
  algorithm: LayoutAlgorithm
  spacing: [number, number]
}
interface LayoutGraph {
  nodes: LayoutNode[]
  edges: Edge[]
}
type LayoutFunction = (
  nodes: LayoutNode[],
  edges: Edge[],
  options: LayoutOptions,
) => Promise<LayoutGraph>

/** 创建本示例的组件、算法和局部状态；根组件惰性初始化后在本次挂载中复用。 */
function createExampleScope() {
  /* 把布局方向转换成节点出边连接点方位。 */
  function sourcePositionForDirection(direction: LayoutDirection): Position {
    switch (direction) {
      case 'TB':
        return Position.Bottom
      case 'BT':
        return Position.Top
      case 'LR':
        return Position.Right
      case 'RL':
        return Position.Left
    }
  }
  /* 把布局方向转换成节点入边连接点方位。 */
  function targetPositionForDirection(direction: LayoutDirection): Position {
    switch (direction) {
      case 'TB':
        return Position.Top
      case 'BT':
        return Position.Bottom
      case 'LR':
        return Position.Left
      case 'RL':
        return Position.Right
    }
  }
  function createAutoLayoutId() {
    return `${Date.now()}`
  }
  const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  /**
   * 将节点测量尺寸与有向边输入 Dagre，按 direction 和 spacing 计算层次布局。
   * dagreGraph 属于当前画布作用域；先移除输入中已不存在的节点，再更新节点与连线。
   * Dagre 返回节点中心坐标，React Flow 使用左上角坐标，因此必须减去节点半宽高。
   * 返回统一 LayoutGraph，不在算法内部修改 React 状态，便于与其它算法互换。
   */
  const layoutWithDagre: LayoutFunction = async (nodes, edges, options) => {
    dagreGraph.setGraph({
      rankdir: options.direction,
      nodesep: options.spacing[0],
      ranksep: options.spacing[1],
    })
    const currentNodeIds = nodes.map((currentNode) => currentNode.id)
    dagreGraph.nodes().forEach((graphNodeId) => {
      if (!currentNodeIds.includes(graphNodeId)) {
        dagreGraph.removeNode(graphNodeId)
      }
    })
    for (const measuredNode of nodes)
      dagreGraph.setNode(measuredNode.id, {
        width: measuredNode.measured?.width ?? 0,
        height: measuredNode.measured?.height ?? 0,
      })
    for (const inputEdge of edges) dagreGraph.setEdge(inputEdge.source, inputEdge.target)
    dagre.layout(dagreGraph)
    return {
      nodes: nodes.map((inputNode) => {
        const { x: centerX, y: centerY } = dagreGraph.node(inputNode.id)
        const topLeftPosition = {
          x: centerX - (inputNode.measured?.width ?? 0) / 2,
          y: centerY - (inputNode.measured?.height ?? 0) / 2,
        }
        return {
          ...inputNode,
          position: topLeftPosition,
        }
      }),
      edges,
    }
  }
  /* 将自上而下的树坐标按目标方向交换坐标轴或反向。 */
  const orientTreePosition = (
    treeX: number,
    treeY: number,
    direction: LayoutDirection,
  ): XYPosition => {
    switch (direction) {
      case 'TB':
        return {
          x: treeX,
          y: treeY,
        }
      case 'LR':
        return {
          x: treeY,
          y: treeX,
        }
      case 'BT':
        return {
          x: -treeX,
          y: -treeY,
        }
      case 'RL':
        return {
          x: -treeY,
          y: treeX,
        }
    }
  }
  const hierarchyTreeLayout = tree<LayoutNode>().separation(() => 1)
  const HIERARCHY_ROOT = {
    id: 'd3-hierarchy-root',
    x: 0,
    y: 0,
    position: {
      x: 0,
      y: 0,
    },
    data: {},
  }
  /**
   * D3 stratify 需要单根树，因此增加虚拟根，把所有无入边的节点挂到虚拟根下。
   * 根据最大节点尺寸和两轴 spacing 生成 nodeSize，避免不同尺寸节点互相覆盖。
   * 先在从上到下的坐标系布局，再根据 TB/BT/LR/RL 交换或反向坐标轴。
   * 以节点 ID 建立结果索引，输出时只合并真实节点，虚拟根不会进入画布。
   */
  const layoutWithHierarchy: LayoutFunction = async (nodes, edges, options) => {
    const isHorizontal = options.direction === 'RL' || options.direction === 'LR'
    const hierarchyInputs: LayoutNode[] = []
    let maximumNodeWidth = 0
    let maximumNodeHeight = 0
    for (const inputNode of nodes) {
      const hierarchyInput = {
        ...inputNode,
        ...inputNode.position,
      }
      hierarchyInputs.push(hierarchyInput)
      maximumNodeWidth = Math.max(maximumNodeWidth, inputNode.measured?.width ?? 0)
      maximumNodeHeight = Math.max(maximumNodeHeight, inputNode.measured?.height ?? 0)
    }
    const nodeSpacing: [number, number] = isHorizontal
      ? [maximumNodeHeight + options.spacing[1], maximumNodeWidth + options.spacing[0]]
      : [maximumNodeWidth + options.spacing[0], maximumNodeHeight + options.spacing[1]]
    hierarchyTreeLayout.nodeSize(nodeSpacing)
    const laidOutHierarchy = hierarchyTreeLayout(
      stratify<LayoutNode>()
        .id((hierarchyInput) => hierarchyInput.id)
        .parentId((hierarchyInput) => {
          if (hierarchyInput.id !== HIERARCHY_ROOT.id) {
            return getIncomers(hierarchyInput, nodes, edges)[0]?.id || HIERARCHY_ROOT.id
          }
        })([HIERARCHY_ROOT, ...hierarchyInputs]),
    )
    const hierarchyById = new Map<string, HierarchyPointNode<LayoutNode>>()
    for (const hierarchyNode of laidOutHierarchy)
      hierarchyById.set(hierarchyNode.id!, hierarchyNode)
    return {
      nodes: nodes.map((inputNode) => {
        const { x: treeX, y: treeY } = hierarchyById.get(inputNode.id)!
        const orientedPosition = orientTreePosition(treeX, treeY, options.direction)
        const topLeftPosition = {
          x: orientedPosition.x - (inputNode.measured?.width ?? 0) / 2,
          y: orientedPosition.y - (inputNode.measured?.height ?? 0) / 2,
        }
        return {
          ...inputNode,
          position: topLeftPosition,
        }
      }),
      edges,
    }
  }
  const elkLayoutEngine = new ELK()
  /* 将 React Flow 使用的 TB/LR/BT/RL 方向转换成 ELK 的方向名称。 */
  function elkDirection(direction: LayoutDirection) {
    switch (direction) {
      case 'TB':
        return 'DOWN'
      case 'LR':
        return 'RIGHT'
      case 'BT':
        return 'UP'
      case 'RL':
        return 'LEFT'
    }
  }
  const LAYOUT_ALGORITHMS: Record<LayoutAlgorithm, LayoutFunction> = {
    dagre: layoutWithDagre,
    'd3-hierarchy': layoutWithHierarchy,
    elk: /* 把 React Flow 节点尺寸和连线端点转换成 ELK 图，异步计算后按节点 id 合并新坐标。 */ async (
      nodes,
      edges,
      options,
    ) => {
      const elkGraph = {
        id: 'elk-root',
        layoutOptions: {
          'elk.algorithm': 'mrtree',
          'elk.direction': elkDirection(options.direction),
          'elk.spacing.nodeNode': `${options.spacing[0]}`,
        },
        children: nodes.map((inputNode) => ({
          id: inputNode.id,
          width: inputNode.measured?.width ?? 0,
          height: inputNode.measured?.height ?? 0,
        })),
        edges: edges.map((inputEdge) => ({
          id: inputEdge.id,
          sources: [inputEdge.source],
          targets: [inputEdge.target],
        })),
      }
      const laidOutGraph = await elkLayoutEngine.layout(elkGraph)
      const elkNodeById = new Map<string, ElkNode>()
      for (const laidOutNode of laidOutGraph.children ?? [])
        elkNodeById.set(laidOutNode.id, laidOutNode)
      return {
        nodes: nodes.map((inputNode) => {
          const laidOutNode = elkNodeById.get(inputNode.id)!
          const topLeftPosition = {
            x: laidOutNode.x!,
            y: laidOutNode.y!,
          }
          return {
            ...inputNode,
            position: topLeftPosition,
          }
        }),
        edges,
      }
    },
  }
  /**
   * 等待 React Flow 完成节点尺寸测量后，选取指定算法异步生成布局。
   * store 比较器只订阅与布局相关的节点尺寸和边端点，忽略位置与透明度写回。
   * 布局结束后恢复节点/边可见性，并按方向设置 sourcePosition 和 targetPosition。
   * 避免把布局输出自身当作新的布局输入变化，从而反复计算和渲染。
   */
  function useAutoLayout(options: LayoutOptions) {
    const { setNodes, setEdges } = useReactFlow<LayoutNode, Edge>()
    const nodesInitialized = useNodesInitialized()
    const layoutInputs = useStore<LayoutGraph>(
      (store: ReactFlowState<LayoutNode>) => ({
        nodes: store.nodes,
        edges: store.edges,
      }),
      layoutInputsEqual,
    )
    React.useEffect(() => {
      if (!(!nodesInitialized || layoutInputs.nodes.length === 0)) {
        ;(async () => {
          const layoutAlgorithm = LAYOUT_ALGORITHMS[options.algorithm]
          const inputNodes = layoutInputs.nodes.map((currentNode) => ({
            ...currentNode,
          }))
          const inputEdges = layoutInputs.edges.map((currentEdge) => ({
            ...currentEdge,
          }))
          const { nodes: laidOutNodes, edges: laidOutEdges } = await layoutAlgorithm(
            inputNodes,
            inputEdges,
            options,
          )
          for (const laidOutNode of laidOutNodes) {
            laidOutNode.style = {
              ...laidOutNode.style,
              opacity: 1,
            }
            laidOutNode.sourcePosition = sourcePositionForDirection(options.direction)
            laidOutNode.targetPosition = targetPositionForDirection(options.direction)
          }
          for (const inputEdge of inputEdges)
            inputEdge.style = {
              ...inputEdge.style,
              opacity: 1,
            }
          setNodes(laidOutNodes)
          setEdges(laidOutEdges)
        })()
      }
    }, [nodesInitialized, layoutInputs, options, setNodes, setEdges])
  }
  function layoutInputsEqual(previousInputs: LayoutGraph, nextInputs: LayoutGraph) {
    return (
      layoutNodesEqual(previousInputs.nodes, nextInputs.nodes) &&
      layoutEdgesEqual(previousInputs.edges, nextInputs.edges)
    )
  }
  /* 节点比较只关心数量和测量尺寸；正在拖动或缩放时保持相等，避免布局过程反复触发。 */
  function layoutNodesEqual(previousNodes: LayoutNode[], nextNodes: LayoutNode[]) {
    if (previousNodes.length !== nextNodes.length) {
      return false
    }
    for (let nodeIndex = 0; nodeIndex < previousNodes.length; nodeIndex++) {
      const previousNode = previousNodes[nodeIndex]!
      const nextNode = nextNodes[nodeIndex]
      if (!nextNode) {
        return false
      }
      if (previousNode.resizing || previousNode.dragging) {
        return true
      }
      if (
        previousNode.measured?.width !== nextNode.measured?.width ||
        previousNode.measured?.height !== nextNode.measured?.height
      ) {
        return false
      }
    }
    return true
  }
  /* 连线比较检查数量、起终点和 handle，忽略布局无关属性。 */
  function layoutEdgesEqual(previousEdges: Edge[], nextEdges: Edge[]) {
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
  const INITIAL_NODES: LayoutNode[] = [
    {
      id: '1',
      data: {
        label: 'Node 1',
      },
      position: {
        x: 0,
        y: 0,
      },
    },
    {
      id: '2',
      data: {
        label: 'Node 2',
      },
      position: {
        x: 0,
        y: 0,
      },
    },
    {
      id: '3',
      data: {
        label: 'Node 3',
      },
      position: {
        x: 0,
        y: 0,
      },
    },
    {
      id: '4',
      data: {
        label: 'Node 4',
      },
      position: {
        x: 0,
        y: 0,
      },
    },
    {
      id: '5',
      data: {
        label: 'Node 5',
      },
      position: {
        x: 0,
        y: 0,
      },
    },
  ]
  const INITIAL_EDGES: Edge[] = [
    {
      id: '1->2',
      source: '1',
      target: '2',
    },
    {
      id: '1->3',
      source: '1',
      target: '3',
    },
    {
      id: '4->5',
      source: '4',
      target: '5',
    },
  ]
  const PRO_OPTIONS = {
    hideAttribution: true,
  }
  const DEFAULT_EDGE_OPTIONS = {
    type: 'smoothstep',
    markerEnd: {
      type: MarkerType.ArrowClosed,
    },
    pathOptions: {
      offset: 5,
    },
  }
  /**
   * Leva 面板以泛型保留算法名、方向与间距的具体类型，再交给 useAutoLayout。
   * 新增根节点和点击创建的子节点先设为透明，等待布局完成后统一显示。
   * 图由受控 nodes/edges 保存，每次布局写回坐标后 fitView 调整画布视口。
   */
  function AutoLayoutFlow() {
    const { fitView, addNodes } = useReactFlow<LayoutNode, Edge>()
    const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES)
    const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
    useAutoLayout(
      useLayoutControls({
        algorithm: {
          value: 'dagre' as LayoutAlgorithm,
          options: ['dagre', 'd3-hierarchy', 'elk'] as LayoutAlgorithm[],
        },
        direction: {
          value: 'TB' as LayoutDirection,
          options: {
            down: 'TB',
            right: 'LR',
            up: 'BT',
            left: 'RL',
          } as Record<string, LayoutDirection>,
        },
        spacing: [50, 50] as [number, number],
        'add root node': levaButton(() =>
          addNodes({
            id: createAutoLayoutId(),
            position: {
              x: 0,
              y: 0,
            },
            data: {
              label: 'New Node',
            },
            style: {
              opacity: 0,
            },
          }),
        ),
      }),
    )
    const addChildNode = React.useCallback(
      (parentNodeId: string) => {
        const childNodeId = createAutoLayoutId()
        const childNode = {
          id: childNodeId,
          data: {
            label: `Node ${nodes.length + 1}`,
          },
          position: {
            x: 0,
            y: 0,
          },
          style: {
            opacity: 0,
          },
        }
        const parentToChildEdge = {
          id: `${parentNodeId}->${childNodeId}`,
          source: parentNodeId,
          target: childNodeId,
          style: {
            opacity: 0,
          },
        }
        setNodes((currentNodes) => currentNodes.concat([childNode]))
        setEdges((currentEdges) => currentEdges.concat([parentToChildEdge]))
      },
      [setNodes, setEdges, nodes.length],
    )
    const onNodeClick = React.useCallback(
      (_clickEvent: React.MouseEvent, clickedNode: LayoutNode) => {
        addChildNode(clickedNode.id)
      },
      [addChildNode],
    )
    const onConnect = React.useCallback(
      (connection: Connection) => setEdges((currentEdges) => addEdge(connection, currentEdges)),
      [setEdges],
    )
    React.useEffect(() => {
      fitView()
    }, [nodes, fitView])
    return (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodesDraggable={false}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        connectionLineType={ConnectionLineType.SmoothStep}
        proOptions={PRO_OPTIONS}
        zoomOnDoubleClick={false}
        colorMode="system"
      >
        <LayoutControlsPanel />
      </ReactFlow>
    )
  }
  const _ExampleContent = () => (
    <ReactFlowProvider>
      <AutoLayoutFlow />
    </ReactFlowProvider>
  )
  const initialElement = (
    <LayoutControlsProvider>
      {
        <React.StrictMode>
          <_ExampleContent />
        </React.StrictMode>
      }
    </LayoutControlsProvider>
  )
  return function ExampleRoot() {
    return initialElement
  }
}
function AutoLayoutCanvas() {
  // 惰性保存组件类型，使普通重渲染沿用同一份图状态；工作台重置时重新挂载。
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { AutoLayoutCanvas as default }
