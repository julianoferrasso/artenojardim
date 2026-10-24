import { getImageProps } from 'next/image'
import type PhotoSwipe from 'photoswipe'
import type { Bounds, ZoomLevelOption } from 'photoswipe'
import type { ProductImage } from '@ecommerce/shared/contracts'
import { containedBox } from './image-box'
import 'photoswipe/style.css'

/**
 * Tela cheia da galeria, sobre o PhotoSwipe. Pinça, duplo toque, pan com
 * inércia e arrastar para baixo para fechar são o que o cliente no celular
 * espera, e refazer isso à mão é um ninho de casos do iOS — mesmo raciocínio de
 * não refazer o otimizador de imagem. O módulo só baixa na primeira interação
 * com a galeria (`prefetchGalleryViewer`): a página do produto não paga por ele.
 *
 * Imperativo como a própria biblioteca: função, não componente.
 */

const loadPhotoSwipe = () => import('photoswipe')

/** Chamado no primeiro contato com a galeria, para o clique abrir sem espera. */
export const prefetchGalleryViewer = () => {
  void loadPhotoSwipe()
}

/** Foto pequena pode crescer até isto para não virar um selo no meio da tela. */
const MAX_UPSCALE = 1.5
/** O clique/duplo toque não passa disto do tamanho original: além, é só borrão.
 *  A pinça continua livre — aí é escolha do cliente. */
const MAX_TAP_ZOOM = 2
/** Sem dimensões no banco (uploads antigos) e sem foto carregada para medir. */
const FALLBACK_SIZE = 1200

// Cabe na tela; o padrão do PhotoSwipe nunca passa do tamanho original, e a
// maioria das fotos da loja tem ~600 px.
const initialZoom: ZoomLevelOption = (zoom) => {
  if (!zoom.elementSize || !zoom.panAreaSize) return zoom.fit
  return Math.min(
    MAX_UPSCALE,
    zoom.panAreaSize.x / zoom.elementSize.x,
    zoom.panAreaSize.y / zoom.elementSize.y,
  )
}

let current: PhotoSwipe | null = null

type OpenOptions = {
  images: ProductImage[]
  index: number
  productName: string
  /** Frame da página que mostra a foto `index` agora, se visível: a tela cheia
   *  nasce dele e volta para ele. */
  getFrame: (index: number) => HTMLElement | null
  onIndexChange: (index: number) => void
}

export const openGalleryViewer = async ({
  images,
  index,
  productName,
  getFrame,
  onIndexChange,
}: OpenOptions) => {
  // Dois toques enquanto o módulo baixa abririam duas telas cheias.
  if (current) return
  const { default: PhotoSwipeClass } = await loadPhotoSwipe()
  if (current) return

  const dataSource = images.map((img, i) => {
    const pageImg = getFrame(i)?.querySelector('img')
    const width = img.width ?? (pageImg?.naturalWidth || FALLBACK_SIZE)
    const height = img.height ?? (pageImg?.naturalHeight || FALLBACK_SIZE)
    // Pelo otimizador do Next, não o original do bucket: WebP/AVIF no tamanho
    // que o zoom pede, em vez de um PNG de até 10 MB.
    const { props } = getImageProps({ src: img.url, alt: '', width, height, sizes: '100vw' })
    return {
      src: props.src,
      srcset: props.srcSet,
      width,
      height,
      alt: img.alt ?? productName,
      // A foto que já está na tela segura o lugar enquanto a grande carrega.
      msrc: pageImg?.currentSrc || undefined,
    }
  })

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const pswp = new PhotoSwipeClass({
    dataSource,
    index,
    bgOpacity: 1,
    showHideAnimationType: reducedMotion ? 'none' : 'zoom',
    wheelToZoom: true,
    preload: [1, 2],
    initialZoomLevel: initialZoom,
    secondaryZoomLevel: (zoom) => Math.max(zoom.initial, Math.min(zoom.initial * 2, MAX_TAP_ZOOM)),
    maxZoomLevel: (zoom) => zoom.initial * 4,
    closeTitle: 'Fechar',
    zoomTitle: 'Ampliar',
    arrowPrevTitle: 'Foto anterior',
    arrowNextTitle: 'Próxima foto',
    errorMsg: 'Não foi possível carregar a foto.',
    indexIndicatorSep: ' / ',
  })
  current = pswp

  // A foto da página é `object-contain` num quadrado: a animação tem que sair
  // da foto, não do quadrado com tarja. Sem frame visível, o PhotoSwipe faz fade.
  pswp.addFilter('thumbBounds', (bounds, itemData, i) => {
    const frame = getFrame(i)
    // O tipo diz Bounds, mas undefined é o que o próprio PhotoSwipe devolve
    // quando não acha miniatura — e é o que faz ele cair no fade.
    if (!frame) return bounds as Bounds
    const rect = frame.getBoundingClientRect()
    const box = containedBox(rect, (itemData.width ?? 1) / (itemData.height ?? 1))
    return { x: rect.left + box.offsetX, y: rect.top + box.offsetY, w: box.width }
  })

  pswp.on('change', () => onIndexChange(pswp.currIndex))

  // Botão Voltar do celular fecha a galeria em vez de sair do produto: a tela
  // cheia ganha uma entrada própria no histórico. O router do Next copia o
  // estado dele para dentro do pushState de terceiros, então voltar é seguro.
  window.history.pushState({ galleryViewer: true }, '')
  const onPopState = () => pswp.close()
  window.addEventListener('popstate', onPopState)

  pswp.on('close', () => {
    window.removeEventListener('popstate', onPopState)
    // Fechou pelo X, Esc ou gesto: a entrada que empilhamos ainda está lá.
    if ((window.history.state as { galleryViewer?: boolean } | null)?.galleryViewer) {
      window.history.back()
    }
  })
  pswp.on('destroy', () => {
    current = null
  })

  pswp.init()
}
