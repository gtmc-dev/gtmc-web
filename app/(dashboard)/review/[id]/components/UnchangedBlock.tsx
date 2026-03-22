import React, { useState } from "react"

export function UnchangedBlock({
  content,
  onChange,
}: {
  content: string
  onChange: (val: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const lines = content.split("\n")

  if (lines.length <= 8 || expanded) {
    return (
      <textarea
        className="w-full bg-transparent p-2 font-mono text-sm outline-none resize-y focus:bg-tech-main/5 text-tech-main-dark/70"
        rows={Math.max(2, lines.length + 1)}
        value={content}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  const head = lines.slice(0, 3).join("\n")
  const tail = lines.slice(-3).join("\n")
  const hiddenCount = lines.length - 6

  return (
    <div className="flex flex-col text-tech-main-dark/60 font-mono text-sm border-y border-dashed border-tech-main/20 bg-tech-main/5">
      <pre className="p-2 bg-transparent whitespace-pre-wrap">{head}</pre>
      <div
        className="mx-4 my-1 py-2 px-4 bg-tech-main/10 text-tech-main hover:bg-tech-main/20 cursor-pointer text-center text-xs rounded-sm transition-colors font-bold tracking-widest uppercase"
        onClick={() => setExpanded(true)}
      >
        ? {hiddenCount} unchanged lines hidden. Expand to view/edit
      </div>
      <pre className="p-2 bg-transparent whitespace-pre-wrap">{tail}</pre>
    </div>
  )
}
