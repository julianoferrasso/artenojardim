/**
 * O vínculo de um chat do Telegram, em funções puras.
 *
 * Bot não inicia conversa nem acha ninguém por telefone: quem cadastra abre um
 * link `t.me/<bot>?start=<token>`, toca em "Iniciar", e o Telegram entrega ao bot
 * a mensagem `/start <token>`. No grupo (link `startgroup`) a mensagem chega como
 * `/start@<bot> <token>`, endereçada ao bot — por isso passa pelo modo de
 * privacidade, que esconde do bot as mensagens comuns do grupo.
 */

/** O token cabe no limite do Telegram: até 64 caracteres de A-Z, a-z, 0-9, _ e -. */
const START_COMMAND = /^\/start(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_-]{1,64})$/

export const parseStartToken = (text: string | null): string | null =>
  text?.trim().match(START_COMMAND)?.[1] ?? null

export const telegramStartLinks = (botUsername: string, token: string) => ({
  private: `https://t.me/${botUsername}?start=${token}`,
  group: `https://t.me/${botUsername}?startgroup=${token}`,
})

/** Como o chat aparece na tela: "@fulano", o nome da pessoa, ou o nome do grupo. */
export const telegramChatLabel = (chat: {
  type: string
  title: string | null
  username: string | null
  firstName: string | null
}): string => {
  if (chat.type !== 'private') return chat.title ? `Grupo ${chat.title}` : 'Grupo'
  if (chat.username) return `@${chat.username}`
  return chat.firstName ?? 'Chat pessoal'
}
