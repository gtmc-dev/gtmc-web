"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"

import { revalidatePaths } from "@/lib/revalidation"
import {
  resolveDraftSyncConflict,
  upsertFileOnBranch,
  upsertFilesOnBranch,
} from "@/lib/article-submission"
import {
  abortRebase,
  rebaseArticleContentMultiFile,
  rebaseArticleContent,
  resumeRebase,
} from "@/lib/article-rebase"
import { requireAuth } from "@/lib/auth-helpers"
import { requireRecentAuth } from "@/lib/admin-reauth"
import { getGithubPatForUser, requireAdmin } from "@/lib/auth-context"
import {
  decodeStoredDraftFiles,
  deserializeDraftFilesPayload,
  getActiveDraftFile,
  normalizeDraftFileCollection,
  serializeDraftFilesForStorage,
  type DraftFileCollection,
} from "@/lib/draft-files"
import { formatErrorMessage } from "@/lib/error-handling"
import {
  ARTICLES_REPO_NAME,
  ARTICLES_REPO_OWNER,
  getOctokit,
} from "@/lib/github/articles-repo"
import { reconcileDraftAssetsForPRCompletion } from "@/lib/draft-asset-reconciler"
import { prisma } from "@/lib/prisma"
import type { RebaseState } from "@/types/rebase"

const owner = ARTICLES_REPO_OWNER
const repo = ARTICLES_REPO_NAME

function applyRebasedFilesToDraft(
  draftFiles: DraftFileCollection,
  rebasedFiles?: Array<{ filePath: string; content: string }>,
  singleFileFallback?: { filePath: string; content: string },
  conflict?: { filePath?: string; content?: string | null }
) {
  const rebasedFileMap = new Map(
    (rebasedFiles ?? []).map((file) => [file.filePath, file.content])
  )

  return normalizeDraftFileCollection({
    activeFileId: draftFiles.activeFileId,
    files: draftFiles.files.map((file) => ({
      ...file,
      content:
        rebasedFileMap.get(file.filePath) ??
        (singleFileFallback && file.filePath === singleFileFallback.filePath
          ? singleFileFallback.content
          : file.content),
      conflictContent:
        conflict?.content && file.filePath === conflict.filePath
          ? conflict.content
          : undefined,
    })),
  })
}

async function persistRebasedBranchFiles(input: {
  authorEmail: string
  authorName: string
  branchName: string
  files: Array<{ filePath: string; content: string }>
  message: string
  token?: string
}) {
  if (input.files.length <= 1) {
    const file = input.files[0]
    if (!file) {
      return
    }

    await upsertFileOnBranch({
      authorEmail: input.authorEmail,
      authorName: input.authorName,
      branchName: input.branchName,
      content: file.content,
      filePath: file.filePath,
      message: input.message,
      token: input.token,
    })
    return
  }

  if (!input.token) {
    throw new Error("GitHub token is required to update multiple files")
  }

  await upsertFilesOnBranch(
    input.token,
    input.files.map((file) => ({
      path: file.filePath,
      content: file.content,
    })),
    input.branchName
  )
}

export async function mergePRAction(prNumber: number) {
  const session = await requireAuth()
  await requireAdmin(session.user.id)
  requireRecentAuth(session)

  const token = await getGithubPatForUser(session.user.id)
  const octokit = getOctokit(token)

  try {
    await octokit.pulls.merge({
      owner,
      repo,
      pull_number: prNumber,
      merge_method: "squash", //TODO: Add a UI to allow selecting between rebase and squash.
    })
    try {
      await reconcileDraftAssetsForPRCompletion({
        prNumber,
        outcome: "PR-merged",
      })
    } catch (reconcileError) {
      console.error("Failed to reconcile draft assets after PR merge", {
        prNumber,
        reconcileError,
      })
    }
    revalidatePath("/draft")
    revalidatePath("/review")
    return { success: true }
  } catch (error) {
    throw new Error(formatErrorMessage("Merge failed", error))
  }
}

