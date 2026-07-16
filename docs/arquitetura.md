# Arquitetura — Plataforma de E-commerce (Arte no Jardim)

## Contexto

O objetivo é lançar rapidamente **uma única loja virtual própria**, operada e desenvolvida por **um único desenvolvedor**, sem multi-tenant, planos, assinaturas, marketplace ou API pública na v1.

Ao mesmo tempo, o sistema não pode ser descartável: a intenção declarada é evoluir no futuro para uma plataforma SaaS no modelo Shopify/Nuvemshop **sem reescrever o sistema**.

Esse é o conflito central que toda decisão deste documento resolve: **custo de hoje versus opção de amanhã**. A regra aplicada em todo o documento é:

> Adotar hoje apenas o que é barato agora e caro depois. Adiar tudo que é barato depois.

Concretamente, aceitamos **três** coisas de "SaaS" desde já — a entidade `Store`, o campo `storeId` nas tabelas raiz e o hábito de sempre filtrar por ele — porque adicioná-las depois exige migração de dados e revisão de todas as queries. Recusamos **todo o resto** (resolução de tenant por domínio, planos, temas, isolamento) porque adicionar depois é trabalho localizado.

### Decisões tomadas com o usuário

| Tema | Decisão |
|---|---|
| Pagamentos | Cartão + Pix + Boleto, todos nativos do Stripe Brasil via Payment Element |
| Infraestrutura | Uma VPS Ubuntu com tudo: Nginx, PM2, Postgres, RabbitMQ |
| Identidade | Tabelas separadas: `User` (staff/admin) e `Customer` (cliente da loja) |
| Filas | RabbitMQ **apenas** para e-mail, etiqueta, rastreio e pós-pagamento — 4 filas |
| Busca | `unaccent + ILIKE` na v1; `tsvector` + GIN quando o catálogo crescer |
| Storage | Interface `StorageProvider`; R2 em produção, disco local em desenvolvimento |
| Módulos | `domain/` para funções puras, ao lado de service/repository |
| Pacote compartilhado | Um só: `packages/shared` com `/contracts` e `/constants` |

### Resultado esperado

Um guia de implementação detalhado o bastante para que o desenvolvimento comece sem novas decisões de arquitetura, e enxuto o bastante para caber na cabeça de uma pessoa.

---

## 1. Organização dos repositórios

### Decisão: **monorepo** com pnpm workspaces e **um** pacote compartilhado

```text
ecommerce/
├── apps/
│   ├── api/         Express + Prisma + workers
│   ├── store/       Next.js — loja pública
│   └── admin/       Next.js — painel administrativo
├── packages/
│   └── shared/
│       ├── contracts/   schemas Zod de request/response + tipos inferidos
│       └── constants/   enums, rotas, papéis, UFs, moedas, tabelas estáticas
├── pnpm-workspace.yaml
└── package.json
```

### Por que monorepo

O argumento decisivo é o **contrato entre API e front**. A API valida entrada com Zod; os formulários do admin e da loja validam com Zod + React Hook Form. Em três repositórios, esse schema é duplicado ou publicado como pacote npm privado — e um desenvolvedor solo passa a versionar, publicar e sincronizar um pacote toda vez que muda um campo. É um imposto diário pago para resolver um problema que não existe (equipes independentes com ciclos de release distintos).

No monorepo, mudar um campo é uma edição em `packages/shared` que quebra o build do front imediatamente, no mesmo commit.

Contra-argumentos e por que não vencem:

- *"Repos separados dão deploy independente"* — Falso aqui. Não há Docker nem CI/CD por imagem: o deploy é `git pull` + `pnpm build --filter <app>` + `pm2 reload <app>`. O filtro preserva a independência.
- *"Monorepo exige Turborepo/Nx"* — Não nesta escala. Adicione **quando** o build completo passar de ~2 minutos e incomodar.

### Por que **um** pacote e não `contracts` + `config`

Dois pacotes criam uma pergunta a cada constante nova: *`UserRole` é contrato ou config? E `PaymentStatus`? E as rotas? E as permissões?* A resposta é genuinamente ambígua para todos esses — que são justamente os itens mais compartilhados do sistema. Toda ambiguidade recorrente vira inconsistência: metade vai parar no pacote errado, e daí nasce a importação cruzada que ninguém queria.

Um pacote com dois subcaminhos dá a mesma separação sem a pergunta:

```text
import { createProductSchema } from '@ecommerce/shared/contracts'
import { UserRole, BR_STATES } from '@ecommerce/shared/constants'
```

Via `exports` no `package.json` do pacote. A fronteira é explícita, o tree-shaking funciona, e não há decisão a tomar.

### O que mora em cada subcaminho

**`contracts/`** — o formato da API HTTP: schemas Zod de request e response, tipos inferidos, códigos de erro. **Nunca** lógica de negócio, **nunca** tipos do Prisma.

**`constants/`** — dados estáticos e vocabulário compartilhado:

| Conteúdo | Exemplo |
|---|---|
| Enums de domínio | `PaymentStatus`, `FulfillmentStatus`, `UserRole`, `MovementType` |
| Rotas da API | `ROUTES.products.detail(slug)` — o front nunca concatena string de URL |
| Papéis e permissões | `ROLE_HIERARCHY` |
| Dados fixos do Brasil | `BR_STATES` (27 UFs), `DOCUMENT_TYPES` |
| Moedas e formatação | `CURRENCY.BRL` |
| Nomes de eventos | `EVENTS.order.paid` (ver §12) |

### O risco dos enums e como fechá-lo

Os enums existem em dois lugares: `constants/` (Zod, para o front) e `schema.prisma` (para o banco). O Prisma não gera para o browser, e o front não pode importar `@prisma/client`. Não há como eliminar a duplicação — mas há como impedir a divergência silenciosa:

> Um teste que compara `Object.values(Prisma.UserRole)` com as opções do enum Zod. Cinco linhas, roda no CI, quebra no segundo em que alguém adiciona um valor de um lado só.

É o padrão geral: quando a duplicação é inevitável, torne a divergência **detectável**.

### Regra de disciplina

O front conhece o **formato** da API, não o **domínio** dela. `packages/shared` não importa Prisma, não importa Express, não importa React. Se um dia a loja virar um app React Native ou um tema de terceiros, esse pacote continua sendo a única superfície.

**Não criar** `packages/ui` agora. Duplicar um botão entre store e admin custa pouco; extrair um pacote de UI custa configuração de build, Tailwind compartilhado e um lugar a mais para olhar. Extraia **quando a terceira cópia doer**.

---

## 2. Comunicação entre os três projetos

### Topologia (uma VPS)

```text
                        Internet
                            │
                    ┌───────▼────────┐
                    │  Nginx (443)   │  TLS via Let's Encrypt
                    └───┬────┬───┬───┘
        artenojardim.com│    │   │api.artenojardim.com
                        │    │admin.artenojardim.com
              ┌─────────▼─┐ ┌▼────────┐ ┌─▼─────────┐
              │ store     │ │ admin   │ │ api       │
              │ :3000     │ │ :3001   │ │ :4000     │
              └─────┬─────┘ └────┬────┘ └─────┬─────┘
                    │            │            │
                    └────────────┴────────────┤
                                              │
                              ┌───────────────┼───────────────┐
                        ┌─────▼─────┐  ┌──────▼─────┐  ┌──────▼──────┐
                        │PostgreSQL │  │  RabbitMQ  │  │   workers   │
                        │  :5432    │  │   :5672    │  │    (PM2)    │
                        └───────────┘  └────────────┘  └─────────────┘
```

Postgres e RabbitMQ escutam **apenas em 127.0.0.1**. UFW libera somente 22, 80, 443.

### Como cada um fala com a API

**Regra única: `api` é o dono de todo dado. `store` e `admin` são clientes HTTP. Nenhum dos dois importa Prisma ou toca no Postgres — nunca.**

É a decisão mais importante do documento e a única que, se violada, torna a evolução para SaaS impossível. Next.js *permite* acessar o banco direto dos Server Components. É uma armadilha: no dia em que existir um app mobile, um tema de terceiro ou uma API pública, a regra de negócio estará espalhada por três codebases.

| Origem | Destino | Motivo |
|---|---|---|
| Server Components (`store`) | `http://127.0.0.1:4000` | Catálogo, produto, CMS. Loopback: sem TLS, sem DNS, sem sair da máquina |
| Client Components | `https://api.artenojardim.com` | Carrinho, checkout, tudo autenticado. Via TanStack Query |
| Route Handlers Next (raro) | `http://127.0.0.1:4000` | Só para esconder segredo do browser |

`INTERNAL_API_URL` e `NEXT_PUBLIC_API_URL`; o cliente HTTP escolhe conforme rodar no servidor ou no browser. As rotas vêm de `@ecommerce/shared/constants`.

### Renderização na loja

| Página | Estratégia | Por quê |
|---|---|---|
| Home, categoria, produto, CMS | Server Component + ISR (`revalidate: 60`) | Público, SEO crítico, muda pouco |
| Busca | Server Component dinâmico | Query string infinita, cache inútil |
| Carrinho, checkout, conta | Client Component + TanStack Query | Por usuário, nunca cacheável |

**Invalidação: só o TTL de 60s.** Nada de fila de revalidação — o lojista que publica um produto espera um minuto, e isso não é um problema real. Se um dia for, `revalidatePath` via um endpoint com token secreto resolve em ~20 linhas, **sem fila**.

### Autenticação entre domínios

Subdomínios do mesmo apex permitem o refresh token como cookie de `.artenojardim.com`:

```text
POST api.artenojardim.com/api/v1/auth/login
  → Set-Cookie: refresh_token=<opaco>; Domain=.artenojardim.com;
                HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth
  → body: { accessToken, expiresIn: 900 }
```

- **Access token**: JWT, 15 min, **em memória** (nunca `localStorage` — XSS lê `localStorage`; memória morre com a aba).
- **Refresh token**: string opaca, cookie `HttpOnly`, 30 dias, `Path` restrito ao endpoint de refresh.
- CORS com `credentials: true` e allowlist explícita.

Sessões de **staff** e **cliente** são independentes: cookies, segredos e endpoints distintos. Vazamento de um lado não é vazamento do outro.

---

## 3. A entidade `Store` — sim, criar desde já

### Decisão: `Store` com **exatamente uma linha**, e `storeId` nas tabelas raiz. Nenhuma lógica de tenant.

### Por que criar agora

O custo de adicionar `storeId` **depois** não é a migração de schema — é **revisar cada uma das centenas de queries do sistema** para garantir que filtram pelo tenant. Uma query esquecida vaza dados de uma loja para outra: a classe de bug mais cara que existe em SaaS, e impossível de encontrar por testes, porque em dev só existe um tenant.

Além disso, toda constraint de unicidade muda de natureza: `Product.slug` é único **globalmente** hoje e **por loja** amanhã. Reescrever índices únicos em produção, com dados reais, é doloroso.

Pagamos ~1% de esforço e compramos uma migração futura que é uma troca de função, não um projeto.

### Por que NÃO criar lógica de tenant agora

Middleware de resolução por domínio, contexto de request, RLS, testes de isolamento — código que resolve um problema **inexistente** e que seria mantido por meses sem entregar valor. Pior: sem um segundo tenant real, esse código nunca é exercitado e apodrece.

### Como usar de forma extremamente simples

```text
src/shared/store-context.ts

  getActiveStoreId(): Promise<string>
    - lê STORE_ID do .env
    - valida uma vez no boot que a Store existe
    - guarda em memória
    - retorna sempre a mesma string
```

```text
listProducts(filters):
    storeId = await getActiveStoreId()
    return prisma.product.findMany({ where: { storeId, ...filters } })
```

**É só isso.** Sem middleware, sem AsyncLocalStorage, sem injeção.

### A evolução (Fase 4)

1. `getActiveStoreId()` passa a ler de um `AsyncLocalStorage` populado por um middleware que resolve o tenant pelo `Host`.
2. Os índices `@@unique([storeId, slug])` **já existem**.
3. Todas as queries **já filtram**.
4. Opcionalmente, RLS no Postgres como rede de segurança.

Dias, não meses, e não toca em nenhum service.

### Quais tabelas recebem `storeId`

Recebem — raízes de agregado e tudo que precisa de unicidade por loja:
`User`, `Product`, `ProductVariant`, `Category`, `Customer`, `Order`, `Cart`, `Coupon`, `Page`, `Menu`, `Banner`, `Setting`, `Upload`, `AuditLog`, `InventoryMovement`

Não recebem — filhos alcançáveis pelo pai:
`ProductImage`, `ProductOption`, `OptionValue`, `CartItem`, `OrderItem`, `Address`, `Payment`, `Shipment`, `RefreshToken`, `InventoryLevel`, `InventoryReservation`, `MenuItem`

> `ProductVariant` recebe mesmo sendo filho, **porque** `sku` precisa ser único por loja. Essa é a única razão legítima para denormalizar: viabilizar uma constraint. `InventoryMovement` recebe porque relatórios consultam por período sem passar por produto.

### O modelo `Store` na v1

`id`, `name`, `slug`, `domain`, `email`, `phone`, `document` (CNPJ), `addressJson` (origem do frete), `currency` (`BRL`), `timezone`, `locale`, timestamps.

**Não** criar: `planId`, `status`, `trialEndsAt`, `ownerId`, `customDomain`, `themeId`. Cada um é um campo morto que confunde quem lê o schema. Nascem na Fase 4, junto com a funcionalidade.

---

## 4. Estrutura de pastas da API

