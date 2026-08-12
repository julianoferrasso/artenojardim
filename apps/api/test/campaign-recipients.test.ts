import { describe, it, expect } from 'vitest'
import {
  excludeRecipients,
  paginateRecipients,
  type Recipient,
} from '../src/modules/campaigns/domain/recipients.js'

/**
 * Testes de domain/: funções puras, sem banco. A exclusão é onde o bug mora —
 * errar aqui significa mandar e-mail para quem o lojista desmarcou.
 */

const make = (email: string): Recipient => ({
  email,
  name: null,
  customerId: null,
  source: 'CUSTOMER',
})

describe('excludeRecipients', () => {
  it('remove os endereços desmarcados', () => {
    const all = [make('a@x.com'), make('b@x.com'), make('c@x.com')]
    expect(excludeRecipients(all, ['b@x.com']).map((r) => r.email)).toEqual(['a@x.com', 'c@x.com'])
  })

  it('lista vazia de exclusões devolve todo mundo', () => {
    const all = [make('a@x.com'), make('b@x.com')]
    expect(excludeRecipients(all, [])).toHaveLength(2)
  })

  it('normaliza os DOIS lados: caixa diferente não pode furar a exclusão', () => {
    // O endereço no banco pode ter sido gravado antes de existir normalização.
    // Sem o toLowerCase dos dois lados, o desmarcado receberia o e-mail.
    const all = [make('Cliente@Loja.COM')]
    expect(excludeRecipients(all, ['cliente@loja.com'])).toHaveLength(0)
  })

  it('ignora espaço em volta do endereço excluído', () => {
    const all = [make('a@x.com')]
    expect(excludeRecipients(all, ['  a@x.com  '])).toHaveLength(0)
  })

  it('excluir quem não está na lista não remove ninguém por engano', () => {
    const all = [make('a@x.com'), make('b@x.com')]
    expect(excludeRecipients(all, ['ninguem@x.com'])).toHaveLength(2)
  })

  it('excluir todo mundo devolve lista vazia — o service é quem recusa o envio', () => {
    const all = [make('a@x.com'), make('b@x.com')]
    expect(excludeRecipients(all, ['a@x.com', 'b@x.com'])).toHaveLength(0)
  })
})

describe('paginateRecipients', () => {
  const all = Array.from({ length: 10 }, (_, i) => make(`${i}@x.com`))

  it('a primeira página começa no índice 0 — `page` é 1-based', () => {
    expect(paginateRecipients(all, 1, 3).map((r) => r.email)).toEqual(['0@x.com', '1@x.com', '2@x.com'])
  })

  it('página do meio', () => {
    expect(paginateRecipients(all, 2, 3).map((r) => r.email)).toEqual(['3@x.com', '4@x.com', '5@x.com'])
  })

  it('última página pode vir incompleta', () => {
    expect(paginateRecipients(all, 4, 3)).toHaveLength(1)
  })

  it('página além do fim devolve vazio em vez de estourar', () => {
    expect(paginateRecipients(all, 99, 3)).toEqual([])
  })
})
