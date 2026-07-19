import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { appError, externalServiceError } from '../../shared/errors.js'
import { logger } from '../../config/logger.js'

/**
 * ViaCEP — consulta de endereço por CEP. Grátis, sem chave.
 *
 * Vive em integrations/: sabe falar com o ViaCEP, NÃO sabe do nosso negócio.
 * Traduz o erro externo (CEP inexistente, serviço fora do ar) em appError, para
 * que o módulo nunca veja um FetchError cru nem a forma da resposta do ViaCEP.
 */

export type CepAddress = {
  zipCode: string
  street: string
  district: string
  city: string
  state: string
}

type ViaCepResponse = {
  cep?: string
  logradouro?: string
  bairro?: string
  localidade?: string
  uf?: string
  erro?: boolean | string
}

const VIACEP_URL = 'https://viacep.com.br/ws'

/**
 * Busca o endereço de um CEP (8 dígitos, já normalizado pelo schema).
 * CEP inexistente → 404 de negócio; ViaCEP fora do ar → 503.
 */
export const lookupCep = async (zipCode: string): Promise<CepAddress> => {
  let res: Response
  try {
    // AbortSignal.timeout: o ViaCEP no caminho do checkout não pode pendurar o
    // request do cliente se estiver lento.
    res = await fetch(`${VIACEP_URL}/${zipCode}/json/`, {
      signal: AbortSignal.timeout(5000),
    })
  } catch (err) {
    throw externalServiceError('ViaCEP', err)
  }

  if (!res.ok) throw externalServiceError('ViaCEP', new Error(`HTTP ${res.status}`))

  const data = (await res.json()) as ViaCepResponse

  // ViaCEP responde 200 com { erro: true } para CEP inexistente — não é um erro
  // HTTP, é o payload que diz "não achei".
  if (data.erro) {
    throw appError(ERROR_CODES.NOT_FOUND, 'CEP não encontrado', 404)
  }

  // Alguns CEPs (cidades pequenas) vêm sem logradouro/bairro — o cliente
  // completa na mão. Cidade e UF sempre vêm.
  if (!data.localidade || !data.uf) {
    logger.warn({ zipCode, data }, 'ViaCEP retornou resposta incompleta')
    throw appError(ERROR_CODES.NOT_FOUND, 'CEP não encontrado', 404)
  }

  return {
    zipCode,
    street: data.logradouro ?? '',
    district: data.bairro ?? '',
    city: data.localidade,
    state: data.uf,
  }
}
