"use client"

import { useState, useMemo } from "react"
import { resolveConflictAction } from "@/actions/review"
import { BrutalButton } from "@/components/ui/brutal-button"
import { InlineDiff } from "./InlineDiff"
import { UnchangedBlock } from "./UnchangedBlock"

type BlockType = "text" | "conflict"

interface TokenBlock {
  id: string
  type: BlockType
  content?: string
  current?: string
  incoming?: string
  currentName?: string
  incomingName?: string
  resolvedMode?: "current" | "incoming" | "both" | "manual" | null
  resolvedContent?: string
}

function parseConflicts(text: string): TokenBlock[] {
  const lines = text.split(/\r?\n/)
  const blocks: TokenBlock[] = []
  
  let currentBlockType = "text"
  let buffer: string[] = []
  let currentChange: string[] = []
  let incomingChange: string[] = []
  
  let currentName = "Current Change"
  let incomingName = "Incoming Change"

  const generateId = () => Math.random().toString(36).substring(7)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith("<<<<<<< ")) {
      if (buffer.length > 0) {
         blocks.push({ id: generateId(), type: "text", content: buffer.join("\n") })
         buffer = []
      }
      currentBlockType = "current"
      currentName = line.substring(8)
    } else if (line === "=======") {
      if (currentBlockType === "current") {
         currentBlockType = "incoming"
      } else {
         buffer.push(line)
      }
    } else if (line.startsWith(">>>>>>> ")) {
      if (currentBlockType === "incoming") {
         incomingName = line.substring(8)
         blocks.push({
           id: generateId(),
           type: "conflict",
           current: currentChange.join("\n"),
           incoming: incomingChange.join("\n"),
           currentName,
           incomingName,
           resolvedMode: null,
           resolvedContent: ""
         })
         currentChange = []
         incomingChange = []
         currentBlockType = "text"
      } else {
         buffer.push(line)
      }
    } else {
      if (currentBlockType === "text") buffer.push(line)
      else if (currentBlockType === "current") currentChange.push(line)
      else if (currentBlockType === "incoming") incomingChange.push(line)
    }
  }

  if (buffer.length > 0) {
    blocks.push({ id: generateId(), type: "text", content: buffer.join("\n") })
  }

  return blocks
}

