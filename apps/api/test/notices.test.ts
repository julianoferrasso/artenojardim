import { describe, it, expect } from 'vitest'
import {
  customerBackInStockNotice,
  customerCanceledNotice,
  customerCancelRequestNotice,
  customerReplyNotice,
  staffCanceledNotice,
  staffLowStockNotice,
  staffMessageNotice,
  staffOrderPaidNotice,
  staffOrderCreatedNotice,
  staffProductionDueNotice,
  staffShippingDisconnectedNotice,
  staffSiteDownNotice,
  staffSiteUpNotice,
  toParagraphs,
  type OrderSummary,
} from '../src/modules/notifications/domain/notices.js'
// Direto do template, não do index: o index carrega o client do SES e o env.
import { renderNotice } from '../src/integrations/email/templates/notice.js'

/**
 * O texto dos avisos. O que importa garantir: o cliente nunca recebe texto
 * interno, o valor do estorno aparece formatado com o prazo do meio de
 * pagamento, e o e-mail da equipe grita quando pede ação.
 */

const order = { number: 1042, customerName: 'Maria da Silva' }
const url = 'https://loja.test/conta/pedidos/ord_1'
const brl = (s: string) => s.replace(/ /g, ' ')

describe('aviso de cancelamento ao cliente', () => {
  it('estorno solicitado: valor formatado e prazo do Pix', () => {
    const notice = customerCanceledNotice({
      order,
      by: 'customer',
      refund: { status: 'requested', amount: 12990, method: 'PIX' },
      orderUrl: url,
    })
    const text = brl(notice.paragraphs.join(' '))
    expect(notice.subject).toBe('Pedido #1042 cancelado')
    expect(text).toContain('Olá, Maria.')
    expect(text).toContain('R$ 129,90')
    expect(text).toContain('Pix')
  })

  it('estorno recusado pelo provedor: o cliente lê "em processamento", nunca "falhou"', () => {
    const notice = customerCanceledNotice({
      order,
      by: 'customer',
      refund: { status: 'failed', amount: 5000, method: 'CARD' },
      orderUrl: url,
    })
    const text = notice.paragraphs.join(' ')
    expect(text).toContain('em processamento')
    expect(text.toLowerCase()).not.toContain('recus')
    expect(text.toLowerCase()).not.toContain('falh')
  })

  it('sem pagamento não promete estorno', () => {
    const notice = customerCanceledNotice({ order, by: 'customer', refund: { status: 'none' }, orderUrl: url })
    expect(notice.paragraphs.join(' ')).toContain('não há nada a estornar')
  })

  it('cancelamento aprovado pela loja diz que foi aprovado', () => {
    const notice = customerCanceledNotice({ order, by: 'store', refund: { status: 'none' }, orderUrl: url })
    expect(notice.paragraphs[0]).toContain('Aprovamos')
  })

  it('prazo de pagamento vencido: explica o vencimento, sem falar em estorno', () => {
    const notice = customerCanceledNotice({ order, by: 'system', refund: { status: 'none' }, orderUrl: url })
    const text = notice.paragraphs.join(' ')
    expect(text).toContain('O prazo para pagar o pedido #1042 terminou')
    expect(text).toContain('novo pedido')
    expect(text).not.toContain('estornar')
  })

  it('prazo vencido mas o Pix pago no último segundo: conta o estorno', () => {
    const notice = customerCanceledNotice({
      order,
      by: 'system',
      refund: { status: 'requested', amount: 8990, method: 'PIX' },
      orderUrl: url,
    })
    expect(brl(notice.paragraphs.join(' '))).toContain('O estorno de R$ 89,90 já foi solicitado.')
  })
})

describe('recibo do pedido de cancelamento', () => {
  it('promete o estorno automático só quando há o que estornar', () => {
    const paid = customerCancelRequestNotice({ order, refundAmount: 8000, orderUrl: url })
    const unpaid = customerCancelRequestNotice({ order, refundAmount: 0, orderUrl: url })
    expect(paid.paragraphs.join(' ')).toContain('estorno')
    expect(unpaid.paragraphs.join(' ')).not.toContain('estorno')
  })
})

