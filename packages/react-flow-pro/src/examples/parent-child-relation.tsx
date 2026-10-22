/**
 * 父子节点关系：拖入分组时换算相对坐标，脱离分组时恢复绝对坐标。
 * 每个画布实例通过 createExampleScope 创建独立作用域，避免缓存、store 和可变初始数据跨实例共享。
 */
import * as React from 'react'
import {
  Position,
  useEdgesState,
  useReactFlow,
  useStore,
  useNodesState,
  ReactFlow,
  ReactFlowProvider,
  NodeToolbar,
  BackgroundVariant,
  Background,
  Handle,
  addEdge,
} from '@xyflow/react'
import type { Connection, Edge, Node, NodeProps, OnNodeDrag } from '@xyflow/react'

/** 分组与子节点共用图结构；只有子节点需要 label。 */
type GroupedNode = Node<{ label?: string }>

/** 创建本示例的组件、算法和局部状态；根组件惰性初始化后在本次挂载中复用。 */
function createExampleScope() {
  /**
   * 解除指定节点的父子关系，保持屏幕中可见位置不变。
   * 子节点 position 属于父坐标系，因此脱离时加回父节点 positionAbsolute。
   * 同时移除 parentId、extent、expandParent，避免残留父范围约束影响顶层拖动。
   * 如果还传入 groupIdToRemove，则在同一轮更新中移除对应父组。
   */
  function useDetachNodes() {
    const { setNodes, getNodes, getInternalNode } = useReactFlow<GroupedNode, Edge>()
    return React.useCallback(
      (nodeIdsToDetach: string[], groupIdToRemove?: string) => {
        setNodes(
          getNodes()
            .map((node) => {
              if (nodeIdsToDetach.includes(node.id) && node.parentId) {
                const parentInternalNode = getInternalNode(node.parentId)
                // 删除约束字段表示恢复为顶层节点，满足严格可选属性类型。
                const detachedNode = { ...node }
                delete detachedNode.expandParent
                delete detachedNode.parentId
                delete detachedNode.extent
                return {
                  ...detachedNode,
                  position: {
                    x: node.position.x + (parentInternalNode?.internals.positionAbsolute.x ?? 0),
                    y: node.position.y + (parentInternalNode?.internals.positionAbsolute.y ?? 0),
                  },
                }
              }
              return node
            })
            .filter((node) => !groupIdToRemove || node.id !== groupIdToRemove),
        )
      },
      [setNodes, getNodes, getInternalNode],
    )
  }
  function ChildNode({ id: nodeId, data }: NodeProps<GroupedNode>) {
    const hasParent = useStore((flowState) => !!flowState.nodeLookup.get(nodeId)?.parentId)
    const { deleteElements } = useReactFlow<GroupedNode, Edge>()
    const detachNodes = useDetachNodes()
    return (
      <React.Fragment>
        <NodeToolbar className="nodrag">
          <button
            onClick={() =>
              deleteElements({
                nodes: [
                  {
                    id: nodeId,
                  },
                ],
              })
            }
          >
            {'Delete'}
          </button>
          {hasParent && <button onClick={() => detachNodes([nodeId])}>{'Detach'}</button>}
        </NodeToolbar>
        <Handle type="target" position={Position.Left} />
        <div className="icon">{'△'}</div>
        <div className="label">{data?.label}</div>
        <Handle type="source" position={Position.Right} />
      </React.Fragment>
    )
  }
  const MemoizedChildNode = React.memo(ChildNode)
  const INITIAL_NODES: GroupedNode[] = [
    {
      id: 'group-1',
      type: 'group',
      position: {
        x: 0,
        y: 0,
      },
      style: {
        width: 300,
        height: 300,
      },
      data: {},
    },
    {
      id: '1',
      type: 'node',
      parentId: 'group-1',
      position: {
        x: 125,
        y: 100,
      },
      data: {
        label: 'Node 1',
      },
      extent: 'parent' as const,
    },
    {
      id: '2',
      type: 'node',
      position: {
        x: 500,
        y: 100,
      },
      data: {
        label: 'Node 2',
      },
    },
  ]
  const INITIAL_EDGES: Edge[] = []
  const sortGroupsFirst = (firstNode: GroupedNode, secondNode: GroupedNode) =>
    firstNode.type === secondNode.type
      ? 0
      : firstNode.type === 'group' && secondNode.type !== 'group'
        ? -1
        : 1
  /**
   * 将拖入节点的画布位置转换为父节点局部位置，并限制在父节点测量边界内。
   * 左/上越界时贴到零点，右/下越界时使用父尺寸减子尺寸，内部位置减去父坐标。
   * 沿用示例的原地位置更新方式；调用方必须在更新图状态的流程中使用此函数。
   */
  const getClampedRelativePosition = (node: GroupedNode, parentNode: GroupedNode) => {
    const relativePosition = node.position ?? {
      x: 0,
      y: 0,
    }
    const nodeWidth = node.measured?.width ?? 0
    const nodeHeight = node.measured?.height ?? 0
    const parentWidth = parentNode.measured?.width ?? 0
    const parentHeight = parentNode.measured?.height ?? 0
    if (relativePosition.x < parentNode.position.x) {
      relativePosition.x = 0
    } else {
      if (relativePosition.x + nodeWidth > parentNode.position.x + parentWidth) {
        relativePosition.x = parentWidth - nodeWidth
      } else {
        relativePosition.x -= parentNode.position.x
      }
    }
    if (relativePosition.y < parentNode.position.y) {
      relativePosition.y = 0
    } else {
      if (relativePosition.y + nodeHeight > parentNode.position.y + parentHeight) {
        relativePosition.y = parentHeight - nodeHeight
      } else {
        relativePosition.y -= parentNode.position.y
      }
    }
    return relativePosition
  }
  /**
   * 拖动时用相交检测寻找候选 group，更新分组高亮和当前节点位置。
   * 拖动结束后，把节点挂到首个相交分组，并将画布坐标转换为受约束的局部坐标。
   * 节点排序保证父组在子节点之前，满足 React Flow 解析父子关系的顺序要求。
   * 事件采用官方 OnNodeDrag 类型，同时覆盖鼠标和触摸输入。
   */
  function useParentChildDrag() {
    const { getIntersectingNodes, getNodes, setNodes } = useReactFlow<GroupedNode, Edge>()
    return {
      onNodeDragStop: React.useCallback<OnNodeDrag<GroupedNode>>(
        /* 建立父子关系后将父分组排序到子节点之前，满足 React Flow 的父节点解析顺序。 */ (
          _dragEvent,
          draggedNode,
        ) => {
          if (draggedNode.type !== 'node' && !draggedNode.parentId) {
            return
          }
          const intersectingGroups = getIntersectingNodes(draggedNode).filter(
            (candidateNode) => candidateNode.type === 'group',
          )
          const targetGroup = intersectingGroups[0]
          if (targetGroup && draggedNode.parentId !== targetGroup.id) {
            setNodes(
              getNodes()
                .map((node) => {
                  if (node.id === targetGroup.id) {
                    return {
                      ...node,
                      className: '',
                    }
                  }
                  if (node.id === draggedNode.id) {
                    const relativePosition = getClampedRelativePosition(node, targetGroup) ?? {
                      x: 0,
                      y: 0,
                    }
                    return {
                      ...node,
                      position: relativePosition,
                      parentId: targetGroup.id,
                      extent: 'parent' as const,
                    }
                  }
                  return node
                })
                .sort(sortGroupsFirst),
            )
          }
        },
        [getIntersectingNodes, getNodes, setNodes],
      ),
      onNodeDrag: React.useCallback<OnNodeDrag<GroupedNode>>(
        (_dragEvent, draggedNode) => {
          if (draggedNode.type !== 'node' && !draggedNode.parentId) {
            return
          }
          const intersectingGroups = getIntersectingNodes(draggedNode).filter(
            (candidateNode) => candidateNode.type === 'group',
          )
          const groupHighlightClass =
            intersectingGroups.length && draggedNode.parentId !== intersectingGroups[0]?.id
              ? 'active'
              : ''
          console.log(groupHighlightClass)
          setNodes((currentNodes) =>
            currentNodes.map((node) =>
              node.type === 'group'
                ? {
                    ...node,
                    className: groupHighlightClass,
                  }
                : node.id === draggedNode.id
                  ? {
                      ...node,
                      position: draggedNode.position,
                    }
                  : {
                      ...node,
                    },
            ),
          )
        },
        [getIntersectingNodes, setNodes],
      ),
    }
  }
  const PRO_OPTIONS = {
    hideAttribution: true,
  }
  const NODE_TYPES = {
    node: MemoizedChildNode,
  }
  function ParentChildRelationFlow() {
    const [nodes, , onNodesChange] = useNodesState(INITIAL_NODES)
    const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
    const onConnect = React.useCallback(
      (connection: Connection) => setEdges((currentEdges) => addEdge(connection, currentEdges)),
      [setEdges],
    )
    const { onNodeDrag, onNodeDragStop } = useParentChildDrag()
    return (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onEdgesChange={onEdgesChange}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        proOptions={PRO_OPTIONS}
        fitView
        selectNodesOnDrag={false}
        nodeTypes={NODE_TYPES}
        colorMode="system"
      >
        <Background color="#bbb" gap={50} variant={BackgroundVariant.Dots} />
      </ReactFlow>
    )
  }
  const initialElement = (
    <React.StrictMode>
      <ReactFlowProvider>
        <ParentChildRelationFlow />
      </ReactFlowProvider>
    </React.StrictMode>
  )
  return function ExampleRoot() {
    return initialElement
  }
}
function ParentChildRelationCanvas() {
  // 惰性保存组件类型，使普通重渲染沿用同一份图状态；工作台重置时重新挂载。
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { ParentChildRelationCanvas as default }
