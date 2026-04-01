"use client"

import { formatAbsoluteTime, formatRelativeTime } from "@/lib/format-time"
import Image from "next/image"
import Link from "next/link"
import { useState } from "react"
import { CornerBrackets } from "@/components/ui/corner-brackets"

interface ArticleMetadataProps {
  title: string
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
  title,
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
    <header
      className="
        relative mb-8 flex flex-col gap-2 border guide-line bg-white/80 p-4
        font-mono text-xs text-tech-main
        sm:gap-4 sm:p-6
      ">
      <CornerBrackets />



      {/* System Label */}
      <div
        className="flex flex-wrap justify-between text-tech-main/50">
        <span className="flex items-center gap-2">
          <span className="size-2 animate-pulse bg-tech-main/50" />
          SYS.READ_STREAM | UTF-8
        </span>
        <span>PATH: {filePath}</span>
      </div>


      <div className="
        flex flex-col items-baseline gap-4
        sm:flex-row sm:items-center sm:justify-between
      ">
        <div className="flex flex-row items-center gap-2">
          {/* Primary Author */}
          <span
            className="flex flex-col">
            <span className="flex items-center gap-2">
              <span className="
                relative size-6 border guide-line
                sm:size-10
              ">
                <Link href={`https://github.com/${author}`} target="_blank">
                  <Image
                    src={getAvatarUrl(author)}
                    alt={author}
                    className="border guide-line"
                    fill
                  />
                </Link>
              </span>
              <Link href={`https://github.com/${author}`} target="_blank" className="
                text-xs text-tech-main underline
              ">
                {author}
              </Link>
            </span>
          </span>

          <span className="text-tech-accent">&&</span>

          {/* Co-Authors */}
          {coAuthors.length > 0 && (
            <span
              className="
                flex flex-col gap-3
                sm:flex-row sm:items-center sm:gap-4
              ">
              <span className="flex items-center gap-1">
                {displayContributors.slice(1).map((contributor) => (
                  <span key={contributor} className="
                    relative size-4 border guide-line
                    sm:size-6
                  ">
                    <Link href={`https://github.com/${contributor}`} target="_blank">
                      <Image
                        src={getAvatarUrl(contributor)}
                        alt={contributor}
                        fill
                        title={contributor}
                        className="absolute top-0 left-0"
                      />
                    </Link>
                  </span>
                ))}
                {remainingCount > 0 && (
                  <span className="ml-1 text-tech-accent">+{remainingCount}</span>
                )}
              </span>
            </span>
          )}
        </div>
        <Link
          href={`/draft/new?file=${encodeURIComponent(editPath)}`}
          className="block">
          <button
            type="button"
            className="
              size-full cursor-pointer items-center overflow-hidden border
              border-tech-main/40 bg-tech-main/5 px-3 py-2 text-tech-main
              uppercase transition-all duration-300
              hover:bg-tech-main hover:text-white
            ">
            [EDIT_ARTICLE]
          </button>
        </Link>
      </div>

      <hr className="my-2 border-tech-main/40" />

      <h1
        className="
          font-mono text-xl font-bold tracking-tight text-tech-main-dark
          sm:text-2xl
        ">
        {title}
      </h1>

      <div className="text-tech-accent">

        {/* Edit History */}
        <p >
          {"CREATED: "}
          <span className="text-tech-main">{formatAbsoluteTime(createdAt)}</span>
          <br className="
            block
            sm:hidden
          " />
          <span className="
            hidden
            sm:inline
          ">{" | "}</span>
          {"LAST_EDITED: "}
          <span className="text-tech-main">{formatRelativeTime(lastModified)}</span>
          <br />

          {/* Reading Stats */}
          {"WORD_COUNT: "}
          <span className="text-tech-main">{wordCount.toLocaleString()}</span>
          <br className="
            block
            sm:hidden
          " />
          <span className="
            hidden
            sm:inline
          ">{" | "}</span>
          {"EST_READ_TIME: "}
          <span className="text-tech-main">{readingTime} MIN</span>
        </p>
      </div>

      <div
        className="flex flex-row items-center gap-2">
        <span className="text-tech-accent">URL:</span>
        <code
          className="truncate border guide-line bg-tech-accent/10 px-1.5 py-0.5">
          {canonicalUrl}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="
            border guide-line bg-white px-2 py-0.5 transition-opacity
            hover:bg-tech-accent/10
          "
          aria-label="Copy URL">
          {copied ? "✓" : "Copy"}
        </button>
      </div>

    </header >
  )
}
