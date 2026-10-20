import { isTelegramConfigured } from '../../config/env.js'
import { telegramRequest } from './client.js'

/**
 * Fachada do Telegram. Sabe falar com a Bot API; não sabe o que é um alerta nem
 * um destino — isso é do módulo `alerts`.
 */
export {
  classifyTelegramFailure,
  telegramFailureOf,
  type TelegramFailure,
  type TelegramFailureKind,
} from './client.js'

export { isTelegramConfigured }

export type TelegramChat = {
  /** chat_id como texto: grupos têm id negativo e longo, e o banco guarda string. */
  id: string
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title: string | null
  username: string | null
  firstName: string | null
}

/** `chat` nulo = update que não é mensagem: não serve, mas o id dele ainda conta para o offset. */
export type TelegramMessageUpdate = {
  updateId: number
  chat: TelegramChat | null
  text: string | null
}

type RawUpdate = {
  update_id: number
  message?: {
    text?: string
    chat?: {
      id: number
      type: TelegramChat['type']
      title?: string
      username?: string
      first_name?: string
    }
  }
}

/**
 * O @usuário do bot, para montar o link `t.me/<bot>?start=`. Em memória: só muda
 * trocando o token, e trocar o token pede restart.
 */
let botUsername: Promise<string> | null = null

export const getBotUsername = (): Promise<string> => {
  botUsername ??= telegramRequest<{ username: string }>('getMe', {})
    .then((me) => me.username)
    .catch((err: unknown) => {
      botUsername = null
      throw err
    })
  return botUsername
}

/** Texto em HTML do Telegram (`<b>`, `<a>`, `<code>`): quem chama já escapou o resto. */
export const sendTelegramMessage = async (p: { chatId: string; html: string }): Promise<void> => {
  await telegramRequest('sendMessage', {
    chat_id: p.chatId,
    text: p.html,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  })
}

/**
 * Mensagens novas para o bot (long-poll de `timeoutSec`). Passar `offset`
 * confirma ao Telegram tudo o que veio antes dele — elas não voltam mais.
 * Só funciona se o bot NÃO tiver webhook: com webhook o Telegram responde 409.
 */
export const getTelegramUpdates = async (p: {
  offset?: number
  timeoutSec: number
}): Promise<TelegramMessageUpdate[]> => {
  const raw = await telegramRequest<RawUpdate[]>(
    'getUpdates',
    {
      ...(p.offset !== undefined ? { offset: p.offset } : {}),
      timeout: p.timeoutSec,
      allowed_updates: ['message'],
    },
    (p.timeoutSec + 5) * 1000,
  )

  return raw.map((u): TelegramMessageUpdate => {
    const chat = u.message?.chat
    return {
      updateId: u.update_id,
      chat: chat
        ? {
            id: String(chat.id),
            type: chat.type,
            title: chat.title ?? null,
            username: chat.username ?? null,
            firstName: chat.first_name ?? null,
          }
        : null,
      text: u.message?.text ?? null,
    }
  })
}
