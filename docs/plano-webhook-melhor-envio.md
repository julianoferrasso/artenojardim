# Plano: webhook do Melhor Envio

> Escrito em 27/11/2026. Complementa a **Fase 1.16 (etiqueta + rastreio)** de
> [arquitetura.md](arquitetura.md) §11 ("Etiqueta e rastreio") e §21 (item 16).
> Fonte principal: <https://docs.melhorenvio.com.br/docs/webhooks> (atualizada em 02/06/2026).

## 1. Conclusão primeiro

**Não salve o webhook no painel agora** (o modal "Novo webhook" do app Arte no Jardim).
Há dois motivos:

1. **Hoje ele não receberia nada.** A documentação diz que o webhook é do *aplicativo*. As etiquetas
   *"precisam ser geradas usando o mesmo aplicativo onde o webhook está configurado. Etiquetas criadas
   pelo site ou por outro aplicativo, mesmo que na mesma conta, não serão atendidas"*. Hoje a etiqueta
   é comprada à mão no site do Melhor Envio, e o site não dispara o webhook do app.
2. **O cadastro falharia.** Ao salvar, o Melhor Envio faz uma requisição de teste na URL e recusa o
   cadastro se ela não responder com sucesso (erro `E-WBH-0002 … status inválido 403/405`, relatado no
   fórum oficial). A rota ainda não existe e responderia 404.

O webhook só tem valor **junto com a Fase 1.16**, quando a API passar a comprar a etiqueta. Ele entra
nessa fase como o jeito rápido de saber do status, ao lado de um polling de reserva. A ordem
proposta está no §6.

## 2. O que a documentação garante (e o que não garante)

