import type { Category, CategoryTreeNode } from '@ecommerce/shared/contracts'

/**
 * Funções PURAS de árvore: recebem a lista plana, devolvem estrutura. Sem Prisma,
 * sem I/O — testáveis em milissegundos. É o que justifica a pasta domain/ aqui:
 * a montagem e a detecção de ciclo são a parte com regra, e ela não precisa de banco.
 */

/**
 * Monta a floresta a partir da lista plana (adjacency list → árvore).
 *
 * Uma passada para indexar, uma para ligar: O(n), não O(n²). Cada nó é ligado ao
 * pai; os sem pai (ou com pai fora da lista) viram raízes. Irmãos saem ordenados
 * por position e depois name — a mesma ordem que o admin exibe.
 */
export const buildTree = (
  categories: Array<Category & { productCount: number }>,
): CategoryTreeNode[] => {
  const nodes = new Map<string, CategoryTreeNode>()
  for (const c of categories) nodes.set(c.id, { ...c, children: [] })

  const roots: CategoryTreeNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sortRec = (list: CategoryTreeNode[]): void => {
    list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'pt-BR'))
    for (const n of list) sortRec(n.children)
  }
  sortRec(roots)

  return roots
}

/**
 * Uma categoria pode ser filha de `candidateParentId` sem criar ciclo?
 *
 * Mover a categoria A para debaixo de sua própria descendente B faria B ser
 * ancestral e descendente de A ao mesmo tempo — uma árvore que se morde. A busca
 * sobe de candidateParent até a raiz: se topar com a própria categoria no
 * caminho, o movimento fecha um ciclo.
 *
 * `childrenByParent` já indexado pelo chamador — esta função continua pura.
 */
export const wouldCreateCycle = (
  categoryId: string,
  candidateParentId: string,
  parentOf: Map<string, string | null>,
): boolean => {
  if (categoryId === candidateParentId) return true

  let cursor: string | null = candidateParentId
  const seen = new Set<string>()

  while (cursor) {
    if (cursor === categoryId) return true
    // Dados corrompidos com um ciclo pré-existente não podem virar loop infinito.
    if (seen.has(cursor)) return false
    seen.add(cursor)
    cursor = parentOf.get(cursor) ?? null
  }

  return false
}
