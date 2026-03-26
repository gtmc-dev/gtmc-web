import { describe, expect, it, beforeEach, vi } from "vitest"

vi.mock("@/lib/github-pr")
vi.mock("@/lib/prisma", () => ({
  prisma: {
    revision: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}))

import { rebaseArticleContent } from "./article-rebase"
import type { RebaseInput } from "./article-rebase"
import { getOctokit } from "@/lib/github-pr"

describe("rebaseArticleContent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("NO_CHANGE: baseMainSha === latestMainSha", async () => {
    const input: RebaseInput = {
      draftId: "draft-1",
      filePath: "test.md",
      baseMainSha: "abc123",
      latestMainSha: "abc123",
      draftContent: "draft content",
    }

    const result = await rebaseArticleContent(input)

    expect(result.status).toBe("NO_CHANGE")
    expect(result).toHaveProperty("message")
  })

  it("NO_CHANGE: no commits modified the file", async () => {
    vi.mocked(getOctokit).mockReturnValue({
      repos: {
        compareCommits: vi.fn().mockResolvedValue({
          data: {
            commits: [
              {
                sha: "commit1",
                commit: {
                  message: "Update other file",
                  author: { name: "Author", date: "2024-01-01" },
                },
              },
            ],
          },
        }),
        getCommit: vi.fn().mockResolvedValue({
          data: { files: [{ filename: "other.md" }] },
        }),
      },
    } as any)

    const input: RebaseInput = {
      draftId: "draft-1",
      filePath: "test.md",
      baseMainSha: "abc123",
      latestMainSha: "def456",
      draftContent: "draft content",
    }

    const result = await rebaseArticleContent(input)

    expect(result.status).toBe("NO_CHANGE")
  })

  it("SUCCESS: 2 commits, both modify file, no conflicts", async () => {
    vi.mocked(getOctokit).mockReturnValue({
      repos: {
        compareCommits: vi.fn().mockResolvedValue({
          data: {
            commits: [
              {
                sha: "c1",
                commit: {
                  message: "First",
                  author: { name: "A1", date: "2024-01-01" },
                },
              },
              {
                sha: "c2",
                commit: {
                  message: "Second",
                  author: { name: "A2", date: "2024-01-02" },
                },
              },
            ],
          },
        }),
        getCommit: vi
          .fn()
          .mockResolvedValueOnce({ data: { files: [{ filename: "test.md" }] } })
          .mockResolvedValueOnce({
            data: { files: [{ filename: "test.md" }] },
          }),
        getContent: vi
          .fn()
          .mockResolvedValueOnce({
            data: {
              type: "file",
              content: Buffer.from("base").toString("base64"),
              sha: "s1",
            },
          })
          .mockResolvedValueOnce({
            data: {
              type: "file",
              content: Buffer.from("base\nline1").toString("base64"),
              sha: "s2",
            },
          })
          .mockResolvedValueOnce({
            data: {
              type: "file",
              content: Buffer.from("base\nline1").toString("base64"),
              sha: "s2",
            },
          })
          .mockResolvedValueOnce({
            data: {
              type: "file",
              content: Buffer.from("base\nline1\nline2").toString("base64"),
              sha: "s3",
            },
          }),
      },
    } as any)

    const result = await rebaseArticleContent({
      draftId: "draft-1",
      filePath: "test.md",
      baseMainSha: "abc",
      latestMainSha: "def",
      draftContent: "base\ndraft",
    })

    expect(result.status).toBe("SUCCESS")
    if (result.status === "SUCCESS") {
      expect(result.appliedCommits).toHaveLength(2)
    }
  })

  it("CONFLICT: 2 commits, commit 2 conflicts", async () => {
    vi.mocked(getOctokit).mockReturnValue({
      repos: {
        compareCommits: vi.fn().mockResolvedValue({
          data: {
            commits: [
              {
                sha: "c1",
                commit: {
                  message: "First",
                  author: { name: "A1", date: "2024-01-01" },
                },
              },
              {
                sha: "c2",
                commit: {
                  message: "Conflict",
                  author: { name: "A2", date: "2024-01-02" },
                },
              },
            ],
          },
        }),
        getCommit: vi
          .fn()
          .mockResolvedValueOnce({ data: { files: [{ filename: "test.md" }] } })
          .mockResolvedValueOnce({
            data: { files: [{ filename: "test.md" }] },
          }),
        getContent: vi
          .fn()
          .mockResolvedValueOnce({
            data: {
              type: "file",
              content: Buffer.from("line1\nline2").toString("base64"),
              sha: "s1",
            },
          })
          .mockResolvedValueOnce({
            data: {
              type: "file",
              content: Buffer.from("line1\nline2\nline3").toString("base64"),
              sha: "s2",
            },
          })
          .mockResolvedValueOnce({
            data: {
              type: "file",
              content: Buffer.from("line1\nline2\nline3").toString("base64"),
              sha: "s2",
            },
          })
          .mockResolvedValueOnce({
            data: {
              type: "file",
              content: Buffer.from("line1\nmodified\nline3").toString("base64"),
              sha: "s3",
            },
          }),
      },
    } as any)

    const result = await rebaseArticleContent({
      draftId: "draft-1",
      filePath: "test.md",
      baseMainSha: "abc",
      latestMainSha: "def",
      draftContent: "line1\ndraft modified\nline3",
    })

    expect(result.status).toBe("CONFLICT")
    if (result.status === "CONFLICT") {
      expect(result.appliedCommits).toHaveLength(1)
      expect(result.conflictCommit.sha).toBe("c2")
    }
  })

  it("SUCCESS with irrelevant commits: 3 commits, only 1 modifies file", async () => {
    vi.mocked(getOctokit).mockReturnValue({
      repos: {
        compareCommits: vi.fn().mockResolvedValue({
          data: {
            commits: [
              {
                sha: "c1",
                commit: {
                  message: "Other",
                  author: { name: "A1", date: "2024-01-01" },
                },
              },
              {
                sha: "c2",
                commit: {
                  message: "Target",
                  author: { name: "A2", date: "2024-01-02" },
                },
              },
              {
                sha: "c3",
                commit: {
                  message: "Another",
                  author: { name: "A3", date: "2024-01-03" },
                },
              },
            ],
          },
        }),
        getCommit: vi
          .fn()
          .mockResolvedValueOnce({
            data: { files: [{ filename: "other.md" }] },
          })
          .mockResolvedValueOnce({ data: { files: [{ filename: "test.md" }] } })
          .mockResolvedValueOnce({
            data: { files: [{ filename: "another.md" }] },
          }),
        getContent: vi
          .fn()
          .mockResolvedValueOnce({
            data: {
              type: "file",
              content: Buffer.from("base").toString("base64"),
              sha: "s1",
            },
          })
          .mockResolvedValueOnce({
            data: {
              type: "file",
              content: Buffer.from("base\nupdated").toString("base64"),
              sha: "s2",
            },
          }),
      },
    } as any)

    const result = await rebaseArticleContent({
      draftId: "draft-1",
      filePath: "test.md",
      baseMainSha: "abc",
      latestMainSha: "def",
      draftContent: "base\ndraft",
    })

    expect(result.status).toBe("SUCCESS")
    if (result.status === "SUCCESS") {
      expect(result.appliedCommits).toHaveLength(1)
      expect(result.appliedCommits[0].sha).toBe("c2")
    }
  })
})
