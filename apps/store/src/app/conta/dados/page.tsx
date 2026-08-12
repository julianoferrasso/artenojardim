'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { changeEmailSchema, type CustomerSessionItem } from '@ecommerce/shared/contracts'
import {
  cancelEmailChange,
  changePassword,
  deleteAccount,
  listSessions,
  requestEmailChange,
  revokeOtherSessions,
  updateProfile,
} from '@/lib/account'
import { ApiError } from '@/lib/api'
import { useAuth, authErrorMessage } from '@/lib/auth'
import { fieldClass, formatDateTime, submitButtonClass } from '@/lib/utils'

/**
 * Meus dados. Cinco blocos, cada um com o seu formulário e o seu estado.
 *
 * Não é um formulário só: cada bloco tem confirmação diferente (nenhuma / senha /
 * senha + repetição), consequência diferente (imediata / e-mail pendente /
 * sessões derrubadas) e mensagem de sucesso diferente. Um `handleSubmit` único
 * que decidisse o que enviar pelos campos sujos é a origem de "mudei o nome e
 * ele me pediu a senha".
 *
 * Sem toast: o projeto não tem biblioteca de toast. Confirmação inline em
 * `aria-live`, como na tela de preferências.
 */

const cardClass = 'rounded-xl border border-border bg-card p-5 shadow-soft'
const secondaryButtonClass =
  'h-10 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50'

/** Mensagem por `code`, para os casos em que o texto genérico mente no contexto
 *  de quem JÁ está logado. Fora destes, cai no tratamento compartilhado. */
const accountErrorMessage = (err: unknown): string => {
  if (err instanceof ApiError) {
    if (err.code === 'INVALID_CREDENTIALS') return 'Senha atual incorreta.'
    if (err.code === 'EMAIL_ALREADY_EXISTS') return 'Este e-mail já pertence a outra conta.'
  }
  return authErrorMessage(err)
}