describe('avisos à equipe', () => {
  it('estorno que falhou vira "[Ação necessária]" no assunto', () => {
    const notice = staffCanceledNotice({
      order,
      reason: 'Comprei por engano',
      refund: { status: 'failed', amount: 5000, method: 'PIX' },
      orderUrl: url,
      reservedStock: true,
    })
    expect(notice.subject.startsWith('[Ação necessária]')).toBe(true)
  })

  it('cancelamento com estorno ok é informativo', () => {
    const notice = staffCanceledNotice({
      order,
      reason: 'Comprei por engano',
      refund: { status: 'requested', amount: 5000, method: 'PIX' },
      orderUrl: url,
      reservedStock: true,
    })
    expect(notice.subject.startsWith('[Cancelamento]')).toBe(true)
    expect(notice.paragraphs.join(' ')).toContain('Comprei por engano')
  })

  it('pedido sem pagamento só fala de reserva quando havia peça reservada', () => {
    const withStock = staffCanceledNotice({ order, reason: 'x', refund: { status: 'none' }, orderUrl: url, reservedStock: true })
    const madeToOrder = staffCanceledNotice({ order, reason: 'x', refund: { status: 'none' }, orderUrl: url, reservedStock: false })
    expect(withStock.paragraphs.join(' ')).toContain('reserva de estoque foi liberada')
    expect(madeToOrder.paragraphs.join(' ')).not.toContain('reserva')
  })

  it('mensagem do cliente leva o assunto e o texto inteiro', () => {
    const notice = staffMessageNotice({ order, topic: 'DELIVERY', body: 'Linha 1\n\nLinha 2', threadUrl: url })
    expect(notice.paragraphs).toEqual(['Maria da Silva escreveu (assunto: Entrega):', 'Linha 1', 'Linha 2'])
  })
})

describe('resposta da loja ao cliente', () => {
  it('a recusa de cancelamento tem assunto próprio', () => {
    const notice = customerReplyNotice({ order, body: 'Já está no caminhão.', kind: 'cancel_declined', orderUrl: url })
    expect(notice.subject).toContain('cancelamento')
    expect(notice.paragraphs).toContain('Já está no caminhão.')
  })
})

describe('toParagraphs', () => {
  it('quebra por linha e descarta linhas vazias', () => {
    expect(toParagraphs('  oi \n\n\n tudo bem?\n')).toEqual(['oi', 'tudo bem?'])
  })
})

describe('renderNotice', () => {
  it('escapa HTML do texto digitado pelo cliente', () => {
    const notice = staffMessageNotice({ order, topic: null, body: '<script>alert(1)</script>', threadUrl: url })
    const email = renderNotice({
      branding: { storeName: 'Arte no Jardim', storeUrl: 'https://loja.test', logoUrl: null },
      ...notice,
    })
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
    expect(email.text).toContain('<script>alert(1)</script>')
  })
})

/**
 * Os avisos da equipe viram ALERTA, e o título é o que fica no histórico do
 * banco. Por isso ele nunca leva o nome do cliente: o texto inteiro só viaja na
 * fila, longe do alcance da anonimização LGPD.
 */
