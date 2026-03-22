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
        className="
          focus:bg-tech-main/5
          text-tech-main-dark/70 w-full resize-y bg-transparent p-2 font-mono
          text-sm outline-none
        "
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
    <div className="
      text-tech-main-dark/60 border-tech-main/20 bg-tech-main/5 flex flex-col
      border-y border-dashed font-mono text-sm
    ">
      <pre className="bg-transparent p-2 whitespace-pre-wrap">{head}</pre>
      <div
        className="
          bg-tech-main/10 text-tech-main
          hover:bg-tech-main/20
          mx-4 my-1 cursor-pointer rounded-sm px-4 py-2 text-center text-xs
          font-bold tracking-widest uppercase transition-colors
        "
        onClick={() => setExpanded(true)}
      >
        ? {hiddenCount} unchanged lines hidden. Expand to view/edit
      </div>
      <pre className="bg-transparent p-2 whitespace-pre-wrap">{tail}</pre>
    </div>
  )
}