/** Feedback de uma operação: o mesmo trio em todos os cards. */
function Status({ saved, error }: { saved: string | null; error: string | null }) {
  return (
    <div className="min-h-5 text-sm" aria-live="polite">
      {saved && !error && <span className="text-muted-foreground">{saved}</span>}
      {error && (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}

export default function DadosPage() {
  const { customer } = useAuth()

  // O guard mora no layout — aqui é só estreitamento de tipo.
  if (!customer) return null

  return (
    <>
      <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight">Meus dados</h1>

      <div className="flex flex-col gap-5">
        <PersonalDataCard />
        <DocumentCard />
        <EmailCard />
        <PasswordCard />
        <SessionsCard />
        <DangerZoneCard />
      </div>
    </>
  )
}

// ── Nome e telefone ──────────────────────────────────────────────────────────

/**
 * `name` obrigatório e `phone` livre: no contrato os dois são opcionais porque o
 * PATCH aceita qualquer subconjunto, mas um formulário que SEMPRE envia os dois
 * não pode aceitar um nome vazio.
 *
 * Escrito aqui em vez de derivado do contrato com `.pick()`: o schema
 * compartilhado termina num `.refine` ("informe ao menos um campo"), e um
 * ZodEffects não expõe `.pick()`. Furar isso com `.innerType()` seria depender de
 * um interno do Zod que a versão 4 já moveu uma vez.
 */
const personalSchema = z.object({
  name: z.string().min(2, 'Informe seu nome').max(120).trim(),
  phone: z.string().max(20).optional(),
})

type PersonalInput = z.infer<typeof personalSchema>

function PersonalDataCard() {
  const { customer, applyProfile } = useAuth()
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PersonalInput>({
    resolver: zodResolver(personalSchema),
    defaultValues: { name: customer?.name ?? '', phone: customer?.phone ?? '' },
  })

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-semibold tracking-tight">Dados pessoais</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        É este nome que aparece nos seus pedidos.
      </p>

      <form
        onSubmit={handleSubmit(async (v) => {
          setError(null)
          setSaved(null)
          try {
            // Telefone vazio vira null, não string vazia: o contrato é nullable e
            // "" no banco é um telefone que existe e não serve para nada.
            const result = await updateProfile({ name: v.name, phone: v.phone?.trim() || null })
            applyProfile(result.customer)
            setSaved('Dados salvos ✓')
          } catch (e) {
            setError(accountErrorMessage(e))
          }
        })}
        className="mt-5 flex flex-col gap-4"
        noValidate
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="d-name" className="text-sm font-medium">
            Nome
          </label>
          <input id="d-name" autoComplete="name" {...register('name')} className={fieldClass} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="d-phone" className="text-sm font-medium">
            Telefone
          </label>
          <input
            id="d-phone"
            type="tel"
            autoComplete="tel"
            placeholder="(51) 99999-9999"
            {...register('phone')}
            className={fieldClass}
          />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
          <span className="text-xs text-muted-foreground">
            Usamos só para falar sobre um pedido, se precisarmos.
          </span>
        </div>

        <Status saved={saved} error={error} />

        <button type="submit" disabled={isSubmitting} className={`${submitButtonClass} self-start px-6`}>
          {isSubmitting ? 'Salvando…' : 'Salvar'}
        </button>
      </form>
    </section>
  )
}

// ── CPF ──────────────────────────────────────────────────────────────────────

const documentSchema = z.object({
  document: z.string().min(11, 'Informe o CPF completo').max(18),
})

type DocumentInput = z.infer<typeof documentSchema>

/**
 * O CPF congela no primeiro pedido: dali em diante é dado fiscal de uma venda
 * emitida. Antes disso é cadastro comum — e quem digitou errado no checkout
 * precisa de um caminho de correção, que até aqui não existia.
 */
function DocumentCard() {
  const { customer, applyProfile } = useAuth()
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DocumentInput>({
    resolver: zodResolver(documentSchema),
    defaultValues: { document: customer?.document ?? '' },
  })

  if (!customer) return null

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-semibold tracking-tight">CPF</h2>

      {customer.documentLocked ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Não pode mais ser alterado: já existem pedidos emitidos com ele.
          </p>
          <p className="mt-4 text-sm font-medium">{customer.document ?? '—'}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Se estiver errado, fale conosco.
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Vai na nota do seu pedido. Depois da primeira compra ele não poderá mais ser alterado.
          </p>

          <form
            onSubmit={handleSubmit(async (v) => {
              setError(null)
              setSaved(null)
              try {
                const result = await updateProfile({ document: v.document.trim() })
                applyProfile(result.customer)
                setSaved('CPF salvo ✓')
              } catch (e) {
                setError(accountErrorMessage(e))
              }
            })}
            className="mt-5 flex flex-col gap-4"
            noValidate
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="d-doc" className="text-sm font-medium">
                CPF
              </label>
              <input
                id="d-doc"
                inputMode="numeric"
                placeholder="000.000.000-00"
                {...register('document')}
                className={fieldClass}
              />
              {errors.document && (
                <p className="text-xs text-destructive">{errors.document.message}</p>
              )}
            </div>

            <Status saved={saved} error={error} />

            <button
              type="submit"
              disabled={isSubmitting}
              className={`${submitButtonClass} self-start px-6`}
            >
              {isSubmitting ? 'Salvando…' : 'Salvar'}
            </button>
          </form>
        </>
      )}
    </section>
  )
}

// ── E-mail ───────────────────────────────────────────────────────────────────

type EmailInput = z.infer<typeof changeEmailSchema>

