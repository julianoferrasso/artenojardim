'use client'

import { useState } from 'react'
import Image from 'next/image'
import Script from 'next/script'
import { Camera } from 'lucide-react'
import type { PublicInstagramPost } from '@ecommerce/shared/contracts'
import { SnapCarousel } from '@/components/snap-carousel'
import { InstagramIcon } from '@/components/brand-icons'
import { ExpandableCaption } from '@/components/home/expandable-caption'
import { InstagramPostDialog, POST_PHOTO_SIZES } from '@/components/home/instagram-post-dialog'
import { cn } from '@/lib/utils'

const EMBED_SCRIPT = 'https://www.instagram.com/embed.js'

// No celular sobra a borda do próximo cartão: é o sinal de que dá para arrastar.
// Larguras casadas com POST_PHOTO_SIZES.
const SLIDE = 'w-3/4 shrink-0 snap-start px-1.5 sm:w-1/3 lg:w-1/4'

/**
 * O carrossel "No Instagram" no padrão "fachada" (o mesmo dos widgets de feed
 * profissionais e da recomendação do web.dev/Lighthouse): todo post é um cartão
 * NOSSO, com a foto re-hospedada no nosso storage — tamanho fixo, sem CLS e sem
 * nenhum script da Meta na carga da home.
 *
 * Post "foto" leva ao Instagram. Post "incorporado" abre a janela com o post
 * oficial (vídeo, carrossel, curtidas). O embed.js só baixa quando alguém mostra
 * intenção (mouse, foco ou toque num cartão incorporado), e quem nunca chega
 * perto não fala com a Meta.
 */
export const InstagramFeed = ({ posts }: { posts: PublicInstagramPost[] }) => {
  const [openId, setOpenId] = useState<string | null>(null)
  const [warm, setWarm] = useState(false)
  const openPost = posts.find((p) => p.id === openId) ?? null
  const warmUp = () => setWarm(true)

  return (
    <>
      {warm && (
        // onReady roda no load E a cada montagem seguinte: um post aberto antes
        // de o script chegar é processado assim que ele chega.
        <Script id="instagram-embed-js" src={EMBED_SCRIPT} onReady={() => window.instgrm?.Embeds.process()} />
      )}

      <SnapCarousel
        ariaLabel="Posts do Instagram"
        showArrows
        // Legenda é leitura: gira mais devagar que foto pura.
        autoAdvanceMs={posts.some((p) => p.captioned && p.caption) ? 6000 : 3500}
        trackClassName="-mx-1.5 items-start"
      >
        {posts.map((post) => (
          <div key={post.id} className={SLIDE}>
            {post.displayMode === 'EMBED' ? (
              <button
                type="button"
                onClick={() => {
                  setWarm(true)
                  setOpenId(post.id)
                }}
                onPointerEnter={warmUp}
                onTouchStart={warmUp}
                onFocus={warmUp}
                aria-haspopup="dialog"
                // Também pausa o autoplay do SnapCarousel enquanto a janela está aberta.
                aria-expanded={openId === post.id}
                aria-label="Abrir este post do Instagram"
                className="group block w-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <PostPhoto post={post} />
              </button>
            ) : (
              <a
                href={post.permalink}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Ver este post no Instagram"
                className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <PostPhoto post={post} />
              </a>
            )}
            {post.captioned && post.caption && <ExpandableCaption text={post.caption} />}
          </div>
        ))}
      </SnapCarousel>

      <InstagramPostDialog post={openPost} onClose={() => setOpenId(null)} />
    </>
  )
}

/**
 * A foto do cartão: quadrada e no quadro inteiro (a API a tira do `/embed/`, não
 * da og:image recortada). Entra com fade sobre o fundo do tema; o hover só
 * escurece — nada de `scale`, que lê como "zoom".
 */
const PostPhoto = ({ post }: { post: PublicInstagramPost }) => {
  const [loaded, setLoaded] = useState(false)

  return (
    <span className="relative block aspect-square overflow-hidden rounded-xl bg-secondary">
      {post.imageUrl ? (
        <Image
          src={post.imageUrl}
          alt={post.caption ?? ''}
          fill
          sizes={POST_PHOTO_SIZES}
          onLoad={() => setLoaded(true)}
          className={cn(
            'object-cover transition-opacity duration-300 motion-reduce:transition-none',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : (
        <span aria-hidden className="flex size-full items-center justify-center">
          <Camera className="size-8 text-primary-ink/50" strokeWidth={1.2} />
        </span>
      )}
      <span
        aria-hidden
        className="absolute inset-0 bg-foreground/0 transition-colors duration-300 group-hover:bg-foreground/10 group-focus-visible:bg-foreground/10"
      />
      <span
        aria-hidden
        className="absolute right-2 top-2 rounded-full bg-background/90 p-1.5 text-foreground opacity-0 shadow-soft transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        <InstagramIcon className="size-4" />
      </span>
    </span>
  )
}
