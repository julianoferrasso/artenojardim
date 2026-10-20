import { deliverAlert, type AlertSendJob } from '../../modules/alerts/service.js'

/**
 * Uma entrega de alerta a UM destino. A decisão (o que conta como falha, o que
 * pausa o destino, o que volta para a fila) mora no módulo de alertas; aqui só
 * se liga a fila a ele.
 */
export const alertSendHandler = (job: AlertSendJob): Promise<void> => deliverAlert(job)
