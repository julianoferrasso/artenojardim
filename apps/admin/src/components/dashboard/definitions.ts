import type { MetricKey } from './format'

/**
 * "Como calculamos" — o texto atrás de cada ⓘ. Número sem definição vira
 * discussão ("mas no Mercado Pago deu outro valor"); a definição na própria tela
 * encerra a conversa antes de começar.
 */

export const METRIC_DEFINITIONS: Record<MetricKey, string> = {
  revenue:
    'Soma dos pedidos pagos criados no período (produtos − descontos + frete), já descontados os reembolsos parciais. Pedido cancelado ou reembolsado por inteiro não entra.',
  orders:
    'Pedidos criados no período que foram pagos e não foram cancelados. Pedido parcialmente reembolsado continua contando.',
  averageTicket: 'Receita dividida pelo número de pedidos pagos.',
  visits:
    'Sessões na loja: uma visita termina depois de 30 minutos sem atividade ou na virada do dia. Robôs não contam. Ninguém é identificado — só o total é guardado.',
  conversionRate:
    'Pedidos pagos divididos pelas visitas, contando só os dias em que as visitas já eram registradas.',
}

export const CARD_DEFINITIONS = {
  revenue:
    'Do valor dos produtos até a receita: descontos incluem o frete grátis de cupom; reembolsos são só os parciais (o pedido estornado por inteiro já sai da venda).',
  funnel:
    'Das visitas aos pedidos pagos. "Aguardando pagamento" são pedidos feitos e ainda não pagos (Pix vencido, cartão recusado); "cancelados" inclui os reembolsados por inteiro.',
  payments: 'Meio usado no pagamento aprovado de cada pedido pago. Tentativas recusadas não contam.',
  customers:
    'Novo é quem fez a primeira compra da vida dentro do período; recorrente já tinha comprado antes. Cadastros são contas criadas no período, comprando ou não.',
  traffic:
    'De onde vieram as visitas: link com UTM, site de origem ou navegador do próprio app (Instagram, Facebook). Sem nenhum sinal, a visita é "direta".',
  products:
    'Receita é o valor dos itens antes do desconto do pedido. Conversão é pedidos com o produto ÷ visualizações da página dele.',
  categories: 'Um produto em duas categorias soma nas duas, então a soma das categorias pode passar da receita.',
  states: 'Pelo estado do endereço de entrega dos pedidos pagos.',
  coupons: 'Pedidos pagos que usaram o cupom, o desconto concedido e a receita desses pedidos.',
  recentOrders: 'Os pedidos mais recentes criados no período, de qualquer situação.',
} as const