```text
apps/api/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── config/
│   │   ├── env.ts          Zod sobre process.env — falha no boot se faltar var
│   │   ├── prisma.ts       PrismaClient singleton
│   │   ├── rabbitmq.ts     conexão e canal
│   │   └── logger.ts       pino
│   ├── integrations/       ← TUDO que fala com um serviço externo
│   │   ├── stripe/
│   │   │   ├── client.ts       SDK configurado
│   │   │   ├── payment-intent.ts
│   │   │   ├── refund.ts
│   │   │   └── webhook.ts      constructEvent + tipagem dos eventos
│   │   ├── melhor-envio/
│   │   │   ├── client.ts       fetch base, token, retry, rate limit
│   │   │   ├── quote.ts
│   │   │   ├── label.ts
│   │   │   └── tracking.ts
│   │   ├── smtp/
│   │   │   ├── client.ts       nodemailer
│   │   │   └── templates/
│   │   ├── storage/
│   │   │   ├── types.ts        StorageProvider
│   │   │   ├── r2.ts           produção
│   │   │   ├── local.ts        desenvolvimento
│   │   │   └── index.ts        escolhe pelo env
│   │   └── viacep/
│   │       └── client.ts
│   ├── modules/
│   │   ├── auth/  users/  store/  products/  categories/
│   │   ├── inventory/  customers/  addresses/  cart/  checkout/
│   │   ├── orders/  payments/  shipping/  coupons/
│   │   └── cms/  settings/  uploads/
│   ├── middlewares/
│   │   ├── authenticate.ts     valida JWT → req.auth
│   │   ├── authorize.ts        requireRole('ADMIN')
│   │   ├── validate.ts         validate({ body, query, params })
│   │   ├── error-handler.ts    único lugar que traduz erro → HTTP
│   │   ├── request-context.ts  requestId + logger filho
│   │   └── rate-limit.ts
│   ├── shared/
│   │   ├── errors.ts           appError(), isAppError(), catálogo
│   │   ├── http.ts             ok(), created(), paginated()
│   │   ├── pagination.ts
│   │   ├── store-context.ts    getActiveStoreId()
│   │   ├── audit.ts            audit({ action, entity, ... })
│   │   ├── flags.ts            isEnabled('reviews')
│   │   └── events.ts           publish(routingKey, payload)
│   ├── utils/
│   │   ├── money.ts  slug.ts  crypto.ts  date.ts
│   ├── queues/
│   │   └── topology.ts         exchanges, 4 filas, retry, DLQ — fonte da verdade
│   ├── workers/
│   │   ├── index.ts            processo separado do PM2
│   │   ├── email.worker.ts
│   │   ├── order-paid.worker.ts
│   │   ├── shipping-label.worker.ts
│   │   └── shipping-tracking.worker.ts
│   ├── jobs/                   ← cron, não fila
│   │   ├── reconcile-payments.ts
│   │   ├── release-reservations.ts
│   │   ├── sync-tracking.ts
│   │   └── cleanup-carts.ts
│   ├── app.ts
│   └── server.ts
└── package.json
```

### Responsabilidade de cada diretório

**`config/`** — Ligação com infraestrutura própria e leitura de ambiente. É o **único** lugar que lê `process.env`. `env.ts` valida com Zod no import: faltou `DATABASE_URL`, o processo morre no boot com mensagem clara, não às 3h da manhã com um `undefined`.

**`integrations/`** — **Toda** comunicação com serviço de terceiro. Cada pasta encapsula transporte, autenticação, retry, rate limit e tradução de erro externo → `appError`. Um módulo **nunca** faz `fetch` para fora nem importa o SDK do Stripe diretamente.

Três ganhos concretos:
1. **Um lugar para trocar** — mudar de SMTP para Resend toca uma pasta.
2. **Um lugar para procurar** — "onde chamamos o Melhor Envio?" tem resposta exata.
3. **Um lugar para mockar** — os testes substituem a pasta, não caçam `fetch` espalhado.

A fronteira é: `integrations/` sabe falar com o mundo lá fora e **não** sabe nada do nosso negócio; `modules/` sabe do negócio e **não** sabe como o mundo lá fora fala.

**`modules/`** — O sistema. Uma pasta por contexto de negócio. Um módulo pode importar o `service` de outro; **nunca** o `repository` de outro. O repository é o interior do módulo.

**`middlewares/`** — Preocupações transversais de HTTP. Não é sobre o protocolo? Não mora aqui.

**`shared/`** — Infraestrutura interna que os módulos usam: erros, paginação, envelope, auditoria, flags, publicação de eventos. Regra de negócio aqui está no lugar errado.

**`utils/`** — Funções puras sem dependências. Importa Prisma? Não é util.

**`queues/`** — Topologia declarativa. Ler `topology.ts` é entender o sistema assíncrono inteiro.

**`workers/`** — Consumidores, em **processo separado** sob o PM2. Um worker travado nunca derruba o checkout. Workers não têm lógica própria: desserializam, chamam service, fazem ack/nack.

**`jobs/`** — Tarefas por tempo (cron), não por evento. Distinção importante: fila é reação a algo que aconteceu; job é varredura periódica. Confundir os dois gera fila com mensagem agendada, que RabbitMQ faz mal.

---

## 5. Estrutura dos módulos — arquitetura funcional

### Princípio

Cada arquivo tem **uma** razão para existir. Menos de ~15 linhas úteis e nada de específico? Não deveria existir.

### As camadas

```text
routes.ts     → mapeia caminho + middlewares → controller
controller.ts → traduz HTTP ↔ domínio
service.ts    → orquestra, transaciona, faz I/O
repository.ts → acessa dados
domain/       → funções PURAS: decidem, não fazem
schemas.ts    → Zod
```

### Os arquivos possíveis

| Arquivo | Existe quando | Não existe quando |
|---|---|---|
| `routes.ts` | **Sempre** | — |
| `controller.ts` | **Sempre.** Lê `req`, chama service, formata resposta | — |
| `service.ts` | **Quase sempre.** Regra de negócio, orquestração, transações | CRUD puríssimo sem nenhuma regra (raro) |
| `repository.ts` | Queries complexas, reusadas por 2+ services, ou SQL cru | O service faz 3 chamadas Prisma triviais — use Prisma direto |
| `schemas.ts` | **Sempre que o módulo recebe entrada** | Módulo sem body/query (raríssimo) |
| `domain/*.ts` | Há lógica **pura** que vale isolar e testar sem banco | A regra é `if (x) throw` — deixe no service |
| `types.ts` | Tipos que **não** derivam dos schemas Zod | Quase sempre. `z.infer<typeof x>` já dá o tipo |

### `domain/` — a camada de funções puras

**Definição rígida, sem a qual a pasta vira "diversos":**

> `domain/` contém **apenas funções puras**: sem Prisma, sem `fetch`, sem `Date.now()`, sem efeito colateral. Recebem dados, devolvem dados ou lançam erro de negócio.

O `service.ts` **orquestra e faz I/O**; o `domain/` **decide**. É a fronteira que impede o service de virar um arquivo de 2.000 linhas — e, mais importante, é o que torna a lógica de negócio testável em milissegundos, sem subir banco.

```text
service.ts (impuro — I/O e orquestração)
  1. carrega cart, variantes, cupom do banco        ← I/O
  2. totals = calculateTotals(items, coupon, ship)  ← domain/, puro
  3. grava Order + Items + Reservas em transação    ← I/O
  4. cria PaymentIntent                             ← integrations/
  5. publica order.created                          ← I/O
```

**Isto também é o que sustenta o "sem classes".** A objeção clássica ao código funcional com I/O é "como testo sem injeção de dependência?". A resposta: a lógica que vale testar é pura e não tem dependência. O resto é orquestração, testada por integração contra um Postgres real — mais fiel que qualquer mock.

### Quando `domain/` nasce

Aqui há uma tensão com a regra "evite criar arquivos vazios", e ela se resolve assim: **`domain/` nasce onde a pureza já se justifica no dia um, e cresce por gatilho.**

Nascem já na Fase 1, porque são obviamente puros, complexos e críticos:

| Arquivo | Responsabilidade |
|---|---|
| `checkout/domain/totals.ts` | itens + cupom + frete → subtotal, desconto, total. **O coração do "nunca confie no front"** |
| `coupons/domain/rules.ts` | este cupom se aplica a este carrinho? validade, mínimo, teto, limites |
| `shipping/domain/packing.ts` | cubagem: itens → caixas com peso e dimensões |
| `inventory/domain/ledger.ts` | movimentos → saldo; saldo acumulado do extrato |
| `products/domain/variants.ts` | produto cartesiano de opções, validação de combinações |

**Gatilho para extrair mais:** `service.ts` passou de ~300 linhas, **ou** a mesma lógica é usada por 2+ services, **ou** você quer testá-la sem banco. Antes disso, deixe no service — quatro arquivos de 10 linhas cada são pior que um service de 120.

### Sobre `validator.ts` — não existe. Nunca.

É o arquivo mais comum em boilerplates de Express e o mais inútil. Ele quase sempre contém:

```text
export const validateCreateProduct = (req, res, next) => {
  const result = createProductSchema.safeParse(req.body)
  if (!result.success) return res.status(400).json(...)
  next()
}
```

A **mesma função** repetida em cada módulo, com o schema trocado. É um parâmetro travestido de arquivo.

A alternativa é **um** middleware genérico:

```text
router.post('/', authenticate, requireRole('ADMIN'),
  validate({ body: createProductSchema }), createProductController)
```

Um arquivo em todo o projeto, em vez de dezessete. Quando o Zod não basta ("o SKU já existe?"), isso é **regra de negócio** e mora no service ou no domain — não em um validator.

### Nada de classes

Todo módulo exporta funções nomeadas. Sem `class ProductService`, sem construtor, sem `this`.

Justificativa concreta: uma classe com métodos e sem estado é um objeto que existe só para agrupar funções — e módulos ES já fazem isso, com tree-shaking de brinde. `this` é a maior fonte de bugs de contexto em JS. E a injeção de dependência que a classe habilita resolve testabilidade — problema já resolvido pelo `domain/` puro.

### Exemplos concretos

```text
modules/products/                    modules/checkout/
├── routes.ts                        ├── routes.ts
├── controller.ts                    ├── controller.ts
├── service.ts                       ├── service.ts        orquestra
├── repository.ts   ← EXISTE:        ├── schemas.ts
│    busca, filtros facetados        └── domain/
├── schemas.ts                           ├── totals.ts
└── domain/                              └── validation.ts
    └── variants.ts                  (sem repository.ts — não tem tabela)

modules/settings/
├── routes.ts
├── controller.ts
├── service.ts     ← get/set tipado + cache em memória
└── schemas.ts
(sem repository, sem domain — não há o que decidir)
```

Os três provam a regra: os arquivos que existem são os que têm trabalho a fazer.

---

## 6. Os módulos da v1 e como se relacionam

```text
                 ┌──────────┐
                 │  Store   │ (1 linha; raiz de tudo)
                 └────┬─────┘
        ┌─────────────┼──────────────┬──────────────┐
   ┌────▼────┐  ┌─────▼──────┐  ┌────▼─────┐  ┌────▼─────┐
   │  Users  │  │ Categories │  │Customers │  │ Settings │
   │ (staff) │  └─────┬──────┘  └────┬─────┘  │ + flags  │
   └────┬────┘        │              │        └──────────┘
    ┌───▼───┐    ┌────▼─────┐   ┌────▼─────┐
    │ Auth  │    │ Products │   │Addresses │
    └───────┘    └────┬─────┘   └────┬─────┘
                 ┌────▼─────┐        │
                 │ Variants │        │
                 └────┬─────┘        │
                 ┌────▼─────┐   ┌────▼─────┐
                 │Inventory │   │   Cart   │◄─── Coupons
                 └────┬─────┘   └────┬─────┘
                      │         ┌────▼─────┐
                      │         │ Checkout │◄─── Shipping
                      │         └────┬─────┘
                      └────────►┌────▼─────┐
                                │  Orders  │
                                └────┬─────┘
                           ┌─────────┴────────┐
                     ┌─────▼────┐      ┌──────▼─────┐
                     │ Payments │      │  Shipping  │
                     └──────────┘      └────────────┘
```

| Módulo | Responsabilidade | Relações |
|---|---|---|
| **Auth** | Login, refresh, logout, recuperação. **Dois fluxos separados**: staff e cliente | Lê `User` e `Customer`; só `RefreshToken` é seu |
| **Users** | CRUD de staff, papéis (`OWNER`/`ADMIN`/`STAFF`) | Pertence a `Store`. Referenciado por `AuditLog` |
| **Store** | Ler/editar os dados da loja única | Raiz de tudo |
| **Products** | Produto, imagens, opções, SEO, publicação | Tem `Variants`, pertence a `Categories` |
| **Categories** | Árvore (auto-relação `parentId`) | N:N com `Products` |
| **Product Variants** | SKU, preço, peso, dimensões, combinação de opções | Filha de `Product`. Alvo do `Inventory` |
| **Inventory** | Livro-razão + níveis + reservas | Referencia `Variant` e `Order` |
| **Customers** | Cadastro, senha, dados fiscais | Tem `Addresses`, `Orders`, `Carts` |
| **Addresses** | Endereços do cliente | Filha de `Customer`. Copiada (snapshot) para `Order` |
| **Cart** | Carrinho por cliente ou sessão anônima, com TTL | Aponta para `Variants`, `Coupon`, endereço e cotação |
| **Orders** | Pedido, itens (snapshot), status, timeline | Nasce do `Checkout`, consome `Inventory` |
| **Payments** | PaymentIntent, webhooks, reembolso | **Única fonte de verdade sobre pagamento** |
| **Checkout** | Orquestra o fluxo. Recalcula tudo do zero, sempre | Sem tabela. Usa cart/shipping/coupons/orders/payments |
| **Shipping** | Cotação, etiqueta e rastreio, atrás de `ShippingProvider` | Usado por `Checkout`; cria `Shipment` |
| **Coupons** | Valor/percentual/frete grátis, regras e limites | Aplicado no `Cart`, congelado na `Order` |
| **CMS** | **Page, Banner, Menu.** Só isso | Independente. Consumido pela loja |
| **Settings** | Chave-valor tipado + **feature flags** | Lido por vários módulos |
| **Uploads** | URLs de upload, metadados. Delega a `integrations/storage` | Usado por `Products` e `CMS` |

