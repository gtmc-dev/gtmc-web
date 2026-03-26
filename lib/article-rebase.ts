import {
  ARTICLES_REPO_NAME,
  ARTICLES_REPO_OWNER,
  getOctokit,
} from "@/lib/github-pr"
import {
  getMergeLibrary,
  type MergeConflictBlock,
} from "./article-merge-library"
import type { RebaseCommitInfo, RebaseState } from "../types/rebase"
import { prisma } from "@/lib/prisma"

export interface RebaseInput {
  draftId: string
  filePath: string
  baseMainSha: string
  latestMainSha: string
  draftContent: string
  token?: string
}

export type RebaseOutcome =
  | {
      status: "SUCCESS"
      finalContent: string
      appliedCommits: RebaseCommitInfo[]
    }
  | {
      status: "CONFLICT"
      conflictContent: string
      conflictBlock: MergeConflictBlock
      conflictCommit: RebaseCommitInfo
      appliedCommits: RebaseCommitInfo[]
      remainingCommitShas: string[]
    }
  | { status: "NO_CHANGE"; message: string }

async function getFileSnapshot(
  filePath: string,
  ref: string,
  token?: string
): Promise<{ content: string; sha?: string } | null> {
  const octokit = getOctokit(token)

  try {
    const { data } = await octokit.repos.getContent({
      owner: ARTICLES_REPO_OWNER,
      repo: ARTICLES_REPO_NAME,
      path: filePath,
      ref,
    })

    if (Array.isArray(data) || data.type !== "file") {
      return null
    }

    return {
      content: Buffer.from(data.content, "base64").toString("utf-8"),
      sha: data.sha,
    }
  } catch {
    return null
  }
}

export async function rebaseArticleContent(
  input: RebaseInput
): Promise<RebaseOutcome> {
  const { draftId, filePath, baseMainSha, latestMainSha, draftContent, token } =
    input

  if (baseMainSha === latestMainSha) {
    return { status: "NO_CHANGE", message: "No commits to rebase" }
  }

  const octokit = getOctokit(token)

  const { data: compareData } = await octokit.repos.compareCommits({
    owner: ARTICLES_REPO_OWNER,
    repo: ARTICLES_REPO_NAME,
    base: baseMainSha,
    head: latestMainSha,
  })

  const relevantCommits: RebaseCommitInfo[] = []
  for (const commit of compareData.commits) {
    const { data: commitData } = await octokit.repos.getCommit({
      owner: ARTICLES_REPO_OWNER,
      repo: ARTICLES_REPO_NAME,
      ref: commit.sha,
    })

    const modifiedFile = commitData.files?.some((f) => f.filename === filePath)
    if (modifiedFile) {
      relevantCommits.push({
        sha: commit.sha,
        message: commit.commit.message,
        author: commit.commit.author?.name || "Unknown",
        timestamp: commit.commit.author?.date || new Date().toISOString(),
      })
    }
  }

  if (relevantCommits.length === 0) {
    return { status: "NO_CHANGE", message: "No commits modified this file" }
  }

  const initialState: RebaseState = {
    status: "IN_PROGRESS",
    commitShas: relevantCommits.map((c) => c.sha),
    currentCommitIndex: 0,
    originalContent: draftContent,
    commitInfos: relevantCommits,
  }

  await prisma.revision.update({
    where: { id: draftId },
    data: {
      rebaseState: initialState,
    },
  })

  let currentContent = draftContent
  const appliedCommits: RebaseCommitInfo[] = []
  let previousSha = baseMainSha

  for (let i = 0; i < relevantCommits.length; i++) {
    const commit = relevantCommits[i]
    const baseSnapshot = await getFileSnapshot(filePath, previousSha, token)
    const latestSnapshot = await getFileSnapshot(filePath, commit.sha, token)

    if (!baseSnapshot || !latestSnapshot) {
      continue
    }

    const mergeResult = getMergeLibrary().merge({
      baseContent: baseSnapshot.content,
      draftContent: currentContent,
      latestMainContent: latestSnapshot.content,
    })

    if (mergeResult.conflict) {
      const conflictBlock = mergeResult.blocks.find(
        (b) => b.type === "conflict"
      ) as MergeConflictBlock

      const remainingCommitShas = relevantCommits
        .slice(i + 1)
        .map((c) => c.sha)

      const conflictState: RebaseState = {
        status: "CONFLICT",
        commitShas: relevantCommits.map((c) => c.sha),
        currentCommitIndex: i,
        conflictedCommitSha: commit.sha,
        originalContent: draftContent,
        commitInfos: relevantCommits,
      }

      await prisma.revision.update({
        where: { id: draftId },
        data: {
          rebaseState: conflictState,
        },
      })

      return {
        status: "CONFLICT",
        conflictContent: mergeResult.content,
        conflictBlock,
        conflictCommit: commit,
        appliedCommits,
        remainingCommitShas,
      }
    }

    currentContent = mergeResult.content
    appliedCommits.push(commit)
    previousSha = commit.sha
  }

  const completedState: RebaseState = {
    status: "COMPLETED",
    commitShas: relevantCommits.map((c) => c.sha),
    currentCommitIndex: relevantCommits.length,
    originalContent: draftContent,
    resolvedContent: currentContent,
    commitInfos: relevantCommits,
  }

  await prisma.revision.update({
    where: { id: draftId },
    data: {
      rebaseState: completedState,
    },
  })

  return {
    status: "SUCCESS",
    finalContent: currentContent,
    appliedCommits,
  }
}