export async function closePRAction(prNumber: number) {
  const session = await requireAuth()
  await requireAdmin(session.user.id)
  requireRecentAuth(session)

  const token = await getGithubPatForUser(session.user.id)
  const octokit = getOctokit(token)

  try {
    await octokit.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      state: "closed",
    })
    try {
      await reconcileDraftAssetsForPRCompletion({
        prNumber,
        outcome: "PR-closed",
      })
    } catch (reconcileError) {
      console.error("Failed to reconcile draft assets after PR close", {
        prNumber,
        reconcileError,
      })
    }
    revalidatePath("/draft")
    revalidatePath("/review")
    return { success: true }
  } catch (error) {
    throw new Error(formatErrorMessage("Close failed", error))
  }
}

export async function resolveConflictAction(
  prNumber: number,
  formData: FormData
) {
  const session = await requireAuth()
  await requireAdmin(session.user.id)
  requireRecentAuth(session)

  const content = formData.get("content") as string | null
  const draftFilesPayload = formData.get("draftFiles") as string | null

  const linkedDraft = await prisma.revision.findFirst({
    where: { githubPrNum: prNumber },
  })

  if (!linkedDraft) {
    throw new Error("Linked draft not found")
  }

  if (!linkedDraft.filePath || !linkedDraft.prBranchName) {
    throw new Error("The linked draft is missing PR metadata")
  }

  const storedDraftFiles = decodeStoredDraftFiles({
    content: linkedDraft.content,
    conflictContent: linkedDraft.conflictContent,
    filePath: linkedDraft.filePath,
  })
  const submittedDraftFiles = deserializeDraftFilesPayload(draftFilesPayload)
  const resolvedDraftFiles =
    submittedDraftFiles ||
    (content
      ? normalizeDraftFileCollection({
          activeFileId: storedDraftFiles.activeFileId,
          files: storedDraftFiles.files.map((file) => ({
            ...file,
            content:
              file.id === storedDraftFiles.activeFileId
                ? content
                : file.content,
          })),
        })
      : null)

  if (!resolvedDraftFiles) {
    throw new Error("Resolved content is required")
  }

  const token = await getGithubPatForUser(session.user.id)
  const authorName = session.user.name || "GTMC Admin"
  const authorEmail = session.user.email || "admin@gtmc.dev"

  const rebaseState = linkedDraft.rebaseState as RebaseState | null

  if (rebaseState?.status === "CONFLICT") {
    const resolvedFile = getActiveDraftFile(resolvedDraftFiles)
    const storedFile = getActiveDraftFile(storedDraftFiles)
    const result = await resumeRebase({
      draftId: linkedDraft.id,
      resolvedContent: resolvedFile.content,
      resolvedFiles: resolvedDraftFiles.files.map((file) => ({
        filePath: file.filePath,
        content: file.content,
      })),
      token,
    })

    if (result.status === "SUCCESS") {
      const rebasedDraftFiles = applyRebasedFilesToDraft(
        storedDraftFiles,
        result.files,
        { filePath: storedFile.filePath, content: result.finalContent }
      )
      await persistRebasedBranchFiles({
        authorEmail,
        authorName,
        branchName: linkedDraft.prBranchName,
        files: rebasedDraftFiles.files.map((file) => ({
          filePath: file.filePath,
          content: file.content,
        })),
        message: `docs: apply rebase for ${linkedDraft.title}`,
        token,
      })
      const rebasedDraftStorage =
        serializeDraftFilesForStorage(rebasedDraftFiles)
      await prisma.revision.update({
        where: { id: linkedDraft.id },
        data: {
          status: "IN_REVIEW",
          conflictContent: rebasedDraftStorage.conflictContent,
          content: rebasedDraftStorage.content,
          filePath: rebasedDraftStorage.filePath,
          rebaseState: {
            ...rebaseState,
            status: "COMPLETED",
            resolvedContent: result.finalContent,
          } as unknown as Prisma.InputJsonValue,
        },
      })
    } else if (result.status === "CONFLICT") {
      const conflictDraftStorage = serializeDraftFilesForStorage(
        applyRebasedFilesToDraft(storedDraftFiles, result.files, undefined, {
          filePath: result.conflictFilePath ?? storedFile.filePath,
          content: result.conflictContent,
        })
      )
      await prisma.revision.update({
        where: { id: linkedDraft.id },
        data: {
          status: "SYNC_CONFLICT",
          conflictContent: conflictDraftStorage.conflictContent,
          content: conflictDraftStorage.content,
          filePath: conflictDraftStorage.filePath,
        },
      })
    } else if (result.status === "FILE_DELETED_CONFLICT") {
      const deletedConflictDraftStorage = serializeDraftFilesForStorage(
        applyRebasedFilesToDraft(storedDraftFiles, result.files)
      )
      await prisma.revision.update({
        where: { id: linkedDraft.id },
        data: {
          status: "SYNC_CONFLICT",
          content: deletedConflictDraftStorage.content,
          filePath: deletedConflictDraftStorage.filePath,
          conflictContent: deletedConflictDraftStorage.conflictContent,
        },
      })
    } else {
      throw new Error(formatErrorMessage("Resume rebase failed", result))
    }

    revalidatePaths([
      "/draft",
      `/draft/${linkedDraft.id}`,
      "/review",
      `/review/${prNumber}`,
    ])

    return { success: true, status: result.status }
  }

  const result = await resolveDraftSyncConflict({
    activeFileId: resolvedDraftFiles.activeFileId,
    authorEmail,
    authorName,
    branchName: linkedDraft.prBranchName,
    files: resolvedDraftFiles.files.map((file) => ({
      ...file,
      conflictContent: undefined,
    })),
    syncedMainSha: linkedDraft.syncedMainSha,
    title: linkedDraft.title,
    token,
  })

  const syncedDraftStorage = serializeDraftFilesForStorage({
    activeFileId: result.activeFileId,
    files: result.files,
  })

  await prisma.revision.update({
    where: { id: linkedDraft.id },
    data: {
      conflictContent: syncedDraftStorage.conflictContent,
      content: syncedDraftStorage.content,
      filePath: syncedDraftStorage.filePath,
      status: result.status,
      syncedMainSha: result.syncedMainSha,
    },
  })

  revalidatePaths([
    "/draft",
    `/draft/${linkedDraft.id}`,
    "/review",
    `/review/${prNumber}`,
  ])

  return { success: true, status: result.status }
}