### CMS: escopo reduzido de propósito

`Page`, `Banner`, `Menu`, e a configuração fica em `Settings`. **Nada de blog** — ele é um produto de conteúdo (categorias, tags, autores, RSS, paginação, feed) e só faz sentido com estratégia de SEO orgânico, que é Fase 3.

`Menu` merece nota porque é o que faltava: sem ele, o header e o footer viram array hardcoded no código da loja. Toda alteração de menu vira deploy — inaceitável para quem opera a loja. É uma tabela de 5 colunas e uma tela simples.

**As páginas legais (troca, privacidade, termos) são obrigatórias por lei na Fase 1** — mas não precisam de CMS para existir. Podem nascer como componentes estáticos e migrar para `Page` na Fase 2.

### Relações que merecem destaque

**`Customer` ≠ `User`.** Ciclos de vida distintos: o cliente se auto-cadastra, tem CPF, endereço e histórico de compra; o staff é criado por convite, tem papel e é auditado. Fundi-los força flags condicionais em toda query e, na Fase 4, divergem ainda mais.

**`Cart` não vira `Order`.** O carrinho não é "promovido": o checkout **lê** o carrinho e **constrói** um pedido novo, recalculando do banco. Preço no carrinho é ao vivo (o cliente vê o preço atual); preço no pedido é congelado (o histórico não muda quando você reprecificar amanhã).

**`Payments` é o único que muda status de pagamento.** Nem o controller de order, nem o admin, nem o front. Só o handler de webhook.

---

## 7. Banco de dados — schema Prisma

### Convenções globais

| Regra | Justificativa |
|---|---|
| PK `String @id @default(cuid())` | Ordenável no tempo, não vaza contagem de pedidos, seguro em URL |
| **Dinheiro em `Int` (centavos)** | `Float` erra: `0.1 + 0.2 !== 0.3`. `Decimal` funciona mas contamina o código. Centavos são exatos e triviais em JSON. `formatBRL()` na borda |
| Peso em gramas, dimensões em milímetros (`Int`) | É o que Melhor Envio e Correios esperam |
| `createdAt`/`updatedAt` em toda tabela | Depurar produção sem isso é adivinhação |
| Soft delete **só** onde há histórico (`Product`, `Customer`) | Soft delete universal envenena toda query com `deletedAt: null` |
| Enums do Prisma para estados fechados | Constraint no banco, autocomplete no editor |
| `onDelete: Restrict` por padrão | Cascade acidental apaga pedidos. `Restrict` falha alto e cedo |

### Modelos

#### Núcleo

**`Store`** — `id`, `name`, `slug @unique`, `domain @unique`, `email`, `phone`, `document`, `addressJson`, `currency`, `timezone`, `locale`, timestamps.

**`User`** (staff) — `id`, `storeId`, `name`, `email`, `passwordHash`, `role: UserRole`, `isActive`, `lastLoginAt`, timestamps. `@@unique([storeId, email])`.
`enum UserRole { OWNER ADMIN STAFF }`

**`RefreshToken`** — `id`, `tokenHash @unique`, `userId?`, `customerId?`, `expiresAt`, `revokedAt?`, `replacedById?`, `userAgent`, `ip`, `createdAt`.
Guardamos o **hash**: um dump do banco não dá sessões ao atacante. `replacedById` implementa a cadeia de rotação (§15).

#### Catálogo

**`Category`** — `id`, `storeId`, `name`, `slug`, `description?`, `imageId?`, `parentId?`, `position`, `isActive`, `seoTitle?`, `seoDescription?`, timestamps. `@@unique([storeId, slug])`, `@@index([storeId, parentId])`.
**Adjacency list** (só `parentId`), não nested set: com ~50 categorias e 2–3 níveis, uma query carrega tudo e a árvore se monta em memória em microssegundos. Nested set otimiza uma leitura já instantânea e complica toda escrita.

**`Product`** — `id`, `storeId`, `name`, `slug`, `description?`, `shortDescription?`, `status: ProductStatus`, `brand?`, `tags: String[]`, `seoTitle?`, `seoDescription?`, `publishedAt?`, `deletedAt?`, timestamps. `@@unique([storeId, slug])`, `@@index([storeId, status])`.
`enum ProductStatus { DRAFT ACTIVE ARCHIVED }`
> Sem coluna `searchVector` na v1 — ver §16.

**`ProductCategory`** — join, `@@id([productId, categoryId])`. N:N: um vaso está em "Vasos" e em "Novidades".

**`ProductImage`** — `id`, `productId`, `uploadId`, `alt?`, `position`, `variantId?`. `variantId` permite trocar a foto ao selecionar a cor.

**`ProductOption`** — `id`, `productId`, `name` ("Cor"), `position`. `@@unique([productId, name])`
**`ProductOptionValue`** — `id`, `optionId`, `value` ("Verde"), `position`. `@@unique([optionId, value])`

**`ProductVariant`** — `id`, `storeId`, `productId`, `sku`, `barcode?`, `price`, `compareAtPrice?`, `costPrice?`, `weight` (g), `length`/`width`/`height` (mm), `position`, `isActive`, `imageId?`, timestamps. `@@unique([storeId, sku])`, `@@index([productId])`.

**`VariantOptionValue`** — join, `@@id([variantId, optionValueId])`. Define "esta variante = Verde + Grande".

> **Regra estrutural (igual ao Shopify): todo produto tem no mínimo uma variante.** Produto sem opções tem uma variante "Default Title" invisível na UI. Isso elimina o pior código do e-commerce: `if (product.hasVariants)` espalhado por carrinho, pedido, estoque e frete. Preço, SKU, peso e estoque vivem **sempre** na variante. É a decisão que mais simplifica o sistema inteiro.

#### Estoque

**`InventoryLevel`** — `id`, `variantId @unique`, `onHand`, `reserved`, `updatedAt`.
Projeção materializada. `available = onHand - reserved`. Não é a verdade — é o cache dela.

**`InventoryMovement`** — `id`, `storeId`, `variantId`, `type: MovementType`, `quantity` (**com sinal**), `reason?`, `reference?` (`order:xyz`), `userId?`, `createdAt`. `@@index([variantId, createdAt])`, `@@index([storeId, createdAt])`, `@@index([reference])`.
`enum MovementType { PURCHASE SALE RETURN CANCELLATION ADJUSTMENT COUNT }`
**Append-only. Nunca UPDATE, nunca DELETE.** Errou? Lance um movimento contrário.

**`InventoryReservation`** — `id`, `variantId`, `orderId`, `quantity`, `expiresAt`, `releasedAt?`, `createdAt`. `@@index([expiresAt, releasedAt])`.

#### Clientes

**`Customer`** — `id`, `storeId`, `name`, `email`, `passwordHash?`, `phone?`, `document?`, `documentType?`, `birthDate?`, `emailVerifiedAt?`, `acceptsMarketing`, `deletedAt?`, timestamps. `@@unique([storeId, email])`.
`passwordHash` opcional: guest checkout cria o cliente sem senha; ele pode definir uma depois e assumir o histórico.

**`Address`** — `id`, `customerId`, `label?`, `recipient`, `zipCode`, `street`, `number`, `complement?`, `district`, `city`, `state`, `country`, `isDefault`, timestamps.

#### Carrinho

**`Cart`** — `id`, `storeId`, `customerId?`, `sessionToken? @unique`, `couponId?`, `shippingAddressId?`, `shippingQuoteJson?`, `expiresAt`, timestamps. `@@index([storeId, customerId])`, `@@index([expiresAt])`.
`customerId` **ou** `sessionToken`; ao logar, o carrinho anônimo é mesclado. `shippingQuoteJson` é snapshot da cotação escolhida, sempre revalidado antes de cobrar.

**`CartItem`** — `id`, `cartId`, `variantId`, `quantity`, `createdAt`. `@@unique([cartId, variantId])`.
Sem preço — sempre lido da variante, ao vivo.

#### Pedidos

**`Order`** — `id`, `storeId`, `number` (Int sequencial por loja), `customerId`, `email`, `phone?`, `paymentStatus`, `fulfillmentStatus`, `canceledAt?`, `cancelReason?`, `subtotal`, `discountTotal`, `shippingTotal`, `total`, `couponId?`, `couponCodeSnapshot?`, `shippingAddressJson`, `billingAddressJson?`, `shippingMethodJson`, `customerNote?`, `internalNote?`, timestamps.
`@@unique([storeId, number])`, `@@index([storeId, paymentStatus])`, `@@index([storeId, createdAt])`, `@@index([customerId])`.

```text
enum PaymentStatus     { PENDING PROCESSING PAID FAILED
                         REFUNDED PARTIALLY_REFUNDED }
enum FulfillmentStatus { UNFULFILLED PICKING READY_TO_SHIP
                         SHIPPED DELIVERED RETURNED }
```

> **Por que dois enums e não um.** Um enum único vira produto cartesiano: `PAID_UNFULFILLED`, `PAID_SHIPPED`, `REFUNDED_SHIPPED`… A cada estado novo de um eixo, todos os do outro se multiplicam. Dois eixos ortogonais + `canceledAt` modelam a realidade: pagamento e logística evoluem independentemente.

**`OrderItem`** — `id`, `orderId`, `variantId?` (`SetNull`), `productName`, `variantName`, `sku`, `unitPrice`, `quantity`, `totalPrice`, `weight`, `imageUrl?`.
**Tudo é snapshot.** Se a variante for apagada em 2027, o pedido de 2026 continua imprimindo certo. Um pedido é documento histórico, não view do catálogo atual.

**`OrderEvent`** — `id`, `orderId`, `type`, `description`, `metadataJson?`, `userId?`, `createdAt`. A timeline que o admin exibe e o suporte usa. `type` usa o **mesmo vocabulário dos eventos** (§12).

**`Payment`** — `id`, `orderId`, `provider`, `method: PaymentMethod`, `status: PaymentStatus`, `amount`, `stripePaymentIntentId @unique`, `stripeChargeId?`, `installments?`, `paidAt?`, `failureCode?`, `failureMessage?`, `metadataJson?` (QR do Pix, linha digitável, `expiresAt`), timestamps.
`enum PaymentMethod { CARD PIX BOLETO }`

**`Refund`** — `id`, `paymentId`, `amount`, `reason?`, `stripeRefundId @unique`, `userId?`, `createdAt`.

**`StripeEvent`** — `id` (= `event.id` do Stripe, **PK**), `type`, `payloadJson`, `processedAt?`, `error?`, `createdAt`.
A pedra angular da idempotência: o Stripe **garante** reentrega e **não garante** entrega única.

**`Shipment`** — `id`, `orderId`, `carrier`, `service`, `trackingCode?`, `trackingUrl?`, `labelUrl?`, `providerShipmentId?`, `cost`, `status: ShipmentStatus`, `shippedAt?`, `deliveredAt?`, timestamps.
`enum ShipmentStatus { PENDING LABEL_PURCHASED SHIPPED IN_TRANSIT DELIVERED FAILED }`
Tabela separada porque um pedido pode ter mais de uma remessa — na v1 sempre uma, mas o modelo já suporta.

#### Cupons

**`Coupon`** — `id`, `storeId`, `code`, `type: CouponType`, `value`, `minOrderValue?`, `maxDiscount?`, `usageLimit?`, `usageCount`, `usageLimitPerCustomer?`, `startsAt?`, `endsAt?`, `isActive`, timestamps. `@@unique([storeId, code])`.
`enum CouponType { PERCENTAGE FIXED_AMOUNT FREE_SHIPPING }`

**`CouponUsage`** — `id`, `couponId`, `orderId @unique`, `customerId`, `discountAmount`, `createdAt`.
`usageCount` é cache; `CouponUsage` é a verdade — mesmo padrão do estoque. `orderId @unique` impede contar duas vezes.

#### CMS

**`Page`** — `id`, `storeId`, `title`, `slug`, `contentJson`, `isPublished`, `seoTitle?`, `seoDescription?`, `publishedAt?`, timestamps. `@@unique([storeId, slug])`.

**`Banner`** — `id`, `storeId`, `title?`, `subtitle?`, `uploadId`, `mobileUploadId?`, `link?`, `position`, `isActive`, `startsAt?`, `endsAt?`, timestamps.

**`Menu`** — `id`, `storeId`, `handle` (`header`, `footer-institucional`), `name`, timestamps. `@@unique([storeId, handle])`.
**`MenuItem`** — `id`, `menuId`, `parentId?`, `label`, `url`, `position`, `openInNewTab`. `@@index([menuId, position])`.
Auto-relação para submenu. `url` é string livre — resolver "aponta para categoria X ou página Y" com uma união polimórfica é complexidade sem retorno; o admin oferece um seletor que gera a URL.

#### Settings, Uploads, Auditoria

**`Setting`** — `id`, `storeId`, `key`, `valueJson`, `updatedAt`. `@@unique([storeId, key])`.
Chave-valor com JSON, lido por um helper tipado com Zod por chave. Alternativa rejeitada: tabela larga com uma coluna por config — cada nova config vira migração.

**`Upload`** — `id`, `storeId`, `key @unique` (caminho no bucket), `filename`, `mimeType`, `size`, `width?`, `height?`, `folder?`, `userId?`, `createdAt`.
> Guarda **`key`, não `url`**. A URL é derivada por `getPublicUrl(key)` (§13). Persistir a URL completa amarra os dados ao provedor de hoje — trocar de storage viraria um UPDATE em toda a tabela e as URLs antigas ficariam quebradas no histórico.

