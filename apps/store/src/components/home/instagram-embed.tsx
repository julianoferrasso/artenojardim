'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Script from 'next/script'
import { Camera } from 'lucide-react'
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
    if (captioned) quote.setAttribute('data-instgrm-captioned', '')
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

    // Montado = o blockquote SAIU. O embed.js insere o iframe ao lado dele com
    // altura 0 e só remove o blockquote quando o iframe avisa MOUNTED (conteúdo
    // pronto, altura medida). Antes disso, trocar o placeholder deixaria um buraco.
    const watcher = new MutationObserver(() => {
      if (host.querySelector('iframe') && !host.querySelector('blockquote')) {
        setMounted(true)
        watcher.disconnect()
      }
    })
    watcher.observe(host, { childList: true, subtree: true })
    window.instgrm?.Embeds.process()

    return () => watcher.disconnect()
  }, [near, shortcode, captioned])

  return (
    <div ref={wrapperRef} className="relative">
      {near && (
        // onReady roda no load E a cada montagem seguinte: cada post que entra
        // depois do script já carregado também é processado.
        <Script id="instagram-embed-js" src={EMBED_SCRIPT} onReady={() => window.instgrm?.Embeds.process()} />
      )}

      {/* Link e não div: se o embed nunca montar (bloqueador de rastreio, conta
          com Incorporações desligada), a foto continua levando ao post. */}
      {!mounted && (
        <a
          href={`https://www.instagram.com/p/${shortcode}/`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ver este post no Instagram"
          className="relative block aspect-4/5 overflow-hidden rounded-xl bg-secondary"
        >
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
        </a>
      )}

      <div ref={hostRef} className={cn(!mounted && 'invisible absolute inset-x-0 top-0')} />
    </div>
  )
}
