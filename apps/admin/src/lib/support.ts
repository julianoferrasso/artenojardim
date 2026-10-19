import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ROUTES, type SupportAuthor } from '@ecommerce/shared/constants'
import type {
  SupportReplyInput,
  SupportStatusInput,
  SupportSummary,
  SupportThread,
  SupportThreadListItem,
  SupportView,
} from '@ecommerce/shared/contracts'
import { apiFetch, apiFetchPaginated } from './api'
import { useAuth } from './auth'

/**
 * Tudo do atendimento mora sob ['support']: lista, detalhe e os contadores do
 * menu. Uma resposta muda os três ao mesmo tempo (a conversa sai de "Aguardando"
 * e o número do menu cai), então as mutações invalidam o prefixo inteiro.
 */
const KEY = ['support']

export const SUPPORT_AUTHOR_LABEL: Record<SupportAuthor, string> = {
  CUSTOMER: 'Cliente',
  STAFF: 'Loja',
  SYSTEM: 'Sistema',
}

export type SupportThreadListParams = {
  view: SupportView
  q?: string | undefined
  page?: number | undefined
}

export const useSupportThreads = (params: SupportThreadListParams) =>
  useQuery({
    queryKey: [...KEY, 'threads', params],
    queryFn: () => {
      const search = new URLSearchParams()
      search.set('view', params.view)
      search.set('page', String(params.page ?? 1))
      search.set('perPage', '20')
      if (params.q) search.set('q', params.q)
      return apiFetchPaginated<SupportThreadListItem>(`${ROUTES.admin.support.threads}?${search}`)
    },
  })

export const useSupportThread = (id: string) =>
  useQuery({
    queryKey: [...KEY, 'thread', id],
    queryFn: () => apiFetch<SupportThread>(ROUTES.admin.support.thread(id)),
    enabled: !!id,
  })

/**
 * Alimenta o número do menu. O polling é o que avisa quem deixou o painel
 * aberto numa aba; sem sessão a chamada levaria 401 a cada minuto.
 */
export const useSupportSummary = () => {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...KEY, 'summary'],
    queryFn: () => apiFetch<SupportSummary>(ROUTES.admin.support.summary),
    enabled: !!user,
    refetchInterval: 60_000,
  })
}

const useThreadMutation = <TInput>(id: string, request: (input: TInput) => Promise<SupportThread>) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: (thread) => {
      qc.setQueryData([...KEY, 'thread', id], thread)
      qc.invalidateQueries({ queryKey: KEY })
      // A conversa aparece no card do pedido (status) e a resposta pode virar evento.
      if (thread.order) qc.invalidateQueries({ queryKey: ['order', thread.order.id] })
    },
  })
}

export const useReplySupport = (id: string) =>
  useThreadMutation<SupportReplyInput>(id, (input) =>
    apiFetch<SupportThread>(ROUTES.admin.support.messages(id), {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  )

export const useSetSupportStatus = (id: string) =>
  useThreadMutation<SupportStatusInput>(id, (input) =>
    apiFetch<SupportThread>(ROUTES.admin.support.thread(id), {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  )
