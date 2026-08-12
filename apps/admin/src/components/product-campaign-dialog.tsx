'use client'

import { useState } from 'react'
import { ERROR_CODES } from '@ecommerce/shared/contracts'
import type { Product } from '@ecommerce/shared/contracts'
import type { EmailCampaignKind } from '@ecommerce/shared/constants'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApiError } from '@/lib/api'
import { PREVIEW_PER_PAGE, useCampaignPreview, useSendCampaign } from '@/lib/campaigns'

/**
 * Disparo do e-mail de divulgação de um produto.
 *
 * A aba "Avançado" desmarca destinatários DESTE envio apenas — a preferência
 * gravada de cada cliente não é tocada. Quem decide sair da lista de vez é o
 * cliente, pelo link de descadastro do rodapé.
 */

const SOURCE_LABEL: Record<string, string> = {
  CUSTOMER: 'Conta',
  NEWSLETTER: 'Newsletter',
  BOTH: 'Conta + newsletter',
}

const errorMessage = (err: unknown): string => {
  if (!(err instanceof ApiError)) return 'Não foi possível enviar o e-mail.'

  // Reagimos ao CODE, nunca ao texto: texto é para humanos e muda sem aviso.
  if (err.code === ERROR_CODES.CAMPAIGN_ALREADY_SENT) {
    return 'Este produto já teve o e-mail de novidade enviado. Para divulgá-lo de novo, use o envio manual.'
  }
  if (err.code === ERROR_CODES.CAMPAIGN_NO_RECIPIENTS) {
    return 'Ninguém receberia este e-mail: nenhum cliente ativo aceita novidades, ou todos foram desmarcados.'
  }
  if (err.code === ERROR_CODES.PRODUCT_NOT_ACTIVE) {
    return 'Publique o produto antes de divulgá-lo — o e-mail levaria o cliente a uma página que não existe.'
  }
  return err.message
}

export function ProductCampaignDialog({
  product,
  kind = 'MANUAL',
}: {
  product: Pick<Product, 'id' | 'name' | 'status'>
  kind?: EmailCampaignKind
}) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [subject, setSubject] = useState(`Novidade: ${product.name}`)
  /**
   * Exclusões DESTE envio. Vive no estado do diálogo e some ao fechar — é
   * exatamente o que "só para este envio" significa. Guarda e-mail e não id: o
   * mesmo endereço pode estar nas duas origens, e excluir por id deixaria a
   * metade "newsletter" da mesma pessoa receber o e-mail assim mesmo.
   */
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<number | null>(null)

  const preview = useCampaignPreview(product.id, page, open)
  const send = useSendCampaign()

  const total = preview.data?.total ?? 0
  const willReceive = total - excluded.size

  const reset = () => {
    setExcluded(new Set())
    setPage(1)
    setSubject(`Novidade: ${product.name}`)
    setError(null)
    setSent(null)
  }

  const toggle = (email: string) => {
    setExcluded((current) => {
      const next = new Set(current)
      if (next.has(email)) next.delete(email)
      else next.add(email)
      return next
    })
  }

  if (product.status !== 'ACTIVE') {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        title="Publique o produto primeiro: o e-mail levaria o cliente a uma página que não existe."
      >
        Enviar e-mail de divulgação
      </Button>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Enviar e-mail de divulgação
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Divulgar {product.name}</DialogTitle>
          <DialogDescription>
            O e-mail vai para quem aceita novidades — clientes com e-mail confirmado e inscritos da
            newsletter, sem repetir quem está nos dois.
          </DialogDescription>
        </DialogHeader>

        {sent !== null ? (
          <p className="rounded-md bg-muted px-4 py-3 text-sm">
            Campanha criada. {sent} {sent === 1 ? 'e-mail entrou' : 'e-mails entraram'} na fila e
            serão enviados nos próximos minutos.
          </p>
        ) : (
          <Tabs defaultValue="resumo">
            <TabsList className="w-full">
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="avancado">Avançado</TabsTrigger>
            </TabsList>

            <TabsContent value="resumo" className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="campaign-subject">Assunto</Label>
                <Input
                  id="campaign-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={150}
                />
              </div>

              <p className="text-sm text-muted-foreground">
                {preview.isLoading ? (
                  'Contando destinatários…'
                ) : (
                  <>
                    <strong className="font-medium text-foreground">{willReceive}</strong> de {total}{' '}
                    {total === 1 ? 'pessoa vai' : 'pessoas vão'} receber.
                    {excluded.size > 0 && ` ${excluded.size} desmarcada${excluded.size > 1 ? 's' : ''}.`}
                  </>
                )}
              </p>

              <p className="text-xs text-muted-foreground">
                O envio acontece em segundo plano: a tela responde na hora e os e-mails saem aos
                poucos, para não estourar o limite do provedor.
              </p>
            </TabsContent>

            <TabsContent value="avancado" className="space-y-3 pt-4">
              <p className="text-xs text-muted-foreground">
                Desmarcar exclui a pessoa <strong className="font-medium">deste envio</strong>. A
                preferência dela continua intacta — quem sai da lista de vez é o próprio cliente,
                pelo link do rodapé do e-mail.
              </p>

              {preview.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

              {preview.data && (
                <>
                  <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
                    {preview.data.recipients.map((r) => (
                      <li key={r.email} className="flex items-center gap-3 px-3 py-2">
                        <input
                          type="checkbox"
                          id={`r-${r.email}`}
                          checked={!excluded.has(r.email)}
                          onChange={() => toggle(r.email)}
                          className="size-4 shrink-0 accent-primary"
                        />
                        <label htmlFor={`r-${r.email}`} className="flex-1 cursor-pointer text-sm">
                          <span className="block truncate">{r.name ?? r.email}</span>
                          {r.name && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {r.email}
                            </span>
                          )}
                        </label>
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {SOURCE_LABEL[r.source] ?? r.source}
                        </Badge>
                      </li>
                    ))}
                  </ul>

                  {preview.data.meta.totalPages > 1 && (
                    <div className="flex items-center justify-between text-sm">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        Anterior
                      </Button>
                      <span className="text-muted-foreground">
                        {page} de {preview.data.meta.totalPages} · {total} no total
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= preview.data.meta.totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Próxima
                      </Button>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        )}

        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          {sent !== null ? (
            <Button onClick={() => setOpen(false)}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={send.isPending}>
                Cancelar
              </Button>
              <Button
                disabled={send.isPending || preview.isLoading || willReceive <= 0}
                onClick={() => {
                  setError(null)
                  send.mutate(
                    {
                      productId: product.id,
                      input: { kind, subject, excludedEmails: [...excluded] },
                    },
                    {
                      onSuccess: (campaign) => setSent(campaign.recipientCount),
                      onError: (e) => setError(errorMessage(e)),
                    },
                  )
                }}
              >
                {send.isPending ? 'Enviando…' : `Enviar para ${willReceive}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