describe('alertas da equipe', () => {
  const summary: OrderSummary = {
    ...order,
    total: 18990,
    method: 'PIX',
    items: Array.from({ length: 10 }, (_, i) => ({ label: `Vela ${i + 1}`, quantity: 1, madeToOrderQuantity: 0 })),
    shipping: 'Jadlog .Package — Caxias do Sul/RS',
    couponCode: 'BEMVINDO10',
    productionDays: 0,
    productionDueAt: null,
  }

  it('pedido pago: valor e método no texto, nome do cliente fora do título', () => {
    const notice = staffOrderPaidNotice({ order: summary, orderUrl: url })
    expect(notice.heading).toBe('Novo pedido pago: #1042')
    expect(notice.heading).not.toContain('Maria')
    expect(brl(notice.paragraphs[0]!)).toContain('Maria da Silva pagou R$ 189,90 (Pix). Já pode separar.')
    expect(notice.paragraphs).toContain('… e mais 2 itens.')
    expect(notice.paragraphs).toContain('Entrega: Jadlog .Package — Caxias do Sul/RS.')
  })

  it('pedido pago com encomenda: o próximo passo é produzir, com a data', () => {
    const notice = staffOrderPaidNotice({
      order: {
        ...summary,
        items: [
          { label: 'Vela A', quantity: 2, madeToOrderQuantity: 2 },
          { label: 'Vela B', quantity: 3, madeToOrderQuantity: 1 },
          { label: 'Vela C', quantity: 1, madeToOrderQuantity: 0 },
        ],
        productionDays: 7,
        productionDueAt: new Date('2026-11-04T15:00:00Z'),
      },
      orderUrl: url,
    })
    expect(notice.paragraphs[0]).toContain('Tem encomenda: produzir até qua., 04/11 (7 dias úteis).')
    expect(notice.paragraphs).toContain('2× Vela A — a produzir')
    expect(notice.paragraphs).toContain('3× Vela B — 1 a produzir')
    expect(notice.paragraphs).toContain('1× Vela C')
  })

  it('pedido aguardando pagamento só com encomenda não fala em reserva', () => {
    const allMade = staffOrderCreatedNotice({
      order: { ...summary, items: [{ label: 'Vela', quantity: 1, madeToOrderQuantity: 1 }], productionDays: 7 },
      orderUrl: url,
    })
    expect(allMade.paragraphs.join(' ')).toContain('nada fica reservado')

    const withStock = staffOrderCreatedNotice({ order: summary, orderUrl: url })
    expect(withStock.paragraphs.join(' ')).toContain('O estoque fica reservado')
  })

  it('resumo da produção: atrasadas e vencendo, sem nome de cliente', () => {
    const notice = staffProductionDueNotice({
      overdue: [{ number: 19, dueAt: new Date('2026-10-20T15:00:00Z') }],
      dueSoon: [
        { number: 21, dueAt: new Date('2026-10-22T15:00:00Z') },
        { number: 23, dueAt: new Date('2026-10-22T15:00:00Z') },
      ],
      ordersUrl: url,
    })
    expect(notice.heading).toBe('Encomendas: 1 atrasada, 2 vencem logo')
    expect(notice.paragraphs[0]).toBe('Pedido #19: o prazo de produção venceu ter., 20/10.')
    expect(notice.paragraphs[1]).toBe('Pedido #21: fica pronto até qui., 22/10.')
  })

  it('nenhum título de alerta da equipe leva o nome do cliente', () => {
    const headings = [
      staffMessageNotice({ order, topic: null, body: 'oi', threadUrl: url }).heading,
      staffCanceledNotice({ order, reason: 'x', refund: { status: 'none' }, orderUrl: url, reservedStock: true }).heading,
      staffOrderPaidNotice({ order: summary, orderUrl: url }).heading,
    ]
    for (const heading of headings) expect(heading).not.toContain('Maria')
  })

  it('estoque baixo de um item: produto e variante no título; reserva explicada', () => {
    const notice = staffLowStockNotice({
      items: [
        { productName: 'Vela Lavanda', variantLabel: '300 g', sku: 'VL-300', onHand: 3, reserved: 1, madeToOrderFallback: false },
      ],
      threshold: 2,
      stockUrl: url,
    })
    expect(notice.heading).toBe('Estoque baixo: Vela Lavanda (300 g)')
    expect(notice.paragraphs[0]).toBe(
      'Vela Lavanda (300 g), SKU VL-300: 2 unidades disponíveis (3 unidades em estoque, 1 reservada em pedidos não pagos).',
    )
    expect(notice.paragraphs[1]).toContain('2 unidades')
  })

  it('esgotado e vários itens', () => {
    const one = staffLowStockNotice({
      items: [{ productName: 'Vela', variantLabel: null, sku: 'V', onHand: 0, reserved: 0, madeToOrderFallback: false }],
      threshold: 2,
      stockUrl: url,
    })
    expect(one.heading).toBe('Esgotado: Vela')
    expect(one.paragraphs[0]).toContain('esgotado')

    const hybrid = staffLowStockNotice({
      items: [{ productName: 'Vela', variantLabel: null, sku: 'V', onHand: 0, reserved: 0, madeToOrderFallback: true }],
      threshold: 2,
      stockUrl: url,
    })
    expect(hybrid.heading).toBe('Estoque baixo: Vela')
    expect(hybrid.paragraphs[0]).toContain('acabou a pronta entrega')

    const many = staffLowStockNotice({
      items: [
        { productName: 'A', variantLabel: null, sku: 'A', onHand: 0, reserved: 0, madeToOrderFallback: false },
        { productName: 'B', variantLabel: null, sku: 'B', onHand: 2, reserved: 0, madeToOrderFallback: false },
      ],
      threshold: 2,
      stockUrl: url,
    })
    expect(many.heading).toBe('Estoque baixo em 2 produtos')
  })

  it('frete desconectado pede ação no assunto', () => {
    expect(staffShippingDisconnectedNotice({ shippingUrl: url }).subject).toContain('[Ação necessária]')
  })

  it('loja fora do ar e de volta, com nomes juntos', () => {
    const down = staffSiteDownNotice({
      targets: [
        { name: 'Loja', url: 'https://loja.test', detail: 'HTTP 502' },
        { name: 'Painel', url: 'https://admin.loja.test', detail: 'falha de conexão' },
        { name: 'API', url: 'https://api.loja.test/api/v1/health', detail: 'sem resposta em 15 s' },
      ],
      storeUrl: 'https://loja.test',
    })
    expect(down.heading).toBe('Loja, Painel e API fora do ar')
    expect(down.paragraphs[0]).toBe('Loja (https://loja.test) não responde: HTTP 502.')

    const up = staffSiteUpNotice({ targets: [{ name: 'Loja', downMinutes: 1 }], storeUrl: 'https://loja.test' })
    expect(up.heading).toBe('Loja de volta ao ar')
    expect(up.paragraphs[0]).toContain('cerca de 1 minuto fora')
  })
})

