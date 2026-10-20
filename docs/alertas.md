# Alertas da equipe (e-mail, Telegram, WhatsApp)

Tela **Alertas** no admin (`/alertas`, só ADMIN). Cada destino (um e-mail, um chat ou grupo do
Telegram, um número de WhatsApp) é **confirmado por um código de 6 dígitos** que chega nele mesmo,
e escolhe quais eventos recebe. Substituiu o antigo "e-mail da equipe" de `/configuracoes` (que
agora redireciona para cá); aquele endereço virou o primeiro destino, já verificado.

## Como funciona

```
fato de negócio ──► notify*() (modules/notifications, depois do commit, nunca lança)
                       │  texto pronto (domain/notices.ts)
                       ▼
                    raiseAlert(tipos, conteúdo)  (modules/alerts)
                       │  ninguém assina? para aqui
                       │  grava Alert (tipo + título) e publica UMA mensagem por destino
                       ▼
        fila alert.send ──► worker: deliverAlert → e-mail (SES) | Telegram | WhatsApp
                       grava AlertDelivery (entregue / erro) — é o "Histórico" da tela
```

- **Uma mensagem por destino** (o fan-out da campanha): o retry de um Telegram fora do ar não
  reenvia ao e-mail que já recebeu. Retry 5 s → 30 s → 5 min → DLQ (`alert.send.dlq`).
- **O texto completo não fica no banco.** Ele tem nome e mensagem do cliente; viaja só no payload
  da fila. O histórico guarda o título, que por regra nunca leva nome de cliente (LGPD).
- **Falha do servidor ≠ falha do destino.** Canal sem token, token revogado, modelo da Meta
  inexistente: vira erro no histórico e log, mas nunca marca o destino — dev e produção dividem o
  banco, e um worker de dev sem token "quebraria" destinos que em produção funcionam. Já o bot
  bloqueado pelo usuário (ou removido do grupo) **pausa** o destino, com o motivo na tela.

### Eventos

| Evento | De onde sai | Padrão |
|---|---|---|
| Novo pedido pago | fim do `orderPaidHandler` (MP e Stripe) | ligado |
| Pedido de cancelamento | cliente pede com o pedido em separação | ligado |
| Cancelado pelo cliente | cliente cancela antes da separação (estorno automático) | ligado |
| Estorno falhou | estorno automático recusado pelo provedor (ação necessária) | ligado |
| Pedido aguardando pagamento | `confirm` do checkout | **desligado** |
| Mensagem de cliente | conversa do pedido (inclui devolução) | ligado |
| Estoque baixo / esgotado | reserva no checkout e ajuste/contagem no admin | ligado |
| Frete desconectado | job do Melhor Envio (6 h), repete enquanto durar | ligado |
| Loja fora do ar / de volta | job `site-monitor` (2 min, 3 falhas seguidas) | ligado |

- **Estoque baixo** compara o disponível (`onHand − reserved`) com o limite da loja (tela Alertas,
  aba Eventos; padrão 2). Avisa só ao **cruzar** o limite e de novo ao **zerar**. Pedido não pago
  também reserva: o texto do alerta mostra quanto está reservado.
- **Loja fora do ar** testa `STORE_URL`, `ADMIN_URL` e `API_URL/api/v1/health` pelo endereço
  público (passa pelo Nginx — foi o Nginx que caiu nos 9 dias de agosto/2026). Limite: o monitor
  roda na própria VPS; se a máquina inteira cair, ele cai junto. Para isso, vale um monitor
  externo gratuito (UptimeRobot, Better Stack) apontando para a URL do health.

## Telegram — configuração

1. No Telegram, abra o **@BotFather** e envie `/newbot`.
2. Nome: algo como "Arte no Jardim Alertas". Usuário: precisa terminar em `bot`
   (ex.: `artenojardim_alertas_bot`).
