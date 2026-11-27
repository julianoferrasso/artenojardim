'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import Image from 'next/image'
import { X } from 'lucide-react'
import type { PublicInstagramPost } from '@ecommerce/shared/contracts'
import { INSTAGRAM_PROFILE, InstagramIcon } from '@/components/brand-icons'
import { ExpandableCaption } from '@/components/home/expandable-caption'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } }
  }
}

/**
 * `sizes` da foto do cartão no carrossel. A janela usa o MESMO: o navegador
 * escolhe a mesma URL do otimizador, que já está no cache, e o esqueleto nasce
 * com a foto em vez de um quadrado vazio. Mora aqui porque o carrossel importa
 * esta janela, e não o contrário.
 */
export const POST_PHOTO_SIZES = '(max-width: 640px) 75vw, (max-width: 1024px) 33vw, 288px'

type Props = {
  /** O post aberto; null = janela fechada. */
  post: PublicInstagramPost | null
  onClose: () => void
}

/**
 * Janela com o post oficial do Instagram — a "fachada" da seção: a vitrine só
 * mostra a nossa foto, e o iframe da Meta (vídeo, carrossel, curtidas) só nasce
 * aqui, depois do clique.
 *
 * `<dialog>` nativo: foco preso, Esc e o resto da página inerte vêm do
 * navegador. A janela fica ancorada no topo para que a altura do iframe, que
 * muda, só mexa na borda de baixo.
 */
export const InstagramPostDialog = ({ post, onClose }: Props) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const handleClosed = useEffectEvent(onClose)
  const shortcode = post?.shortcode

  // Abrir/fechar e o botão Voltar do celular (mesma regra da galeria): a janela
  // ganha uma entrada no histórico, e Voltar a fecha em vez de sair da home.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !shortcode) return

    const isOurEntry = () =>
      (window.history.state as { instagramDialog?: boolean } | null)?.instagramDialog === true

    if (!dialog.open) dialog.showModal()
    // Com a entrada já empilhada (o StrictMode do dev roda o efeito duas vezes),
    // não empilha outra: sobraria um Voltar que não faz nada.
    if (!isOurEntry()) window.history.pushState({ instagramDialog: true }, '')
    const onPopState = () => dialog.close()
    const onDialogClose = () => {
      // O evento `close` chega numa tarefa depois do close(): se a janela já foi
      // reaberta (remontagem do StrictMode), é eco da montagem anterior.
      if (dialog.open) return
      window.removeEventListener('popstate', onPopState)
      // Fechou pelo X, Esc ou clique fora: a entrada que empilhamos ainda está lá.
      if (isOurEntry()) window.history.back()
      handleClosed()
    }
    window.addEventListener('popstate', onPopState)
    dialog.addEventListener('close', onDialogClose)

    return () => {
      window.removeEventListener('popstate', onPopState)
      dialog.removeEventListener('close', onDialogClose)
      if (dialog.open) dialog.close()
    }
  }, [shortcode])

  return (
    <dialog
      ref={dialogRef}
      aria-label="Post do Instagram"
      // A janela ocupa a tela inteira e é transparente: o clique "fora" do cartão
      // é um clique no próprio <dialog>.
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close()
      }}
      className="m-0 size-full max-h-none max-w-none overflow-y-auto overscroll-contain border-0 bg-transparent px-4 py-6 text-foreground backdrop:bg-foreground/50 open:animate-in open:fade-in open:duration-200 sm:py-12"
    >
      {post && (
        <div className="mx-auto w-full max-w-100">
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Fechar"
              className="rounded-full border border-border bg-background/90 p-2 shadow-soft transition-colors hover:bg-accent"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* key: cada post nasce com o próprio estado de montagem. */}
          <EmbeddedPost key={post.shortcode} post={post} />

          <div className="mt-3 rounded-xl bg-card p-3 shadow-soft">
            {post.captioned && post.caption && <ExpandableCaption text={post.caption} />}
            <a
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'primary', emphasis: 'quiet' }), 'mt-3 w-full')}
            >
              <InstagramIcon className="size-4" aria-hidden />
              Ver no Instagram
            </a>
          </div>
        </div>
      )}
    </dialog>
  )
}

/**
 * O post oficial, sobre o esqueleto com a nossa foto. O código que o lojista
 * colou NUNCA chega aqui: a API guardou só o shortcode (validado por regex) e o
 * blockquote oficial é remontado com a API do DOM — nada de innerHTML com texto
 * de fora.
 *
 * O blockquote é criado fora do React de propósito: o embed.js o SUBSTITUI por
 * um iframe, e um nó que o React acha que é dele sumindo quebra o próximo render.
 */