describe('aviso de reposição (Avise-me)', () => {
  const productUrl = 'https://loja.test/produtos/vela-1'

  it('assunto com o produto e a variação, e botão para a página', () => {
    const notice = customerBackInStockNotice({ productName: 'Vela Jardim', variantLabel: 'Lavanda', productUrl })
    expect(notice.subject).toBe('Voltou: Vela Jardim (Lavanda)')
    expect(notice.ctaUrl).toBe(productUrl)
  })

  it('produto sem variação não ganha parênteses', () => {
    const notice = customerBackInStockNotice({ productName: 'Vela Jardim', variantLabel: null, productUrl })
    expect(notice.subject).toBe('Voltou: Vela Jardim')
  })

  it('diz que é o único aviso — a inscrição some no envio', () => {
    const notice = customerBackInStockNotice({ productName: 'Vela Jardim', variantLabel: null, productUrl })
    expect(notice.paragraphs.join(' ')).toContain('único aviso')
  })

  it('passou a ser sob encomenda: não promete estoque, diz o prazo', () => {
    const notice = customerBackInStockNotice({ productName: 'Vela Jardim', variantLabel: null, productUrl, productionDays: 7 })
    expect(notice.subject).toBe('Agora sob encomenda: Vela Jardim')
    expect(notice.heading).not.toContain('estoque')
    expect(notice.paragraphs.join(' ')).toContain('em até 7 dias úteis')
    expect(notice.paragraphs.join(' ')).toContain('único aviso')
  })
})
