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
  const [loaded, setLoaded] = useState(false)

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
    // Invisível até virar iframe: o placeholder é quem aparece enquanto isso.
    quote.style.opacity = '0'
    quote.style.margin = '0'
    const link = document.createElement('a')
    link.href = permalink
    link.textContent = 'Ver este post no Instagram'
    quote.appendChild(link)
    host.replaceChildren(quote)

    // O iframe chegou = o embed.js terminou; aí o placeholder sai.
    const watcher = new MutationObserver(() => {
      if (host.querySelector('iframe')) {
        setLoaded(true)
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

      {!loaded && (
        <div className="relative aspect-4/5 overflow-hidden rounded-xl bg-secondary">
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
        </div>
      )}

      <div ref={hostRef} className={cn(!loaded && 'absolute inset-x-0 top-0')} />
    </div>
  )
}
