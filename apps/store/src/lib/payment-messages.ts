/**
 * Motivo de recusa do Mercado Pago (status_detail) → o que dizer ao cliente.
 * Recusa clara converte mais que "erro": quem sabe que é saldo troca de cartão;
 * quem lê "erro genérico" desiste. Motivo desconhecido cai no texto padrão.
 */
const DECLINE_MESSAGES: Record<string, string> = {
  insufficient_amount: 'Saldo ou limite insuficiente. Tente outro cartão ou pague com Pix.',
  card_insufficient_amount: 'Saldo ou limite insuficiente. Tente outro cartão ou pague com Pix.',
  amount_limit_exceeded: 'O valor passa do limite do cartão. Tente outro cartão ou pague com Pix.',
  bad_filled_card_data: 'Algum dado do cartão não confere. Revise número, validade, código e nome.',
  invalid_request: 'Algum dado do cartão não confere. Revise número, validade, código e nome.',
  invalid_card_token: 'Os dados do cartão expiraram. Preencha de novo para pagar.',
  rejected_by_issuer: 'O banco emissor recusou o pagamento. Fale com o banco ou use outro cartão.',
  required_call_for_authorize:
    'O banco precisa autorizar este pagamento. Ligue para o banco emissor e tente de novo, ou use outro cartão.',
  card_disabled: 'Este cartão está bloqueado. Ative-o com o banco ou use outro cartão.',
  high_risk: 'Não conseguimos aprovar este pagamento. Tente outro cartão ou pague com Pix.',
  max_attempts_exceeded: 'Muitas tentativas com este cartão. Use outro cartão ou pague com Pix.',
  invalid_installments: 'Este cartão não aceita esse número de parcelas. Escolha outra opção.',
  processing_error: 'Houve uma falha ao processar o pagamento. Tente novamente em instantes.',
}

const DEFAULT_DECLINE = 'Pagamento não aprovado. Tente outro cartão ou pague com Pix.'

export const declineMessage = (reason: string | undefined): string =>
  (reason && DECLINE_MESSAGES[reason]) || DEFAULT_DECLINE
