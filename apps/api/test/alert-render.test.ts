import { describe, it, expect } from 'vitest'
import {
  adminPathOf,
  emailCodeNotice,
  escapeTelegramHtml,
  renderTelegramAlert,
  renderWhatsAppAlert,
  telegramCodeMessage,
  testAlertContent,
  toTemplateParam,
  type AlertContent,
} from '../src/modules/alerts/domain/render.js'

/**
 * O mesmo alerta em três formatos. O que já quebrou (ou quebraria) em produção:
 * HTML do cliente injetado no Telegram, quebra de linha num parâmetro da Meta
 * (erro 132018) e mensagem acima do limite do Telegram.
 */

const content: AlertContent = {
  subject: '[Atendimento] Pedido #1042 — mensagem de Maria',
  heading: 'Mensagem sobre o pedido #1042',
  paragraphs: ['Maria escreveu:', 'A vela <b>chegou</b> quebrada & torta', 'Podem trocar?'],
  ctaLabel: 'Responder no painel',
  ctaUrl: 'https://admin.loja.test/atendimento/thr_1',
  footerNote: 'rodapé',
}

describe('renderTelegramAlert', () => {
  it('escapa o texto do cliente: < > & viram entidades, e só as nossas tags sobram', () => {
    const html = renderTelegramAlert('CUSTOMER_MESSAGE', content)
    expect(html).toContain('A vela &lt;b&gt;chegou&lt;/b&gt; quebrada &amp; torta')
    expect(html).toContain('<b>Mensagem sobre o pedido #1042</b>')
    expect(html).toContain('<a href="https://admin.loja.test/atendimento/thr_1">Responder no painel</a>')
    expect(html.startsWith('💬 ')).toBe(true)
  })

  it('o emoji do conteúdo vence o do tipo (a loja voltou não é 🔴)', () => {
    expect(renderTelegramAlert('SITE_DOWN', { ...content, emoji: '🟢' }).startsWith('🟢 ')).toBe(true)
  })

  it('mensagem gigante fica abaixo do limite de 4096 do Telegram', () => {
    const huge = { ...content, paragraphs: ['x'.repeat(10_000)] }
    const visible = renderTelegramAlert('CUSTOMER_MESSAGE', huge).replace(/<[^>]+>/g, '')
    expect(visible.length).toBeLessThan(4096)
    expect(visible).toContain('…')
  })
})

describe('escapeTelegramHtml', () => {
  it('escapa aspas para o atributo href', () => {
    expect(escapeTelegramHtml('a"b')).toBe('a&quot;b')
  })
})

describe('toTemplateParam', () => {
  it('sem quebra de linha, tab ou 4+ espaços seguidos (a Meta recusa)', () => {
    const param = toTemplateParam('linha 1\nlinha 2\r\n\tlinha 3      fim', 200)
    expect(param).toBe('linha 1 · linha 2 · linha 3   fim')
    expect(param).not.toMatch(/[\n\r\t]| {4,}/)
  })

  it('corta no limite com reticências', () => {
    const param = toTemplateParam('a'.repeat(50), 10)
    expect(param).toHaveLength(10)
    expect(param.endsWith('…')).toBe(true)
  })
})

describe('adminPathOf', () => {
  it('devolve o caminho dentro do painel, sem a barra inicial', () => {
    expect(adminPathOf('https://admin.loja.test/pedidos/ord_1', 'https://admin.loja.test')).toBe('pedidos/ord_1')
    expect(adminPathOf('https://admin.loja.test/pedidos/ord_1', 'https://admin.loja.test/')).toBe('pedidos/ord_1')
  })

  it('link fora do painel (ou a raiz) cai na tela de Alertas: a Meta não aceita parâmetro vazio', () => {
    expect(adminPathOf('https://loja.test/', 'https://admin.loja.test')).toBe('alertas')
    expect(adminPathOf('https://admin.loja.test/', 'https://admin.loja.test')).toBe('alertas')
  })
})

describe('renderWhatsAppAlert', () => {
  it('título com emoji, corpo numa linha só e o caminho do painel no botão', () => {
    const { bodyParams, buttonUrlParam } = renderWhatsAppAlert('CUSTOMER_MESSAGE', content, 'https://admin.loja.test')
    expect(bodyParams[0]).toBe('💬 Mensagem sobre o pedido #1042')
    expect(bodyParams[1]).not.toMatch(/\n/)
    expect(bodyParams[1]).toContain('Maria escreveu: · A vela <b>chegou</b>')
    expect(buttonUrlParam).toBe('atendimento/thr_1')
  })
})

describe('mensagens do código', () => {
  it('e-mail: código no assunto e no título, com a validade', () => {
    const notice = emailCodeNotice({ code: '012345', label: 'Celular da Ana', storeName: 'Arte no Jardim', adminUrl: 'https://admin.loja.test/alertas' })
    expect(notice.subject).toContain('012345')
    expect(notice.heading).toBe('Seu código: 012345')
    expect(notice.paragraphs.join(' ')).toContain('10 minutos')
  })

  it('Telegram: código em <code> (toque para copiar) e nome da loja escapado', () => {
    const html = telegramCodeMessage({ code: '987654', storeName: 'Arte & Jardim' })
    expect(html).toContain('<code>987654</code>')
    expect(html).toContain('Arte &amp; Jardim')
  })
})

describe('testAlertContent', () => {
  it('lista os eventos que o destino assina', () => {
    const c = testAlertContent({ label: 'Grupo', events: ['ORDER_PAID', 'LOW_STOCK'], alertsUrl: 'https://admin.loja.test/alertas' })
    expect(c.paragraphs.join(' ')).toContain('Novo pedido pago, Estoque baixo')
    expect(c.emoji).toBe('✅')
  })

  it('sem evento marcado, diz o que fazer', () => {
    const c = testAlertContent({ label: 'Grupo', events: [], alertsUrl: 'https://admin.loja.test/alertas' })
    expect(c.paragraphs.join(' ')).toContain('Nenhum evento marcado')
  })
})