function EmailCard() {
  const { customer, applyProfile } = useAuth()
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EmailInput>({ resolver: zodResolver(changeEmailSchema) })

  if (!customer) return null

  const cancel = async () => {
    setError(null)
    try {
      await cancelEmailChange()
      applyProfile({ ...customer, pendingEmail: null })
      setSaved('Troca cancelada.')
    } catch (e) {
      setError(accountErrorMessage(e))
    }
  }

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-semibold tracking-tight">E-mail</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        É por ele que você entra na conta e recupera a senha.
      </p>

      <p className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{customer.email}</span>
        {customer.emailVerified ? (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
            confirmado
          </span>
        ) : (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
            não confirmado
          </span>
        )}
      </p>

      {customer.pendingEmail ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm">
            Enviamos um link de confirmação para{' '}
            <span className="font-medium">{customer.pendingEmail}</span>.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            O seu e-mail atual continua valendo até você clicar nele.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                reset({ email: customer.pendingEmail ?? '', currentPassword: '' })
                setOpen(true)
                setSaved(null)
              }}
              className={secondaryButtonClass}
            >
              Enviar de novo
            </button>
            <button type="button" onClick={() => void cancel()} className={secondaryButtonClass}>
              Cancelar troca
            </button>
          </div>
        </div>
      ) : (
        !open && (
          <button
            type="button"
            onClick={() => {
              setOpen(true)
              setSaved(null)
            }}
            className={`${secondaryButtonClass} mt-4`}
          >
            Alterar e-mail
          </button>
        )
      )}

      {open && (
        <form
          onSubmit={handleSubmit(async (v) => {
            setError(null)
            setSaved(null)
            try {
              const result = await requestEmailChange(v)
              applyProfile({ ...customer, pendingEmail: result.pendingEmail })
              setOpen(false)
              reset()
              setSaved(`Link enviado para ${result.pendingEmail}.`)
            } catch (e) {
              setError(accountErrorMessage(e))
            }
          })}
          className="mt-5 flex flex-col gap-4 border-t border-border pt-5"
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="d-email" className="text-sm font-medium">
              Novo e-mail
            </label>
            <input
              id="d-email"
              type="email"
              autoComplete="email"
              {...register('email')}
              className={fieldClass}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="d-email-pass" className="text-sm font-medium">
              Sua senha atual
            </label>
            <input
              id="d-email-pass"
              type="password"
              autoComplete="current-password"
              {...register('currentPassword')}
              className={fieldClass}
            />
            {errors.currentPassword && (
              <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
            )}
            {/* O "porquê" evita que pedir a senha aqui pareça arbitrário. */}
            <span className="text-xs text-muted-foreground">
              Pedimos a senha porque quem tem o seu e-mail consegue recuperar a sua conta.
            </span>
          </div>

          <Status saved={null} error={error} />

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={isSubmitting} className={`${submitButtonClass} px-6`}>
              {isSubmitting ? 'Enviando…' : 'Enviar link de confirmação'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setError(null)
                reset()
              }}
              className={secondaryButtonClass}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {!open && <div className="mt-3"><Status saved={saved} error={error} /></div>}
    </section>
  )
}

// ── Senha ────────────────────────────────────────────────────────────────────

/**
 * A confirmação é validação de FORMULÁRIO, não de contrato: a API não tem o que
 * fazer com um segundo campo idêntico. Mesmo padrão de `/entrar/redefinir-senha`.
 *
 * Os campos são reescritos, e não derivados de `changePasswordSchema`, porque
 * aquele já termina num `.refine` — e um ZodEffects não expõe `.extend()`. As
 * duas regras de negócio (mínimo de 6, senha nova diferente da atual) são
 * repetidas de propósito: a API valida de novo, e é ela que manda.
 */
const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual'),
    password: z.string().min(6, 'Mínimo de 6 caracteres').max(200),
    confirm: z.string(),
  })
  .refine((v) => v.currentPassword !== v.password, {
    path: ['password'],
    message: 'A nova senha deve ser diferente da atual',
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'As senhas não conferem',
  })

type PasswordFormInput = z.infer<typeof passwordFormSchema>

