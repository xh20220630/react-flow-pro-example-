'use client'

import { useEffect, useState } from 'react'
import { PRO_EXAMPLES, ProExampleCanvas, type ProExampleId } from '@react-flow-pro-example/core'
import './react-flow-pro-page.css'

function getExample(): ProExampleId {
  const id = location.hash.slice(1)
  return PRO_EXAMPLES.find((e) => e.id === id)?.id ?? 'dynamic-layouting'
}

export function ReactFlowProPage() {
  const [example, setExample] = useState(getExample)
  const [query, setQuery] = useState('')
  const [revision, setRevision] = useState(0)
  const [navOpen, setNavOpen] = useState(false)
  useEffect(() => {
    const change = () => setExample(getExample())
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  const current = PRO_EXAMPLES.find((e) => e.id === example)!
  const filtered = PRO_EXAMPLES.filter((e) =>
    `${e.name} ${e.title}`.toLowerCase().includes(query.toLowerCase()),
  )
  const categories = [...new Set(filtered.map((e) => e.category))]
  return (
    <main className="pro-workbench">
      <aside className={`example-navigation ${navOpen ? 'is-open' : ''}`}>
        <a className="workbench-brand" href="#dynamic-layouting">
          <span className="brand-mark">◈</span>
          <div>
            React Flow<span>PRO EXAMPLES · NEXT.JS</span>
          </div>
        </a>
        <label className="example-search">
          <span>⌕</span>
          <input
            placeholder="搜索功能…"
            aria-label="搜索示例"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <nav aria-label="Pro 功能示例">
          {categories.map((category) => (
            <div className="example-category" key={category}>
              <h2>{category}</h2>
              {filtered
                .filter((e) => e.category === category)
                .map((e) => (
                  <a
                    key={e.id}
                    href={`#${e.id}`}
                    className={e.id === example ? 'is-active' : ''}
                    aria-current={e.id === example ? 'page' : undefined}
                    onClick={() => setNavOpen(false)}
                  >
                    <span>{e.name}</span>
                    <small>{e.title}</small>
                  </a>
                ))}
            </div>
          ))}
          {!filtered.length && <p className="no-examples">没有匹配的功能</p>}
        </nav>
        <footer>
          <span>{PRO_EXAMPLES.length} 个本地示例</span>
          <a href="https://reactflow.dev/examples/pro-examples" target="_blank" rel="noreferrer">
            官方目录 ↗
          </a>
        </footer>
      </aside>
      <section className="example-workspace">
        <header className="example-header">
          <div>
            <button
              className="nav-toggle"
              aria-label="切换示例导航"
              aria-expanded={navOpen}
              onClick={() => setNavOpen(!navOpen)}
            >
              ☰
            </button>
            <div className="example-heading">
              <div className="example-breadcrumb">
                Pro Examples <span>/</span> {current.category}
              </div>
              <h1>{current.name}</h1>
            </div>
          </div>
          <div className="example-header-actions">
            <a
              href={`https://reactflow.dev/examples/${current.path}`}
              target="_blank"
              rel="noreferrer"
            >
              参考示例 ↗
            </a>
            <button className="reset-example" onClick={() => setRevision((n) => n + 1)}>
              ↻ 重置示例
            </button>
          </div>
        </header>
        <p className="example-instructions">{current.hint}</p>
        <div className="example-stage" key={`${example}-${revision}`}>
          <ProExampleCanvas example={example} />
        </div>
        <footer className="example-footer">
          <span>{current.title}</span>
          <span>React Flow 12 · 本地运行</span>
        </footer>
      </section>
    </main>
  )
}
