import {
  type AdminTheme,
  type PublicStore,
  type PublicTheme,
  type StoreButtons,
  type StoreTheme,
  type UpdateStoreThemeInput,
} from '@ecommerce/shared/contracts'
import { EVENTS } from '@ecommerce/shared/constants'
import { hexToOklch, oklchToHex } from '@ecommerce/shared/utils'
import { prisma } from '../../config/prisma.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { getFlags } from '../../shared/flags.js'
import { getSetting, setSetting } from '../../shared/settings.js'
import { audit, diff, type AuditContext } from '../../shared/audit.js'
import { notFound } from '../../shared/errors.js'
import { storage } from '../../integrations/storage/index.js'

/**
 * Projeção PÚBLICA da Store: nada de `id`, `document` ou endereço — é resposta
 * cacheável que qualquer visitante anônimo lê.
 */
export const getPublicStore = async (): Promise<PublicStore> => {
  const [store, flags, theme] = await Promise.all([
    prisma.store.findUniqueOrThrow({
      where: { id: getActiveStoreId() },
      select: {
        name: true,
        email: true,
        phone: true,
        currency: true,
        locale: true,
        timezone: true,
      },
    }),
    getFlags(),
    getSetting('theme'),
  ])

  return { ...store, flags, theme: await toPublicTheme(theme) }
}

/**
 * Resolve o `logoId` em URL. A URL é DERIVADA da key a cada leitura, nunca
 * persistida — trocar de provedor de storage não pode exigir um UPDATE.
 *
 * O filtro por storeId no lookup não é decorativo: sem ele, um id de upload de
 * outra loja viraria o logo desta. É a regra 3 aplicada onde importa.
 */
const toPublicTheme = async ({ logoId, ...theme }: StoreTheme): Promise<PublicTheme> => ({
  ...theme,
  logoUrl: await resolveLogoUrl(logoId),
})

const resolveLogoUrl = async (logoId: string | null): Promise<string | null> => {
  if (!logoId) return null

  const upload = await prisma.upload.findFirst({
    where: { id: logoId, storeId: getActiveStoreId() },
    select: { key: true },
  })

  // Logo apagado da biblioteca de mídia não derruba a loja: cai no fallback.
  return upload ? storage().getPublicUrl(upload.key) : null
}

/** O formulário do admin fala hex — o banco guarda OKLCH. Aqui é a volta. */
export const getAdminTheme = async (): Promise<AdminTheme> => {
  const theme = await getSetting('theme')

  return {
    primary: oklchToHex(theme.primary),
    secondary: oklchToHex(theme.secondary),
    accent: oklchToHex(theme.accent),
    background: oklchToHex(theme.background),
    radius: theme.radius,
    badgeStyle: theme.badgeStyle,
    buttons: {
      primary: toAdminButton(theme.buttons.primary),
      secondary: toAdminButton(theme.buttons.secondary),
    },
    logoId: theme.logoId,
    logoUrl: await resolveLogoUrl(theme.logoId),
  }
}

/** A cor própria do botão viaja em hex para o formulário, como as do tema. */
const toAdminButton = (style: StoreButtons['primary']) => ({
  source: style.source,
  custom: style.custom ? oklchToHex(style.custom) : null,
  emphasis: style.emphasis,
})

export const updateTheme = async (
  input: UpdateStoreThemeInput,
  context: AuditContext,
): Promise<AdminTheme> => {
  // Posse verificada no SERVICE, não na rota: `requireMinRole` diz quem é, não
  // diz que este upload é desta loja. Sem isto, um id forjado vira o logo.
  if (input.logoId) {
    const upload = await prisma.upload.findFirst({
      where: { id: input.logoId, storeId: getActiveStoreId() },
      select: { id: true },
    })
    if (!upload) throw notFound('Upload')
  }

  const before = await getSetting('theme')

  const next: StoreTheme = {
    primary: hexToOklch(input.primary),
    secondary: hexToOklch(input.secondary),
    accent: hexToOklch(input.accent),
    background: hexToOklch(input.background),
    radius: input.radius,
    badgeStyle: input.badgeStyle,
    buttons: {
      primary: fromAdminButton(input.buttons.primary),
      secondary: fromAdminButton(input.buttons.secondary),
    },
    logoId: input.logoId,
  }

  await setSetting('theme', next)

  // O diff compara OKLCH serializado: o valor comparável é o que foi gravado,
  // não o hex que o formulário mandou.
  const changes = diff(flatten(before), flatten(next))

  if (Object.keys(changes).length > 0) {
    await audit({
      action: EVENTS.store.themeUpdated,
      entityType: 'Store',
      entityId: getActiveStoreId(),
      changes,
      context,
    })
  }

  return getAdminTheme()
}

/**
 * Achata o tema para o diff da auditoria: `diff` compara valor a valor, e dois
 * objetos `{l,c,h}` diferentes sempre pareceriam "mudou" na comparação por
 * referência. Como string, o log fica legível para quem audita.
 */
const fromAdminButton = (
  style: UpdateStoreThemeInput['buttons']['primary'],
): StoreButtons['primary'] => ({
  source: style.source,
  custom: style.custom ? hexToOklch(style.custom) : null,
  emphasis: style.emphasis,
})

const flatten = (theme: StoreTheme): Record<string, unknown> => ({
  primary: oklchToHex(theme.primary),
  secondary: oklchToHex(theme.secondary),
  accent: oklchToHex(theme.accent),
  background: oklchToHex(theme.background),
  radius: theme.radius,
  badgeStyle: theme.badgeStyle,
  // Serializado: o diff da auditoria compara valor a valor, e dois objetos
  // aninhados sempre pareceriam "mudou" na comparação por referência.
  buttons: JSON.stringify(theme.buttons),
  logoId: theme.logoId,
})