function PasswordCard() {
  const { applySession } = useAuth()
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormInput>({ resolver: zodResolver(passwordFormSchema) })

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-semibold tracking-tight">Senha</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ao trocar, encerramos as sessões abertas em outros dispositivos.
      </p>

      <form
        onSubmit={handleSubmit(async (v) => {
          setError(null)
          setSaved(null)
          try {
            const session = await changePassword({
              currentPassword: v.currentPassword,
              password: v.password,
            })
            // Sem isto a aba fica com um access token REVOGADO e o cliente é
            // deslogado no próximo request, sem entender por quê.
            applySession(session)
            reset()
            setSaved('Senha alterada. Esta sessão continua ativa; as outras foram encerradas.')
          } catch (e) {
            setError(accountErrorMessage(e))
          }
        })}
        className="mt-5 flex flex-col gap-4"
        noValidate
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="d-cur" className="text-sm font-medium">
            Senha atual
          </label>
          <input
            id="d-cur"
            type="password"
            autoComplete="current-password"
            {...register('currentPassword')}
            className={fieldClass}
          />
          {errors.currentPassword && (
            <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="d-new" className="text-sm font-medium">
            Nova senha
          </label>
          <input
            id="d-new"
            type="password"
            autoComplete="new-password"
            {...register('password')}
            className={fieldClass}
          />
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          <span className="text-xs text-muted-foreground">Mínimo 6 caracteres.</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="d-confirm" className="text-sm font-medium">
            Repita a nova senha
          </label>
          <input
            id="d-confirm"
            type="password"
            autoComplete="new-password"
            {...register('confirm')}
            className={fieldClass}
          />
          {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
        </div>

        <Status saved={saved} error={error} />

        <button type="submit" disabled={isSubmitting} className={`${submitButtonClass} self-start px-6`}>
          {isSubmitting ? 'Salvando…' : 'Trocar senha'}
        </button>
      </form>
    </section>
  )
}

// ── Dispositivos ─────────────────────────────────────────────────────────────

function SessionsCard() {
  const { applySession } = useAuth()
  const [sessions, setSessions] = useState<CustomerSessionItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const result = await listSessions()
        if (!cancelled) setSessions(result.sessions)
      } catch (e) {
        if (!cancelled) setError(accountErrorMessage(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const revoke = async () => {
    setError(null)
    setSaved(null)
    setWorking(true)
    try {
      const session = await revokeOtherSessions()
      // Mesma armadilha da troca de senha: o revoke derruba TUDO, inclusive esta
      // aba, e a sessão devolvida é o que a mantém viva.
      applySession(session)
      const result = await listSessions()
      setSessions(result.sessions)
      setSaved('Os outros dispositivos foram desconectados.')
    } catch (e) {
      setError(accountErrorMessage(e))
    } finally {
      setWorking(false)
    }
  }

  const others = sessions?.filter((s) => !s.current).length ?? 0

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-semibold tracking-tight">Dispositivos conectados</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Onde a sua conta está aberta agora. Não reconhece algum? Desconecte e troque a senha.
      </p>

      {sessions === null && !error && (
        <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>
      )}

      {sessions && sessions.length > 0 && (
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-baseline gap-x-2 py-2.5 text-sm">
              <span className="font-medium">{s.device}</span>
              {s.current && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                  este dispositivo
                </span>
              )}
              <span className="w-full text-xs text-muted-foreground">
                Desde {formatDateTime(s.createdAt)}
                {s.ip ? ` — ${s.ip}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <Status saved={saved} error={error} />
      </div>

      {others > 0 && (
        <button
          type="button"
          onClick={() => void revoke()}
          disabled={working}
          className={`${secondaryButtonClass} mt-2`}
        >
          {working ? 'Desconectando…' : 'Desconectar os outros dispositivos'}
        </button>
      )}
    </section>
  )
}

// ── Excluir a conta ──────────────────────────────────────────────────────────

const CONFIRM_WORD = 'EXCLUIR'

/**
 * LGPD: o titular tem direito à eliminação. Os pedidos permanecem porque nota
 * emitida é obrigação fiscal — o que se destrói é o dado pessoal.
 *
 * Duas travas (senha + palavra digitada) porque é irreversível e não há desfazer.
 */
function DangerZoneCard() {
  const { logout } = useAuth()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [word, setWord] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  const submit = async () => {
    setError(null)
    setWorking(true)
    try {
      await deleteAccount({ currentPassword: password })
      // A conta já não existe: limpa o estado local e sai para a home. Sem o
      // logout, o contexto seguiria com um cliente que o banco não tem mais.
      await logout()
      router.replace('/')
    } catch (e) {
      setError(accountErrorMessage(e))
      setWorking(false)
    }
  }

  return (
    <section className={`${cardClass} border-destructive/40`}>
      <h2 className="text-lg font-semibold tracking-tight">Excluir minha conta</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Apagamos os seus dados pessoais, endereços e preferências. Os pedidos já feitos permanecem
        sem identificação, porque a nota fiscal emitida não pode ser apagada. Não há como desfazer.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`${secondaryButtonClass} mt-4 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive`}
        >
          Quero excluir a minha conta
        </button>
      ) : (
        <div className="mt-5 flex flex-col gap-4 border-t border-border pt-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="d-del-pass" className="text-sm font-medium">
              Sua senha atual
            </label>
            <input
              id="d-del-pass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="d-del-word" className="text-sm font-medium">
              Digite <span className="font-mono">{CONFIRM_WORD}</span> para confirmar
            </label>
            <input
              id="d-del-word"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              className={fieldClass}
            />
          </div>

          <Status saved={null} error={error} />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={working || word !== CONFIRM_WORD || password.length === 0}
              className="h-11 rounded-lg bg-destructive px-6 text-sm font-medium text-destructive-foreground shadow-soft transition-all duration-200 hover:bg-destructive/90 disabled:opacity-50"
            >
              {working ? 'Excluindo…' : 'Excluir definitivamente'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setError(null)
                setPassword('')
                setWord('')
              }}
              className={secondaryButtonClass}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
