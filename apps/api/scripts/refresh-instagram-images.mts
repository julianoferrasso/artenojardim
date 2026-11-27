import { prisma } from '../src/config/prisma.js'
import { initStoreContext, getActiveStoreId } from '../src/shared/store-context.js'
import { reimportInstagramPostImage } from '../src/modules/instagram/service.js'

// Manutenção: baixa de novo a foto de todos os posts do Instagram da loja.
// Existe porque as primeiras vieram da og:image, que o Instagram entrega como o
// topo-centro com 60% da largura — na vitrine pareciam "com zoom". Agora a foto
// sai do `/embed/`, no quadro inteiro. Foto enviada à mão pelo lojista fica.
//
//   pnpm --filter @ecommerce/api exec tsx --env-file=.env scripts/refresh-instagram-images.mts
//
// Com dev e produção no mesmo banco, rodar daqui já vale para a loja. Depois,
// revalide a loja (cache de dados da home).
await initStoreContext()

const posts = await prisma.instagramPost.findMany({
  where: { storeId: getActiveStoreId() },
  select: { id: true, shortcode: true },
  orderBy: { position: 'asc' },
})

let updated = 0
let fromOg = 0
const failed: string[] = []

for (const post of posts) {
  try {
    const result = await reimportInstagramPostImage(post.id)
    if (result.status === 'skipped') {
      console.log(`= ${post.shortcode}: ${result.reason}`)
      continue
    }
    updated++
    if (result.source === 'og') fromOg++
    console.log(`✓ ${post.shortcode}: ${result.source} · ${Math.round(result.size / 1024)} KB`)
  } catch {
    // Uma falha (post removido, bloqueio) não pode parar os outros.
    failed.push(post.shortcode)
    console.log(`✗ ${post.shortcode}: o Instagram não entregou a foto`)
  }
}

console.log(
  `\n${posts.length} posts · ${updated} atualizados (${fromOg} ainda pela og:image) · ${failed.length} falharam`,
)
await prisma.$disconnect()
