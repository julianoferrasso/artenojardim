import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma.js'

/**
 * Idempotência dos consumidores. RabbitMQ é *at-least-once*: um ack perdido por
 * queda de rede reentrega a mensagem. Sem esta trava o cliente recebe dois
 * e-mails — ou, muito pior, o estoque é debitado duas vezes.
 *
 * Obrigatório, não defensivo.
 */

/**
 * Marca o evento como processado e diz se ELE é o primeiro a fazê-lo.
 *
 * Uma escrita só, e não um `findUnique` seguido de `create`: entre a leitura e a
 * escrita cabe uma segunda entrega da mesma mensagem, e as duas passariam pela
 * checagem antes de qualquer uma gravar. O unique da PK é o que decide, e ele
 * decide no banco, onde não há janela.
 *
 * Devolve `false` quando alguém já processou — o consumidor então só dá ack.
 */
export const claimEvent = async (eventId: string, queue: string): Promise<boolean> => {
  try {
    await prisma.processedEvent.create({ data: { id: eventId, queue } })
    return true
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false
    throw err
  }
}

/**
 * Desfaz a marcação. Necessário porque marcamos ANTES de executar o handler (é o
 * que fecha a janela de corrida) — então um handler que falha precisa liberar o
 * evento, senão o retry chega, vê "já processado" e descarta a mensagem sem
 * nunca ter feito o trabalho.
 */
export const releaseEvent = async (eventId: string): Promise<void> => {
  await prisma.processedEvent.deleteMany({ where: { id: eventId } })
}
