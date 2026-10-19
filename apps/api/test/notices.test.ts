import { describe, it, expect } from 'vitest'
import {
  customerCanceledNotice,
  customerCancelRequestNotice,
  customerReplyNotice,
  staffCanceledNotice,
  staffMessageNotice,
  toParagraphs,
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
    })
    expect(notice.subject.startsWith('[Ação necessária]')).toBe(true)
  })

  it('cancelamento com estorno ok é informativo', () => {
    const notice = staffCanceledNotice({
      order,
      reason: 'Comprei por engano',
      refund: { status: 'requested', amount: 5000, method: 'PIX' },
      orderUrl: url,
    })
    expect(notice.subject.startsWith('[Cancelamento]')).toBe(true)
    expect(notice.paragraphs.join(' ')).toContain('Comprei por engano')
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
