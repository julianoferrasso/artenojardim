import { prisma } from '../src/config/prisma.js'
import { initStoreContext, getActiveStoreId } from '../src/shared/store-context.js'
import { fetchPostMeta } from '../src/integrations/instagram/client.js'

// Manutenção: busca de novo a legenda de todos os posts do Instagram da loja.
// Existe porque as primeiras legendas foram salvas cortadas em 300 caracteres e
// sem as quebras de linha. Só lê a página do post — não baixa imagem de novo.
//
//   pnpm --filter @ecommerce/api exec tsx --env-file=.env scripts/refresh-instagram-captions.mts
//
// Com dev e produção no mesmo banco, rodar daqui (pelo túnel) já vale para a loja.
await initStoreContext()

const posts = await prisma.instagramPost.findMany({
  where: { storeId: getActiveStoreId() },
  select: { id: true, shortcode: true, permalink: true, caption: true },
  orderBy: { position: 'asc' },
})

let updated = 0
const failed: string[] = []

for (const post of posts) {
  try {
    const { caption } = await fetchPostMeta(post.permalink)
    if (caption && caption !== post.caption) {
      await prisma.instagramPost.update({ where: { id: post.id }, data: { caption } })
      updated++
      console.log(`✓ ${post.shortcode}: ${post.caption?.length ?? 0} → ${caption.length} caracteres`)
    } else {
      console.log(`= ${post.shortcode}: sem mudança`)
    }
  } catch {
    // Uma falha (post removido, bloqueio) não pode parar os outros.
    failed.push(post.shortcode)
    console.log(`✗ ${post.shortcode}: o Instagram não entregou a página`)
  }
}

console.log(`\n${posts.length} posts · ${updated} atualizados · ${failed.length} falharam`)
await prisma.$disconnect()