3. O BotFather responde com o **token** (`123456789:AA…`). É a senha do bot.
4. Opcional, no BotFather: `/setuserpic` (logo), `/setdescription` ("Alertas da loja Arte no Jardim").
5. Na VPS, acrescente ao `/var/www/artenojardim/apps/api/.env`:
   ```
   TELEGRAM_BOT_TOKEN=123456789:AA…
   ```
   e reinicie **API e worker** (o worker é quem envia):
   ```bash
   aj 'pm2 restart artenojardim-api artenojardim-worker'
   ```
6. No admin, **Alertas**: o cartão do Telegram mostra `Bot @…`. **Adicionar destino → Telegram**,
   dê um nome, abra o link (ou aponte a câmera para o QR code) e toque em **Iniciar**. O bot manda o
   código no chat; digite na tela.
7. **Grupo da equipe:** crie o grupo antes; no cadastro escolha **Um grupo**. O link pede o grupo,
   adiciona o bot e manda o `/start` sozinho; o código chega no grupo.

Cuidados:
- **Não ative webhook no bot.** O painel lê o "Iniciar" com `getUpdates` (por isso funciona em dev
  e produção sem rota pública). Com webhook o Telegram responde 409, e a tela avisa. Para remover:
  `https://api.telegram.org/bot<TOKEN>/deleteWebhook`.
- **Use o mesmo token em dev, ou deixe vazio.** O banco é compartilhado: um chat vinculado por um
  bot de dev é um chat com quem o bot de produção nunca falou — ele não consegue escrever lá.
- Token vazou? `/revoke` no BotFather, troque no `.env` e reinicie.

## WhatsApp — configuração (Meta, WhatsApp Cloud API)

O código está pronto e desligado: o cartão fica "Aguardando a conta da Meta" até as variáveis
existirem. Mensagem que a empresa inicia só sai por **modelo (template) aprovado**.

1. **Conta empresarial** em business.facebook.com (com a verificação do negócio, para sair dos
   limites iniciais).
2. Em developers.facebook.com: **Criar app → Negócios**, e adicione o produto **WhatsApp**. Isso
   cria uma conta do WhatsApp Business (WABA) ligada ao portfólio.
3. **Número dedicado.** Um número registrado na API deixa de funcionar no aplicativo do WhatsApp do
   celular. Use um chip só para isso, verifique por SMS/ligação e aprove o nome de exibição.
4. **Token permanente:** Configurações do negócio → Usuários do sistema → crie um usuário
   *Administrador*, atribua a ele o app e a conta do WhatsApp, e gere um token com as permissões
   `whatsapp_business_messaging` e `whatsapp_business_management`. (O token da página "API Setup"
   dura 24 h — não serve.)
5. **Phone Number ID:** WhatsApp → API Setup (é um id numérico, não o telefone).
6. **Forma de pagamento** na conta do WhatsApp: a Meta cobra por mensagem de modelo (autenticação e
   utilidade têm preços por país; veja a tabela de preços da Meta para o Brasil).
7. **Os dois modelos**, em WhatsApp Manager → Modelos de mensagem, idioma **Português (BR)**:

   **`codigo_verificacao`** — categoria **Autenticação**
   - Entrega do código: **Copiar código**; texto do botão: `Copiar código`.
   - Marque "Adicionar recomendação de segurança" e a validade de **10 minutos**.
   - O texto do corpo é a Meta que gera ("*{{1}}* é seu código de verificação…").

   **`alerta_loja`** — categoria **Utilidade**
   - Corpo (exatamente dois parâmetros; a Meta recusa corpo que começa ou termina em variável):
     ```
     Alerta da loja Arte no Jardim:
     *{{1}}*

     {{2}}

     Abra o painel para ver os detalhes.
     ```
     Exemplos para a aprovação: `{{1}}` = `🛒 Novo pedido pago: #1042`;
     `{{2}}` = `Maria pagou R$ 189,90 (Pix). Já pode separar. · 2× Vela Lavanda (300 g)`.
   - Botão **Visitar site**, URL **dinâmica**: `https://admin.artenojardim.com.br/{{1}}`, texto
     `Abrir no painel`, exemplo `pedidos/abc123`.
   - O código manda `{{1}}` = emoji + título, `{{2}}` = o texto em uma linha (até 600 caracteres)
     e o botão com o caminho do painel. Mudou o modelo? Mude `renderWhatsAppAlert`
     (`modules/alerts/domain/render.ts`) junto.
