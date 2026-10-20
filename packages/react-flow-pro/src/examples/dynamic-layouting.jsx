import * as React from 'react'
import { timer as createAnimationTimer } from 'd3-timer'
import {
  getOutgoers,
  Position,
  getBezierPath,
  useReactFlow,
  useStore,
  ReactFlow,
  ReactFlowProvider,
  BaseEdge,
  EdgeLabelRenderer,
  Background,
  Handle,
} from '@xyflow/react'
import { stratify, tree } from 'd3-hierarchy'
function createExampleScope() {
  const workflowTreeLayout = tree()
    .nodeSize([200, 150])
    .separation(() => 1)
  const ANIMATION_OPTIONS = {
    duration: 300,
  }
  /* 用连线的 source/target 推导父子关系，构建 d3 层级树后计算坐标，再映射回 React Flow 节点。 */
  function layoutWorkflowTree(nodes, edges) {
    if (nodes.length === 0) {
      return []
    } else {
      return workflowTreeLayout(
        stratify()
          .id((workflowNode) => workflowNode.id)
          .parentId(
            (workflowNode) =>
              edges.find((incomingEdge) => incomingEdge.target === workflowNode.id)?.source,
          )(nodes),
      )
        .descendants()
        .map((hierarchyNode) => ({
          ...hierarchyNode.data,
          position: {
            x: hierarchyNode.x,
            y: hierarchyNode.y,
          },
        }))
    }
  }
  const selectNodeCount = (store) => store.nodeLookup.size
  /* 订阅节点数量触发树布局；从画布当前位置插值到新位置，首次布局后跳过 fitView，后续增删结束时调整视口。 */
  function useWorkflowLayout() {
    const firstLayoutRef = React.useRef(true)
    const nodeCount = useStore(selectNodeCount)
    const { getNodes, getNode, setNodes, setEdges, getEdges, fitView } = useReactFlow()
    React.useEffect(() => {
      const nodeTransitions = layoutWorkflowTree(getNodes(), getEdges()).map((targetNode) => ({
        id: targetNode.id,
        from: getNode(targetNode.id)?.position || targetNode.position,
        to: targetNode.position,
        node: targetNode,
      }))
      const animationTimer = createAnimationTimer((elapsedMilliseconds) => {
        const progress = elapsedMilliseconds / ANIMATION_OPTIONS.duration
        setNodes(
          nodeTransitions.map(({ node: transitionNode, from: fromPosition, to: toPosition }) => ({
            ...transitionNode,
            position: {
              x: fromPosition.x + (toPosition.x - fromPosition.x) * progress,
              y: fromPosition.y + (toPosition.y - fromPosition.y) * progress,
            },
          })),
        )
        if (elapsedMilliseconds > ANIMATION_OPTIONS.duration) {
          setNodes(
            nodeTransitions.map(({ node: transitionNode, to: toPosition }) => ({
              ...transitionNode,
              position: {
                x: toPosition.x,
                y: toPosition.y,
              },
            })),
          )
          animationTimer.stop()
          if (!firstLayoutRef.current) {
            fitView({
              duration: 200,
              padding: 0.2,
            })
          }
          firstLayoutRef.current = false
        }
      })
      return () => {
        animationTimer.stop()
      }
    }, [nodeCount, getEdges, getNodes, getNode, setNodes, fitView, setEdges])
  }
  const createWorkflowId = () =>
    new Date().getTime().toString(36) + Math.random().toString(36).slice(2)
  const FOOD_LABELS =
    '🍇 Grapes.🍈 Melon.🍉 Watermelon.🍊 Tangerine.🍋 Lemon.🍌 Banana.🍍 Pineapple.🥭 Mango.🍎 Red Apple.🍏 Green Apple.🍐 Pear.🍑 Peach.🍒 Cherries.🍓 Strawberry.🫐 Blueberries.🥝 Kiwi Fruit.🍅 Tomato.🫒 Olive.🥥 Coconut.🥑 Avocado.🍆 Eggplant.🥔 Potato.🥕 Carrot.🌽 Ear of Corn.🌶️ Hot Pepper.🫑 Bell Pepper.🥒 Cucumber.🥬 Leafy Green.🥦 Broccoli.🧄 Garlic.🧅 Onion.🍄 Mushroom.🥜 Peanuts.🌰 Chestnut.🍞 Bread.🥐 Croissant.🥖 Baguette Bread.🫓 Flatbread.🥨 Pretzel.🥯 Bagel.🥞 Pancakes.🧇 Waffle.🧀 Cheese Wedge.🍖 Meat on Bone.🍗 Poultry Leg.🥩 Cut of Meat.🥓 Bacon.🍔 Hamburger.🍟 French Fries.🍕 Pizza.🌭 Hot Dog.🥪 Sandwich.🌮 Taco.🌯 Burrito.🫔 Tamale.🥙 Stuffed Flatbread.🧆 Falafel.🥚 Egg.🍳 Cooking.🥘 Shallow Pan of Food.🍲 Pot of Food.🫕 Fondue.🥣 Bowl with Spoon.🥗 Green Salad.🍿 Popcorn.🧈 Butter.🧂 Salt.🥫 Canned Food.🍱 Bento Box.🍘 Rice Cracker.🍙 Rice Ball.🍚 Cooked Rice.🍛 Curry Rice.🍜 Steaming Bowl.🍝 Spaghetti.🍠 Roasted Sweet Potato.🍢 Oden.🍣 Sushi.🍤 Fried Shrimp.🍥 Fish Cake with Swirl.🥮 Moon Cake.🍡 Dango.🥟 Dumpling.🥠 Fortune Cookie.🥡 Takeout Box.🦪 Oyster.🍦 Soft Ice Cream.🍧 Shaved Ice.🍨 Ice Cream.🍩 Doughnut.🍪 Cookie.🎂 Birthday Cake.🍰 Shortcake.🧁 Cupcake.🥧 Pie.🍫 Chocolate Bar.🍬 Candy.🍭 Lollipop.🍮 Custard.🍯 Honey Pot.🍼 Baby Bottle.🥛 Glass of Milk.☕ Hot Beverage.🫖 Teapot.🍵 Teacup Without Handle.🍶 Sake.🍾 Bottle with Popping Cork.🍷 Wine Glass.🍸 Cocktail Glass.🍹 Tropical Drink.🍺 Beer Mug.🍻 Clinking Beer Mugs.🥂 Clinking Glasses.🥃 Tumbler Glass.🥤 Cup with Straw.🧋 Bubble Tea.🧃 Beverage Box.🧉 Mate.🧊 Ice.🥢 Chopsticks.🍽️ Fork and Knife with Plate.🍴 Fork and Knife.🥄 Spoon'.split(
      '.',
    )
  const randomFoodLabel = () => FOOD_LABELS[Math.floor(Math.random() * FOOD_LABELS.length)]
  /* 点击占位节点后将其转换成工作流节点，同时把入边转换为工作流边，并追加一个新的末端占位节点。 */
  function useActivatePlaceholder(placeholderNodeId) {
    const { getNode, setNodes, setEdges } = useReactFlow()
    return () => {
      const placeholderNode = getNode(placeholderNodeId)
      if (!placeholderNode) {
        return
      }
      const nextPlaceholderId = createWorkflowId()
      const nextPlaceholderNode = {
        id: nextPlaceholderId,
        position: {
          x: placeholderNode.position.x,
          y: placeholderNode.position.y,
        },
        type: 'placeholder',
        data: {
          label: '+',
        },
      }
      const nextPlaceholderEdge = {
        id: `${placeholderNode.id}=>${nextPlaceholderId}`,
        source: placeholderNode.id,
        target: nextPlaceholderId,
        type: 'placeholder',
      }
      setNodes((currentNodes) =>
        currentNodes
          .map((currentNode) =>
            currentNode.id === placeholderNodeId
              ? {
                  ...currentNode,
                  type: 'workflow',
                  data: {
                    label: randomFoodLabel(),
                  },
                }
              : currentNode,
          )
          .concat([nextPlaceholderNode]),
      )
      setEdges((currentEdges) =>
        currentEdges
          .map((currentEdge) =>
            currentEdge.target === placeholderNodeId
              ? {
                  ...currentEdge,
                  type: 'workflow',
                }
              : currentEdge,
          )
          .concat([nextPlaceholderEdge]),
      )
    }
  }
  const PlaceholderNode = React.memo(({ id: nodeId, data: nodeData }) => (
    <div onClick={useActivatePlaceholder(nodeId)} title="click to add a node">
      {nodeData.label}
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  ))
  /* 为工作流节点追加子节点和末端占位节点；先移除该父节点现有的占位子节点及对应连线。 */
  function useAddWorkflowChild(parentNodeId) {
    const { setEdges, setNodes, getNodes, getEdges, getNode } = useReactFlow()
    return React.useCallback(() => {
      const parentNode = getNode(parentNodeId)
      if (!parentNode) {
        return
      }
      const childNodeId = createWorkflowId()
      const placeholderNodeId = createWorkflowId()
      const childNode = {
        id: childNodeId,
        position: {
          x: parentNode.position.x,
          y: parentNode.position.y + 150,
        },
        type: 'workflow',
        data: {
          label: randomFoodLabel(),
        },
      }
      const placeholderNode = {
        id: placeholderNodeId,
        position: {
          x: childNode.position.x,
          y: childNode.position.y + 150,
        },
        type: 'placeholder',
        data: {
          label: '+',
        },
      }
      const parentToChildEdge = {
        id: `${parentNode.id}=>${childNodeId}`,
        source: parentNode.id,
        target: childNodeId,
        type: 'workflow',
      }
      const childToPlaceholderEdge = {
        id: `${childNodeId}=>${placeholderNodeId}`,
        source: childNodeId,
        target: placeholderNodeId,
        type: 'placeholder',
      }
      const replacedPlaceholderIds = getOutgoers(parentNode, getNodes(), getEdges())
        .filter((outgoingNode) => outgoingNode.type === 'placeholder')
        .map((placeholderNode) => placeholderNode.id)
      setNodes((currentNodes) =>
        currentNodes
          .filter((currentNode) => !replacedPlaceholderIds.includes(currentNode.id))
          .concat([childNode, placeholderNode]),
      )
      setEdges((currentEdges) =>
        currentEdges
          .filter((currentEdge) => !replacedPlaceholderIds.includes(currentEdge.target))
          .concat([parentToChildEdge, childToPlaceholderEdge]),
      )
    }, [getEdges, getNode, getNodes, parentNodeId, setEdges, setNodes])
  }
  const WORKFLOW_NODE_TYPES = {
    placeholder: PlaceholderNode,
    workflow: React.memo(({ id: nodeId, data: nodeData }) => (
      <div onClick={useAddWorkflowChild(nodeId)} title="click to add a child node">
        {nodeData.label}
        <Handle type="target" position={Position.Top} isConnectable={false} />
        <Handle type="source" position={Position.Bottom} isConnectable={false} />
      </div>
    )),
  }
  /* 占位边只根据端点和方向生成贝塞尔曲线路径。 */
  function PlaceholderEdge({
    id: edgeId,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
  }) {
    const [edgePath] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    })
    return <BaseEdge id={edgeId} style={style} path={edgePath} markerEnd={markerEnd} />
  }
  /* 在原边中间插入工作流节点，用两条新边替换原边，并把新节点排在原目标节点之前。 */
  function useInsertWorkflowNode(edgeId) {
    const { setEdges, setNodes, getNode, getEdge } = useReactFlow()
    return () => {
      const originalEdge = getEdge(edgeId)
      if (!originalEdge) {
        return
      }
      const targetNode = getNode(originalEdge.target)
      if (!targetNode) {
        return
      }
      const insertedNodeId = createWorkflowId()
      const insertedNode = {
        id: insertedNodeId,
        position: {
          x: targetNode.position.x,
          y: targetNode.position.y,
        },
        data: {
          label: randomFoodLabel(),
        },
        type: 'workflow',
      }
      const sourceToInsertedEdge = {
        id: `${originalEdge.source}->${insertedNodeId}`,
        source: originalEdge.source,
        target: insertedNodeId,
        type: 'workflow',
      }
      const insertedToTargetEdge = {
        id: `${insertedNodeId}->${originalEdge.target}`,
        source: insertedNodeId,
        target: originalEdge.target,
        type: 'workflow',
      }
      setEdges((currentEdges) =>
        currentEdges
          .filter((currentEdge) => currentEdge.id !== edgeId)
          .concat([sourceToInsertedEdge, insertedToTargetEdge]),
      )
      setNodes((currentNodes) => {
        const targetNodeIndex = currentNodes.findIndex(
          (currentNode) => currentNode.id === originalEdge.target,
        )
        return [
          ...currentNodes.slice(0, targetNodeIndex),
          insertedNode,
          ...currentNodes.slice(targetNodeIndex, currentNodes.length),
        ]
      })
    }
  }
  /* 使用贝塞尔路径返回的标签坐标定位加号按钮；点击按钮将当前边拆成两段。 */
  function WorkflowEdge({
    id: edgeId,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
  }) {
    const insertWorkflowNode = useInsertWorkflowNode(edgeId)
    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    })
    return (
      <React.Fragment>
        <BaseEdge id={edgeId} style={style} path={edgePath} markerEnd={markerEnd} />
        <EdgeLabelRenderer>
          <button
            style={{
              transform: `translate(${labelX}px, ${labelY}px) translate(-50%, -50%)`,
            }}
            onClick={insertWorkflowNode}
            className="edge-button nodrag nopan"
          >
            {'+'}
          </button>
        </EdgeLabelRenderer>
      </React.Fragment>
    )
  }
  const WORKFLOW_EDGE_TYPES = {
    placeholder: PlaceholderEdge,
    workflow: WorkflowEdge,
  }
  const PRO_OPTIONS = {
    account: 'paid-pro',
    hideAttribution: true,
  }
  const INITIAL_NODES = [
    {
      id: '1',
      data: {
        label: '🌮 Taco',
      },
      position: {
        x: 0,
        y: 0,
      },
      type: 'workflow',
    },
    {
      id: '2',
      data: {
        label: '+',
      },
      position: {
        x: 0,
        y: 150,
      },
      type: 'placeholder',
    },
  ]
  const INITIAL_EDGES = [
    {
      id: '1=>2',
      source: '1',
      target: '2',
      type: 'placeholder',
    },
  ]
  const FIT_VIEW_OPTIONS = {
    padding: 0.1,
  }
  function DynamicLayoutingFlow() {
    useWorkflowLayout()
    return (
      <React.Fragment>
        <ReactFlow
          defaultNodes={INITIAL_NODES}
          defaultEdges={INITIAL_EDGES}
          proOptions={PRO_OPTIONS}
          fitView
          nodeTypes={WORKFLOW_NODE_TYPES}
          edgeTypes={WORKFLOW_EDGE_TYPES}
          fitViewOptions={FIT_VIEW_OPTIONS}
          minZoom={0.2}
          nodesDraggable={false}
          nodesConnectable={false}
          zoomOnDoubleClick={false}
          deleteKeyCode={null}
          colorMode="system"
        >
          <Background />
        </ReactFlow>
      </React.Fragment>
    )
  }
  function DynamicLayoutingExample() {
    return (
      <ReactFlowProvider>
        <DynamicLayoutingFlow />
      </ReactFlowProvider>
    )
  }
  const initialElement = (
    <React.StrictMode>
      <DynamicLayoutingExample />
    </React.StrictMode>
  )
  return function ExampleRoot() {
    return initialElement
  }
}
function DynamicLayoutingCanvas() {
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { DynamicLayoutingCanvas as default }