export async function submitWithRebaseAction(revisionId: string) {
  const session = await requireAuth()
  await requireAdmin(session.user.id)
  requireRecentAuth(session)

  const token = await getGithubPatForUser(session.user.id)
  const authorName = session.user.name || "GTMC Admin"
  const authorEmail = session.user.email || "admin@gtmc.dev"

  const revision = await prisma.revision.findUnique({
    where: { id: revisionId },
  })

  if (!revision) {
    throw new Error("Revision not found")
  }

  const storedDraftFiles = decodeStoredDraftFiles({
    content: revision.content,
    conflictContent: revision.conflictContent,
    filePath: revision.filePath,
  })

  const draftFile = getActiveDraftFile(storedDraftFiles)

  if (!draftFile.filePath || !revision.prBranchName) {
    throw new Error("The revision is missing PR metadata")
  }

  if (!revision.baseMainSha || !revision.syncedMainSha) {
    throw new Error("The revision is missing main SHA metadata")
  }

  const result =
    storedDraftFiles.files.length === 1
      ? await rebaseArticleContent({
          draftId: revisionId,
          filePath: draftFile.filePath,
          baseMainSha: revision.baseMainSha,
          latestMainSha: revision.syncedMainSha,
          draftContent: draftFile.content,
          token,
        })
      : await rebaseArticleContentMultiFile({
          draftId: revisionId,
          files: storedDraftFiles.files.map((file) => ({
            filePath: file.filePath,
            content: file.content,
          })),
          baseMainSha: revision.baseMainSha,
          latestMainSha: revision.syncedMainSha,
          token,
        })

  if (result.status === "SUCCESS") {
    const rebasedDraftFiles = applyRebasedFilesToDraft(
      storedDraftFiles,
      result.files,
      { filePath: draftFile.filePath, content: result.finalContent }
    )
    await persistRebasedBranchFiles({
      authorEmail,
      authorName,
      branchName: revision.prBranchName,
      files: rebasedDraftFiles.files.map((file) => ({
        filePath: file.filePath,
        content: file.content,
      })),
      message: `docs: apply fine-grained rebase for ${revision.title}`,
      token,
    })
    const rebasedDraftStorage = serializeDraftFilesForStorage(rebasedDraftFiles)
    await prisma.revision.update({
      where: { id: revisionId },
      data: {
        status: "IN_REVIEW",
        conflictContent: rebasedDraftStorage.conflictContent,
        content: rebasedDraftStorage.content,
        filePath: rebasedDraftStorage.filePath,
      },
    })
  } else if (result.status === "CONFLICT") {
    const conflictDraftStorage = serializeDraftFilesForStorage(
      applyRebasedFilesToDraft(storedDraftFiles, result.files, undefined, {
        filePath: result.conflictFilePath ?? draftFile.filePath,
        content: result.conflictContent,
      })
    )
    await prisma.revision.update({
      where: { id: revisionId },
      data: {
        status: "SYNC_CONFLICT",
        conflictContent: conflictDraftStorage.conflictContent,
        content: conflictDraftStorage.content,
        filePath: conflictDraftStorage.filePath,
      },
    })
  } else if (result.status === "FILE_DELETED_CONFLICT") {
    const deletedConflictDraftStorage = serializeDraftFilesForStorage(
      applyRebasedFilesToDraft(storedDraftFiles, result.files)
    )
    await prisma.revision.update({
      where: { id: revisionId },
      data: {
        status: "SYNC_CONFLICT",
        content: deletedConflictDraftStorage.content,
        filePath: deletedConflictDraftStorage.filePath,
        conflictContent: deletedConflictDraftStorage.conflictContent,
      },
    })
  }

  revalidatePaths(
    [
      "/draft",
      `/draft/${revisionId}`,
      "/review",
      revision.githubPrNum ? `/review/${revision.githubPrNum}` : "",
    ].filter(Boolean)
  )

  return { success: true, status: result.status }
}

