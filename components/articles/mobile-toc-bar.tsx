"use client"

import * as React from "react"
import { Link } from "@/i18n/navigation"
import { useSidebarContext } from "@/app/[locale]/(dashboard)/articles/sidebar/sidebar-context"

function useScrollProgress() {
  const [progress, setProgress] = React.useState(0)

  React.useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY
      const docHeight = document.body.scrollHeight - window.innerHeight
      setProgress(docHeight > 0 ? scrollTop / docHeight : 0)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return progress
}

export function MobileTocBar() {
  const { toc, activeHeadingId } = useSidebarContext()
  const progress = useScrollProgress()
  const [isSheetOpen, setIsSheetOpen] = React.useState(false)

  React.useEffect(() => {
    if (!isSheetOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsSheetOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [isSheetOpen])

  React.useEffect(() => {
    if (!isSheetOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [isSheetOpen])

  if (toc.length === 0) return null

  const activeItem = toc.find((item) => item.id === activeHeadingId)
  const pct = Math.round(progress * 100)

  return (
    <>
      {/* Progress strip — fixed just below sticky navbar */}
      <div className="xl:hidden fixed top-16 md:top-20 left-0 right-0 z-[49] h-0.5 bg-tech-main/10">
        <div
          className="h-full bg-tech-main transition-[width] duration-150"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Section label — fixed right-aligned in navbar row */}
      {activeItem && (
        <div className="xl:hidden fixed top-0 right-0 z-[51] flex h-16 md:h-20 items-center pr-4">
          <button
            type="button"
            onClick={() => setIsSheetOpen(true)}
            className="max-w-[40vw] truncate font-mono text-xs text-tech-main/60 hover:text-tech-main transition-colors duration-150 border-l border-tech-main/20 pl-3"
            aria-label="Open table of contents"
          >
            {activeItem.text}
          </button>
        </div>
      )}

      {/* Bottom Sheet overlay */}
      <div
        className={`xl:hidden fixed inset-0 z-[60] ${isSheetOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!isSheetOpen}
      >
        {/* Backdrop */}
        <button
          type="button"
          aria-label="Close table of contents"
          className={`absolute inset-0 w-full bg-black/20 backdrop-blur-xs transition-opacity duration-300 ${isSheetOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => setIsSheetOpen(false)}
        />

        {/* Sheet panel */}
        <div
          className={`absolute inset-x-0 bottom-0 flex flex-col max-h-[70dvh] border-t border-tech-main/30 bg-white/95 backdrop-blur-md transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isSheetOpen ? "translate-y-0" : "translate-y-full"}`}
          role="dialog"
          aria-modal="true"
          aria-label="Table of contents"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-tech-main/20 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-bold tracking-[0.12em] text-tech-main/60 uppercase">
                本文目录
              </span>
              <span className="font-mono text-xs text-tech-main/40">·</span>
              <span className="font-mono text-xs text-tech-main/50">{pct}%</span>
            </div>

            <div className="mx-4 h-0.5 flex-1 bg-tech-main/15">
              <div
                className="h-full bg-tech-main transition-[width] duration-150"
                style={{ width: `${pct}%` }}
              />
            </div>

            <button
              type="button"
              onClick={() => setIsSheetOpen(false)}
              className="cursor-pointer px-3 py-2 font-mono text-xs font-bold tracking-[0.15em] text-tech-main uppercase transition-colors hover:bg-tech-main/10"
              aria-label="Close table of contents"
            >
              CLOSE
            </button>
          </div>

          {/* TOC list */}
          <ul className="flex-1 overflow-y-auto px-4 py-3">
            {toc.map((item) => {
              const isActive = item.id === activeHeadingId
              return (
                <li key={item.id}>
                  <Link
                    href={`#${item.id}`}
                    onClick={() => setIsSheetOpen(false)}
                    className={`block border-l-[3px] py-2.5 pl-4 pr-2 text-sm leading-snug transition-all duration-200 ${
                      isActive
                        ? "border-tech-main font-semibold text-tech-main"
                        : "border-transparent text-tech-main/60 hover:border-tech-main/30 hover:text-tech-main"
                    }`}
                  >
                    {item.text}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </>
  )
}
