import { deliverAlert, type AlertSendJob } from '../../modules/alerts/service.js'
import { permanentError } from '../consumer.js'

/**
 * Uma entrega de alerta a UM destino. A decisão (o que conta como falha, o que
 * pausa o destino, o que volta para a fila) mora no módulo de alertas; aqui só
 * se liga a fila a ele.
 *
 * A guarda existe por causa do Prisma: `where: { id: undefined }` vira "sem
 * filtro", e uma mensagem sem destino seria entregue ao primeiro da loja. Só o
 * nosso código publica aqui — mas mensagem torta vai para a DLQ, não para alguém.
 */
export const alertSendHandler = (job: AlertSendJob): Promise<void> => {
  if (!job?.alertId || !job.destinationId || !job.types?.length || !job.content) {
    throw permanentError('mensagem de alerta sem alerta, destino, tipo ou conteúdo')
  }
  return deliverAlert(job)
}