export async function abortRebaseAction(revisionId: string) {
  const session = await requireAuth()
  await requireAdmin(session.user.id)
  requireRecentAuth(session)

  const token = await getGithubPatForUser(session.user.id)

  try {
    const revision = await prisma.revision.findUnique({
      where: { id: revisionId },
    })

    if (!revision) {
      throw new Error("Revision not found")
    }

    await abortRebase({
      draftId: revisionId,
      token,
    })

    revalidatePaths(
      [
        "/draft",
        `/draft/${revisionId}`,
        "/review",
        revision.githubPrNum ? `/review/${revision.githubPrNum}` : "",
      ].filter(Boolean)
    )

    return { success: true }
  } catch (error) {
    throw new Error(formatErrorMessage("Abort rebase failed", error))
  }
}

export async function keepFileAction(revisionId: string) {
  const session = await requireAuth()
  await requireAdmin(session.user.id)
  requireRecentAuth(session)

  const token = await getGithubPatForUser(session.user.id)
  const authorName = session.user.name || "GTMC Admin"
  const authorEmail = session.user.email || "admin@gtmc.dev"

  const revision = await prisma.revision.findUnique({
    where: { id: revisionId },
  })

  if (!revision) {
    throw new Error("Revision not found")
  }

  const storedDraftFiles = decodeStoredDraftFiles({
    content: revision.content,
    conflictContent: revision.conflictContent,
    filePath: revision.filePath,
  })

  if (storedDraftFiles.files.length !== 1) {
    throw new Error("Keep file only supports single-file drafts")
  }

  const draftFile = getActiveDraftFile(storedDraftFiles)

  if (!draftFile.filePath || !revision.prBranchName) {
    throw new Error("The revision is missing PR metadata")
  }

  await upsertFileOnBranch({
    authorEmail,
    authorName,
    branchName: revision.prBranchName,
    content: draftFile.content,
    filePath: draftFile.filePath,
    message: `docs: keep file despite deletion in main for ${revision.title}`,
    token,
  })

  const keptDraftStorage = serializeDraftFilesForStorage({
    activeFileId: storedDraftFiles.activeFileId,
    files: [
      {
        ...draftFile,
        conflictContent: undefined,
      },
    ],
  })

  await prisma.revision.update({
    where: { id: revisionId },
    data: {
      status: "IN_REVIEW",
      conflictContent: keptDraftStorage.conflictContent,
      content: keptDraftStorage.content,
      filePath: keptDraftStorage.filePath,
      rebaseState: Prisma.DbNull,
    },
  })

  revalidatePaths(
    [
      "/draft",
      `/draft/${revisionId}`,
      "/review",
      revision.githubPrNum ? `/review/${revision.githubPrNum}` : "",
    ].filter(Boolean)
  )

  return { success: true }
}