| Tema | Confirmado | Fonte |
|---|---|---|
| Cadastro | Só pelo painel: Integrações → Área Dev → app → Novo Webhook. Informa a URL e um único evento ("Atualização das etiquetas"). Não há endpoint de API documentado. | [WH] |
| Teste no cadastro | Existe, e status 403/405 reprovam. **O método e o corpo não estão documentados.** | [fórum](https://docs.melhorenvio.com.br/discuss/680c275b7b1e110045455dda) |
| Eventos | `order.created`, `pending`, `released` (paga), `generated` (gerada), `received` (Pegaki), `posted`, `delivered`, `cancelled`, `undelivered`, `paused` (precisa de ação do destinatário), `suspended` | [WH] |
| Requisição | `POST` em JSON, `user-agent: Melhor Envio Webhooks/1.0`. Corpo: `{ event, data: { id, protocol, status, tracking, self_tracking, user_id, tags[{tag,url}], created_at, paid_at, generated_at, posted_at, delivered_at, canceled_at, expired_at, tracking_url } }`. As datas vêm em ISO com fuso. | [WH] |
| Assinatura | Cabeçalho `X-ME-Signature` com HMAC-SHA256 do **corpo**, usando o **secret do aplicativo** (o nosso Client Secret de /frete). | [WH] |
| Codificação | **base64** do digest. É inferência forte: o exemplo decodifica em 32 bytes, e três implementações de terceiros usam base64. | inferência |
| Entrega | Sem resposta de sucesso em **6 s**, o Melhor Envio tenta de novo a cada **15 min**, até **5 tentativas**. Depois disso **descarta** o evento. | [WH] |
| Ordem e duplicidade | **Nada garantido**: nenhuma palavra sobre ordem, duplicata, IPs ou replay. | — |
| Sandbox | É um app separado, com webhook próprio. O status muda sozinho a cada 15 min. `order.generated` pode não chegar lá. | [WH], [fórum](https://docs.melhorenvio.com.br/discuss/68910c730e5c18630850998d) |
| Rastreio por consulta | `POST /api/v2/me/shipment/tracking` com `{orders:[uuid…]}`. Limite de 250 req/min por usuário. As datas vêm **sem fuso**. | [ref](https://docs.melhorenvio.com.br/reference/rastreio-de-envios) |

[WH]: https://docs.melhorenvio.com.br/docs/webhooks

O que se tira disso para o desenho:

- **O webhook perde eventos.** Depois de 5 tentativas (cerca de 1h15) ele desiste. A loja já ficou 9 dias fora
  do ar em ago/2026, e um apagão desses engole todos os eventos do período. Por isso o **polling
  de reserva é obrigatório**, e o webhook só acelera.
- **Pode chegar duplicado e fora de ordem.** A aplicação tem que ser idempotente e
  **monotônica**: um `posted` que chega depois de `delivered` é ignorado.
- **Trocar o Client Secret no painel muda a assinatura na hora.** Os webhooks passam a ser
  recusados até o /frete ser atualizado. O polling cobre esse buraco.

## 3. Desenho

### 3.1 Dados: nasce o `Shipment`

O `Shipment` já está previsto na arquitetura (§11: "cria `Shipment`"). Campos mínimos:

```prisma
model Shipment {
  id              String   @id @default(cuid())
  storeId         String
  orderId         String   @unique
  provider        String   // 'melhor_envio'
  providerOrderId String   // UUID devolvido por POST /me/cart — a chave do webhook (data.id)
  protocol        String?  // ORD-…, o que aparece no painel do ME
  status          ShipmentStatus
  trackingCode    String?
  trackingUrl     String?
  labelUrl        String?
  paidAt, generatedAt, postedAt, deliveredAt, canceledAt  DateTime?
  lastEventAt     DateTime?
  @@unique([provider, providerOrderId])
  @@index([storeId, status])
}
// CREATED, RELEASED, GENERATED, POSTED, DELIVERED, CANCELED, PROBLEM
// (enum também em constants/ — teste de drift)
```

- **A chave é `data.id`**, o UUID que o `POST /api/v2/me/cart` devolve ("salve este id"). Ele é gravado
  quando a etiqueta é comprada.
- Ao inserir no carrinho, mande também `options.tags: [{ tag: <nº do pedido>, url: <link do pedido no
  admin> }]`. Assim a equipe acha o pedido pelo painel do Melhor Envio, e a tag serve de plano B para casar o evento.
  A pesquisa da API **não busca por tag**, então ela não pode ser a chave.

### 3.2 Uma função só aplica o status

Segue o mesmo padrão do pagamento (regra 6: `applyMercadoPagoOrder`):
`applyMelhorEnvioShipment(snapshot)` em `modules/shipping/service.ts`. Webhook e polling chamam
**a mesma função**, e nenhum outro caminho muda o status da remessa. Ela:

1. Acha o `Shipment` por `(provider, providerOrderId)`. Se não achar (etiqueta feita no site, ou de
   outra loja da conta), registra em log e encerra **com sucesso**, porque não há o que reentregar.
2. Compara o **posto** do status novo com o atual
   (`CREATED < RELEASED < GENERATED < POSTED < DELIVERED`). Regressão é ignorada. `CANCELED` e
   `PROBLEM` são laterais e sempre registram.
3. Numa transação: atualiza o `Shipment`, grava um `OrderEvent` na timeline e, quando for o caso,
   muda o `Order.fulfillmentStatus`.
4. Publica o aviso ao cliente pela fila de e-mail que já existe. Nada de e-mail síncrono dentro do webhook.

| Evento | Remessa | Pedido (`fulfillmentStatus`) | Aviso |
|---|---|---|---|
| `created`, `pending`, `released` | CREATED / RELEASED | — | — |
| `generated` | GENERATED + `labelUrl` | READY_TO_SHIP | — |
| `received` (Pegaki) | — (só timeline) | — | — |
| `posted` | POSTED + `trackingCode`/`trackingUrl` | **SHIPPED** | e-mail "seu pedido foi enviado" com o rastreio |
| `delivered` | DELIVERED | **DELIVERED** | e-mail "entregue" (já previsto: `email.order_delivered`) |
| `cancelled` | CANCELED | volta a READY_TO_SHIP | alerta à equipe |
| `undelivered`, `paused`, `suspended` | PROBLEM | — | alerta à equipe (o `paused` pede ação do destinatário) |

Alertas à equipe: um tipo novo `SHIPPING_ISSUE` no catálogo de `/alertas`. É enum no Prisma e em
`constants/`, com migration e teste de drift.

Atenção às grafias: o evento é `order.cancelled` (dois L), mas o campo é `canceled_at`. Aceite as duas.
`tracking` pode chegar `null` no `posted` e só aparecer até 1 dia útil depois. O polling completa.

### 3.3 O endpoint

`POST /api/v1/webhooks/melhor-envio` (em `ROUTES.webhooks.melhorEnvio`). Monte com `express.raw` **antes**
do `express.json`, igual ao Stripe em `app.ts`, porque a assinatura é sobre os bytes crus.

```
GET/HEAD                         → 200 {}          (cobre o teste do cadastro, se não for POST)
POST sem X-ME-Signature          → 401             (log: método, user-agent, tamanho — nunca o corpo inteiro)
POST com assinatura inválida     → 401
POST válido sem `event` conhecido → 200 no-op       (cobre o teste, se for POST assinado)
POST válido                      → applyMelhorEnvioShipment → 200
erro de banco                    → 500             (o ME tenta de novo em 15 min; a função é idempotente)
```

- **A verificação fica em `integrations/melhor-envio/webhook.ts`**:
  `base64(HMAC-SHA256(rawBody, clientSecret))` comparado com `timingSafeEqual`, os dois lados como Buffer
  de mesmo tamanho. O secret vem de `getMeAppConfig()`, lido a cada requisição (o segredo trocado no
  admin vale na hora). Sem Client Secret configurado, responde 503.
- **Responder em menos de 6 s.** A aplicação é um update e um publish, rápida. Se um dia ficar pesada, o
  handler só grava e enfileira.
- Rate limit leve na rota e nenhum dado do corpo no log (há CPF/endereço em outros endpoints do ME, e
  o webhook pode ganhar campos).
- Como o método do teste de cadastro não está documentado, o primeiro cadastro deve ser feito com
  o log da API aberto. Se o painel recusar, o log mostra o que chegou e o código se ajusta.

### 3.4 Polling de reserva (obrigatório)

Use o `jobs/sync-tracking.ts` que a arquitetura já prevê (cron, 2× ao dia), no worker como o
`melhor-envio-token`:

- Seleciona as remessas com status antes de `DELIVERED`/`CANCELED`, criadas há menos de 60 dias.
- Consulta `POST /api/v2/me/shipment/tracking` em lotes, longe do limite de 250/min.
- Converte cada resposta num snapshot e chama **a mesma** `applyMelhorEnvioShipment`.
- As datas dessa API vêm **sem fuso** (`"2023-04-17 13:55:05"`). Confirme o fuso com uma etiqueta real
  antes de confiar nelas. Na dúvida, use o horário em que observamos a mudança.

Com o polling, o webhook vira otimização: o status chega em segundos em vez de horas, e nada
se perde quando o webhook falha.

## 4. Relação com o /frete e as credenciais

- O webhook usa o **Client Secret** de /frete. Quando o webhook existir, a confirmação forte de troca
  de credenciais (feita em 27/11/2026) ganha mais um item em "O que acontece": *"os webhooks de
  rastreio passam a ser validados com o segredo novo; se ele não for o do painel, o status das
  entregas só atualiza pelo polling"*.
- Trocar de app ou de ambiente (o diálogo que exige digitar DESCONECTAR) também exige cadastrar o webhook
  **no app novo**, porque o webhook é do aplicativo. Isso entra no texto do diálogo.

## 5. Testes

- **Unitários, sem rede:** o payload literal da documentação como fixture, com a assinatura calculada no
  teste. Cobrir: assinatura válida, inválida, ausente e de tamanho diferente; evento desconhecido;
  duplicata; `posted` depois de `delivered` (ignorado); `cancelled` e `canceled`; remessa
  desconhecida (200 sem efeito).
- **A função `applyMelhorEnvioShipment`:** a tabela de transições do §3.2 como `it.each`.
- **Sandbox:** app próprio em app-sandbox.melhorenvio.com.br, com webhook apontando para uma URL
  pública temporária. Os status andam sozinhos a cada 15 min, o que é bom para ver a sequência inteira.
  `generated` pode não chegar lá: não trate a ausência dele como erro.
- **Produção:** a primeira etiqueta real comprada pela API, acompanhada pelo log até o `posted`.

## 6. Ordem de execução

1. **Fase 1.16a — etiqueta pela API:** `Shipment` + migration, `POST /me/cart` com `tags`, checkout e
   geração (`shipping.label`, que já está na arquitetura), e o número do endereço de origem, que
   **ainda falta** em `Store.addressJson`. Pré-requisito: corrigir peso e medidas placeholder de 2
   produtos (10 g e 10×10×10 cm).
2. **Fase 1.16b — rastreio:** `applyMelhorEnvioShipment` + `sync-tracking` (polling) + e-mails de
   enviado/entregue + alerta `SHIPPING_ISSUE`.
3. **Fase 1.16c — webhook:** a rota do §3.3, com deploy.
4. **Só então, no painel:** Integrações → Área Dev → Arte no Jardim → Novo Webhook → URL
   `https://api.artenojardim.com.br/api/v1/webhooks/melhor-envio` → evento "Atualização das etiquetas".
   Acompanhe o log da API durante o salvamento (é a requisição de teste).
5. Primeira etiqueta real: conferir na timeline do pedido que `posted` e `delivered` chegaram pelo
   webhook e que o polling não deixou divergência.

## 7. Pontos em aberto

- O formato exato da requisição de teste do cadastro (o §3.3 cobre as duas hipóteses conhecidas).
- A codificação da assinatura: base64 é inferência. Se a validação falhar com o secret certo, teste hex.
- Se `data.status` do cancelamento vem `canceled` ou `cancelled`.
- Se `data.tags` sempre volta com o que mandamos no carrinho.
- O fuso das datas da API de rastreio.
