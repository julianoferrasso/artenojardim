import { describe, it, expect } from 'vitest'
import { parseStartToken, telegramChatLabel, telegramStartLinks } from '../src/modules/alerts/domain/telegram.js'

/**
 * O vínculo de um chat: o link manda `/start <token>` no privado e
 * `/start@<bot> <token>` num grupo (link `startgroup`). Qualquer outra mensagem
 * para o bot não pode vincular nada.
 */

const TOKEN = 'Ab3_-xYz0123456789abcdefghijklmnopqrstuvwxy'

describe('parseStartToken', () => {
  it('lê o token do /start do chat privado', () => {
    expect(parseStartToken(`/start ${TOKEN}`)).toBe(TOKEN)
  })

  it('lê o token do /start@bot que o grupo recebe', () => {
    expect(parseStartToken(`/start@ArteNoJardimBot ${TOKEN}`)).toBe(TOKEN)
  })

  it('ignora o resto: /start sem token, texto comum, outro comando, token com caractere fora do Telegram', () => {
    expect(parseStartToken('/start')).toBeNull()
    expect(parseStartToken('olá')).toBeNull()
    expect(parseStartToken(`/help ${TOKEN}`)).toBeNull()
    expect(parseStartToken('/start token+com/barra')).toBeNull()
    expect(parseStartToken(null)).toBeNull()
  })

  it('não aceita token acima dos 64 caracteres do Telegram', () => {
    expect(parseStartToken(`/start ${'a'.repeat(65)}`)).toBeNull()
  })
})

describe('telegramStartLinks', () => {
  it('um link para a conversa e outro para escolher o grupo, com o mesmo token', () => {
    expect(telegramStartLinks('ArteBot', 'tok')).toEqual({
      private: 'https://t.me/ArteBot?start=tok',
      group: 'https://t.me/ArteBot?startgroup=tok',
    })
  })
})

describe('telegramChatLabel', () => {
  it('privado: @usuário, ou o nome quando não há usuário', () => {
    expect(telegramChatLabel({ type: 'private', title: null, username: 'ana', firstName: 'Ana' })).toBe('@ana')
    expect(telegramChatLabel({ type: 'private', title: null, username: null, firstName: 'Ana' })).toBe('Ana')
  })

  it('grupo: o nome do grupo', () => {
    expect(telegramChatLabel({ type: 'supergroup', title: 'Equipe', username: null, firstName: null })).toBe('Grupo Equipe')
  })
})
