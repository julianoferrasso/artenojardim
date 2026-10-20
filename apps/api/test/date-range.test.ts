import { describe, it, expect } from 'vitest'
import {
  allowedGranularities,
  autoGranularity,
  dayKeyWeekday,
  isDayKey,
  resolveComparison,
  resolvePreset,
  spanDays,
} from '@ecommerce/shared/utils'

/**
 * Intervalos do dashboard. O admin e a API precisam chegar aos MESMOS dias — o
 * seletor desenha um período e o servidor consulta outro seria o pior bug do
 * painel, porque ninguém desconfia do número.
 */

// 20/10/2026 é terça-feira.
const TODAY = '2026-10-20'

describe('resolvePreset', () => {
  it('hoje e ontem são um dia só', () => {
    expect(resolvePreset('today', TODAY)).toEqual({ from: TODAY, to: TODAY })
    expect(resolvePreset('yesterday', TODAY)).toEqual({ from: '2026-10-19', to: '2026-10-19' })
  })

  it('"últimos N dias" inclui hoje e tem exatamente N dias', () => {
    expect(resolvePreset('last7', TODAY)).toEqual({ from: '2026-10-14', to: TODAY })
    expect(resolvePreset('last30', TODAY)).toEqual({ from: '2026-09-21', to: TODAY })
    expect(spanDays(resolvePreset('last90', TODAY))).toBe(90)
    expect(resolvePreset('last365', TODAY)).toEqual({ from: '2025-10-21', to: TODAY })
  })

  it('a semana começa no domingo', () => {
    expect(dayKeyWeekday(TODAY)).toBe(2)
    expect(resolvePreset('thisWeek', TODAY)).toEqual({ from: '2026-10-18', to: TODAY })
    // Num domingo a semana é só o próprio dia.
    expect(resolvePreset('thisWeek', '2026-10-18')).toEqual({ from: '2026-10-18', to: '2026-10-18' })
  })

  it('mês e ano: até hoje, ou o anterior inteiro', () => {
    expect(resolvePreset('thisMonth', TODAY)).toEqual({ from: '2026-10-01', to: TODAY })
    expect(resolvePreset('lastMonth', TODAY)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(resolvePreset('lastMonth', '2026-03-15')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(resolvePreset('lastMonth', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(resolvePreset('thisYear', TODAY)).toEqual({ from: '2026-01-01', to: TODAY })
    expect(resolvePreset('lastYear', TODAY)).toEqual({ from: '2025-01-01', to: '2025-12-31' })
  })
})

describe('resolveComparison — período anterior', () => {
  it('intervalo móvel ou livre compara com a mesma duração imediatamente antes', () => {
    expect(
      resolveComparison({ preset: null, range: { from: '2026-10-10', to: '2026-10-20' } }, 'previous_period'),
    ).toEqual({ from: '2026-09-29', to: '2026-10-09' })
    expect(resolveComparison({ preset: 'today', range: { from: TODAY, to: TODAY } }, 'previous_period')).toEqual({
      from: '2026-10-19',
      to: '2026-10-19',
    })
    expect(
      resolveComparison({ preset: 'last30', range: resolvePreset('last30', TODAY) }, 'previous_period'),
    ).toEqual({ from: '2026-08-22', to: '2026-09-20' })
  })

  it('"este mês" compara com o mesmo trecho do mês anterior, com teto no fim do mês', () => {
    expect(
      resolveComparison({ preset: 'thisMonth', range: resolvePreset('thisMonth', TODAY) }, 'previous_period'),
    ).toEqual({ from: '2026-09-01', to: '2026-09-20' })
    expect(
      resolveComparison(
        { preset: 'thisMonth', range: resolvePreset('thisMonth', '2026-03-31') },
        'previous_period',
      ),
    ).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('"esta semana" compara com os mesmos dias da semana anterior', () => {
    expect(
      resolveComparison({ preset: 'thisWeek', range: resolvePreset('thisWeek', TODAY) }, 'previous_period'),
    ).toEqual({ from: '2026-10-11', to: '2026-10-13' })
  })

  it('"mês passado" compara com o mês inteiro antes dele, mesmo de outro tamanho', () => {
    expect(
      resolveComparison({ preset: 'lastMonth', range: resolvePreset('lastMonth', TODAY) }, 'previous_period'),
    ).toEqual({ from: '2026-08-01', to: '2026-08-31' })
  })

  it('"este ano" e "ano passado" comparam com o ano anterior', () => {
    expect(
      resolveComparison({ preset: 'thisYear', range: resolvePreset('thisYear', TODAY) }, 'previous_period'),
    ).toEqual({ from: '2025-01-01', to: '2025-10-20' })
    expect(
      resolveComparison({ preset: 'lastYear', range: resolvePreset('lastYear', TODAY) }, 'previous_period'),
    ).toEqual({ from: '2024-01-01', to: '2024-12-31' })
  })
})

describe('resolveComparison — ano anterior e nenhum', () => {
  it('volta um ano, e 29/02 vira 28/02', () => {
    expect(resolveComparison({ preset: 'last7', range: resolvePreset('last7', TODAY) }, 'previous_year')).toEqual({
      from: '2025-10-14',
      to: '2025-10-20',
    })
    expect(
      resolveComparison({ preset: null, range: { from: '2028-02-29', to: '2028-02-29' } }, 'previous_year'),
    ).toEqual({ from: '2027-02-28', to: '2027-02-28' })
  })

  it('"sem comparação" é null', () => {
    expect(resolveComparison({ preset: 'today', range: { from: TODAY, to: TODAY } }, 'none')).toBeNull()
  })
})

describe('granularidade', () => {
  it('permite só o que cabe na duração', () => {
    expect(allowedGranularities(1)).toEqual(['hour'])
    expect(allowedGranularities(7)).toEqual(['day'])
    expect(allowedGranularities(13)).toEqual(['day'])
    expect(allowedGranularities(14)).toEqual(['day', 'week'])
    expect(allowedGranularities(60)).toEqual(['day', 'week', 'month'])
    expect(allowedGranularities(366)).toEqual(['day', 'week', 'month'])
    expect(allowedGranularities(367)).toEqual(['week', 'month'])
  })

  it('o automático é o mais fino que ainda dá um gráfico legível', () => {
    expect(autoGranularity(1)).toBe('hour')
    expect(autoGranularity(2)).toBe('day')
    expect(autoGranularity(92)).toBe('day')
    expect(autoGranularity(93)).toBe('week')
    expect(autoGranularity(200)).toBe('week')
    expect(autoGranularity(201)).toBe('month')
  })

  it('o automático é sempre um dos permitidos', () => {
    for (let span = 1; span <= 731; span++) {
      expect(allowedGranularities(span)).toContain(autoGranularity(span))
    }
  })
})

describe('isDayKey', () => {
  it('exige formato e data de calendário real', () => {
    expect(isDayKey('2026-10-20')).toBe(true)
    expect(isDayKey('2028-02-29')).toBe(true)
    expect(isDayKey('2026-02-30')).toBe(false)
    expect(isDayKey('2026-13-01')).toBe(false)
    expect(isDayKey('2026-1-01')).toBe(false)
    expect(isDayKey('20/10/2026')).toBe(false)
  })
})
