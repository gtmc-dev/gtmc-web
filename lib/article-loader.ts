import fs from "fs"
import path from "path"
import { type ArticleTreeNode } from "./github-repo-client"
import { shouldIgnoreDirectory, shouldIgnoreFile } from "./article-ignore"
import { parseFrontMatter } from "./frontmatter-parser"

const ARTICLES_DIR = path.join(process.cwd(), "articles")
const SUBMODULE_GIT = path.join(ARTICLES_DIR, ".git")
const SLUG_MAP_PATH = path.join(process.cwd(), "lib/slug-map.json")

const filePathToSlugKey: Record<string, string> = (() => {
  try {
    const raw = fs.readFileSync(SLUG_MAP_PATH, "utf-8")
    const slugMap = JSON.parse(raw) as Record<string, string>
    const inverted: Record<string, string> = {}
    for (const [slugKey, filePath] of Object.entries(slugMap)) {
      inverted[filePath.replace(/\.md$/i, "")] = slugKey
    }
    return inverted
  } catch {
    return {}
  }
})()

export function isSubmoduleAvailable(): boolean {
  return fs.existsSync(SUBMODULE_GIT)
}

export async function getArticleContent(
  filePath: string
): Promise<string | null> {
  if (isSubmoduleAvailable()) {
    const localPath = path.join(ARTICLES_DIR, filePath)
    try {
      return fs.readFileSync(localPath, "utf-8")
    } catch {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[article-loader] File not in submodule: ${filePath}, falling back to API`
        )
      }
    }
  }
  if (process.env.NODE_ENV === "development" && !isSubmoduleAvailable()) {
    console.warn("[article-loader] Submodule not available, using API")
  }
  return null
}

export async function getArticleTree(): Promise<ArticleTreeNode[]> {
  if (isSubmoduleAvailable()) {
    try {
      return buildArticleTree(ARTICLES_DIR)
    } catch {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[article-loader] Failed to build local tree, falling back to API"
        )
      }
    }
  }
  if (process.env.NODE_ENV === "development" && !isSubmoduleAvailable()) {
    console.warn("[article-loader] Submodule not available, using API for tree")
  }
  return []
}

function buildArticleTree(dir: string, parentPath = ""): ArticleTreeNode[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const nodes: ArticleTreeNode[] = []

  for (const entry of entries) {
    if (shouldIgnoreDirectory(entry.name)) continue
    if (!parentPath && shouldIgnoreFile(entry.name, true)) continue

    const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      const children = buildArticleTree(path.join(dir, entry.name), entryPath)
      nodes.push({
        id: entryPath,
        title: entry.name,
        slug: entryPath,
        isFolder: true,
        parentId: parentPath || null,
        children,
      })
    } else if (entry.name.endsWith(".md")) {
      const titleName = entry.name.replace(/\.md$/, "")
      const slugWithoutExt = entryPath.replace(/\.md$/, "")
      const content = fs.readFileSync(path.join(dir, entry.name), "utf-8")
      const fm = parseFrontMatter(content)
      const isReadme = entry.name.toLowerCase() === "readme.md"

      // For README.md files, try to use folder slug from slug map
      let nodeSlug: string
      if (isReadme) {
        const folderSlug =
          filePathToSlugKey[slugWithoutExt.replace(/\/readme$/i, "")]
        nodeSlug = folderSlug ?? slugWithoutExt
      } else {
        nodeSlug = filePathToSlugKey[slugWithoutExt] ?? slugWithoutExt
      }

      const mdNode: ArticleTreeNode & {
        index: number
        isAppendix: boolean
        isPreface: boolean
      } = {
        id: slugWithoutExt,
        title: isReadme
          ? fm.introTitle || fm.title || titleName
          : fm.title || titleName,
        slug: nodeSlug,
        isFolder: false,
        index: fm.index,
        isAppendix: isAppendixPath(slugWithoutExt),
        isPreface: nodeSlug === "preface",
        parentId: parentPath || null,
        children: [],
      }
      nodes.push(mdNode)
    }
  }

  nodes.sort((a, b) => {
    if (a.isFolder === b.isFolder) return a.title.localeCompare(b.title)
    return a.isFolder ? -1 : 1
  })

  return nodes
}

function isAppendixPath(relativePath: string): boolean {
  const normalizedPath = relativePath.replace(/\\/g, "/")
  const pathSegments = normalizedPath.split("/")
  return pathSegments.some(
    (segment) =>
      segment.toLowerCase().includes("appendix") || segment.includes("附录")
  )
}

export async function getArticleBuffer(
  filePath: string
): Promise<Buffer | null> {
  if (isSubmoduleAvailable()) {
    const localPath = path.join(ARTICLES_DIR, filePath)
    try {
      return fs.readFileSync(localPath)
    } catch {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[article-loader] Buffer not in submodule: ${filePath}, falling back to API`
        )
      }
    }
  }
  return null
}
