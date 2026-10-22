/**
 * 选择分组：用选区包围盒创建父节点，动态拟合分组边界，解组时保持节点绝对位置。
 * 每个画布实例通过 createExampleScope 创建独立作用域，避免缓存、store 和可变初始数据跨实例共享。
 */
import * as React from 'react'
import {
  SelectionMode,
  useEdgesState,
  useReactFlow,
  useStore,
  useNodesState,
  useOnSelectionChange,
  ReactFlow,
  applyNodeChanges,
  ReactFlowProvider,
  NodeToolbar,
  Background,
  addEdge,
} from '@xyflow/react'
import type { Connection, Dimensions, Edge, Node, NodeProps, XYPosition } from '@xyflow/react'

/** 分组节点不需要文字，普通节点可选地携带标签。 */
type GroupedNode = Node<{ label?: string }>
/** 子节点在父坐标系中的包围盒，包含本轮累计的子节点数量。 */
interface ChildBounds {
  x1: number
  y1: number
  x2: number
  y2: number
  numberOfChildren: number
}
/** 调整父节点后，offset 用来补偿子节点的局部坐标以保持绝对位置。 */
interface GroupAdjustment {
  dimension: Dimensions
  offset: XYPosition
  position: XYPosition
}

/** 创建本示例的组件、算法和局部状态；根组件惰性初始化后在本次挂载中复用。 */
function createExampleScope() {
  /* 解组时把父节点绝对位置加回子节点坐标，并在同一次节点更新中移除指定分组。 */
  function useDetachNodes() {
    const { setNodes, getNodes, getInternalNode } = useReactFlow<GroupedNode, Edge>()
    return React.useCallback(
      (nodeIdsToDetach: string[], groupIdToRemove?: string) => {
        const detachedNodeIds = new Set(nodeIdsToDetach)
        const updatedNodes: GroupedNode[] = []
        for (const node of getNodes())
          if (groupIdToRemove !== node.id) {
            if (detachedNodeIds.has(node.id) && node.parentId) {
              const parentInternalNode = getInternalNode(node.parentId)
              const detachedNode = { ...node }
              delete detachedNode.parentId
              updatedNodes.push({
                ...detachedNode,
                position: {
                  x: node.position.x + (parentInternalNode?.internals.positionAbsolute.x ?? 0),
                  y: node.position.y + (parentInternalNode?.internals.positionAbsolute.y ?? 0),
                },
              })
            } else {
              updatedNodes.push(node)
            }
          }
        setNodes(updatedNodes)
      },
      [setNodes, getNodes, getInternalNode],
    )
  }
  function GroupNode({ id: groupId }: NodeProps<GroupedNode>) {
    const detachNodes = useDetachNodes()
    const { getNodes } = useReactFlow<GroupedNode, Edge>()
    const hasChildren = useStore(
      (flowState) => (flowState.parentLookup.get(groupId)?.size ?? 0) > 0,
    )
    return (
      <div>
        {hasChildren && (
          <NodeToolbar className="nodrag">
            <button
              className="xy-theme__button"
              onClick={() => {
                detachNodes(
                  getNodes()
                    .filter((node) => node.parentId === groupId)
                    .map((childNode) => childNode.id),
                  groupId,
                )
              }}
            >
              {'Ungroup'}
            </button>
          </NodeToolbar>
        )}
      </div>
    )
  }
  const MemoizedGroupNode = React.memo(GroupNode)
  const createNodeId = (prefix = 'node') => `${prefix}_${Math.random() * 1e4}`
  /**
   * 订阅选区并排除 group 节点，仅在选中多个普通节点时展示创建分组入口。
   * 用选区包围盒左上角作为新分组原点；读取内部节点的绝对位置后减去该原点。
   * 将新分组放在节点数组首位，再为选区节点写入 parentId，避免父节点解析落后于子节点。
   * 组尺寸由后续 fitGroups 计算，创建入口只负责拓扑与坐标变换。
   */
  function GroupSelectionToolbar() {
    const { setNodes, getNodesBounds, getNodes, getInternalNode } = useReactFlow<
      GroupedNode,
      Edge
    >()
    const [selectedNodes, setSelectedNodes] = React.useState<GroupedNode[]>([])
    useOnSelectionChange<GroupedNode>({
      onChange: ({ nodes: selectionNodes }) => {
        setSelectedNodes(selectionNodes.filter((node) => node.type !== 'group'))
      },
    })
    if (selectedNodes.length <= 1) {
      return null
    }
    const selectedNodeIds = selectedNodes.map((selectedNode) => selectedNode.id)
    return (
      <NodeToolbar nodeId={selectedNodeIds} isVisible>
        <button
          className="xy-theme__button"
          onClick={() => {
            const currentNodes = getNodes()
            const groupId = createNodeId('group')
            const selectionBounds = getNodesBounds(selectedNodes)
            const groupPosition = {
              x: selectionBounds.x,
              y: selectionBounds.y,
            }
            setNodes([
              {
                id: groupId,
                type: 'group',
                position: groupPosition,
                data: {},
              },
              ...currentNodes.map((node) => {
                if (selectedNodeIds.includes(node.id)) {
                  const internalNode = getInternalNode(node.id)
                  if (!internalNode) {
                    return node
                  }
                  const absolutePosition = internalNode.internals.positionAbsolute
                  return {
                    ...node,
                    position: {
                      x: absolutePosition.x - groupPosition.x,
                      y: absolutePosition.y - groupPosition.y,
                    },
                    parentId: groupId,
                    selected: false,
                  }
                }
                return node
              }),
            ])
          }}
        >
          {'Group selected nodes'}
        </button>
      </NodeToolbar>
    )
  }
  const INITIAL_NODES: GroupedNode[] = [
    {
      id: 'group-1',
      type: 'group',
      position: {
        x: 0,
        y: 0,
      },
      data: {},
    },
    {
      id: '1',
      parentId: 'group-1',
      position: {
        x: 25,
        y: 80,
      },
      data: {
        label: 'Node 1',
      },
    },
    {
      id: '2',
      parentId: 'group-1',
      position: {
        x: 250,
        y: 25,
      },
      data: {
        label: 'Node 2',
      },
    },
    {
      id: '3',
      parentId: 'group-1',
      position: {
        x: 250,
        y: 140,
      },
      data: {
        label: 'Node 3',
      },
    },
    {
      id: '4',
      position: {
        x: 500,
        y: 100,
      },
      data: {
        label: 'Node 4',
      },
    },
    {
      id: '5',
      position: {
        x: 650,
        y: 50,
      },
      data: {
        label: 'Node 5',
      },
    },
    {
      id: '6',
      position: {
        x: 800,
        y: 150,
      },
      data: {
        label: 'Node 6',
      },
    },
  ]
  const INITIAL_EDGES: Edge[] = []
  function getNodeSize(node: GroupedNode): Dimensions {
    return {
      width: node.width ?? node.measured?.width ?? 0,
      height: node.height ?? node.measured?.height ?? 0,
    }
  }
  /* 累计子节点的带内边距包围盒，同时记录子节点数量供后续分组整理使用。 */
  function expandChildBounds(
    bounds: ChildBounds,
    childPosition: XYPosition,
    childSize: Dimensions,
    padding: number,
  ) {
    const { x: childX, y: childY } = childPosition
    const paddedLeft = childX - padding
    const paddedTop = childY - padding
    bounds.x1 = paddedLeft < bounds.x1 ? paddedLeft : bounds.x1
    bounds.y1 = paddedTop < bounds.y1 ? paddedTop : bounds.y1
    const paddedRight = childX + childSize.width + padding
    const paddedBottom = childY + childSize.height + padding
    bounds.x2 = paddedRight > bounds.x2 ? paddedRight : bounds.x2
    bounds.y2 = paddedBottom > bounds.y2 ? paddedBottom : bounds.y2
    bounds.numberOfChildren += 1
  }
  function getOrCreateChildBounds(
    childBoundsByParentId: Map<string, ChildBounds>,
    parentId: string,
  ) {
    let childBounds = childBoundsByParentId.get(parentId)
    if (!childBounds) {
      childBounds = {
        x1: 1 / 0,
        y1: 1 / 0,
        x2: -1 / 0,
        y2: -1 / 0,
        numberOfChildren: 0,
      }
      childBoundsByParentId.set(parentId, childBounds)
    }
    return childBounds
  }
  /* 由子节点包围盒计算分组尺寸、分组原点和对子节点坐标的补偿量。 */
  function calculateGroupAdjustment(
    groupNode: GroupedNode,
    childBounds: ChildBounds,
  ): GroupAdjustment | undefined {
    const { x1: boundsLeft, y1: boundsTop, x2: boundsRight, y2: boundsBottom } = childBounds
    const groupWidth = boundsRight - boundsLeft
    const groupHeight = boundsBottom - boundsTop
    const currentSize = getNodeSize(groupNode)
    if (
      groupWidth === currentSize.width &&
      groupHeight === currentSize.height &&
      boundsLeft === 0 &&
      boundsTop === 0
    ) {
      return
    }
    const { x: groupX, y: groupY } = groupNode.position
    return {
      dimension: {
        width: groupWidth,
        height: groupHeight,
      },
      offset: {
        x: boundsLeft,
        y: boundsTop,
      },
      position: {
        x: groupX + boundsLeft,
        y: groupY + boundsTop,
      },
    }
  }
  /**
   * 按子节点内容拟合分组，同时处理嵌套组的尺寸和坐标补偿。
   * 第一遍逆序累计带 padding 的子包围盒，记录待移除的空组/单子组及需要调整的组。
   * 第二遍顺序应用调整：父组移动多少，子节点局部坐标就反向补偿多少。
   * 父组被移除时，子节点恢复顶层坐标并去掉 parentId；仍存活的父子关系保持不变。
   * 没有组尺寸/位置需要调整时复用输入数组，避免无意义的画布状态更新。
   * @param padding 分组边界与子节点包围盒之间的留白，单位为画布坐标。
   */
  function fitGroups(nodes: GroupedNode[], padding = 25): GroupedNode[] {
    const groupsToRemove = new Map<string, GroupedNode>()
    const childBoundsByParentId = new Map<string, ChildBounds>()
    const adjustmentsByNodeId = new Map<string, GroupAdjustment>()
    for (let nodeIndex = nodes.length - 1; nodeIndex >= 0; nodeIndex--) {
      const node = nodes[nodeIndex]!
      const childBounds = childBoundsByParentId.get(node.id)
      if ((!childBounds || childBounds.numberOfChildren === 1) && node.type === 'group') {
        groupsToRemove.set(node.id, node)
        continue
      }
      const adjustment = childBounds ? calculateGroupAdjustment(node, childBounds) : undefined
      if (adjustment) {
        adjustmentsByNodeId.set(node.id, adjustment)
      }
      if (node.parentId) {
        expandChildBounds(
          getOrCreateChildBounds(childBoundsByParentId, node.parentId),
          adjustment ? adjustment.position : node.position,
          adjustment ? adjustment.dimension : getNodeSize(node),
          padding,
        )
      }
    }
    if (adjustmentsByNodeId.size === 0) {
      return nodes
    }
    const updatedNodes: GroupedNode[] = []
    for (const node of nodes) {
      if (groupsToRemove.has(node.id)) {
        continue
      }
      const removedParent = groupsToRemove.get(node.parentId || '')
      if (removedParent) {
        const detachedNode = { ...node }
        delete detachedNode.parentId
        updatedNodes.push({
          ...detachedNode,
          position: {
            x: node.position.x + removedParent.position.x,
            y: node.position.y + removedParent.position.y,
          },
        })
        continue
      }
      const adjustment = adjustmentsByNodeId.get(node.id)
      const parentAdjustment = adjustmentsByNodeId.get(node.parentId || '')
      if (adjustment && parentAdjustment) {
        updatedNodes.push({
          ...node,
          ...adjustment.dimension,
          position: {
            x: adjustment.position.x - parentAdjustment.offset.x,
            y: adjustment.position.y - parentAdjustment.offset.y,
          },
        })
        continue
      }
      if (adjustment) {
        updatedNodes.push({
          ...node,
          ...adjustment.dimension,
          position: adjustment.position,
        })
        continue
      }
      if (parentAdjustment) {
        updatedNodes.push({
          ...node,
          position: {
            x: node.position.x - parentAdjustment.offset.x,
            y: node.position.y - parentAdjustment.offset.y,
          },
        })
        continue
      }
      updatedNodes.push(node)
    }
    return updatedNodes
  }
  const PRO_OPTIONS = {
    hideAttribution: true,
  }
  const NODE_TYPES = {
    group: MemoizedGroupNode,
  }
  /**
   * 所有节点 change 先经 applyNodeChanges，再立即交给 fitGroups 归并组边界。
   * 因此子节点拖动、尺寸变化和选区分组共用同一套拟合规则。
   * 解组工具栏按当前 group 查询子节点，由 useDetachNodes 负责恢复画布绝对位置。
   */
  function SelectionGroupingFlow() {
    const [nodes, setNodes] = useNodesState(INITIAL_NODES)
    const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
    const onConnect = React.useCallback(
      (connection: Connection) => setEdges((currentEdges) => addEdge(connection, currentEdges)),
      [setEdges],
    )
    return (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onEdgesChange={onEdgesChange}
        onNodesChange={React.useCallback(
          /* 先应用 React Flow 节点变更，再重新拟合分组，使拖动、缩放后的分组边界跟随子节点。 */ (
            changes,
          ) => {
            setNodes((currentNodes) => fitGroups(applyNodeChanges(changes, currentNodes)))
          },
          [setNodes],
        )}
        onConnect={onConnect}
        proOptions={PRO_OPTIONS}
        fitView
        nodeTypes={NODE_TYPES}
        selectionMode={SelectionMode.Full}
        colorMode="system"
      >
        <Background />
        <GroupSelectionToolbar />
      </ReactFlow>
    )
  }
  const initialElement = (
    <React.StrictMode>
      <ReactFlowProvider>
        <SelectionGroupingFlow />
      </ReactFlowProvider>
    </React.StrictMode>
  )
  return function ExampleRoot() {
    return initialElement
  }
}
function SelectionGroupingCanvas() {
  // 惰性保存组件类型，使普通重渲染沿用同一份图状态；工作台重置时重新挂载。
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { SelectionGroupingCanvas as default }
