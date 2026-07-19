import Link from 'next/link'
import { ROUTES } from '@ecommerce/shared/constants'

/**
 * Callback do OAuth do Melhor Envio. É a `URL de redirecionamento após
 * autorização` registrada no app deles: o lojista autoriza, o Melhor Envio
 * redireciona para cá com ?code&state, e este Server Component repassa ao backend
 * (loopback) para trocar o código por tokens. A loja não guarda segredo nenhum —
 * só transporta o código; quem fala com o Melhor Envio é a API.
 */

export const dynamic = 'force-dynamic'

type Search = { code?: string; state?: string; error?: string }

const exchange = async (code: string, state: string): Promise<boolean> => {
  const internal = process.env.INTERNAL_API_URL
  if (!internal) return false
  try {
    const res = await fetch(`${internal}${ROUTES.shipping.callback}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state }),
      cache: 'no-store',
    })
    return res.ok
  } catch {
    return false
  }
}

export default async function MelhorEnvioCallbackPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const { code, state, error } = await searchParams

  const connected = !error && code && state ? await exchange(code, state) : false

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      {connected ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Melhor Envio conectado</h1>
          <p className="text-muted-foreground">
            A conta foi conectada com sucesso. A loja já pode calcular fretes.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Não foi possível conectar</h1>
          <p className="text-muted-foreground">
            A autorização falhou ou expirou. Inicie a conexão novamente pelo painel.
          </p>
        </>
      )}
      <Link href="/" className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent">
        Voltar à loja
      </Link>
    </main>
  )
}
