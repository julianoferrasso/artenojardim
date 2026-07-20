import { describe, it, expect } from 'vitest'
import {
  spDayKey,
  spDayStart,
  spDayEnd,
  spDayAsDateColumn,
  addSpDays,
  spWeekday,
} from '@ecommerce/shared/utils'

/**
 * O dia brasileiro visto de um processo que roda em UTC. Puro de propósito: é
 * onde o bug do gráfico de receita se manifesta, e dá para prendê-lo sem banco.
 */

describe('spDayKey — a fronteira do dia', () => {
  it('23h de Brasília ainda é o dia anterior (o bug relatado)', () => {
    // 20/07 02:00Z = 19/07 23:00 em Brasília.
    expect(spDayKey(new Date('2026-07-20T02:00:00.000Z'))).toBe('2026-07-19')
  })

  it('vira o dia exatamente às 03:00Z', () => {
    expect(spDayKey(new Date('2026-07-20T02:59:59.999Z'))).toBe('2026-07-19')
    expect(spDayKey(new Date('2026-07-20T03:00:00.000Z'))).toBe('2026-07-20')
  })

  it('meio-dia UTC é o mesmo dia nos dois fusos', () => {
    expect(spDayKey(new Date('2026-07-20T12:00:00.000Z'))).toBe('2026-07-20')
  })
})

describe('spDayStart / spDayEnd', () => {
  it('start é 03:00Z do próprio dia', () => {
    expect(spDayStart('2026-07-19').toISOString()).toBe('2026-07-19T03:00:00.000Z')
  })

  it('end é 02:59:59.999Z do dia seguinte — não vaza para o dia de depois', () => {
    expect(spDayEnd('2026-07-19').toISOString()).toBe('2026-07-20T02:59:59.999Z')
  })

  it('o intervalo de um dia encosta no do seguinte sem sobrepor', () => {
    expect(spDayEnd('2026-07-19').getTime() + 1).toBe(spDayStart('2026-07-20').getTime())
  })

  it('todo instante cai dentro do intervalo do seu próprio dia', () => {
    const amostras = [
      '2026-07-20T02:00:00.000Z',
      '2026-07-20T03:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
      '2026-12-31T23:59:59.999Z',
    ]
    for (const iso of amostras) {
      const instante = new Date(iso)
      const dia = spDayKey(instante)
      expect(spDayStart(dia).getTime()).toBeLessThanOrEqual(instante.getTime())
      expect(spDayEnd(dia).getTime()).toBeGreaterThanOrEqual(instante.getTime())
    }
  })
})

describe('spDayAsDateColumn', () => {
  it('é meia-noite UTC, NÃO o mesmo que spDayStart', () => {
    expect(spDayAsDateColumn('2026-07-19').toISOString()).toBe('2026-07-19T00:00:00.000Z')
    // A distinção que o dashboard precisa: coluna @db.Date vs coluna timestamp.
    expect(spDayAsDateColumn('2026-07-19').getTime()).not.toBe(spDayStart('2026-07-19').getTime())
  })
})

describe('addSpDays — aritmética de calendário', () => {
  it('anda para frente e para trás', () => {
    expect(addSpDays('2026-07-19', 1)).toBe('2026-07-20')
    expect(addSpDays('2026-07-19', -1)).toBe('2026-07-18')
    expect(addSpDays('2026-07-19', 0)).toBe('2026-07-19')
  })

  it('vira o mês', () => {
    expect(addSpDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addSpDays('2026-07-31', 1)).toBe('2026-08-01')
  })

  it('vira o ano', () => {
    expect(addSpDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addSpDays('2025-12-31', 1)).toBe('2026-01-01')
  })

  it('respeita ano bissexto', () => {
    expect(addSpDays('2024-03-01', -1)).toBe('2024-02-29')
    expect(addSpDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('a janela de 7 dias do dashboard tem 7 chaves distintas terminando em hoje', () => {
    const hoje = '2026-07-20'
    const chaves = Array.from({ length: 7 }, (_, i) => addSpDays(hoje, -(7 - 1) + i))
    expect(chaves).toHaveLength(7)
    expect(new Set(chaves).size).toBe(7)
    expect(chaves[0]).toBe('2026-07-14')
    expect(chaves[6]).toBe(hoje)
  })
})

describe('spWeekday', () => {
  it('devolve o dia da semana brasileiro, não o de Londres', () => {
    // 18/07/2026 é sábado. 00:00Z de sábado ainda é sexta 21h em Brasília.
    expect(spWeekday(new Date('2026-07-18T00:00:00.000Z'))).toBe(5) // sexta
    expect(spWeekday(new Date('2026-07-18T12:00:00.000Z'))).toBe(6) // sábado
  })
})
