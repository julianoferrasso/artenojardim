'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Script from 'next/script'
import { Camera } from 'lucide-react'
import { INSTAGRAM_PROFILE } from '@/components/brand-icons'
import { ExpandableCaption } from '@/components/home/expandable-caption'
import { cn } from '@/lib/utils'

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } }
  }
}

const EMBED_SCRIPT = 'https://www.instagram.com/embed.js'

type Props = {
  shortcode: string
  captioned: boolean
  imageUrl: string | null
  caption: string | null
}

/**
 * Post incorporado do Instagram. O código que o lojista colou NUNCA chega aqui:
 * a API guardou só o shortcode (validado por regex) e este componente remonta
 * o blockquote oficial com a API do DOM — nada de innerHTML com texto de fora.
 *
 * O blockquote é criado fora do React de propósito: o embed.js o SUBSTITUI por
 * um iframe, e um nó que o React acha que é dele sumindo quebra o próximo render.
 *
 * Só monta quando o slide chega perto da tela: 18 iframes do Instagram de uma
 * vez pesariam a home inteira, e o script da Meta nem carrega se ninguém rolar.
 */
export const InstagramEmbed = ({ shortcode, captioned, imageUrl, caption }: Props) => {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setNear(true)
          observer.disconnect()
        }
      },
      { rootMargin: '300px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!near || !host) return

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
    const watcher = new MutationObserver(() => {
      const frame = host.querySelector('iframe')
      if (!frame) return
      const height = frame.getAttribute('height')
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
      setMounted(true)
      watcher.disconnect()
    })
    watcher.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['height'] })
    window.instgrm?.Embeds.process()

    return () => watcher.disconnect()
  }, [near, shortcode])

  return (
    <div ref={wrapperRef} className="relative">
      {near && (
        // onReady roda no load E a cada montagem seguinte: cada post que entra
        // depois do script já carregado também é processado.
        <Script id="instagram-embed-js" src={EMBED_SCRIPT} onReady={() => window.instgrm?.Embeds.process()} />
      )}

      {/* Link e não div: se o embed nunca montar (bloqueador de rastreio, conta
          com Incorporações desligada), a foto continua levando ao post.
          A geometria espelha o cartão do iframe (máx. 540px, cabeçalho, foto
          quadrada, rodapé de ações) para a troca não empurrar a página. A foto
          é quadrada porque a og:image que o Instagram entrega já vem cortada
          em 1:1: num 4:5 ela era cortada de novo e parecia ampliada. */}
      {!mounted && (
        <a
          href={`https://www.instagram.com/p/${shortcode}/`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ver este post no Instagram"
          className="block max-w-135 overflow-hidden rounded-sm border border-border bg-card"
        >
          <span className="flex h-14 items-center gap-2.5 px-3">
            <span aria-hidden className="size-8 shrink-0 rounded-full bg-muted" />
            <span className="truncate text-sm font-semibold text-card-foreground">
              {INSTAGRAM_PROFILE.handle.replace(/^@/, '')}
            </span>
          </span>
          <span className="relative block aspect-square bg-secondary">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={caption ?? ''}
                fill
                sizes="(max-width: 640px) 100vw, 33vw"
                className="object-cover"
              />
            ) : (
              <span aria-hidden className="flex size-full items-center justify-center">
                <Camera className="size-8 text-primary-ink/50" strokeWidth={1.2} />
              </span>
            )}
          </span>
          <span aria-hidden className="flex h-38 flex-col justify-center gap-3 px-3">
            <span className="h-3 w-32 rounded-sm bg-muted" />
            <span className="h-3 w-20 rounded-sm bg-muted" />
            <span className="h-3 w-40 rounded-sm bg-muted" />
          </span>
        </a>
      )}

      <div
        ref={hostRef}
        className={cn(mounted ? 'animate-in fade-in duration-300' : 'invisible absolute inset-x-0 top-0')}
      />

      {captioned && caption && <ExpandableCaption text={caption} />}
    </div>
  )
}
