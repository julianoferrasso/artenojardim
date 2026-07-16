/**
 * Contrato de storage.
 *
 * ── Por que NÃO `upload(file)` ───────────────────────────────────────────────
 * A assinatura intuitiva obrigaria o arquivo a passar pela API, e isso mata o
 * benefício do object storage:
 *   - o Node bufferiza dezenas de MB em memória (pico por request concorrente);
 *   - entra multer, disco temporário e limite de body;
 *   - a VPS paga a banda duas vezes (recebe do cliente, envia ao R2);
 *   - upload de 20 MB em 4G estoura o timeout do request.
 *
 * Com getUploadUrl, o browser faz PUT direto e o arquivo NUNCA toca a API.
 *
 * ── Por que a interface se justifica ─────────────────────────────────────────
 * Não é pelo swap futuro — é porque `local.ts` é a implementação de
 * DESENVOLVIMENTO: clone o repo, `pnpm dev`, e suba sem credencial de nuvem.
 * O swap vem de brinde; o valor é hoje.
 *
 * Atenção: a interface resolve o acoplamento de CÓDIGO, não a migração de DADOS.
 * É por isso que produção usa R2 desde o dia um — assim a migração de mídia, com
 * URLs já indexadas pelo Google, simplesmente nunca acontece.
 */

export type UploadTarget = {
  /** Para onde o browser faz PUT. R2 assinado em prod; a própria API em dev. */
  uploadUrl: string
  method: 'PUT'
  headers: Record<string, string>
  key: string
}

export type StorageProvider = {
  readonly id: 'local' | 'r2'

  getUploadUrl: (key: string, mimeType: string) => Promise<UploadTarget>

  /** Derivada, nunca persistida. É o que mantém o dado independente do provedor. */
  getPublicUrl: (key: string) => string

  delete: (key: string) => Promise<void>

  exists: (key: string) => Promise<boolean>
}
