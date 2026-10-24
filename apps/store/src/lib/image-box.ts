/**
 * Caixa realmente ocupada por uma foto com `object-contain` dentro do frame —
 * o resto é tarja. Quem mapeia o cursor (zoom no hover) ou anima a partir da
 * foto (tela cheia) precisa desta caixa: o retângulo do frame faz o zoom derivar
 * perto das bordas e a animação crescer do quadrado em vez da foto.
 */
export const containedBox = (frame: { width: number; height: number }, ratio: number) => {
  const box = frame.width / frame.height
  const width = ratio > box ? frame.width : frame.height * ratio
  const height = ratio > box ? frame.width / ratio : frame.height
  return { width, height, offsetX: (frame.width - width) / 2, offsetY: (frame.height - height) / 2 }
}
