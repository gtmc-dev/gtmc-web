"use client"

import * as React from "react"

import { EditorTabStrip } from "@/components/editor/editor-tab-strip"
import { EditorTextarea } from "@/components/editor/editor-textarea"
import { EditorToolbar } from "@/components/editor/editor-toolbar"
import { LazyMarkdownPreview } from "@/components/editor/lazy-markdown-preview"
import { ReviewFileList } from "@/components/review/review-file-list"
import { ModeSelector } from "@/components/review/mode-selector"
import { RebaseProgress } from "@/components/review/rebase-progress"
import {
  selectModeAction,
  abortResolutionAction,
  finalizeReviewAction,
} from "@/actions/review"
import type {
  ConflictMode,
  ModeAnalysis,
  ReviewFile,
  ReviewSessionState,
} from "@/types/review"
import type { RebaseState } from "@/types/rebase"

function inferMode(revision: {
  conflictMode: string | null
  rebaseState: unknown
}): ConflictMode | null {
  if (revision.conflictMode) {
    return revision.conflictMode as ConflictMode
  }

  const rebaseState = revision.rebaseState as { status?: string } | null

  if (
    rebaseState?.status &&
    rebaseState.status !== "IDLE" &&
    rebaseState.status !== "ABORTED"
  ) {
    return "FINE_GRAINED"
  }

  return null
}

interface ReviewEditorProps {
  pr: { number: number; title: string; htmlUrl: string }
  files: ReviewFile[]
  modeAnalysis: ModeAnalysis
  revision: { id: string; conflictMode: string | null; rebaseState: unknown }
}

export function ReviewEditor({
  pr,
  files,
  modeAnalysis,
  revision,
}: ReviewEditorProps) {
  const [reviewSession, setReviewSession] = React.useState<ReviewSessionState>(
    () => ({
      mode: inferMode(revision),
      files,
      activeFileId: files[0]?.id ?? "",
      modeAnalysis,
    })
  )

  const [activeTab, setActiveTab] = React.useState<"write" | "preview">("write")

  const [fileContents, setFileContents] = React.useState<
    Record<string, string>
  >(() => Object.fromEntries(files.map((f) => [f.id, f.content])))

  const [isSelectingMode, setIsSelectingMode] = React.useState(false)
  const [isAborting, setIsAborting] = React.useState(false)
  const [isFinalizing, setIsFinalizing] = React.useState(false)

  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const activeFile =
    reviewSession.files.find((f) => f.id === reviewSession.activeFileId) ??
    reviewSession.files[0]

  const activeContent =
    fileContents[reviewSession.activeFileId] ?? activeFile?.content ?? ""

  const hasConflicts = reviewSession.files.some((f) => f.status === "conflict")

  const rebaseState = revision.rebaseState as RebaseState | null

  const handleSelectFile = (fileId: string) => {
    setReviewSession((prev) => ({ ...prev, activeFileId: fileId }))
  }

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFileContents((prev) => ({
      ...prev,
      [reviewSession.activeFileId]: e.target.value,
    }))
  }

  const insertSyntax = (prefix: string, suffix: string = "") => {
    if (!textareaRef.current) return
    const start = textareaRef.current.selectionStart
    const end = textareaRef.current.selectionEnd
    const selected = activeContent.substring(start, end)
    const newText = prefix + selected + suffix
    const next =
      activeContent.substring(0, start) + newText + activeContent.substring(end)

    setFileContents((prev) => ({
      ...prev,
      [reviewSession.activeFileId]: next,
    }))

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        textareaRef.current.selectionStart = start + prefix.length
        textareaRef.current.selectionEnd =
          start + prefix.length + selected.length
      }
    }, 0)
  }

  const handleSelectMode = async (mode: ConflictMode) => {
    setIsSelectingMode(true)
    try {
      await selectModeAction(revision.id, mode)
      setReviewSession((prev) => ({ ...prev, mode }))
    } finally {
      setIsSelectingMode(false)
    }
  }

  const handleAbort = async () => {
    setIsAborting(true)
    try {
      await abortResolutionAction(revision.id)
      setReviewSession((prev) => ({ ...prev, mode: null }))
    } finally {
      setIsAborting(false)
    }
  }

  const handleFinalize = async (options?: {
    commitTitle?: string
    commitBody?: string
  }) => {
    setIsFinalizing(true)
    try {
      await finalizeReviewAction(pr.number, options)
    } finally {
      setIsFinalizing(false)
    }
  }

  const simpleFileStatuses = reviewSession.files.map((f) => ({
    filePath: f.filePath,
    status: f.status,
  }))

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <ReviewFileList
        files={reviewSession.files}
        activeFileId={reviewSession.activeFileId}
        onSelectFile={handleSelectFile}
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 border border-tech-main/40 bg-tech-main/5 px-4 py-3 font-mono text-xs text-tech-main">
          <span className="truncate uppercase tracking-widest">
            PR_{pr.number}_ {pr.title}
          </span>
          <a
            href={pr.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 underline underline-offset-4 uppercase tracking-widest hover:text-tech-main-dark">
            OPEN_PR_
          </a>
        </div>

        {reviewSession.mode === null ? (
          <div className="border border-tech-main/40 bg-white/80 p-6 backdrop-blur-sm">
            <ModeSelector
              modeAnalysis={reviewSession.modeAnalysis}
              onSelectMode={handleSelectMode}
              hasConflicts={hasConflicts}
            />
            {isSelectingMode && (
              <p className="mt-3 font-mono text-[0.6875rem] tracking-widest uppercase text-tech-main/50 text-center">
                INITIALIZING_RESOLUTION_MODE_
              </p>
            )}
          </div>
        ) : (
          <>
            <RebaseProgress
              mode={reviewSession.mode}
              rebaseState={rebaseState}
              files={simpleFileStatuses}
              onAbort={handleAbort}
              onFinalize={handleFinalize}
              isAborting={isAborting}
              isFinalizing={isFinalizing}
            />

            <div
              className="
                relative flex min-h-[31.25rem] grow flex-col border
                border-tech-main/40 bg-white/80 backdrop-blur-sm
              ">
              <EditorTabStrip
                activeTab={activeTab}
                onTabChange={setActiveTab}
                writeId="review-editor-write-panel"
                previewId="review-editor-preview-panel"
                rightSlot={activeFile?.filePath || "UNTITLED_FILE_"}
              />

              {activeTab === "write" && (
                <EditorToolbar onInsert={insertSyntax} />
              )}

              <section
                id="review-editor-write-panel"
                role="tabpanel"
                className="editor-grow"
                hidden={activeTab !== "write"}>
                <div className="editor-surface">
                  <EditorTextarea
                    ref={textareaRef}
                    value={activeContent}
                    onChange={handleContentChange}
                    placeholder="ENTER REVIEW CONTENT... (Use Markdown)"
                  />
                </div>
              </section>

              <section
                id="review-editor-preview-panel"
                role="tabpanel"
                hidden={activeTab !== "preview"}
                className="editor-grow">
                {activeContent.trim() ? (
                  <div
                    className="
                      w-full max-w-none overflow-hidden p-6 wrap-break-word
                      selection:bg-tech-main/20 selection:text-slate-900
                      sm:p-8
                    ">
                    <LazyMarkdownPreview
                      content={activeContent}
                      rawPath={activeFile?.filePath ?? ""}
                    />
                  </div>
                ) : (
                  <p className="editor-panel">NOTHING_TO_PREVIEW_</p>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
