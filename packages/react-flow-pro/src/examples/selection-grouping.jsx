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
function createExampleScope() {
  /* 解组时把父节点绝对位置加回子节点坐标，并在同一次节点更新中移除指定分组。 */
  function useDetachNodes() {
    const { setNodes, getNodes, getInternalNode } = useReactFlow()
    return React.useCallback(
      (nodeIdsToDetach, groupIdToRemove) => {
        const detachedNodeIds = new Set(nodeIdsToDetach)
        const updatedNodes = []
        for (const node of getNodes())
          if (groupIdToRemove !== node.id) {
            if (detachedNodeIds.has(node.id) && node.parentId) {
              const parentInternalNode = getInternalNode(node.parentId)
              updatedNodes.push({
                ...node,
                position: {
                  x: node.position.x + (parentInternalNode?.internals.positionAbsolute.x ?? 0),
                  y: node.position.y + (parentInternalNode?.internals.positionAbsolute.y ?? 0),
                },
                parentId: undefined,
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
  function GroupNode({ id: groupId }) {
    const detachNodes = useDetachNodes()
    const { getNodes } = useReactFlow()
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
  /* 用选区包围盒创建分组，并用节点绝对位置减去分组原点生成子节点相对坐标。 */
  function GroupSelectionToolbar() {
    const { setNodes, getNodesBounds, getNodes, getInternalNode } = useReactFlow()
    const [selectedNodes, setSelectedNodes] = React.useState([])
    useOnSelectionChange({
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
                    selected: node.selected ? false : undefined,
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
  const INITIAL_NODES = [
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
  const INITIAL_EDGES = []
  function getNodeSize(node) {
    return {
      width: node.width ?? node.measured?.width ?? 0,
      height: node.height ?? node.measured?.height ?? 0,
    }
  }
  /* 累计子节点的带内边距包围盒，同时记录子节点数量供后续分组整理使用。 */
  function expandChildBounds(bounds, childPosition, childSize, padding) {
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
  function getOrCreateChildBounds(childBoundsByParentId, parentId) {
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
  function calculateGroupAdjustment(groupNode, childBounds) {
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
  /* 逆序归并子节点包围盒，再顺序应用分组位置与尺寸调整；父组移动时对子节点减去同一偏移，以保持画布绝对位置。 */
  function fitGroups(nodes, padding = 25) {
    const groupsToRemove = new Map()
    const childBoundsByParentId = new Map()
    const adjustmentsByNodeId = new Map()
    for (let nodeIndex = nodes.length - 1; nodeIndex >= 0; nodeIndex--) {
      const node = nodes[nodeIndex]
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
    const updatedNodes = []
    for (const node of nodes) {
      if (groupsToRemove.has(node.id)) {
        continue
      }
      const removedParent = groupsToRemove.get(node.parentId || '')
      if (removedParent) {
        updatedNodes.push({
          ...node,
          position: {
            x: node.position.x + removedParent.position.x,
            y: node.position.y + removedParent.position.y,
          },
          parentId: undefined,
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
  function SelectionGroupingFlow() {
    const [nodes, setNodes] = useNodesState(INITIAL_NODES)
    const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
    const onConnect = React.useCallback(
      (connection) => setEdges((currentEdges) => addEdge(connection, currentEdges)),
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
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { SelectionGroupingCanvas as default }