**`AuditLog`** — `id`, `storeId`, `userId?`, `action` (`product.update`), `entityType`, `entityId`, `changesJson?`, `ip?`, `userAgent?`, `createdAt`. `@@index([storeId, createdAt])`, `@@index([entityType, entityId])`.

**`ProcessedEvent`** — `id` (**PK** = messageId), `queue`, `processedAt`. Idempotência dos workers (§12).

**`Favorite`** — `id`, `customerId`, `productId`, `createdAt`. `@@unique([customerId, productId])`.
**Tabela na Fase 1; funcionalidade na Fase 3.** Única exceção à regra "não crie o que não usa", e é barata: 4 colunas, zero dependência, zero código. Evita uma migração numa base já grande.

### Índices — a lógica

| Índice | Query que ele serve |
|---|---|
| `Product @@unique([storeId, slug])` | `/produtos/vaso-ceramica` — a rota mais quente da loja |
| `Product @@index([storeId, status])` | Vitrine (só `ACTIVE`) |
| `ProductVariant @@unique([storeId, sku])` | Integridade + busca por SKU no admin |
| `Order @@index([storeId, paymentStatus])` | "Pagos aguardando separação" — a tela mais usada do admin |
| `Order @@index([storeId, createdAt])` | Listagem padrão |
| `InventoryMovement @@index([variantId, createdAt])` | Reconstrução do saldo e extrato |
| `InventoryReservation @@index([expiresAt, releasedAt])` | Job de expiração varre só as pendentes |
| `Cart @@index([expiresAt])` | Limpeza de abandonados |
| `StripeEvent` PK = `event.id` | Idempotência — o índice **é** a constraint |

**A ordem importa.** `[storeId, status]` serve `WHERE storeId=? AND status=?` **e** `WHERE storeId=?`. O inverso não serve a segunda. Regra: campo sempre-presente primeiro.

**Não indexe por precaução.** Todo índice é escrita mais lenta e disco. Os próximos, quando `EXPLAIN ANALYZE` de uma query real pedir.

### Constraints — a rede de segurança

O banco deve **recusar** dados impossíveis, mesmo com bug na aplicação. Via `migration.sql` manual (o Prisma não modela `CHECK`):

- `InventoryLevel.onHand >= 0` e `reserved >= 0`
- `ProductVariant.price >= 0`
- `Order.total >= 0`
- `CartItem.quantity > 0`
- `Coupon`: `type='PERCENTAGE'` → `value BETWEEN 1 AND 100`
- `RefreshToken`: exatamente um de `userId`/`customerId` não-nulo

### Boas práticas obrigatórias

1. **Transação onde há invariante.** Criar pedido = `Order` + `OrderItem` + `InventoryReservation` + `usageCount`. Ou tudo, ou nada.
2. **Nunca `SELECT *` implícito em lista.** `select` explícito — a vitrine não precisa do `description` de 40 KB de 24 produtos.
3. **`Promise.all` para queries independentes.**
4. **`include` além de 2 níveis** provavelmente é query crua no repository.
5. **Toda migration versionada, nunca `db push` em produção.**
6. **Backup: `pg_dump` diário via cron, com cópia off-site.** Numa VPS única, não é opcional — é a diferença entre um susto e o fim do negócio. **Testar o restore trimestralmente**: backup nunca testado é backup inexistente.

---

## 8. Produtos — modelagem detalhada (modelo Shopify)

```text
Product ──── "Vaso de Cerâmica Artesanal"
  │            slug, descrição, status, tags, SEO
  ├── ProductCategory[] ──── Vasos, Novidades   (N:N)
  ├── ProductImage[] ──────── foto1 (pos 0), foto2 (pos 1)
  │                              └── variantId? → foto muda ao trocar a cor
  ├── ProductOption[] ─────── "Cor"      ──── Verde, Terracota
  │                           "Tamanho"  ──── P, M, G
  └── ProductVariant[] ────── o produto vendável de verdade
        │                       sku, price, compareAtPrice, costPrice
        │                       weight (g), length/width/height (mm)
        ├── VariantOptionValue[] ── {Verde, G}   ← define a variante
        └── InventoryLevel ───────── onHand, reserved
              └── InventoryMovement[] ── o histórico
```

### O ponto central

**O `Product` é marketing. A `ProductVariant` é comércio.**

O produto responde "o que é isso, como se chama, como aparece no Google". A variante responde "o que exatamente eu envio, quanto custa, quanto pesa, quantos tenho".

Consequências diretas:
- O carrinho aponta para `variantId`, nunca `productId`.
- O estoque é da variante.
- O frete soma peso e dimensões **das variantes** no carrinho.
- Produto sem opções tem **uma** variante default. A UI esconde isso; o modelo, não.

Sem essa uniformidade, cada consumidor (carrinho, pedido, frete, estoque, busca) precisa de dois caminhos, e é garantido que um deles vai divergir.

### Fluxo de cadastro no admin

1. **Informações** — nome (gera slug editável), descrição rica, categorias, tags, marca.
2. **Mídia** — upload direto via URL assinada, reordenação por drag & drop.
3. **Preço** — `price`, `compareAtPrice` ("de R$ 199 por R$ 149"), `costPrice` (interno, alimenta a margem).
4. **Estoque** — SKU, código de barras, quantidade inicial (gera `InventoryMovement` do tipo `PURCHASE`, nunca `UPDATE` no `onHand`).
5. **Envio** — peso em gramas, dimensões em milímetros. **Sem isso não há cotação** — o admin bloqueia a publicação.
6. **Variações** — declarar opções; a UI propõe o cartesiano (`products/domain/variants.ts`); o usuário desmarca o que não existe e define preço/SKU/estoque de cada uma.
7. **SEO** — `seoTitle`, `seoDescription`, preview do Google. Vazio → cai para nome e `shortDescription`.
8. **Status** — `DRAFT` → `ACTIVE` (define `publishedAt`) → `ARCHIVED`.

### Regras de negócio

- Slug único por loja; ao colidir, sufixar `-2`.
- Publicar exige: ≥1 imagem, ≥1 variante ativa, todas com preço e peso.
- Excluir produto com pedidos → `ARCHIVED` + `deletedAt`, nunca DELETE.
- Mudar preço **não** afeta pedidos (snapshot) nem carrinhos (preço ao vivo — o cliente paga o preço vigente ao fechar).

---

## 9. Estoque — livro-razão

### Decisão: **event sourcing localizado** (ledger + projeção)

`InventoryMovement` é append-only. `InventoryLevel.onHand` é projeção materializada.

### Por que não um campo `quantity`

Um campo mutável responde "quanto tem" e nada do que o negócio pergunta de verdade:

- "Por que o sistema diz 3 e a prateleira tem 1?"
- "Quem alterou isso e quando?"
- "Quanto vendi deste SKU em junho?"
- "O pedido cancelado devolveu o estoque?"

Com `UPDATE quantity = quantity - 1` essas perguntas são **impossíveis** — a informação foi destruída na escrita. Um ledger torna todas triviais, ao custo de uma tabela e uma função. É o raro caso em que a solução mais rica é também a mais simples de operar.

### Tipos de movimento

| Tipo | Sinal | Origem | Quando |
|---|---|---|---|
| `PURCHASE` | **+** | Admin | Fornecedor, produção, estoque inicial |
| `SALE` | **−** | Sistema | Webhook `payment_intent.succeeded` |
| `RETURN` | **+** | Admin | Devolução reintegrada |
| `CANCELLATION` | **+** | Sistema | Pedido pago cancelado/reembolsado |
| `ADJUSTMENT` | **±** | Admin | Quebra, perda, erro. **`reason` obrigatório** |
| `COUNT` | **±** | Admin | Inventário físico. Grava a **diferença** |

### Reserva ≠ movimento

**Crítico.**

```text
Cliente cria pedido (ainda não pagou)
  → InventoryReservation(qty=1, expiresAt=+30min)
  → InventoryLevel.reserved += 1
  → NENHUM InventoryMovement
     (a mercadoria continua fisicamente na prateleira)

Pagamento aprovado
  → InventoryMovement(SALE, -1, reference='order:abc')
  → onHand -= 1 ; reserved -= 1 ; reservation.releasedAt = now

Pagamento falha / Pix expira / TTL vence
  → reserved -= 1 ; reservation.releasedAt = now
  → NENHUM movimento (nada aconteceu de verdade)
```

O ledger registra **fatos físicos**. Reserva é **intenção**. Misturá-los polui o histórico com eventos que nunca ocorreram e destrói qualquer relatório de vendas.

`available = onHand - reserved` — é o número que a loja mostra e o carrinho valida.

Com Pix e boleto a reserva ganha peso: o boleto leva até 3 dias. **TTL por método** via `Setting`: cartão 30 min, Pix 60 min, boleto 3 dias — ajustável sem deploy.

### Concorrência — a parte que costuma quebrar

Dois clientes, uma peça. O padrão perigoso é ler o saldo, decidir, e depois escrever: entre a leitura e a escrita, o outro passou.

Solução: **decidir e escrever no mesmo comando**, deixando o banco arbitrar.

```sql
UPDATE "InventoryLevel"
   SET reserved = reserved + $qty
 WHERE "variantId" = $id
   AND (onHand - reserved) >= $qty
RETURNING *;
```

Zero linhas de volta = não havia estoque, e a decisão foi atômica sob o lock de linha do Postgres. Sem `SELECT` antes, sem race, sem lock explícito, sem serializable. O `CHECK (reserved >= 0)` é a rede embaixo.

### Reconstrução do saldo

```sql
SELECT "variantId", SUM(quantity) AS onHand
  FROM "InventoryMovement" GROUP BY "variantId";
```

Isso habilita três coisas de alto valor:

1. **Auditoria** — job diário compara ledger × projeção e alerta na divergência. Se divergiu, há um bug **e você sabe no mesmo dia**, com o histórico intacto.
2. **Recuperação** — corrompeu `InventoryLevel`? `TRUNCATE` e reprojete. O dado real nunca esteve lá.
3. **Estoque retroativo** — "quanto eu tinha em 31/12?" é `WHERE createdAt <= '2026-12-31'`. Impossível com campo mutável.

### Extrato no admin

Data, tipo, quantidade com sinal, saldo acumulado (`SUM() OVER (ORDER BY createdAt)`), motivo, responsável, link para o pedido. Zero código novo — é uma query sobre uma tabela que já existe.

---

## 10. Checkout — fluxo transparente com Stripe

```text
1. CARRINHO      GET/POST /cart              valida disponibilidade
2. IDENTIFICAÇÃO login | cadastro | guest    e-mail obrigatório
3. ENDEREÇO      POST /checkout/address      CEP → ViaCEP → autopreenche
4. FRETE         POST /checkout/shipping     Melhor Envio → opções
5. RESUMO        GET  /checkout/summary      backend recalcula TUDO
6. PEDIDO+PI     POST /checkout/confirm      ┌ tx: Order(PENDING)+Items+Reservas
                                             └ Stripe PI (metadata.orderId)
7. ELEMENTS      Payment Element             cartão | Pix | boleto
8. WEBHOOK       POST /webhooks/stripe       ← A ÚNICA FONTE DE VERDADE
9. PAGO          paymentStatus = PAID        SALE no ledger, publica order.paid
10. SEPARAÇÃO    fulfillmentStatus = PICKING
11. EXPEDIÇÃO    etiqueta, rastreio, SHIPPED
```

### Regra absoluta: o front nunca decide nada

O passo 6 **recalcula do zero, a partir do banco**, ignorando integralmente o que o cliente mandou:

- preço de cada item ← `ProductVariant.price` (o payload é descartado)
- disponibilidade ← `InventoryLevel`
- frete ← recotação (a cotação de 40 min atrás não vale)
- cupom ← revalidação de validade, limites e uso por cliente
- total ← `checkout/domain/totals.ts`, função pura, testada isoladamente

O request de `confirm` carrega, no máximo, **ids e escolhas**. Nunca valores. Um cliente que edite o preço no DevTools recebe o preço real.

### O `PaymentIntent` e o `orderId`

`Order` nasce **antes** do PI, com `paymentStatus: PENDING`, e o `orderId` vai em `metadata`. É o que torna o webhook trivial: quando o evento chega — talvez 3 dias depois, no boleto — ele diz exatamente qual pedido pagar.

A alternativa (criar o pedido no webhook) exige reconstruir carrinho, preço e reserva num contexto sem request, sem sessão e sem garantia de que o estoque ainda existe. É a origem clássica do "pagou e não tem o produto".

Idempotência: `idempotencyKey = orderId` na chamada ao Stripe. Duplo clique não cria dois PIs.

### Webhooks — o coração da confiabilidade

```text
POST /webhooks/stripe   (rota fora do body-parser JSON: precisa do raw body)

1. constructEvent(rawBody, signature, secret)
   → assinatura inválida → 400 e ponto final
2. INSERT INTO "StripeEvent" (id, type, payload)
   → conflito de PK → já processado → 200 e ignora
3. Processa INLINE, dentro de uma transação  (~20ms)
4. processedAt = now()
5. Publica order.paid  ← os efeitos lentos vão para a fila
6. 200
```

| Evento | Ação |
|---|---|
| `payment_intent.succeeded` | `PAID`, `SALE` no ledger, libera reserva, `CouponUsage`, publica `order.paid` |
| `payment_intent.processing` | `PROCESSING` — Pix/boleto emitidos, aguardando compensação |
| `payment_intent.payment_failed` | `FAILED`, libera reserva, publica `email.payment_failed` |
| `payment_intent.canceled` | Boleto/Pix expirado — libera reserva, cancela o pedido |
| `charge.refunded` | `REFUNDED`, movimento `CANCELLATION`, cria `Refund` |
| `charge.dispute.created` | `OrderEvent` + alerta ao admin |

