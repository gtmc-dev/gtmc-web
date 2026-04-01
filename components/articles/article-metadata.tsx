"use client"

import { formatAbsoluteTime, formatRelativeTime } from "@/lib/format-time"
import Image from "next/image"
import Link from "next/link"
import { useState } from "react"
import { CornerBrackets } from "@/components/ui/corner-brackets"

interface ArticleMetadataProps {
  author: string
  coAuthors?: string[]
  createdAt: string
  lastModified: string
  canonicalUrl: string
  filePath: string
  wordCount: number
  readingTime: number
  editPath: string
}

export function ArticleMetadata({
  author,
  coAuthors = [],
  createdAt,
  lastModified,
  canonicalUrl,
  filePath,
  wordCount,
  readingTime,
  editPath,
}: ArticleMetadataProps) {
  const [copied, setCopied] = useState(false)

  const getAvatarUrl = (username: string) => {
    return `https://github.com/${username}.png`
  }

  const allContributors = [author, ...coAuthors]
  const displayContributors = allContributors.slice(0, 5)
  const remainingCount = allContributors.length - 5

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(canonicalUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  return (
    <div
      className="
        relative border guide-line bg-white/80 p-4 font-mono text-xs
        text-tech-main
        sm:p-6
      ">
      <CornerBrackets />

      {/* System Label */}
      <div
        className="mb-4 flex flex-wrap justify-between text-tech-main/50">
        <span className="flex items-center gap-2">
          <span className="size-2 animate-pulse bg-tech-main/50" />
          SYS.READ_STREAM | UTF-8
        </span>
        <span>PATH: {filePath}</span>
      </div>

      {/* Reading Stats */}
      <div
        className="
          mb-4 flex flex-col gap-2 opacity-80 transition-opacity
          hover:opacity-100
          sm:flex-row sm:items-center
        ">
        <div className="flex items-center gap-1">
          <span className="opacity-50">WORD_COUNT:</span>
          <span className="font-bold">{wordCount.toLocaleString()}</span>
        </div>
        <span
          className="
            hidden opacity-30
            sm:inline
          ">
          |
        </span>
        <div className="flex items-center gap-1">
          <span className="opacity-50">EST_READ_TIME:</span>
          <span className="font-bold">{readingTime} MIN</span>
        </div>
      </div>

      {/* Edit Action */}
      <Link
        href={`/draft/new?file=${encodeURIComponent(editPath)}`}
        className="mb-4 block">
        <button
          type="button"
          className="
            relative flex size-full h-10 cursor-pointer items-center gap-2
            overflow-hidden border border-tech-main/40 bg-tech-main/10 px-4 py-2
            tracking-widest text-tech-main uppercase transition-all duration-300
            hover:bg-tech-main hover:text-white
            sm:w-auto
          ">
          <span className="font-bold">[EDIT_ARTICLE]</span>
        </button>
      </Link>

      {/* Primary Author */}
      <div
        className="
          mb-4 flex flex-col gap-3
          sm:flex-row sm:items-center sm:gap-4
        ">
        <div className="flex items-center gap-2">
          <Image
            src={getAvatarUrl(author)}
            alt={author}
            className="border guide-line"
            width={32}
            height={32}
          />
          <span className="text-sm font-bold text-tech-main-dark">{author}</span>
        </div>
      </div>

      {/* Co-Authors */}
      {coAuthors.length > 0 && (
        <div
          className="
            mb-4 flex flex-col gap-3
            sm:flex-row sm:items-center sm:gap-4
          ">
          <span className="text-tech-accent">CONTRIBUTORS:</span>
          <div className="flex items-center gap-1">
            {displayContributors.slice(1).map((contributor) => (
              <Image
                key={contributor}
                src={getAvatarUrl(contributor)}
                alt={contributor}
                className="border guide-line"
                title={contributor}
                width={20}
                height={20}
              />
            ))}
            {remainingCount > 0 && (
              <span className="ml-1 text-tech-accent">+{remainingCount}</span>
            )}
          </div>
        </div>
      )}

      {/* Edit Actions */}
      <div
        className="
          mb-4 flex flex-col gap-2
          sm:flex-row sm:gap-6
        ">
        <div>
          <span className="text-tech-accent">CREATED: </span>
          <span>{formatAbsoluteTime(createdAt)}</span>
        </div>
        <div>
          <span className="text-tech-accent">LAST_EDITED: </span>
          <span>{formatRelativeTime(lastModified)}</span>
        </div>
      </div>

      <div
        className="
          flex flex-col gap-2
          sm:flex-row sm:items-center
        ">
        <span className="text-tech-accent">URL:</span>
        <div className="flex flex-1 items-center gap-2">
          <code
            className="flex-1 truncate border guide-line bg-tech-bg px-2 py-1">
            {canonicalUrl}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="
              border guide-line bg-white px-3 py-1 transition-opacity
              hover:bg-tech-accent/10
            "
            aria-label="Copy URL">
            {copied ? "✓" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  )
}
