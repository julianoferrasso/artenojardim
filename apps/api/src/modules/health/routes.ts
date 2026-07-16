import { Router } from 'express'
import { healthController } from './controller.js'

export const healthRoutes: Router = Router()

healthRoutes.get('/', healthController)
