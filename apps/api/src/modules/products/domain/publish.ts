/**
 * As regras de publicação moram em @ecommerce/shared/contracts: o admin desenha
 * a lista "pronto para publicar" com a mesma função que a API usa para barrar.
 * Reexportadas para quem já importava daqui.
 */
export {
  publishBlockers,
  BLOCKER_MESSAGES,
  type ProductForPublish,
  type PublishBlocker,
} from '@ecommerce/shared/contracts'
