# Arte no Jardim — regras do projeto

Arquitetura completa: [docs/arquitetura.md](docs/arquitetura.md). Este arquivo é o resumo **operativo** —
o que fazer e o que não fazer ao escrever código. Em caso de dúvida, o documento manda.

## Antes de rodar qualquer coisa

O Postgres vive na VPS e **não** é exposto na internet (só 22/80/443 abertas). Para a API
dev do seu PC alcançar o banco, abra um **túnel SSH** e deixe a janela aberta:

```powershell
.\scripts\db-tunnel.ps1     # cano: 127.0.0.1:5433 (local) -> VPS:5432 (Postgres)
pnpm dev:api                # em outro terminal; conecta em 127.0.0.1:5433
```

A API pensa que o banco está em `127.0.0.1:5433`, mas cada query viaja pelo túnel até a VPS.
`ECONNREFUSED 127.0.0.1:5433` = o túnel caiu, **não** que o banco morreu — reabra o script.

> **dev e produção compartilham o MESMO banco** (o da VPS). Uma migration rodada em dev
> (`migrate dev`) já vale para produção — por isso `migrate deploy` no deploy costuma dizer
> "No pending migrations". Não existe base local separada.

## Deploy (VPS `/var/www/artenojardim`)

Fluxo padrão: `git pull` → `pnpm install --frozen-lockfile` → `build:shared` →
`pnpm -r build` → `prisma migrate deploy` → recarregar os processos. Passo a passo, portas,
PM2 e armadilhas de Nginx: [docs/infra-vps.md](docs/infra-vps.md). O que **não** pode esquecer:

- **Apps Next (`store`/`admin`) precisam de `pm2 restart`, não `reload`.** `next start` lê o
  `.next` uma vez no boot; `reload` serve o build antigo (rota nova dá 404). A **API** (Express) pode `reload`.
- A VPS é **compartilhada** com outro projeto (`rag_sefaz` + apps `api`/`web`/`ai-service` no
  PM2). Nossos processos têm prefixo `artenojardim-`. Nunca toque nos deles nem no banco `rag_sefaz`.
- SSH por `plink -i C:\Users\2cta\Documents\placeadmin_vps.ppk root@23.29.114.96`. Scripts longos
  vão base64 (`echo <b64> | base64 -d | bash`) para o PowerShell não mastigar as aspas.

## Estado atual do projeto (onde olhar num contexto novo)

- **Fases concluídas e no ar** e gotchas vivos: a **memória do projeto** (índice `MEMORY.md`,
  carregado automático) — ex.: frete Melhor Envio, checkout, dimensões provisórias das velas.
- **O que aconteceu por último:** `git log --oneline -15`.
- **Roadmap completo e decisões:** [docs/arquitetura.md](docs/arquitetura.md) (§21 Roadmap).
- **Credenciais** (Stripe, Melhor Envio, DB) vivem em `apps/api/.env` — fora do git, nunca em log.

## Stack

Node 24 LTS · pnpm workspaces · TypeScript ESM · Express 5 · Prisma · PostgreSQL · RabbitMQ
Next.js App Router · Tailwind · shadcn/ui · React Hook Form · Zod · TanStack Query
Ubuntu · Nginx · PM2 · Let's Encrypt. **Sem Docker. Sem Kubernetes.**

## As regras que não se quebram

1. **`api` é dono de todo dado.** `store` e `admin` são clientes HTTP. Nenhum dos dois importa Prisma
   ou toca no Postgres. Nunca. É a regra que mantém a evolução para SaaS possível.
2. **Sem classes.** Funções nomeadas exportadas. Sem `this`, sem construtor, sem DI.
3. **Toda query filtra por `storeId`.** Via `getActiveStoreId()`. É o que compra o multi-tenant da Fase 4.
4. **Dinheiro é `Int` em centavos.** Nunca `Float`, nunca `Decimal`. Peso em gramas, dimensões em milímetros.
5. **O front nunca decide valor.** Preço, frete, desconto e total são recalculados no backend, do banco.
6. **Só o webhook do Stripe muda status de pagamento.**
7. **Estoque é ledger append-only.** Nunca `UPDATE` em `onHand`. Reserva **não** é movimento.
8. **Nunca `nack(requeue: true)`.** Retry por TTL → DLQ.
9. **Não publique evento sem consumidor.** Cadastrar produto não publica nada.
10. **Sem `validator.ts`.** Existe `middlewares/validate.ts`, um só, para o projeto inteiro.