8. Na VPS, no `apps/api/.env`:
   ```
   WHATSAPP_ACCESS_TOKEN=EAAG…
   WHATSAPP_PHONE_NUMBER_ID=1234567890
   ```
   (os dois andam juntos: só um derruba o boot). Reinicie API e worker. O cartão fica
   "Pronto para enviar", e **Adicionar destino → WhatsApp** manda o código pelo modelo de
   autenticação.

Enquanto o app estiver em **modo de desenvolvimento**, a Meta só entrega para até 5 números
cadastrados como destinatários de teste (erro 131030 — a tela traduz).

"Enviado", no WhatsApp, quer dizer que a Meta **aceitou**. A entrega no aparelho só chegaria por
webhook de status, que não existe (ainda).

## Variáveis (`apps/api/.env`)

| Variável | Padrão | Para quê |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | — | Token do BotFather. Vazio = Telegram desligado |
| `WHATSAPP_ACCESS_TOKEN` | — | Token permanente do usuário do sistema |
| `WHATSAPP_PHONE_NUMBER_ID` | — | Id do número remetente |
| `WHATSAPP_GRAPH_VERSION` | `v26.0` | Versão da Graph API |
| `WHATSAPP_OTP_TEMPLATE` | `codigo_verificacao` | Nome do modelo de código |
| `WHATSAPP_ALERT_TEMPLATE` | `alerta_loja` | Nome do modelo de alerta |
| `WHATSAPP_TEMPLATE_LANG` | `pt_BR` | Idioma dos dois modelos |

O e-mail usa o SES que já existe (`EMAIL_FROM` etc.).

## Segurança do código

6 dígitos (`crypto.randomInt`), só o hash SHA-256 no banco (salgado pelo id do destino), validade
de 10 min, **5 tentativas** — gastas atomicamente antes de comparar, para requisições paralelas não
ganharem tentativa extra —, 60 s entre reenvios e rate limit por usuário (15 envios/h, 30
verificações/15 min). O link do Telegram é um token aleatório de uso único (hash no banco, 30 min).
O token do bot vai dentro da URL da Bot API: a URL nunca entra em log nem em erro.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Cartão do Telegram "Não configurado" | `TELEGRAM_BOT_TOKEN` ausente, ou API não reiniciada |
| "O Telegram recusou o token do bot" | Token errado ou revogado (`/revoke`) |
| "Este bot está com webhook ativo" | Alguém configurou webhook: `deleteWebhook` (acima) |
| Tocou em Iniciar e nada aconteceu | Link de outro cadastro ou expirado (30 min): gere outro |
| Destino "Pausado" sozinho com erro do bot | Bloquearam o bot ou o removeram do grupo: desbloqueie/readicione e reative |
| WhatsApp 131030 | Número fora da lista de teste da Meta |
| WhatsApp "modelo não existe" (132001) | Modelo ainda não aprovado, ou nome/idioma diferente do `.env` |
| WhatsApp 190 | Token vencido: use o permanente do usuário do sistema |
| Alerta não aparece no Histórico | Ninguém assina o evento (aba Eventos) ou a fila está fora |
| `alert.send.dlq` > 0 | Provedor fora por mais de ~5 min (3 tentativas esgotadas) |

Conferir a fila: `rabbitmqctl list_queues -p artenojardim name messages | grep alert`.
