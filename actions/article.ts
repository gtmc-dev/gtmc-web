"use server"

import type { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"

import { revalidatePaths } from "@/lib/revalidation"
import {
  getMainBranchHeadSha,
  openDraftPullRequest,
  type BranchFileEntry,
} from "@/lib/article-submission"
import {
  buildMigrationTargets,
  type MigrationAssetInput,
  parseDraftTempImageRefs,
  rewriteDraftTempUrls,
} from "@/lib/draft-markdown"
import {
  createDraftFile,
  decodeStoredDraftFiles,
  deserializeDraftFilesPayload,
  getDuplicateDraftFilePaths,
  normalizeDraftFileCollection,
  serializeDraftFilesForStorage,
} from "@/lib/draft-files"
import { deleteDraftAsset, downloadDraftAsset } from "@/lib/draft-storage"
import { requireAuth } from "@/lib/auth-helpers"
import { getGitHubWriteToken } from "@/lib/github/articles-repo"
import { prisma } from "@/lib/prisma"

const EDITABLE_STATUSES = new Set(["DRAFT"])

export async function saveDraftAction(formData: FormData) {
  const session = await requireAuth()

  const userId = session.user.id

  const title = formData.get("title") as string
  const content = formData.get("content") as string
  const revisionId = formData.get("revisionId") as string | null
  const articleId = formData.get("articleId") as string | null
  const filePath = formData.get("filePath") as string | null
  const activeFileId = formData.get("activeFileId") as string | null
  const draftFilesPayload = formData.get("draftFiles") as string | null
  const token =
    (session.user as { githubPat?: string }).githubPat ||
    process.env.GITHUB_TOKEN

  const draftFiles =
    deserializeDraftFilesPayload(draftFilesPayload) ||
    normalizeDraftFileCollection({
      activeFileId: activeFileId || undefined,
      files: [
        createDraftFile({
          content: content || "",
          filePath: filePath || "",
        }),
      ],
    })

  if (!title) {
    throw new Error("Title is required")
  }

  const nextDraftStorage = serializeDraftFilesForStorage(draftFiles)

  let savedRevision: { id: string }

  if (revisionId) {
    const existing = await prisma.revision.findUnique({
      where: { id: revisionId },
    })

    if (!existing) {
      throw new Error("Draft not found")
    }

    if (existing.authorId !== userId) {
      throw new Error("Unauthorized")
    }

    if (!EDITABLE_STATUSES.has(existing.status)) {
      throw new Error("Cannot edit a draft that is already in review")
    }

    savedRevision = await prisma.revision.update({
      where: { id: revisionId },
      data: {
        articleId: articleId || existing.articleId,
        conflictContent: nextDraftStorage.conflictContent,
        content: nextDraftStorage.content,
        filePath: nextDraftStorage.filePath,
        title,
      },
    })
  } else {
    const baseMainSha = await getMainBranchHeadSha(token)
    const createData: Prisma.RevisionCreateInput = {
      baseMainSha,
      content: nextDraftStorage.content,
      ...(nextDraftStorage.conflictContent
        ? { conflictContent: nextDraftStorage.conflictContent }
        : {}),
      filePath: nextDraftStorage.filePath || undefined,
      status: "DRAFT",
      syncedMainSha: baseMainSha,
      title,
      author: { connect: { id: userId } },
    }

    if (articleId) {
      createData.article = { connect: { id: articleId } }
    }

    savedRevision = await prisma.revision.create({
      data: createData,
    })
  }

  revalidatePath("/draft")
  return { success: true, revisionId: savedRevision.id }
}

export async function submitForReviewAction(revisionId: string) {
  const session = await requireAuth()

  if (!revisionId) {
    throw new Error("Revision ID is required")
  }

  const existing = await prisma.revision.findUnique({
    where: { id: revisionId },
    include: { author: true },
  })

  if (!existing) {
    throw new Error("Revision not found")
  }

  if (existing.authorId !== session.user.id) {
    throw new Error("Unauthorized")
  }

  if (existing.status !== "DRAFT") {
    throw new Error("Only a draft can open a PR")
  }

  const storedDraftFiles = decodeStoredDraftFiles({
    content: existing.content,
    conflictContent: existing.conflictContent,
    filePath: existing.filePath,
  })
  const missingFilePath = storedDraftFiles.files.find((file) => !file.filePath)
  if (missingFilePath) {
    throw new Error(
      "Every file in a draft requires a file path before opening a PR."
    )
  }

  const duplicateFilePaths = getDuplicateDraftFilePaths(storedDraftFiles.files)
  if (duplicateFilePaths.length > 0) {
    throw new Error(
      `Duplicate file paths are not allowed in one draft: ${duplicateFilePaths.join(", ")}`
    )
  }

  const token = getGitHubWriteToken(existing.author.githubPat)
  const authorName = session.user.name || "GTMC Author"
  const authorEmail = session.user.email || "author@gtmc.dev"
  const baseMainSha =
    existing.baseMainSha || (await getMainBranchHeadSha(token))

  if (!token) {
    throw new Error(
      "Failed to create PR: missing GITHUB_ARTICLES_WRITE_PAT or another token with repo write permission."
    )
  }

  const tempPrefix = process.env.DRAFT_STORAGE_TEMP_PREFIX ?? "draft-temp"
  const parsedRefsByFileId = new Map<
    string,
    ReturnType<typeof parseDraftTempImageRefs>
  >()
  const referencedStoragePaths = new Set<string>()
  const urlToRepoPath = new Map<string, string>()
  const migrationTargetsByRepoPath = new Map<
    string,
    { assetId: string; storagePath: string; repoPath: string }
  >()
  const migratedAssetsById = new Map<
    string,
    { assetId: string; repoPath: string }
  >()
  const allStoragePathsToDownload = new Set<string>()

  for (const file of storedDraftFiles.files) {
    const refs = parseDraftTempImageRefs(file.content, tempPrefix)
    parsedRefsByFileId.set(file.id, refs)

    for (const ref of refs) {
      referencedStoragePaths.add(ref.storagePath)
    }
  }

  if (referencedStoragePaths.size > 0) {
    const draftAssets = (await (prisma as any).draftAsset.findMany({
      where: { revisionId },
      select: {
        id: true,
        storagePath: true,
        filename: true,
        contentHash: true,
        mimeType: true,
      },
    })) as Array<{
      id: string
      storagePath: string
      filename: string
      contentHash: string | null
      mimeType: string
    }>
    const draftAssetByStoragePath = new Map(
      draftAssets.map((asset) => [asset.storagePath, asset])
    )

    for (const storagePath of referencedStoragePaths) {
      if (!draftAssetByStoragePath.has(storagePath)) {
        throw new Error(
          `Referenced draft asset is missing from database: ${storagePath}`
        )
      }
    }

    for (const file of storedDraftFiles.files) {
      const refs = parsedRefsByFileId.get(file.id) || []
      if (refs.length === 0) {
        continue
      }

      const uniqueStoragePaths = [
        ...new Set(refs.map((ref) => ref.storagePath)),
      ]
      const migrationAssets: MigrationAssetInput[] = uniqueStoragePaths.map(
        (storagePath) => {
          const matchingAsset = draftAssetByStoragePath.get(storagePath)
          if (!matchingAsset) {
            throw new Error(
              `Referenced draft asset is missing from database: ${storagePath}`
            )
          }

          return {
            id: matchingAsset.id,
            storagePath: matchingAsset.storagePath,
            filename: matchingAsset.filename,
            contentHash: matchingAsset.contentHash,
          }
        }
      )

      const migrationTargets = buildMigrationTargets(
        file.filePath,
        migrationAssets
      )
      const repoPathByStoragePath = new Map(
        migrationTargets.map((target) => [target.storagePath, target.repoPath])
      )

      for (const ref of refs) {
        const repoPath = repoPathByStoragePath.get(ref.storagePath)
        if (!repoPath) {
          throw new Error(
            `Failed to resolve migration target for storage path: ${ref.storagePath}`
          )
        }

        urlToRepoPath.set(ref.url, repoPath)
      }

      for (const target of migrationTargets) {
        const repoPathKey = target.repoPath.toLowerCase()
        if (!migrationTargetsByRepoPath.has(repoPathKey)) {
          migrationTargetsByRepoPath.set(repoPathKey, {
            assetId: target.assetId,
            storagePath: target.storagePath,
            repoPath: target.repoPath,
          })
        }

        if (!migratedAssetsById.has(target.assetId)) {
          migratedAssetsById.set(target.assetId, {
            assetId: target.assetId,
            repoPath: target.repoPath,
          })
        }

        allStoragePathsToDownload.add(target.storagePath)
      }
    }
  }

  const rewrittenDraftFiles =
    urlToRepoPath.size === 0
      ? storedDraftFiles.files
      : storedDraftFiles.files.map((file) => ({
          ...file,
          content: rewriteDraftTempUrls(file.content, urlToRepoPath),
        }))

  const downloadedAssetByStoragePath = new Map<string, Buffer>()
  if (allStoragePathsToDownload.size > 0) {
    await Promise.all(
      [...allStoragePathsToDownload].map(async (storagePath) => {
        const downloaded = await downloadDraftAsset(storagePath)
        downloadedAssetByStoragePath.set(storagePath, downloaded)
      })
    )
  }

  const imageEntries: BranchFileEntry[] = [
    ...migrationTargetsByRepoPath.values(),
  ].map((target) => {
    const content = downloadedAssetByStoragePath.get(target.storagePath)
    if (!content) {
      throw new Error(
        `Missing downloaded draft asset content: ${target.storagePath}`
      )
    }

    return {
      path: target.repoPath,
      content,
    }
  })

  try {
    const result = await openDraftPullRequest({
      activeFileId: storedDraftFiles.activeFileId,
      authorEmail,
      files: rewrittenDraftFiles,
      ...(imageEntries.length > 0 ? { imageEntries } : {}),
      title: existing.title,
      baseMainSha,
      authorName,
      draftId: existing.id,
      token,
    })

    const syncedDraftStorage = serializeDraftFilesForStorage({
      activeFileId: result.activeFileId,
      files: result.files,
    })

    await prisma.$transaction(async (tx) => {
      if (migratedAssetsById.size > 0) {
        const migratedAt = new Date()

        await Promise.all(
          [...migratedAssetsById.values()].map((target) =>
            (tx as any).draftAsset.update({
              where: { id: target.assetId },
              data: {
                status: "migrated-to-repo",
                migratedRepoPath: target.repoPath,
                githubPrNum: result.prNumber,
                migratedAt,
              },
            })
          )
        )
      }

      await tx.revision.update({
        where: { id: revisionId },
        data: {
          baseMainSha,
          conflictContent: syncedDraftStorage.conflictContent,
          content: syncedDraftStorage.content,
          filePath: syncedDraftStorage.filePath,
          githubPrNum: result.prNumber,
          githubPrUrl: result.prUrl,
          prBranchName: result.branchName,
          status: result.status,
          submittedAt: new Date(),
          syncedMainSha: result.syncedMainSha,
        },
      })
    })

    revalidatePaths(["/draft", "/review"])
    return { success: true, status: result.status }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    if (message.includes("Resource not accessible by personal access token")) {
      throw new Error(
        "Failed to create PR: the configured GitHub token cannot create branches in the Articles repo. Set GITHUB_ARTICLES_WRITE_PAT with repo write access on Vercel."
      )
    }
    throw error
  }
}

export async function deleteDraftAction(revisionId: string) {
  const session = await requireAuth()

  const userId = session.user.id
  const existing = await prisma.revision.findUnique({
    where: { id: revisionId },
  })

  if (!existing) {
    throw new Error("Draft not found")
  }

  if (existing.authorId !== userId) {
    throw new Error("Unauthorized to delete this draft")
  }

  if (
    existing.githubPrNum ||
    existing.status === "IN_REVIEW" ||
    existing.status === "SYNC_CONFLICT"
  ) {
    throw new Error("Cannot delete a draft after a PR has been opened")
  }

  const draftAssets = await (prisma as any).draftAsset.findMany({
    where: { revisionId },
  })

  for (const asset of draftAssets) {
    try {
      await deleteDraftAsset(asset.storagePath)
      await (prisma as any).draftAsset.update({
        where: { id: asset.id },
        data: { status: "deleted", deletedAt: new Date() },
      })
    } catch (error) {
      await (prisma as any).draftAsset.update({
        where: { id: asset.id },
        data: {
          status: "cleanup-failed",
          cleanupAttempts: { increment: 1 },
          cleanupFailedAt: new Date(),
          cleanupFailureReason:
            error instanceof Error ? error.message : "Unknown error",
        },
      })
    }
  }

  await prisma.revision.delete({
    where: { id: revisionId },
  })

  revalidatePath("/draft")
  return { success: true }
}