## Camadas de um módulo

```
routes.ts     → caminho + middlewares → controller
controller.ts → traduz HTTP ↔ domínio. Sem regra de negócio.
service.ts    → orquestra, transaciona, faz I/O
repository.ts → acesso a dados            (só se houver query complexa/reusada)
domain/       → funções PURAS: sem Prisma, sem fetch, sem Date.now()
schemas.ts    → Zod
```

**Crie só o arquivo que tem trabalho a fazer.** Sem `types.ts` se `z.infer` resolve.
Sem `repository.ts` se o service faz 3 chamadas Prisma triviais.
`domain/` nasce quando `service.ts` passa de ~300 linhas, ou há reuso, ou você quer testar sem banco.

Um módulo importa o `service` de outro. **Nunca** o `repository` de outro.

## Fronteiras

- **`integrations/`** — tudo que fala com serviço externo (Stripe, Melhor Envio, SMTP, storage, ViaCEP).
  Sabe falar com o mundo lá fora, **não** sabe do nosso negócio. Traduz erro externo → `appError`.
  Um módulo **nunca** faz `fetch` para fora nem importa o SDK do Stripe direto.
- **`modules/`** — sabe do negócio, **não** sabe como o mundo lá fora fala.
- **`config/`** — o **único** lugar que lê `process.env`.
- **`shared/`** — erros, paginação, envelope, auditoria, flags, publish. Sem regra de negócio.
- **`utils/`** — funções puras sem dependência. Importa Prisma? Não é util.
- **`queues/`** — reação a fato consumado. **`jobs/`** — varredura periódica (cron). Não confunda.

## packages/shared

Um pacote, dois subcaminhos:

```ts
import { createProductSchema } from '@ecommerce/shared/contracts'  // formato da API HTTP
import { UserRole, BR_STATES } from '@ecommerce/shared/constants'  // enums, rotas, dados fixos
```

Não importa Prisma, não importa Express, não importa React. O front conhece o **formato** da API,
não o **domínio** dela.

Enums vivem em `constants/` (Zod) **e** em `schema.prisma`. A duplicação é inevitável — o front não pode
importar `@prisma/client`. Por isso existe um teste de drift no CI. **Mudou um lado, mude o outro.**

## Erros

`appError(code, message, status)` — factory, não classe. Um único `error-handler.ts` traduz erro → HTTP.
Nenhum controller monta `res.status(500)`. Erro de negócio tem `code` estável em `contracts`;
o front reage ao `code`, nunca ao texto. **Nunca vazar stack trace.**

## Segurança

- Access token JWT 15min **em memória** no cliente. Nunca `localStorage`.
- Refresh token **opaco**, hash no banco, cookie HttpOnly, rotação com detecção de reúso.
- **Verificação de posse é no service**, não só na rota. `requireAuth` não impede IDOR.
- Nunca logar: senha, token, cartão, CPF completo, `Authorization`.
- Auditar toda ação de staff que muda estado, via `shared/audit.ts`, chamado no **service**.

## Convenções

- Idioma do código: **inglês**. Idioma do usuário e dos comentários: **português**.
- Comentário só para restrição que o código não mostra. Não descreva o que a linha faz.
- `select` explícito no Prisma. Nunca traga o catálogo inteiro para renderizar um card.
- Transação onde há invariante.
- Migration versionada. **Nunca `db push` em produção.**

## Cor e espaçamento

Token semântico do shadcn/ui, sempre: `bg-primary`, `text-muted-foreground`, `p-4`, `rounded-lg`.
**Nunca** `bg-[#3a5f2b]`, `p-[17px]`, `text-[19px]`. Token nomeado por função (`--primary`),
nunca por aparência (`--verde-musgo`). É o que torna a Fase 4 (temas) uma mudança de ~10 linhas.

## Escopo — o que NÃO existe ainda

Multi-tenant · planos · assinaturas · marketplace · API pública · temas múltiplos · blog ·
Redis · Elasticsearch · permissões granulares · derivadas de imagem.

Cada um tem gatilho de revisão documentado no apêndice de [docs/arquitetura.md](docs/arquitetura.md).
**Não antecipe nenhum.** Quando houver dúvida entre duas soluções, escolha a mais simples que permita crescer.
