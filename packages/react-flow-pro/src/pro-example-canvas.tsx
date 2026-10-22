'use client'

import { lazy, Suspense, type ComponentType, type CSSProperties } from 'react'
import type { ProExampleId } from './catalog'
import './styles/index.css'

const examples = {
  'node-position-animation': lazy(() => import('./examples/node-position-animation')),
  shapes: lazy(() => import('./examples/shapes')),
  'edge-routing': lazy(() => import('./examples/edge-routing')),
  'editable-edge': lazy(() => import('./examples/editable-edge')),
  'helper-lines': lazy(() => import('./examples/helper-lines')),
  collaborative: lazy(() => import('./examples/collaborative')),
  'copy-paste': lazy(() => import('./examples/copy-paste')),
  'undo-redo': lazy(() => import('./examples/undo-redo')),
  'selection-grouping': lazy(() => import('./examples/selection-grouping')),
  'parent-child-relation': lazy(() => import('./examples/parent-child-relation')),
  'expand-collapse': lazy(() => import('./examples/expand-collapse')),
  'auto-layout': lazy(() => import('./examples/auto-layout')),
  'force-layout': lazy(() => import('./examples/force-layout')),
  'dynamic-layouting': lazy(() => import('./examples/dynamic-layouting')),
  'freehand-draw': lazy(() => import('./examples/freehand-draw')),
} satisfies Record<ProExampleId, ComponentType>

export type ProExampleCanvasProps = {
  example: ProExampleId
  className?: string
  style?: CSSProperties
}

export function ProExampleCanvas({ example, className, style }: ProExampleCanvasProps) {
  const Example = examples[example]
  return (
    <div
      className={`rf-pro-example${className ? ` ${className}` : ''}`}
      data-example={example}
      style={style}
    >
      <Suspense fallback={<div className="rf-pro-loading">加载示例…</div>}>
        <Example key={example} />
      </Suspense>
    </div>
  )
}

export function NodePositionAnimationExample() {
  return <ProExampleCanvas example="node-position-animation" />
}
export function ShapesExample() {
  return <ProExampleCanvas example="shapes" />
}
export function EdgeRoutingExample() {
  return <ProExampleCanvas example="edge-routing" />
}
export function EditableEdgeExample() {
  return <ProExampleCanvas example="editable-edge" />
}
export function HelperLinesExample() {
  return <ProExampleCanvas example="helper-lines" />
}
export function CollaborativeExample() {
  return <ProExampleCanvas example="collaborative" />
}
export function CopyPasteExample() {
  return <ProExampleCanvas example="copy-paste" />
}
export function UndoRedoExample() {
  return <ProExampleCanvas example="undo-redo" />
}
export function SelectionGroupingExample() {
  return <ProExampleCanvas example="selection-grouping" />
}
export function ParentChildRelationExample() {
  return <ProExampleCanvas example="parent-child-relation" />
}
export function ExpandCollapseExample() {
  return <ProExampleCanvas example="expand-collapse" />
}
export function AutoLayoutExample() {
  return <ProExampleCanvas example="auto-layout" />
}
export function ForceLayoutExample() {
  return <ProExampleCanvas example="force-layout" />
}
export function DynamicLayoutingExample() {
  return <ProExampleCanvas example="dynamic-layouting" />
}
export function FreehandDrawExample() {
  return <ProExampleCanvas example="freehand-draw" />
}
