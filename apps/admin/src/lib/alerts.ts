import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import {
  ERROR_CODES,
  type AlertDestination,
  type AlertDestinationStep,
  type AlertHistoryItem,
  type AlertSettings,
  type AlertsOverview,
  type AlertTestResult,
  type CreateAlertDestinationInput,
  type TelegramLinkStatus,
  type UpdateAlertDestinationInput,
} from '@ecommerce/shared/contracts'
import { ApiError, apiFetch } from './api'

const KEY = ['alerts']
const OVERVIEW_KEY = [...KEY, 'overview']

/** `enabled` porque quem não é ADMIN levaria 403 em cada chamada. */
export const useAlertsOverview = (enabled: boolean) =>
  useQuery({
    queryKey: OVERVIEW_KEY,
    queryFn: () => apiFetch<AlertsOverview>(ROUTES.admin.alerts.overview),
    enabled,
  })

/** Só busca com a aba aberta, e se atualiza sozinho: o alerta sai pela fila, segundos depois. */
export const useAlertHistory = (enabled: boolean) =>
  useQuery({
    queryKey: [...KEY, 'history'],
    queryFn: () => apiFetch<AlertHistoryItem[]>(ROUTES.admin.alerts.history),
    enabled,
    refetchInterval: 30_000,
  })

const useInvalidateAlerts = () => {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: KEY })
}

export const useCreateAlertDestination = () => {
  const invalidate = useInvalidateAlerts()
  return useMutation({
    mutationFn: (input: CreateAlertDestinationInput) =>
      apiFetch<AlertDestinationStep>(ROUTES.admin.alerts.destinations, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  })
}

/** Novo código — ou, no Telegram ainda sem chat, um link novo. */
export const useResendAlertCode = () => {
  const invalidate = useInvalidateAlerts()
  return useMutation({
    mutationFn: (id: string) => apiFetch<AlertDestinationStep>(ROUTES.admin.alerts.resend(id), { method: 'POST' }),
    onSuccess: invalidate,
  })
}

export const useVerifyAlertCode = () => {
  const invalidate = useInvalidateAlerts()
  return useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      apiFetch<AlertDestination>(ROUTES.admin.alerts.verify(id), {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
    onSuccess: invalidate,
  })
}

/**
 * Espera o "Iniciar" no Telegram: a API segura a chamada até 10 s. Quem chama
 * faz o laço — em sequência, nunca em intervalo, para não abrir duas esperas.
 */
export const syncTelegramLink = (id: string): Promise<TelegramLinkStatus> =>
  apiFetch<TelegramLinkStatus>(ROUTES.admin.alerts.telegramSync(id), { method: 'POST' })

/**
 * Nome, eventos e pausa. Otimista: o chip e o switch mudam na hora do clique.
 * O `scope` enfileira os PATCHes — dois cliques rápidos mandam a lista inteira de
 * eventos em ordem, e o segundo não chega antes do primeiro.
 */
export const useUpdateAlertDestination = () => {
  const qc = useQueryClient()
  return useMutation({
    scope: { id: 'alert-destination-update' },
    mutationFn: ({ id, input }: { id: string; input: UpdateAlertDestinationInput }) =>
      apiFetch<AlertDestination>(ROUTES.admin.alerts.destination(id), {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: OVERVIEW_KEY })
      const previous = qc.getQueryData<AlertsOverview>(OVERVIEW_KEY)
      qc.setQueryData<AlertsOverview>(OVERVIEW_KEY, (data) =>
        data && {
          ...data,
          destinations: data.destinations.map((d) =>
            d.id === id
              ? {
                  ...d,
                  ...(input.label !== undefined ? { label: input.label } : {}),
                  ...(input.events !== undefined ? { events: input.events } : {}),
                  ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
                }
              : d,
          ),
        },
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(OVERVIEW_KEY, context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: OVERVIEW_KEY }),
  })
}

export const useDeleteAlertDestination = () => {
  const invalidate = useInvalidateAlerts()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(ROUTES.admin.alerts.destination(id), { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

export const useTestAlertDestination = () => {
  const invalidate = useInvalidateAlerts()
  return useMutation({
    mutationFn: (id: string) => apiFetch<AlertTestResult>(ROUTES.admin.alerts.test(id), { method: 'POST' }),
    // Sucesso e falha mudam o destino (último envio, erro, pausa): os dois recarregam.
    onSettled: invalidate,
  })
}

export const useUpdateAlertSettings = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AlertSettings) =>
      apiFetch<AlertSettings>(ROUTES.admin.alerts.settings, { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: (settings) => {
      qc.setQueryData<AlertsOverview>(OVERVIEW_KEY, (data) => data && { ...data, settings })
    },
  })
}

// ── Rótulos e formatos ───────────────────────────────────────────────────────

/** A API manda o motivo legível (provedor, código errado, espera). Aqui só os casos genéricos. */
export const alertErrorMessage = (err: unknown, fallback = 'Não foi possível concluir. Tente de novo.'): string => {
  if (!(err instanceof ApiError)) return fallback
  if (err.code === ERROR_CODES.RATE_LIMITED) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.'
  if (err.code === ERROR_CODES.VALIDATION_ERROR) return err.details?.[0]?.message ?? err.message
  return err.message
}

/** "+55 (54) 99999-8888" a partir de 5554999998888; outro país fica com o + e os dígitos. */
export const formatPhone = (digits: string): string => {
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const rest = digits.slice(4)
    return `+55 (${digits.slice(2, 4)}) ${rest.slice(0, -4)}-${rest.slice(-4)}`
  }
  return `+${digits}`
}

export const destinationAddress = (d: AlertDestination): string => {
  if (d.channel === 'TELEGRAM') return d.addressLabel ?? (d.address ? 'Chat vinculado' : 'Aguardando o "Iniciar" no Telegram')
  if (d.channel === 'WHATSAPP' && d.address) return formatPhone(d.address)
  return d.address ?? ''
}

export type DestinationStatus = 'active' | 'pending' | 'paused' | 'failing'

export const destinationStatus = (d: AlertDestination): DestinationStatus => {
  if (!d.verified) return 'pending'
  if (!d.enabled) return 'paused'
  return d.lastError ? 'failing' : 'active'
}

export const DESTINATION_STATUS_LABEL: Record<DestinationStatus, string> = {
  active: 'Ativo',
  pending: 'Aguardando código',
  paused: 'Pausado',
  failing: 'Com falha',
}

export const DESTINATION_STATUS_CLASS: Record<DestinationStatus, string> = {
  active: 'border-success/30 bg-success/15 text-success',
  pending: 'border-warning/30 bg-warning/15 text-warning-foreground',
  paused: 'border-border bg-muted text-muted-foreground',
  failing: 'border-destructive/30 bg-destructive/10 text-destructive',
}
