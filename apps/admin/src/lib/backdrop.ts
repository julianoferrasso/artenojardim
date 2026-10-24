import { sampleBackdrop, type SampledBackdrop } from '@ecommerce/shared/utils'

/**
 * Lê a cor da borda da foto do banner, no navegador, para a loja prolongá-la
 * atrás do texto.
 *
 * Carrega a foto pelo `/_next/image` do PRÓPRIO admin, não pela URL do bucket:
 * o CORS do S3 só libera PUT, e imagem de outra origem desenhada num canvas o
 * "contamina" — o getImageData lança. Pela mesma origem não há CORS, e o mesmo
 * caminho serve para o upload recém-feito e para o banner antigo.
 *
 * 256px de largura bastam para a média de uma borda. A largura e a qualidade
 * precisam estar em `images.imageSizes`/`images.qualities` (os padrões do Next).
 */
const SAMPLE_WIDTH = 256
const SAMPLE_QUALITY = 75

export const sampleImageBackdrop = (url: string): Promise<SampledBackdrop | null> =>
  new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0)
        resolve(sampleBackdrop(ctx.getImageData(0, 0, canvas.width, canvas.height)))
      } catch {
        // Canvas contaminado ou sem memória: o formulário segue com a cor manual.
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = `/_next/image?url=${encodeURIComponent(url)}&w=${SAMPLE_WIDTH}&q=${SAMPLE_QUALITY}`
  })