const EmbeddedPost = ({ post }: { post: PublicInstagramPost }) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const { shortcode } = post

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const permalink = `https://www.instagram.com/p/${shortcode}/`
    const quote = document.createElement('blockquote')
    quote.className = 'instagram-media'
    quote.setAttribute('data-instgrm-permalink', `${permalink}?utm_source=ig_embed&utm_campaign=loading`)
    quote.setAttribute('data-instgrm-version', '14')
    // Nunca `data-instgrm-captioned`: a legenda do iframe não encolhe. Quem a
    // mostra é o ExpandableCaption, embaixo.
    // O embed.js COPIA este cssText para o iframe (`style = blockquote.cssText`):
    // qualquer coisa posta aqui para esconder o blockquote esconde o post junto.
    // Por isso só o estilo do código oficial, e quem esconde é o host.
    quote.style.cssText =
      'background:#FFF;border:0;border-radius:3px;margin:0;max-width:540px;min-width:326px;padding:0;width:100%'
    const link = document.createElement('a')
    link.href = permalink
    link.textContent = 'Ver este post no Instagram'
    quote.appendChild(link)
    host.replaceChildren(quote)

    // O embed.js insere o iframe com altura 0. A ordem medida no Chrome é MEASURE
    // (altura real no iframe) e, logo depois, MOUNTED, que remove o blockquote e
    // SOBRESCREVE a altura com `blockquote.clientHeight`. O nosso só tem o link
    // (~18px), e outro MEASURE não é garantido: o post virava uma tira. Por isso a
    // medida é guardada e devolvida, e só se revela com ela no iframe.
    let measured: string | null = null
    let afterMount = false
    let revealed = false
    let tallest = 0
    const watcher = new MutationObserver(() => {
      const frame = host.querySelector('iframe')
      if (!frame) return
      const height = frame.getAttribute('height')
      if (!revealed) {
        if (host.querySelector('blockquote')) {
          if (height !== '0') measured = height
          return
        }
        // A remoção e a altura do MOUNTED saem do mesmo handler: o primeiro
        // callback sem blockquote é sempre o dele. Sem medida ainda, quem chama
        // de novo é o próximo MEASURE.
        if (!afterMount) {
          afterMount = true
          if (measured) frame.setAttribute('height', measured)
          return
        }
        revealed = true
        setMounted(true)
      }
      // Montado, o embed.js segue re-medindo e alterna a altura a cada ~1s
      // (571 ↔ 532: põe e tira a linha "Adicione um comentário"). A altura só
      // cresce — sobra uma faixa em branco em vez de a janela pulsar.
      const px = Number(height)
      if (px > tallest) {
        tallest = px
        frame.style.minHeight = `${px}px`
      }
    })
    watcher.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['height'] })
    // Script ainda baixando: o onReady dele, na seção, processa este blockquote.
    window.instgrm?.Embeds.process()

    return () => {
      watcher.disconnect()
      // Tira o iframe: o vídeo do post não continua tocando com a janela fechada.
      host.replaceChildren()
    }
  }, [shortcode])

  return (
    <div className="relative overflow-hidden rounded-sm bg-card">
      {/* Link e não div: se o embed nunca montar (bloqueador de rastreio, conta
          com Incorporações desligada), a foto continua levando ao post. A
          geometria espelha o cartão do iframe (cabeçalho, foto quadrada, rodapé
          de ações), e a foto é a do quadro inteiro, a mesma do iframe: a troca
          não empurra a janela nem dá "zoom". */}
      {!mounted && (
        <a
          href={post.permalink}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ver este post no Instagram"
          className="block rounded-sm border border-border"
        >
          <span className="flex h-14 items-center gap-2.5 px-3">
            <span aria-hidden className="size-8 shrink-0 rounded-full bg-muted" />
            <span className="truncate text-sm font-semibold text-card-foreground">
              {INSTAGRAM_PROFILE.handle.replace(/^@/, '')}
            </span>
          </span>
          <span className="relative block aspect-square bg-secondary">
            {post.imageUrl && (
              <Image src={post.imageUrl} alt={post.caption ?? ''} fill sizes={POST_PHOTO_SIZES} className="object-cover" />
            )}
          </span>
          <span aria-hidden className="flex h-38 flex-col justify-center gap-3 px-3">
            <span className="h-3 w-32 animate-pulse rounded-sm bg-muted" />
            <span className="h-3 w-20 animate-pulse rounded-sm bg-muted" />
            <span className="h-3 w-40 animate-pulse rounded-sm bg-muted" />
          </span>
        </a>
      )}

      <div
        ref={hostRef}
        className={cn(mounted ? 'animate-in fade-in duration-300' : 'invisible absolute inset-x-0 top-0')}
      />
    </div>
  )
}
