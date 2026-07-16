import type { PublicFlags } from '@ecommerce/shared/contracts'
import { getSetting } from './settings.js'

/**
 * Feature flags — chave `feature_flags` em Setting. Sem tabela nova, sem serviço.
 *
 * O valor para um dev solo não é desacoplar deploy de release (isso é problema de
 * time grande). É o KILL SWITCH: se as avaliações começarem a receber spam às 2h
 * da manhã, um toggle resolve em 5 segundos. Sem flag, é reverter e fazer deploy —
 * sob pressão, de madrugada, no pior momento possível.
 *
 * ── Higiene (sem isso, flags viram dívida) ──────────────────────────────────
 * 1. Toda flag nasce com gatilho de remoção documentado.
 * 2. Teto de 5 simultâneas. Chegou em 5? Remova uma antes de criar a sexta.
 * 3. Flag NÃO é configuração. "Frete grátis acima de R$ 200" é Setting:
 *    permanente, e o lojista mexe. Flag é temporária, e só o dev mexe.
 * 4. Flag liga/desliga o que JÁ está pronto. Código pela metade é branch.
 *
 * Favoritos NÃO precisa de flag: a tabela existe desde a Fase 1, a UI não.
 * Não há o que ligar. Flag serve quando o código existe e roda.
 */

export const getFlags = async (): Promise<PublicFlags> => getSetting('feature_flags')

export const isEnabled = async (flag: keyof PublicFlags): Promise<boolean> => {
  const flags = await getFlags()
  return flags[flag]
}