### Por que o handler é síncrono e só os efeitos são assíncronos

Uma alternativa tentadora é o webhook apenas enfileirar e retornar 200. **Rejeitada:** a transação que muda o pedido para `PAID` leva ~20ms e precisa acontecer *agora* — a tela de confirmação do cliente faz polling nesse status. Se o worker estiver fora do ar, o cliente pagou e fica olhando um spinner.

E a fila não adiciona durabilidade que já não exista: o Stripe **reentrega** em caso de não-200, e `StripeEvent` **dá a idempotência**. Ou seja, a fila entre o Stripe e o banco acrescenta um modo de falha sem remover nenhum.

O que **é** assíncrono são os efeitos: e-mail, etiqueta, analytics. Um webhook que manda e-mail síncrono é um webhook que vai dar timeout e ser reentregue.

### Por que a assinatura é obrigatória

Sem `constructEvent`, `/webhooks/stripe` é um endpoint público que marca pedidos como pagos mediante um POST bem formatado. É a vulnerabilidade mais grave possível em e-commerce. Não é boa prática — é a única coisa entre o sistema e a fraude trivial.

### Pix e Boleto

Ambos são **assíncronos**: o `confirm` retorna `processing`, não `succeeded`.

- **Pix** — Stripe devolve QR + copia-e-cola em `next_action`; a tela mostra e faz polling em `GET /orders/:id/status`. Expira em ~1h.
- **Boleto** — PDF e linha digitável; e-mail com o boleto sai por worker. Compensação em até 3 dias úteis; a reserva acompanha.
- **Cartão** — pode exigir 3DS; o Payment Element trata o desafio.

SLA diferente por método é a razão do TTL de reserva configurável.

### Reconciliação — a rede de segurança

`jobs/reconcile-payments.ts`, a cada 15 min: busca pedidos `PENDING`/`PROCESSING` há mais de 1 hora e consulta a API do Stripe direto. Stripe diz `succeeded` e o banco diz `PENDING`? Um webhook se perdeu — o job aplica o mesmo caminho de processamento.

~30 linhas que cobrem o pior cenário do negócio (cliente pagou, sistema não viu) sem precisar de outbox transacional. **É o melhor retorno sobre esforço de todo o sistema.**

---

## 11. Frete — Melhor Envio com porta aberta

```text
integrations/melhor-envio/     ← COMO falar com a API deles
├── client.ts                    fetch base, token, retry, rate limit
├── quote.ts  label.ts  tracking.ts

modules/shipping/              ← O QUE o negócio faz com frete
├── routes.ts  controller.ts  schemas.ts
├── service.ts                   escolhe provider, aplica regras
├── types.ts                     ShippingProvider  ← EXISTE
├── domain/
│   └── packing.ts               cubagem: itens → caixas (puro)
└── providers/
    ├── index.ts                 registry: Record<string, ShippingProvider>
    └── melhor-envio.ts          adapta integrations/ → ShippingProvider
```

O contrato:

```text
ShippingProvider = {
  id: string
  quote:        (req: QuoteRequest) => Promise<QuoteOption[]>
  createLabel:  (order)             => Promise<LabelResult>
  track:        (code)              => Promise<TrackingStatus>
  cancelLabel?: (id)                => Promise<void>
}
```

### Por que este nível de abstração e não menos

Uma abstração se justifica com **evidência concreta** de um segundo caso — e aqui existe: Correios, Jadlog, Kangu e Loggi estão declarados. Sem a interface, "adicionar Jadlog" significa caçar chamadas ao Melhor Envio espalhadas por checkout, orders e workers.

Com ela: criar `jadlog.ts`, registrar no `index.ts`, pronto. Checkout, orders e workers não mudam.

### Por que não mais

Sem factory, sem plugin loader, sem classe abstrata, sem tabela de providers. O registry é um objeto literal. **Um `Record<string, ShippingProvider>` é uma factory — só que legível.**

E `providers/melhor-envio.ts` é fino de propósito: ele **adapta**, não implementa. O HTTP mora em `integrations/`.

### Fluxo de cotação

```text
POST /checkout/shipping  { cartId, zipCode }
  1. carrega itens + peso/dimensões das variantes
  2. packing.ts → caixas                        ← domain, puro
  3. origem = Store.addressJson | destino = CEP
  4. melhorEnvio.quote(...)                     ← integrations
  5. filtra serviços habilitados em Setting
  6. aplica regras: frete grátis acima de X
  7. ordena por preço
→ [{ id, carrier:'Correios', service:'PAC', price:2350, deliveryDays:7 }]
```

Cotação **nunca** é cacheada por cliente, mas é cacheada por `(CEP, peso arredondado, valor)` por ~30 min — a API do Melhor Envio tem rate limit e latência de 1–3s, e essa chamada está no caminho crítico do checkout.

### Etiqueta e rastreio (assíncronos)

- `order.paid` → fila `shipping.label` → worker compra e gera a etiqueta → salva `labelUrl` e `trackingCode`.
- `jobs/sync-tracking.ts` (cron 2×/dia) → publica `shipping.tracking.sync` para remessas em trânsito → worker consulta e atualiza `Shipment`; ao virar `DELIVERED`, publica `email.order_delivered`.

> Rastreio é **cron que alimenta fila**, não fila pura: nada "acontece" para reagir — é uma varredura periódica. Essa é exatamente a distinção `jobs/` × `queues/`.

Assíncrono por necessidade: a compra de etiqueta pode falhar (saldo, indisponibilidade) e **não pode** impedir a confirmação do pagamento. Falhou? Retry, DLQ, alerta — **o cliente já pagou e o pedido é válido de qualquer forma**.

---

## 12. Eventos e RabbitMQ

### Decisão: fila **apenas** para o que é genuinamente assíncrono. Quatro filas.

O erro comum é tratar eventos como arquitetura principal e publicar tudo "porque um dia alguém pode consumir". Cada evento sem consumidor é topologia para manter, mensagem para depurar e um lugar a mais onde procurar quando algo não acontece. **Cadastrar um produto não precisa publicar evento.**

O critério é único e binário:

> Vai para a fila o que é **lento**, **pode falhar sem quebrar o fluxo principal**, ou tem **mais de um interessado**. Todo o resto é chamada de função.

### O que foi cortado, e por quê

| Descartado | Por quê |
|---|---|
| `catalog.product.updated` → revalidar loja | O ISR de 60s já resolve. Uma fila para economizar 60s de atraso é fila para o ego |
| `order.created` | Ninguém consome. O pedido ainda não é fato comercial — pode nunca ser pago |
| `inventory.low_stock` | É uma **query** no dashboard (`available < minStock`), não um evento |
| `notification.*` | Não existe notificação além de e-mail na v1 |
| `product.*`, `category.*` | CRUD síncrono. Quem precisa saber já sabe: quem chamou |

De 7 filas para 4.

### Topologia

```text
Exchange:  ecommerce.events  (topic, durable)
Exchange:  ecommerce.dlx     (topic, durable)

FILAS (4):
  email.send         ← email.*                  e-mail é lento e falha
  order.paid         ← order.paid               fan-out do pós-pagamento
  shipping.label     ← shipping.label.requested API externa, pode falhar
  shipping.tracking  ← shipping.tracking.sync   API externa, em lote

RETRY (por fila; TTL crescente, dead-letter de volta à origem):
  <fila>.retry.5s     x-message-ttl=5000
  <fila>.retry.30s    x-message-ttl=30000
  <fila>.retry.5m     x-message-ttl=300000

DEAD LETTER:
  <fila>.dlq          ← ecommerce.dlx   (sem consumidor; inspeção manual)
```

### Vocabulário de eventos — a convenção vale mesmo com poucas filas

Nomes padronizados em `@ecommerce/shared/constants`, no formato **`recurso.ação-no-passado`**:

```text
order.paid    order.canceled    order.shipped    order.delivered
product.created    product.updated    product.deleted
customer.registered
```

E aqui está o ganho que não é óbvio: **esse vocabulário é usado em três lugares, não só na fila.**

| Superfície | Uso |
|---|---|
| `AuditLog.action` | `product.updated` |
| `OrderEvent.type` | `order.paid` |
| Routing key do RabbitMQ | `order.paid` — só para os 4 que têm fila |

Um único vocabulário para "o que aconteceu no sistema", independente de onde é registrado. `product.updated` **existe** como nome — vai para o `AuditLog`, e **não** vai para fila nenhuma, porque ninguém consome. No dia em que alguém consumir, o nome já existe e já é o certo.

Isso é o que "eventos internos sem Event Sourcing" significa na prática: **padronizar o vocabulário sem construir a máquina.**

### Produtores

Só o **service** publica, sempre **depois** do commit. Publicar dentro da transação é o erro clássico: se ela der rollback, um evento sobre um fato que não aconteceu já está na fila.

```text
publish(routingKey, payload):
  channel.publish('ecommerce.events', routingKey, Buffer(JSON.stringify({
    id:         cuid(),        ← chave de idempotência do consumidor
    type:       routingKey,
    occurredAt: ISO,
    payload
  })), { persistent: true, messageId: id })
```

`persistent: true` + fila durable = a mensagem sobrevive a restart do broker. Sem isso, um `pm2 restart` na hora errada perde pedidos pagos.

### Eventos que realmente vão para fila na v1

```text
order.paid                  → publicado pelo webhook
  └─ order-paid.worker      → publica email.order_confirmation
                            → publica shipping.label.requested

email.order_confirmation    email.order_shipped     email.order_delivered
email.payment_failed        email.boleto_issued     email.password_reset
                            → email.worker (genérico: {template, to, data})

shipping.label.requested    → shipping-label.worker
shipping.tracking.sync      → shipping-tracking.worker (alimentado por cron)
```

`order.paid` tem um worker **orquestrador** de propósito: um lugar único que responde "o que acontece quando um pedido é pago?". Quando surgir analytics server-side ou ERP, é ali que entra — sem tocar no webhook.

### Consumidores

```text
consume(queue, handler):
  channel.prefetch(1)               ← não acumule trabalho não processado
  channel.consume(queue, async msg => {
    try {
      const event = JSON.parse(msg.content)
      if (await alreadyProcessed(event.id)) return channel.ack(msg)
      await handler(event.payload)
      await markProcessed(event.id)
      channel.ack(msg)
    } catch (err) {
      logger.error({ err, msg })
      await routeToRetryOrDlq(msg, err)   ← nunca nack(requeue:true)
    }
  })
```

### Retry — por que não `nack(requeue: true)`

`nack` com requeue devolve a mensagem para a **frente** da fila. Ela é reprocessada imediatamente, falha de novo, e o resultado é um **loop infinito a 100% de CPU** que trava a fila para todo mundo. É o erro mais comum com RabbitMQ.

O padrão correto usa TTL: publicar na `<fila>.retry.5s`, que **não tem consumidor**. Passados 5s, o TTL expira e o RabbitMQ dead-letter a mensagem **de volta** para a fila original. Backoff sem cron, sem scheduler, sem código — só topologia.

```text
falha 1 → retry.5s   → 5s depois volta
falha 2 → retry.30s  → 30s depois volta
falha 3 → retry.5m   → 5min depois volta
falha 4 → DLQ        → alerta, inspeção humana
```

Contagem no header `x-retry-count`.

### Dead Letter Queue

A DLQ **não tem consumidor**. É intencional: uma mensagem lá dentro é um bug, e bug se corrige, não se reprocessa cegamente. O admin (Fase 2) mostra o conteúdo e permite reprocessar após o fix. Alerta quando a profundidade > 0.

### Idempotência

Tabela `ProcessedEvent(id PK, queue, processedAt)`. O consumidor insere; conflito de PK = já processado = ack e segue.

**Obrigatório, não defensivo**: RabbitMQ é *at-least-once*. Um ack perdido por queda de rede reentrega. Sem isso, o cliente recebe dois e-mails — ou, muito pior, o estoque é debitado duas vezes.

Quando possível, prefira **operações naturalmente idempotentes**: `UPDATE order SET status='PAID' WHERE id=x` pode rodar mil vezes; `UPDATE inventory SET onHand = onHand - 1` não pode rodar duas.

### Quando NÃO usar fila

Precisa do resultado agora? Síncrono. É varredura periódica? `jobs/`, cron. Ninguém consome? Não publique.

---

## 13. Storage e Uploads

### Decisão: interface `StorageProvider`; **R2 em produção, disco local em desenvolvimento**

```text
integrations/storage/
├── types.ts     StorageProvider
├── r2.ts        produção — Cloudflare R2 (S3-compatível)
├── local.ts     desenvolvimento — ./uploads + rota de recebimento
└── index.ts     escolhe por env.STORAGE_DRIVER
```

### A interface

```text
StorageProvider = {
  getUploadUrl:  (key, mimeType) => Promise<{ uploadUrl, method, headers }>
  getPublicUrl:  (key)           => string
  delete:        (key)           => Promise<void>
  exists?:       (key)           => Promise<boolean>
}
```

### Por que **não** `upload(file)`

A assinatura intuitiva — `upload(file)` / `delete(file)` / `getUrl(file)` — tem um problema técnico sério: **`upload(file)` obriga o arquivo a passar pela API**. E isso mata justamente o benefício do object storage:

- O Node bufferiza dezenas de MB em memória (pico por request concorrente);
- entra `multer`, disco temporário e limite de body;
- a VPS paga a banda **duas vezes** (recebe do cliente, envia ao R2);
- upload de 20 MB em 4G estoura o timeout do request.

Com `getUploadUrl`, o browser faz `PUT` **direto** no R2 e o arquivo **nunca toca a API**. Sem multer, sem disco temporário, sem timeout, sem pico de memória.

