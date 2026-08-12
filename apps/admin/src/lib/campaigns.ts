import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import type {
  Campaign,
  CampaignPreview,
  SendProductCampaignInput,
} from '@ecommerce/shared/contracts'
import { apiFetch, apiFetchPaginated } from './api'

const KEY = ['campaigns']
const PREVIEW_KEY = ['campaign-preview']

/** A aba "Avançado" mostra 50 por página: a lista pagina no SERVIDOR, então a
 *  tela nunca renderiza cinco mil linhas nem precisa de virtualização. */
export const PREVIEW_PER_PAGE = 50

export const useCampaignPreview = (productId: string, page: number, enabled: boolean) =>
  useQuery({
    queryKey: [...PREVIEW_KEY, productId, page],
    queryFn: () =>
      apiFetch<CampaignPreview>(
        `${ROUTES.admin.campaigns.preview(productId)}?page=${page}&perPage=${PREVIEW_PER_PAGE}`,
      ),
    // Sem isto o preview seria buscado no primeiro render da tela do produto,
    // antes de alguém abrir o diálogo — uma query cara para nada.
    enabled,
  })

export const useSendCampaign = () => {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ productId, input }: { productId: string; input: SendProductCampaignInput }) =>
      apiFetch<Campaign>(ROUTES.admin.campaigns.send(productId), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY })
      // A prévia também muda: quem recebeu agora pode ter se descadastrado
      // depois, e a próxima campanha precisa refletir isso.
      void qc.invalidateQueries({ queryKey: PREVIEW_KEY })
    },
  })
}

export const useCampaigns = (page: number) =>
  useQuery({
    queryKey: [...KEY, page],
    queryFn: () => apiFetchPaginated<Campaign>(`${ROUTES.admin.campaigns.list}?page=${page}`),
  })
