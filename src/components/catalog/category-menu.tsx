'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Menu, X } from 'lucide-react'
import { categoryHref } from '@/catalog/category-tree'
import type { CategoryNode } from '@/types/catalog'

const linkClass =
  'font-label inline-flex min-h-11 items-center text-sm text-ink-2 no-underline transition-colors duration-150 hover:text-ink hover:underline'

function SubList({ nodes, onNavigate }: { nodes: CategoryNode[]; onNavigate: () => void }) {
  return (
    <ul>
      {nodes.map((node) => (
        <li key={node.id}>
          <Link href={categoryHref(node.path)} onClick={onNavigate} className={linkClass}>
            {node.name}
          </Link>
          {node.children.length > 0 && (
            <div className="pl-4">
              <SubList nodes={node.children} onNavigate={onNavigate} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Header category navigation: a mega menu from md up, a drawer below. Escape closes and returns focus. */
export function CategoryMenu({ tree }: { tree: CategoryNode[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const isAnyOpen = openId !== null || isDrawerOpen

  useEffect(() => {
    if (!isAnyOpen) return
    function close(returnFocus: boolean) {
      const trigger = rootRef.current?.querySelector<HTMLElement>('[aria-expanded="true"]')
      setOpenId(null)
      setIsDrawerOpen(false)
      if (returnFocus) trigger?.focus()
    }
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && close(true)
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [isAnyOpen])

  const closeAll = () => {
    setOpenId(null)
    setIsDrawerOpen(false)
  }

  return (
    <nav aria-label="Categories" ref={rootRef} className="relative border-t border-rule">
      <div className="shell-container md:hidden">
        <button
          type="button"
          aria-expanded={isDrawerOpen}
          aria-controls="category-drawer"
          onClick={() => setIsDrawerOpen((open) => !open)}
          className="font-label inline-flex min-h-11 items-center gap-2 text-sm text-ink"
        >
          {isDrawerOpen ? (
            <X aria-hidden className="size-4" />
          ) : (
            <Menu aria-hidden className="size-4" />
          )}
          <span>Browse categories</span>
        </button>
      </div>
      {isDrawerOpen && (
        <div
          id="category-drawer"
          className="absolute inset-x-0 top-full z-(--z-dropdown) max-h-[70dvh] overflow-y-auto border-b border-rule bg-paper md:hidden"
        >
          <div className="shell-container py-3">
            <SubList nodes={tree} onNavigate={closeAll} />
          </div>
        </div>
      )}

      <ul className="shell-container hidden gap-6 md:flex">
        {tree.map((node) => {
          const isOpen = openId === node.id
          if (node.children.length === 0) {
            return (
              <li key={node.id}>
                <Link href={categoryHref(node.path)} className={linkClass}>
                  {node.name}
                </Link>
              </li>
            )
          }
          return (
            <li key={node.id}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`menu-${node.id}`}
                onClick={() => setOpenId(isOpen ? null : node.id)}
                className={`${linkClass} gap-1`}
              >
                {node.name}
                <ChevronDown aria-hidden className="size-3.5" />
              </button>
              {isOpen && (
                <div
                  id={`menu-${node.id}`}
                  className="absolute inset-x-0 top-full z-(--z-dropdown) border-b border-rule bg-paper"
                >
                  <div className="shell-container grid grid-cols-3 gap-8 py-6">
                    <Link
                      href={categoryHref(node.path)}
                      onClick={closeAll}
                      className="font-label col-span-3 text-sm text-ink underline"
                    >
                      All {node.name.toLowerCase()}
                    </Link>
                    {node.children.map((child) => (
                      <div key={child.id}>
                        <Link
                          href={categoryHref(child.path)}
                          onClick={closeAll}
                          className="font-label inline-flex min-h-11 items-center text-ink"
                        >
                          {child.name}
                        </Link>
                        <SubList nodes={child.children} onNavigate={closeAll} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