A interface acomoda os dois mundos porque `local.ts` retorna uma URL apontando para uma rota **da própria API** (`/api/v1/uploads/direct?token=…`) que grava em `./uploads`. **O código do front é idêntico nos dois casos** — ele pede uma URL e faz PUT nela.

### Por que a interface se justifica (e não é abstração especulativa)

Não é pelo swap futuro — é porque **`local.ts` é a implementação de desenvolvimento**: você clona o repo, `pnpm dev`, e sobe sem credencial de nuvem nenhuma. Dev/prod parity com um `if` no `index.ts`.

O swap futuro vem de brinde. Mas o valor é hoje.

### Por que R2 em produção **desde o dia um**, e não disco local

Disco local em produção é tentador (é grátis, o Nginx serve). Rejeitado por três motivos concretos:

1. **Backup** — `pg_dump` não leva as imagens. Vira um segundo processo de backup, que será esquecido até o dia do desastre.
2. **É um caminho sem volta** — a interface torna a troca de **código** gratuita, mas **não** a troca de **dados**: migrar mídia com URLs já indexadas pelo Google exige mover arquivos e manter os caminhos antigos vivos (ou 301) para sempre. **A interface resolve o acoplamento, não a migração.** Começando no R2, essa migração simplesmente nunca acontece.
3. **Sem CDN** — toda imagem sai do Brasil, do mesmo IP, competindo com o Postgres pelo I/O da mesma máquina.

R2 custa centavos nesse volume, **não cobra egress** (o diferencial real contra o S3, onde a banda de imagem é o custo dominante em e-commerce) e serve por CDN global.

### Fluxo

```text
1. Admin escolhe o arquivo
2. POST /api/v1/uploads/presign  { filename, mimeType, size }
     valida: mime na allowlist, size <= 10MB, autenticado
     key: store/<storeId>/products/<ano>/<mes>/<cuid>.<ext>
     → storage.getUploadUrl(key, mimeType)
     → { uploadUrl, key }
3. Browser faz PUT direto           ← R2 em prod, rota local em dev
4. POST /api/v1/uploads/confirm  { key, width, height }
     → cria Upload, retorna { id, url: getPublicUrl(key) }
5. O produto referencia uploadId
```

`Upload` guarda a **`key`**, não a URL (§7). A URL é sempre derivada — é o que mantém os dados independentes do provedor.

### Redimensionamento

**Não gerar derivadas.** Guardar o original e deixar o `next/image` otimizar sob demanda (`remotePatterns` para o domínio do R2). O Next redimensiona, converte para WebP/AVIF e cacheia.

Um worker com `sharp` gerando 4 tamanhos por imagem é ~150 linhas, uma fila, uma tabela de variantes e um caminho de invalidação — para resolver o que o framework já resolve. **Reavaliar quando** o cache de imagem do Next virar gargalo de I/O.

Validação: `image/jpeg|png|webp|avif`, ≤10 MB, dimensões mínimas. Órfãos (confirmados e nunca referenciados por >24h) são varridos por um job semanal.

---

## 14. API REST

### Versionamento: prefixo de caminho `/api/v1`

Escolhido sobre header (`Accept: application/vnd...`) porque é visível, testável com `curl`, cacheável por CDN e trivial de rotear no Nginx. Header é mais "puro" e mais difícil de debugar às 2h da manhã.

**Na v1 não haverá `/v2`.** O prefixo existe para que, quando houver uma API pública com clientes que não controlamos, exista um lugar óbvio para versionar. Custo hoje: uma string.

### Rotas

```text
/api/v1
├── /auth
│   ├── /admin/{login,refresh,logout}
│   └── /{register,login,refresh,logout,forgot-password,reset-password}
├── /store                       público: dados da loja + flags públicas
├── /products                    GET público | POST/PATCH/DELETE admin
│   └── /:id/variants
├── /categories
├── /cart  └── /items/:itemId
├── /checkout/{address,shipping,summary,confirm}
├── /orders  └── /:id/{events,fulfillment,status}
├── /customers  └── /me/addresses
├── /coupons/validate
├── /inventory/{movements,levels}
├── /uploads/{presign,confirm}
├── /cms/{pages,banners,menus}
├── /settings
└── /webhooks/stripe             sem auth; validação por assinatura
```

Mesmo recurso, permissão diferente por método e papel. `GET /products` público retorna só `ACTIVE`; como admin, retorna tudo. **Duas listagens paralelas (`/products` e `/admin/products`) divergem** — uma vira mais permissiva que a outra e ninguém percebe.

Os caminhos vêm de `@ecommerce/shared/constants` — o front nunca concatena string de URL.

### Resposta padronizada

```text
Sucesso simples    { "data": { ... } }
Paginado           { "data": [ ... ],
                     "meta": { "page":1, "perPage":24, "total":137, "totalPages":6 } }
Erro               { "error": { "code": "VALIDATION_ERROR",
                                "message": "Dados inválidos",
                                "details": [{ "field":"email", "message":"E-mail inválido" }] } }
```

O envelope `data` existe para que adicionar `meta` nunca seja breaking change. Sem envelope, `[...]` → `{data, meta}` quebra todo cliente. Custo: um `.data` no cliente, escondido por um helper de fetch.

### Paginação: offset (`?page=1&perPage=24`)

Cursor é superior em bases grandes e obrigatório para infinite scroll estável. Rejeitado na v1 porque **não dá para pular para a página 7**, e o admin precisa disso. Com dezenas de milhares de produtos, `OFFSET 500` é irrelevante para o Postgres.

`perPage` limitado a 100 no servidor — `?perPage=999999` é um DoS de uma linha.

### Filtros e ordenação

```text
GET /products?category=vasos&minPrice=5000&maxPrice=20000
             &tags=novidade&inStock=true&q=ceramica
             &sort=-createdAt&page=1&perPage=24
```

- Prefixo `-` = descendente.
- **Allowlist de campos ordenáveis** no Zod. `sort` livre permite ordenar por coluna sem índice e derrubar o banco.
- Todo filtro é declarado no Zod e traduzido explicitamente para Prisma. **Nunca** repassar query params direto para o `where` — é injeção de filtro.

### Validação

```text
validate({ body?, query?, params? })
  → parseia com Zod
  → sucesso: substitui req.body/query/params pelo valor PARSEADO
  → falha: 422 com details[]
```

Substituir pelo valor parseado é o detalhe que faz diferença: `?page=2` chega como `number`, e o handler recebe dados já tipados e coeridos, sem `Number()` espalhado.

### Tratamento de erros

Sem classes. Uma factory:

```text
shared/errors.ts
  appError(code, message, status, details?) → Error com props anexadas
  isAppError(err) → boolean

  notFound(resource)        → 404   unauthorized(msg?)  → 401
  forbidden(msg?)           → 403   conflict(msg)       → 409
  validationError(details)  → 422   businessError(code, msg) → 400
```

- **Um único `error-handler.ts`** traduz erro → HTTP. Nenhum controller monta `res.status(500)`.
- Handlers async passam por um wrapper (ou Express 5) — um `throw` em `async` sem isso derruba o processo.
- Erro inesperado → log com stack + `requestId` → 500 genérico. **Nunca vazar stack trace**: é um mapa do sistema para um atacante.
- Erro de negócio tem `code` estável (`INSUFFICIENT_STOCK`, `COUPON_EXPIRED`), definido em `shared/contracts`. O front reage ao `code`, nunca ao texto da `message` — texto é para humanos e muda.
- `integrations/` traduz erro externo → `appError`. Um `StripeCardError` nunca vaza para o controller.

---

## 15. Segurança

### JWT + Refresh Token com rotação e detecção de reúso

| Token | Formato | Vida | Onde |
|---|---|---|---|
| Access | JWT HS256 `{ sub, type, role, storeId }` | 15 min | Memória do cliente |
| Refresh | String opaca (32 bytes) | 30 dias | Cookie `HttpOnly` + hash no banco |

**Por que o refresh é opaco e não JWT.** Um JWT é válido até expirar — não há como revogá-lo. Um token opaco é uma linha no banco: revogar é um `UPDATE`. O access token é curto justamente porque não é revogável; o refresh é o ponto de controle.

**Rotação com detecção de reúso** — a parte que a maioria pula:

```text
POST /auth/refresh com T1
  → T1 revogado, T2 emitido, T1.replacedById = T2.id

Se T1 aparecer DE NOVO (já revogado):
  → alguém tem um token roubado
  → revoga TODA a cadeia daquele usuário
  → força novo login
  → registra no AuditLog
```

Sem isso, um refresh roubado dá acesso perpétuo e silencioso. Com isso, o roubo se autodenuncia na próxima renovação legítima. É a diferença entre "temos refresh token" e "temos refresh token seguro".

Senhas: **argon2id** (ou bcrypt cost 12). Nunca SHA — SHA é rápido, e rapidez é o que não se quer aqui.

### RBAC simples

```text
enum UserRole { OWNER ADMIN STAFF }
requireRole('OWNER')            → só o dono
requireRole('OWNER','ADMIN')    → gestão
```

Três papéis, hierarquia implícita (em `shared/constants`), verificação por rota. **Não** construir permissões granulares (`product.create`, `order.refund`) agora: duas tabelas, uma tela e uma checagem em toda rota, para uma loja com 1–3 pessoas que confiam umas nas outras. Nasce na Fase 4.

Regra de ouro: **verificação de posse é no service, não só na rota**. `GET /orders/:id` com `requireAuth` não basta — o service confirma `order.customerId === auth.sub`. Sem isso, trocar o id na URL lê o pedido do vizinho (IDOR — a vulnerabilidade nº 1 do OWASP).

### Helmet, CORS, Rate Limit

- **Helmet** com defaults + `hsts` + CSP na loja, permitindo os domínios do Stripe.
- **CORS**: allowlist explícita, `credentials: true`. Nunca `origin: '*'` com credentials.
- **Rate limit** com store no **Postgres**, não em memória: com `pm2 cluster`, memória por processo significa que o limite real é N× o configurado.

| Escopo | Limite |
|---|---|
| Global por IP | 300 / 15 min |
| `POST /auth/login` | 5 / 15 min por IP+email |
| `POST /auth/register` | 3 / hora por IP |
| `forgot-password` | 3 / hora por e-mail |
| `POST /checkout/confirm` | 10 / hora por cliente |
| `POST /checkout/shipping` | 30 / hora por IP (a API do Melhor Envio tem custo) |
| `/webhooks/stripe` | **sem limite** (nunca bloqueie o Stripe) |

Nginx com `limit_req` como primeira barreira — bloquear ali custa 1000× menos que no Node.

### Auditoria — **desde o primeiro CRUD**

`shared/audit.ts` expõe `audit({ action, entityType, entityId, changes })`, chamado no **service** (não em middleware — middleware não sabe *o que* mudou). `action` usa o vocabulário de eventos (§12).

**Nasce junto com o CRUD de produtos, não no endurecimento.** É barato de implementar e caro de reconstituir: auditoria adicionada depois não tem retroatividade — os seis meses em que ela não existiu são um buraco permanente no histórico. É por isso que a versão anterior deste roadmap estava errada ao deixá-la para o item 18.

Não auditar: leitura (volume enorme, valor baixo) e ação de cliente (o pedido já é o registro).

### Logs

`pino` em JSON. `requestId` (UUID por request) propagado para logs, workers e resposta de erro — o cliente reporta "erro X" e o `requestId` acha a linha exata.

**Nunca logar**: senha, token, cartão, CPF completo, `Authorization`. Um redator de campos no pino, configurado no dia um — log vaza para lugares onde ninguém esperava.

Rotação por `logrotate`. Erro 5xx → Sentry (grátis nesse volume) — sem isso, você descobre os bugs pelo cliente.

### Checklist de infraestrutura

- UFW: só 22, 80, 443. Postgres e RabbitMQ em `127.0.0.1`.
- SSH: só chave, sem senha, sem root, `fail2ban`.
- Let's Encrypt via `certbot --nginx`, renovação automática testada.
- `.env` fora do git, `chmod 600`.
- Secrets fortes e distintos: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `STRIPE_WEBHOOK_SECRET`.
- `unattended-upgrades` para patches de segurança.
- Postgres: usuário da aplicação **sem** `SUPERUSER`.
- Node roda como usuário não-privilegiado, nunca root.

---

## 16. Performance

### Busca — comece simples, migre por gatilho

**v1: `unaccent` + `ILIKE`, dentro de `products/repository.ts`.**

```sql
CREATE EXTENSION IF NOT EXISTS unaccent;

SELECT ... FROM "Product"
 WHERE "storeId" = $1 AND status = 'ACTIVE'
   AND (unaccent(name)  ILIKE unaccent($2)
     OR unaccent(brand) ILIKE unaccent($2)
     OR EXISTS (SELECT 1 FROM unnest(tags) t
                 WHERE unaccent(t) ILIKE unaccent($2)))
```

Criar `tsvector` + GIN para um catálogo de 50 produtos é otimização prematura: com `Seq Scan` sobre 50 linhas o Postgres responde em menos de 1ms, e o índice GIN só custa escrita.

**Mas atenção ao `ILIKE` puro — no Brasil ele está errado, não apenas lento.** `name ILIKE '%ceramica%'` **não encontra "Vaso de Cerâmica"**, e ninguém digita acento na busca. Isso não é performance, é resultado errado no dia um. Por isso `unaccent` entra desde já: uma extensão e uma função.

O que se abre mão conscientemente na v1: stemming ("vasos" não acha "vaso") e ranking por relevância (a ordenação é por data ou preço, não por pertinência).

**Gatilho para migrar para FTS:** ~500 produtos, **ou** a busca passar de 200ms, **ou** faltar ranking por relevância — o que vier primeiro.

**Fase 2+ — a versão completa:**