export default function ConflictResolver({
  prNumber,
  filePath,
  initialContent,
}: {
  prNumber: number
  filePath: string
  initialContent: string
}) {
  const [blocks, setBlocks] = useState<TokenBlock[]>(() => parseConflicts(initialContent))
  const [viewMode, setViewMode] = useState<"visual" | "raw">("visual")
  const [rawContent, setRawContent] = useState(initialContent)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Generate final output
  const finalContent = useMemo(() => {
    if (viewMode === "raw") return rawContent
    return blocks
      .map((b) => {
        if (b.type === "text") return b.content || ""
        if (b.resolvedMode) return b.resolvedContent || ""
        return `<<<<<<< ${b.currentName}\n${b.current}\n=======\n${b.incoming}\n>>>>>>> ${b.incomingName}`
      })
      .join("\n")
  }, [blocks, viewMode, rawContent])

  const allResolved = blocks.every(
    (b) => b.type === "text" || b.resolvedMode !== null
  )

  const remainingConflicts = blocks.filter(b => b.type === "conflict" && b.resolvedMode === null).length

  function handleAccept(blockId: string, mode: "current" | "incoming" | "both") {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId || b.type !== "conflict") return b
        let resolvedContent = ""
        if (mode === "current") resolvedContent = b.current || ""
        if (mode === "incoming") resolvedContent = b.incoming || ""
        if (mode === "both")
          resolvedContent = (b.current || "") + "\n" + (b.incoming || "")
        return { ...b, resolvedMode: mode, resolvedContent }
      })
    )
  }

  function handleRevert(blockId: string) {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId || b.type !== "conflict") return b
        return { ...b, resolvedMode: null, resolvedContent: "" }
      })
    )
  }

  function updateTextContent(blockId: string, value: string) {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, content: value } : b))
    )
  }

  function updateResolvedContent(blockId: string, value: string) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId ? { ...b, resolvedContent: value, resolvedMode: "manual" } : b
      )
    )
  }

  function syncRawToBlocks() {
    setBlocks(parseConflicts(rawContent))
  }

  function syncBlocksToRaw() {
    setRawContent(finalContent)
  }

  async function handleResolve(formData: FormData) {
    setIsSubmitting(true)
    try {
      formData.set("content", finalContent)
      await resolveConflictAction(prNumber, formData)
      window.location.reload()
    } catch (err) {
      alert("Failed to resolve conflict: " + err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-l-4 border-tech-main bg-tech-main/10 p-4">
        <div>
          <p className="font-bold tracking-widest uppercase text-tech-main">
            Merge Conflict Detected
          </p>
          <p className="text-sm text-tech-main-dark">
            {viewMode === "visual"
              ? remainingConflicts === 0
                ? "All conflicts resolved! You can submit now."
                : `${remainingConflicts} conflict(s) remaining.`
              : "Raw text mode active."}
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex gap-2">
          <BrutalButton
            variant={viewMode === "visual" ? "primary" : "secondary"}
            onClick={(e) => {
              e.preventDefault()
              if (viewMode === "raw") syncRawToBlocks()
              setViewMode("visual")
            }}
          >
            Visual Mode
          </BrutalButton>
          <BrutalButton
            variant={viewMode === "raw" ? "primary" : "secondary"}
            onClick={(e) => {
              e.preventDefault()
              if (viewMode === "visual") syncBlocksToRaw()
              setViewMode("raw")
            }}
          >
            Raw Editor
          </BrutalButton>
        </div>
      </div>

      <form action={handleResolve} className="space-y-4">
        <input type="hidden" name="filePath" value={filePath} />

        <div className="bg-tech-main/5 border-tech-main/30 border p-1 rounded-sm w-full relative">
          {viewMode === "raw" ? (
            <textarea
              name="content"
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              className="text-tech-main-dark min-h-[600px] w-full resize-y bg-transparent p-4 font-mono text-sm outline-none"
            />
          ) : (
            <div className="flex flex-col min-h-[600px] bg-transparent">
              {blocks.map((b) => {
                if (b.type === "text") {
                  return (
                    <UnchangedBlock
                      key={b.id}
                      content={b.content || ""}
                      onChange={(val) => updateTextContent(b.id, val)}
                    />
                  )
                }

                if (b.resolvedMode) {
                  const linesCount = (b.resolvedContent?.split("\n").length || 0) + 1
                  return (
                    <div key={b.id} className="border border-green-500/50 bg-green-500/10 my-2 shadow-sm">
                      <div className="flex items-center justify-between bg-green-500/20 px-3 py-1 text-xs text-green-700 font-bold border-b border-green-500/30">
                        <span>Resolved ({b.resolvedMode})</span>
                        <button
                          type="button"
                          className="hover:underline text-red-600"
                          onClick={() => handleRevert(b.id)}
                        >
                          Revert
                        </button>
                      </div>
                      <textarea
                        className="w-full bg-transparent p-2 font-mono text-sm outline-none resize-y"
                        rows={Math.max(3, linesCount)}
                        value={b.resolvedContent}
                        onChange={(e) => updateResolvedContent(b.id, e.target.value)}
                      />
                    </div>
                  )
                }

                // Unresolved Conflict Block
                return (
                  <div key={b.id} className="border border-red-500/50 my-2 flex flex-col font-mono text-sm shadow-sm">
                    {/* Actions Bar */}
                    <div className="flex gap-2 p-2 bg-red-500/10 border-b border-red-500/30 text-xs text-red-800">
                      <button
                        type="button"
                        className="hover:underline font-bold"
                        onClick={() => handleAccept(b.id, "current")}
                      >
                        Accept Current
                      </button>
                      <span>|</span>
                      <button
                        type="button"
                        className="hover:underline font-bold"
                        onClick={() => handleAccept(b.id, "incoming")}
                      >
                        Accept Incoming
                      </button>
                      <span>|</span>
                      <button
                        type="button"
                        className="hover:underline font-bold"
                        onClick={() => handleAccept(b.id, "both")}
                      >
                        Accept Both
                      </button>
                    </div>

                    {/* Current Change */}
                    <div className="bg-blue-500/10 border-l-4 border-blue-500 p-2">
                      <div className="text-blue-600/80 text-xs font-bold mb-1 opacity-70">
                        {b.currentName}
                      </div>
                      <InlineDiff
                        currentText={b.current || ""}
                        incomingText={b.incoming || ""}
                        mode="current"
                      />
                    </div>

                    {/* Incoming Change */}
                    <div className="bg-green-500/10 border-l-4 border-green-500 p-2 border-t border-red-500/30">
                      <div className="text-green-600/80 text-xs font-bold mb-1 opacity-70">
                        {b.incomingName}
                      </div>
                      <InlineDiff
                        currentText={b.current || ""}
                        incomingText={b.incoming || ""}
                        mode="incoming"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <BrutalButton
          type="submit"
          variant="primary"
          disabled={isSubmitting || (viewMode === "visual" && !allResolved)}
        >
          {isSubmitting ? "RESOLVING..." : "MARK COMPLETED & SUBMIT"}
        </BrutalButton>
      </form>
    </div>
  )
}
