interface TreeNode {
  id: string
  title: string
  slug: string
  index: number
  isAppendix: boolean
  isPreface: boolean
  isFolder: boolean
  parentId: string | null
  children: TreeNode[]
}

interface FlatArticle {
  slug: string
  title: string
  parentPath: string
}

export function flattenArticleTree(tree: TreeNode[]): FlatArticle[] {
  const result: FlatArticle[] = []

  function dfs(nodes: TreeNode[]): void {
    for (const node of nodes) {
      if (!node.isFolder) {
        const parentPath = node.slug.split("/").slice(0, -1).join("/")
        result.push({
          slug: node.slug,
          title: node.title,
          parentPath,
        })
      }
      if (node.children.length > 0) {
        dfs(node.children)
      }
    }
  }

  dfs(tree)
  return result
}