```sql
ALTER TABLE "Product" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', coalesce(name,'')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce("shortDescription",'')), 'B') ||
    setweight(to_tsvector('portuguese', coalesce(array_to_string(tags,' '),'')), 'C') ||
    setweight(to_tsvector('portuguese', coalesce(description,'')), 'D')
  ) STORED;

CREATE INDEX product_search_idx ON "Product" USING GIN ("searchVector");
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

- **`GENERATED ... STORED`** — o Postgres mantém a coluna sozinho. Sem trigger, sem hook do Prisma, sem risco de dessincronizar.
- **`setweight`** — casar no nome vale mais que na descrição. `ts_rank` ordena por relevância real.
- **`'portuguese'`** — stemming: "vasos" acha "vaso".
- **`pg_trgm`** — typo ("ceramca") e autocomplete.

A migração é **uma migration + uma função** (`searchProducts()` no repository). Nada mais no sistema muda — é exatamente por isso que a busca mora atrás do repository, e é o que torna seguro começar simples.

**Por que nunca Elasticsearch/Meilisearch.** Cada um é mais um serviço para instalar, monitorar, indexar e manter sincronizado — em uma VPS, sozinho. O FTS do Postgres atende dezenas de milhares de produtos em milissegundos com **zero infraestrutura nova**, porque o Postgres já está lá, já tem backup e já é monitorado. **Reavaliar** só com facetas dinâmicas complexas ou > 100k itens.

### Paginação
`perPage` com teto no servidor e `select` explícito. Uma listagem que traz `description` de 24 produtos transfere 1 MB para renderizar cards com nome e preço.

### Lazy loading
- `next/image` com lazy por padrão e `priority` **só** na imagem principal (LCP).
- `next/dynamic` para o que é pesado e não crítico: editor rico do admin, galeria com zoom.
- Server Components por padrão: o JS de um componente que só renderiza HTML **não vai para o browser**. Maior ganho disponível, e é de graça.

### Cache — em camadas

| Camada | O quê | TTL |
|---|---|---|
| Nginx | `/_next/static/*`, imagens | 1 ano (imutável) |
| Next ISR | Home, categoria, produto, CMS | 60s |
| TanStack Query | Estado de servidor no cliente | `staleTime` 30s |
| Postgres/memória | Cotação de frete `(CEP, peso, valor)` | 30 min |
| Memória do processo | `Store`, `Setting`, flags, `Menu` | Vida do processo, invalidado na escrita |

**Nenhum Redis na v1.** Redis resolve cache compartilhado entre instâncias — e há uma instância. Um Map em memória atende, e o que precisa ser compartilhado (rate limit) cabe no Postgres. **Adotar quando** houver uma segunda VPS ou o rate limit no Postgres virar gargalo mensurável. Nesse dia, `getSetting()` muda por dentro e nada mais muda.

### Compressão
`gzip`/`brotli` **no Nginx**, não no Express. É C contra JS, e não ocupa o event loop.

### Postgres e PM2
- `shared_buffers = 25%` da RAM, `effective_cache_size = 50%`.
- `pg_stat_statements` desde o dia um — é como se descobre a query lenta antes do cliente.
- `connection_limit` do Prisma coerente com `max_connections`: `pm2 cluster` de 4 × pool 10 = 40 conexões.
- PM2: `api` em `cluster` (N = núcleos), `workers` em `fork` com **uma** instância (N workers no mesmo prefetch multiplicam a concorrência sem querer), `store`/`admin` em `cluster`.
- `pm2 reload` (não `restart`) para deploy sem downtime.
- `pm2 save` + `pm2 startup` — senão um reboot derruba a loja até alguém perceber.

---

## 17. Tema e design tokens

### Decisão: tokens semânticos via shadcn/ui + Tailwind. **Nenhuma estrutura nova.**

O objetivo — evitar dezenas de valores fixos espalhados — está absolutamente certo. Mas a solução já vem pronta: **o shadcn/ui já entrega exatamente essa camada**, e criar uma estrutura `Theme → Colors → Typography → Spacing → Components` por cima seria reimplementar o que já existe.

Ao instalar o shadcn/ui, você recebe:

```text
globals.css        --primary, --secondary, --background, --foreground,
                   --muted, --border, --destructive, --radius   (light + dark)
tailwind.config    mapeia os tokens: bg-primary, text-muted-foreground
components/ui/     componentes que já consomem os tokens
```

O trabalho real é de **disciplina**, não de arquitetura:

| Regra | Certo | Errado |
|---|---|---|
| Cor sempre por token semântico | `bg-primary` | `bg-[#3a5f2b]`, `bg-green-700` |
| Token nomeado por **função**, não por aparência | `--primary`, `--destructive` | `--verde-musgo` |
| Espaçamento pela escala do Tailwind | `p-4`, `gap-6` | `p-[17px]` |
| Tipografia por escala | `text-lg` | `text-[19px]` |
| Raio pelo token | `rounded-lg` | `rounded-[10px]` |

> Um token chamado `--verde-musgo` é um valor fixo com passo extra: no dia em que a marca virar azul, você troca o valor e o nome mente para sempre. `--primary` sobrevive à mudança.

O único artefato novo é `packages/shared/constants/theme.ts` **se** store e admin precisarem dos mesmos valores em JS (ex.: cor de um gráfico, e-mail HTML). Enquanto for só CSS, não existe.

Sugestão de higiene: uma regra de ESLint que proíbe `[#...]` em `className`. Barato, e é o que impede o valor fixo de voltar.

### A evolução (Fase 4)

Loja lê `Store.themeJson` e injeta as variáveis em runtime:

```text
<style>:root { --primary: {theme.primary}; --radius: {theme.radius}; }</style>
```

~10 linhas, porque **todo o CSS já lê dessas variáveis**. É o retorno de ter usado tokens desde o dia um — e a razão de isso valer a pena mesmo com um tema só.

Templates arbitrários (Liquid) são um produto inteiro, não uma feature. Tokens cobrem 90% do que um lojista quer (cores, fonte, logo, raio) com 1% do esforço.

---

## 18. Feature flags

### Decisão: chave `feature_flags` em `Setting`. Sem tabela nova, sem serviço externo.

```text
Setting(key: 'feature_flags', valueJson: {
  reviews:   false,
  wishlist:  false,
  giftCards: false
})

shared/flags.ts → isEnabled('reviews'): boolean   (cache em memória)
GET /api/v1/store → devolve as flags PÚBLICAS para a loja e o admin
```

### Por que vale a pena, mesmo solo

O valor não é o que normalmente se atribui a flags (desacoplar deploy de release, útil em time grande). Para um dev solo, o valor real é o **kill switch**: se as avaliações começarem a receber spam às 2h da manhã, um toggle resolve em 5 segundos. Sem flag, é reverter e fazer deploy — sob pressão, de madrugada, no pior momento possível.

O segundo valor é o soft launch: ligar avaliações para observar antes de anunciar.

Custo total: uma chave em `Setting`, um helper, um campo na resposta de `/store`. ~20 linhas.

### A regra de higiene — sem ela, isso vira dívida

**Flags apodrecem.** Uma flag ligada há dois anos é código morto com um `if` em volta, e ninguém se lembra do que acontece se desligar. É como sistemas viram um labirinto de condicionais.

Portanto:

1. **Toda flag nasce com gatilho de remoção documentado** ("remover após 2 semanas de reviews em produção").
2. **Teto de 5 flags simultâneas.** Chegou em 5? Remova uma antes de criar a sexta.
3. **Flag não é configuração.** "Frete grátis acima de R$ 200" é `Setting`, é permanente e o lojista mexe. Flag é temporária e só o dev mexe. Confundir os dois é como o teto estoura.
4. **Flag liga/desliga o que já está pronto.** Não é para código pela metade — para isso serve o branch.

### O que **não** é flag

`Favorite` (Fase 3) não precisa de flag: a tabela existe, a UI não. Não há o que ligar. Flag serve quando o código **existe e roda**, e você quer decidir se o usuário vê.

---

## 19. Loja — páginas e navegação

```text
/                              Home — banners, destaques, categorias, novidades
/busca?q=                      Resultado com filtros
/categorias/[...slug]          Grid + filtros + ordenação
/produtos/[slug]               Produto
/carrinho                      Carrinho
/checkout                      Passo único com seções
/checkout/pedido/[id]          Confirmação — Pix/boleto exibidos aqui, com polling
/conta                         Painel do cliente
  /conta/pedidos  /conta/pedidos/[id]  /conta/enderecos  /conta/dados
  /conta/favoritos             Fase 3, atrás de flag
/entrar  /cadastrar  /recuperar-senha
/paginas/[slug]                CMS
```

### Navegação

- **Header** (fixo): logo, menu **vindo do CMS** (`Menu` handle `header`; mega menu no desktop, drawer no mobile), busca com autocomplete, conta, carrinho com badge.
- **Footer**: menus institucionais do CMS, atendimento, redes, formas de pagamento, selos.
- **Breadcrumb** em categoria e produto — UX e JSON-LD no mesmo componente.

> O menu vem do banco, não de um array no código. É a razão de `Menu` existir: sem ele, mudar um item do header vira deploy.

### Páginas que merecem nota

**Produto** — Server Component com ISR. Galeria, seletor de variação (troca preço, SKU, imagem e disponibilidade **sem reload**), calculadora de frete por CEP (a mesma rota do checkout — reduz o abandono por surpresa no frete), estoque baixo ("últimas 2"), relacionados. `generateMetadata` com SEO e OG. JSON-LD `Product` + `Offer`.

**Checkout** — **página única com seções que se revelam**, não wizard de 4 telas: cada navegação é um ponto de abandono. Cliente logado com endereço padrão vê frete e pagamento já prontos. Resumo sticky. Sem header de navegação — nada deve tirar o cliente daqui.

**Confirmação** — Pix: QR + copia-e-cola + contador + polling. Boleto: PDF + linha digitável + prazo. **Esta página é parte do funil de pagamento, não um agradecimento** — é onde o Pix efetivamente acontece.

**Estados obrigatórios em toda página**: loading (skeleton), erro (com retry), vazio (com ação). O vazio do carrinho é oportunidade de venda, não tela morta.

---

## 20. Admin — telas

```text
/                     Dashboard
/produtos             Lista (busca, filtros, ações em lote)
  /produtos/[id]      Abas: Info | Mídia | Preço | Estoque | Envio | Variações | SEO
/categorias           Árvore com drag & drop
/pedidos              Lista (filtro por pagamento/fulfillment, período, busca)
  /pedidos/[id]       Detalhe + timeline + ações
/clientes  └── /[id]  Perfil, endereços, histórico, LTV
/estoque              Níveis, alerta de baixo, ajuste
  /estoque/[variantId] Extrato do ledger
/cupons               Fase 2
/cms/{paginas,banners,menus}   Fase 2
/configuracoes        Loja, frete, pagamento, e-mails, usuários, flags
/uploads              Biblioteca de mídia
/sistema/dlq          Fase 2 — mensagens mortas e reprocessamento
```

### Telas que merecem nota

**Dashboard** (Fase 2) — não é enfeite: vendas hoje/semana/mês vs. período anterior, ticket médio, **pedidos aguardando separação** (a fila de trabalho real), estoque baixo (query `available < minStock`, não evento), últimos pedidos, top produtos. Se as agregações ficarem lentas, uma tabela `DailyMetric` por job resolve — **quando** ficarem.

**Pedido (detalhe)** — a tela mais importante, onde a operação vive. Cliente, itens com foto e SKU, totais, pagamento (método, status, id do Stripe, link para o dashboard, botão de reembolso), envio (endereço, serviço, etiqueta, rastreio), **timeline** (`OrderEvent`), notas interna e do cliente, e as ações: separar, comprar etiqueta, marcar enviado, cancelar, reembolsar.

**Produto (edição)** — abas para não virar formulário de 60 campos. A aba de variações é a mais complexa da aplicação: declarar opções, gerar o cartesiano, desmarcar, editar preço/SKU/estoque em grade. **Vale investir tempo** — é onde o lojista passa a maior parte das horas.

**Estoque (extrato)** — o ledger renderizado. A tela que responde "por que o estoque está errado" — e é a razão inteira de existir o ledger.

**Configurações** — abas: Loja, Frete (serviços, frete grátis, prazo adicional), Pagamento (métodos, parcelas, TTL de reserva), E-mails, Usuários, **Flags**.

### Padrões do admin

- **Todas as listas iguais**: busca, filtros, ordenação, paginação, ações em lote. Um `<DataTable>` genérico.
- **TanStack Query** com `staleTime` baixo — o admin precisa de dado fresco.
- **Optimistic updates** só em toggle simples. Nunca em preço ou estoque: fingir sucesso e falhar em algo que envolve dinheiro é pior que um spinner de 300ms.
- **Confirmação** para tudo destrutivo, com o nome digitado quando for irreversível.
- **Toast** em toda mutação.

---

## 21. Roadmap

### Fase 0 — Fundação (semana 1)

1. Monorepo pnpm, três apps, `packages/shared` com `/contracts` e `/constants`.
2. VPS: Ubuntu, Node LTS, Postgres, RabbitMQ, Nginx, PM2, UFW, certbot.
3. `config/env.ts` com Zod, `logger`, `prisma`, `error-handler`, `validate`, envelope, `shared/audit.ts`, `shared/flags.ts`.
4. `integrations/storage` com `local.ts` e `r2.ts`.
5. Prisma inicial: `Store`, `User`, `RefreshToken`, `AuditLog`, `Setting`. Seed da loja única.
6. `getActiveStoreId()`.
7. shadcn/ui instalado nos dois fronts, tokens semânticos definidos.
8. Deploy manual ponta a ponta com um `/health`.

> **Por que primeiro:** deploy quebrado na semana 8, com features prontas, é a pior hora possível para descobrir problema de infraestrutura. Deploy ruim de "hello world" é um problema de 30 minutos.

### Fase 1 — Loja vendendo (semanas 2–10)

**O objetivo é vender. Nada que não leve a uma venda entra na Fase 1.**

| # | Entrega | Depende de |
|---|---|---|
| 1 | Auth staff + shell do admin | Fase 0 |
| 2 | Uploads (presign + confirm) | Fase 0 |
| 3 | Categorias (CRUD + árvore) **com auditoria** | 1 |
| 4 | Produtos + variantes + imagens + SEO **com auditoria** | 2, 3 |
| 5 | Inventory (ledger + níveis + reservas + extrato) | 4 |
| 6 | Loja: home, categoria, produto, busca (`unaccent`+ILIKE) | 4 |
| 7 | Auth cliente + conta | 1 |
| 8 | Carrinho (anônimo + logado + merge) | 4, 5 |
| 9 | Endereços + ViaCEP | 7 |
| 10 | Shipping: cotação (`integrations/melhor-envio` + `domain/packing`) | 8, 9 |
| 11 | Checkout: recálculo (`domain/totals`) + pedido + reservas | 8, 9, 10 |
| 12 | Payments: PI + Payment Element (cartão/Pix/boleto) | 11 |
| 13 | **Webhooks + idempotência + reconciliação** | 12 |
| 14 | RabbitMQ: 4 filas + workers + e-mails | 13 |
| 15 | Admin: pedidos, separação, expedição | 13 |
| 16 | Shipping: etiqueta + rastreio (worker + cron) | 14, 15 |
| 17 | Conta: pedidos e rastreio | 15 |
| 18 | Endurecimento: rate limit, helmet, backup, Sentry | todos |

> **Auditoria não está no item 18** — ela entra no item 3, junto com o primeiro CRUD. Auditoria adicionada depois não é retroativa: os meses sem ela são um buraco permanente.

**Marco de "pode vender": item 15.** Os itens 16–18 são melhoria de operação — uma etiqueta comprada à mão no site do Melhor Envio funciona nas primeiras semanas.

**Favoritos:** só a tabela (item 4). Zero código.

### Fase 2 — Operação e conversão (semanas 11–16)

Só depois de vendas reais, porque agora existe dado para saber o que importa.

- **Cupons** — a primeira alavanca de venda de verdade (Black Friday, primeira compra, recuperação).
- **CMS: `Page` + `Banner` + `Menu`** — as páginas legais migram dos componentes estáticos para `Page`; o header passa a ler `Menu`. **Sem blog.**
- **Dashboard** — vendas, ticket médio, top produtos, estoque baixo, pedidos a separar.
- **Relatórios** — vendas por período/produto/categoria, margem (`costPrice` já existe), export CSV.
- **SEO** — sitemap dinâmico, robots, JSON-LD (`Product`, `Offer`, `BreadcrumbList`), OG, canonical.
- **Busca → FTS** — `tsvector` + GIN + `ts_rank`, **se** o gatilho de §16 tiver sido atingido.
- **Admin: DLQ** — visualizar e reprocessar.
- **Carrinho abandonado** — e-mail em D+1 (a fila `email.send` já existe; é um cron + um template).

### Fase 3 — Crescimento (semanas 17–24)

Depende de tráfego existente. Antes disso, é otimizar o que ninguém vê.

- **Favoritos** — a tabela existe desde a Fase 1; é UI + 3 endpoints. Atrás de flag no soft launch.
- **Avaliações** — `Review` com moderação e `verifiedPurchase` (via `OrderItem`). **Só faz sentido com volume**: 4 avaliações não vendem nada, e sem moderação vira spam. Atrás de flag — é o caso de uso que justifica o kill switch.
- **Blog** — reuso do `Page` com `type: POST`, ou `Post` próprio. Motor de SEO orgânico de longo prazo. **Aqui, não antes.**
- **Analytics** — GA4 + Meta Pixel via consent mode. **Server-side tagging** para `purchase` (o browser bloqueia; o webhook não mente) — entra como consumidor de `order.paid`, sem tocar no webhook.
- **Melhorias** — filtros facetados, autocomplete, relacionados.

### Fase 4 — SaaS (quando houver decisão de negócio)

**Gatilho: um segundo cliente pagante querendo usar a plataforma.** Não antes. Construir SaaS sem cliente de SaaS é construir para um usuário imaginário — e o imaginário nunca reclama, então tudo parece certo até o primeiro real chegar.

1. **Multi-tenant de verdade** — middleware resolve pelo `Host`; `getActiveStoreId()` lê de `AsyncLocalStorage`. **As queries já filtram, os índices já são compostos.** Dias, não meses. *(Único item cuja economia foi comprada na Fase 0.)*
2. **RLS no Postgres** — rede contra o `where` esquecido.
3. **Onboarding** — cadastro de loja, subdomínio, wizard.
4. **Planos e billing** — Stripe Billing, limites por plano, trial. `Plan`, `Subscription`, `Usage`.
5. **Domínio personalizado** — Nginx dinâmico + certbot por domínio (ou Caddy com `on_demand_tls`, que resolve isso nativamente).
6. **Temas** — `Store.themeJson` sobrescreve as variáveis CSS. **~10 linhas, porque os tokens existem desde a Fase 0.**
7. **API pública** — `/api/public/v1`, API keys, escopos, rate limit por plano, OpenAPI. `/api/v1` continua interna.
8. **Webhooks para lojistas** — a inversão: agora **nós** entregamos, com retry e assinatura. Reuso direto da topologia.
9. **Marketplace de extensões** — o mais caro e o último: sandbox, revisão, billing de terceiros, versionamento. Só com dezenas de lojas ativas e demanda real.

---

## 22. Verificação

Como confirmar que cada parte funciona de ponta a ponta. Sem isso, o documento é teoria.

### Fase 0
- `curl https://api.artenojardim.com/api/v1/health` → 200 com versão e uptime.
- `pm2 list` → todos `online`. `pm2 reload api` sem 502 durante o reload.
- Remover uma var do `.env` → a API **recusa subir** com mensagem clara.
- `pg_dump` gera arquivo; **restaurar em um banco de teste** e conferir contagens.
- `STORAGE_DRIVER=local pnpm dev` sobe **sem nenhuma credencial de nuvem** (prova que a interface se paga em dev).
- Teste de drift dos enums: alterar `UserRole` só no Prisma → **CI quebra**.

### Catálogo, busca e estoque
- Produto com 2 opções (3×2) → 6 linhas em `ProductVariant` e 6 em `InventoryLevel`.
- Estoque inicial → `InventoryMovement` do tipo `PURCHASE`; **nenhum `UPDATE` direto** tocou `onHand`.
- `SELECT variantId, SUM(quantity) FROM "InventoryMovement" GROUP BY variantId` **bate exatamente** com `InventoryLevel.onHand`. Este teste valida o desenho inteiro do estoque.
- Buscar **"ceramica"** (sem acento) → **acha "Vaso de Cerâmica"**. É o teste que justifica o `unaccent`; sem ele, a busca da v1 estaria quebrada.
- Editar um produto → `AuditLog` com `action='product.updated'`, `userId`, e o diff em `changesJson`.

### Concorrência de estoque
- Variante com `onHand = 1`. Dois `POST /checkout/confirm` simultâneos (`xargs -P2` ou k6).
- Esperado: **um** 201, **um** 409 `INSUFFICIENT_STOCK`. `reserved = 1`, nunca 2.
- **O teste mais importante do sistema.** Se falhar, vende-se o que não existe.

### Domain (unitário, sem banco)
- `calculateTotals` — cupom percentual com teto, frete grátis acima do mínimo, desconto maior que o subtotal (não pode dar total negativo), arredondamento em centavos.
- `packing` — item único, muitos itens, item que excede a caixa máxima.
- `ledger` — saldo a partir de movimentos, saldo retroativo, movimentos que se anulam.
- Rodam em milissegundos e sem infraestrutura. **É o retorno concreto da camada `domain/`.**

### Checkout e pagamento (Stripe test mode)
- **Cartão** `4242…` → `succeeded` → webhook → `PAID` → `SALE` no ledger → reserva liberada → e-mail na fila.
- **Cartão** `4000000000000002` (recusa) → `FAILED` → **reserva liberada** → estoque disponível de novo.
- **3DS** `4000002500003155` → desafio → aprova → `PAID`.
- **Pix** → `processing` → QR na tela → `stripe trigger payment_intent.succeeded` → `PAID`.
- **Boleto** → `processing` → linha digitável → e-mail com o PDF.
- **Expiração** → `payment_intent.canceled` → cancelado, reserva liberada.
- **Idempotência** → `stripe events resend <id>` 5× → **um** `StripeEvent`, **um** `SALE`, **um** e-mail.
- **Assinatura** → `curl` com corpo forjado → **400**, e nada muda no banco.
- **Recálculo** → adulterar o preço no payload do `confirm` → o pedido é criado com o **preço do banco**.
- **Reconciliação** → desligar o listener, pagar, religar o job → em ≤15 min o pedido vira `PAID` sozinho.
- **Latência do webhook** → medir o handler: deve responder em **< 500ms** (prova que os efeitos foram para a fila).

### RabbitMQ
- `topology.ts` cria **4 filas** + retries + DLQs. Nenhuma fila órfã no painel do RabbitMQ.
- Derrubar o worker, gerar 10 eventos, subir o worker → os 10 são processados (durabilidade).
- Handler que sempre lança → `retry.5s` → `retry.30s` → `retry.5m` → **DLQ**. Confirmar que **não** houve loop imediato.
- Mesma mensagem 3× → processada 1×, `ProcessedEvent` com 1 linha.
- Cadastrar um produto → **nenhuma mensagem publicada** (prova que o corte foi feito).

### Frete
- Cotar com CEP real → opções com preço e prazo.
- Item sem peso → o admin **bloqueia a publicação**.
- Melhor Envio fora do ar (mock 500) → checkout mostra erro claro e **não** cria pedido; o erro externo virou `appError` (não vazou `FetchError`).
- `order.paid` → etiqueta por worker → `labelUrl` e `trackingCode` no `Shipment`.
- `sync-tracking` → status muda → `DELIVERED` → e-mail.

### Storage
- Presign + PUT direto → o arquivo **não aparece** no processo da API (sem pico de memória).
- `Upload` guarda `key`, não URL. Trocar `CDN_URL` no env → **todas** as imagens seguem o novo domínio sem UPDATE no banco.
- `delete` remove do R2 e do banco.

### Segurança
- `GET /orders/:id` com o id de outro cliente → **403**, não 200. Repetir para addresses, carts, customers. (IDOR.)
- Reusar um refresh token já rotacionado → **toda a cadeia é revogada** e o `AuditLog` registra.
- 6 logins errados → **429**.
- Access token expirado → 401 → o cliente renova sozinho → o request repete transparente.
- `STAFF` tentando reembolsar → **403**.
- Erro 500 forçado → resposta genérica com `requestId`, **sem stack trace**.
- Ler o log de um login → **nenhuma senha ou token**.

### Flags e tema
- `feature_flags.reviews = false` → a UI some da loja **sem deploy**.
- `grep -r "\[#" apps/*/src` → **zero** resultados em `className` (prova que os tokens estão sendo usados).
- Trocar `--primary` em `globals.css` → a loja inteira muda de cor. **É o ensaio da Fase 4.**

### Performance
- Lighthouse na home e no produto → **LCP < 2.5s**, CLS < 0.1.
- `pg_stat_statements` após navegação completa → nenhuma query > 100ms.
- Listagem de 24 produtos → payload < 100 KB (prova o `select` explícito).
- k6: 50 usuários por 1 min → p95 < 500ms, 0 erros.

---

## Apêndice — decisões e seus gatilhos de revisão

Toda decisão de "não agora" tem um gatilho explícito. É o que separa simplicidade de dívida técnica: dívida é adiar sem saber quando pagar.

| Decisão | Escolha v1 | Revisar quando |
|---|---|---|
| Repositório | Monorepo pnpm | Nunca |
| Pacotes compartilhados | **Um** (`shared` com 2 subcaminhos) | Um terceiro consumidor com necessidades divergentes |
| Build orchestrator | Nenhum (scripts npm) | Build completo > 2 min |
| **Filas** | **4** (email, order.paid, label, tracking) | Novo consumidor real — nunca "por via das dúvidas" |
| **Busca** | **`unaccent` + `ILIKE`** | ~500 produtos, > 200ms, ou faltar ranking → FTS |
| Motor de busca | Postgres | Facetas complexas ou > 100k produtos |
| Cache distribuído | Nenhum (memória + Postgres) | 2ª VPS ou rate limit vira gargalo |
| Paginação | Offset | > 100k linhas ou scroll infinito |
| **Storage prod** | **R2 desde o dia um** | Nunca (egress grátis vence) |
| Storage dev | Disco local | Nunca |
| Derivadas de imagem | `next/image` sob demanda | Cache de imagem satura o I/O |
| Publicação de eventos | Após commit + reconciliação | Perda de evento não-financeiro doer |
| Handler de webhook | Síncrono; só efeitos em fila | Transação passar de ~200ms |
| **`domain/`** | 5 arquivos onde já se justifica | `service.ts` > 300 linhas, ou reuso, ou teste sem banco |
| **CMS** | Page + Banner + Menu | Blog → Fase 3 |
| Multi-tenant | `storeId` sem lógica | 2º cliente pagante |
| Permissões | 3 papéis fixos | Uma loja com > 10 funcionários |
| **Tema** | Tokens do shadcn/ui | Fase 4: `themeJson` sobrescreve (~10 linhas) |
| **Feature flags** | Chave em `Setting`, teto de 5 | Passar de 5 → remova antes de criar |
| Árvore de categorias | Adjacency list | > 10k categorias ou > 6 níveis |
| Métricas do dashboard | Query agregada ao vivo | Dashboard > 2s |
