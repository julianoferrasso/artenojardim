'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type GuideChannel = 'TELEGRAM' | 'WHATSAPP'

/** O passo a passo curto; o completo, com os textos exatos dos modelos da Meta, está em docs/alertas.md. */
const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>
)

const TelegramGuide = () => (
  <ol className="list-decimal space-y-2 pl-5 text-sm">
    <li>
      No Telegram, abra o <strong>@BotFather</strong> e envie <Code>/newbot</Code>.
    </li>
    <li>
      Escolha o nome (ex.: “Arte no Jardim Alertas”) e o usuário do bot — ele precisa terminar em “bot”, como{' '}
      <Code>artenojardim_alertas_bot</Code>.
    </li>
    <li>
      O BotFather responde com o <strong>token</strong> (algo como <Code>123456789:AA…</Code>). Ele é a senha do bot:
      não mande para ninguém.
    </li>
    <li>
      No servidor, coloque o token em <Code>TELEGRAM_BOT_TOKEN</Code> no <Code>apps/api/.env</Code> e reinicie a API e o
      worker (<Code>pm2 restart artenojardim-api artenojardim-worker</Code>).
    </li>
    <li>
      Volte aqui: o cartão do Telegram passa a mostrar o @ do bot. Use <strong>Adicionar destino → Telegram</strong>,
      abra o link (ou o QR code) e toque em <strong>Iniciar</strong>. O código chega no chat.
    </li>
    <li>
      Para a equipe toda receber num <strong>grupo</strong>: crie o grupo antes e escolha “Um grupo” no cadastro — o
      Telegram pede para escolher o grupo e adiciona o bot.
    </li>
    <li className="text-muted-foreground">
      Não ative webhook nesse bot: o painel lê o “Iniciar” por consulta. Se o token vazar, gere outro com{' '}
      <Code>/revoke</Code> no BotFather e atualize o <Code>.env</Code>.
    </li>
  </ol>
)

const WhatsAppGuide = () => (
  <ol className="list-decimal space-y-2 pl-5 text-sm">
    <li>
      Crie (ou use) a conta empresarial em <strong>business.facebook.com</strong> e, em{' '}
      <strong>developers.facebook.com</strong>, um app do tipo Negócios com o produto <strong>WhatsApp</strong>.
    </li>
    <li>
      Cadastre um <strong>número dedicado</strong> na conta do WhatsApp Business: um número registrado na API deixa de
      funcionar no aplicativo do celular.
    </li>
    <li>
      Gere um <strong>token permanente</strong>: Configurações do negócio → Usuários do sistema → um usuário
      administrador com o app e a conta do WhatsApp atribuídos → token com <Code>whatsapp_business_messaging</Code> e{' '}
      <Code>whatsapp_business_management</Code>.
    </li>
    <li>
      Anote o <strong>Phone Number ID</strong> (WhatsApp → Configuração da API). É um id numérico, não o telefone.
    </li>
    <li>
      Crie e aprove dois modelos em português (pt_BR): <Code>codigo_verificacao</Code> (Autenticação, botão “copiar
      código”) e <Code>alerta_loja</Code> (Utilidade). O texto exato está em <Code>docs/alertas.md</Code>.
    </li>
    <li>Cadastre uma forma de pagamento na conta do WhatsApp: a Meta cobra por mensagem enviada.</li>
    <li>
      No servidor, preencha <Code>WHATSAPP_ACCESS_TOKEN</Code> e <Code>WHATSAPP_PHONE_NUMBER_ID</Code> no{' '}
      <Code>apps/api/.env</Code> e reinicie a API e o worker. O cartão do WhatsApp fica “Pronto para enviar”.
    </li>
    <li className="text-muted-foreground">
      Enquanto o app estiver em modo de desenvolvimento, a Meta só entrega para até 5 números cadastrados como
      destinatários de teste.
    </li>
  </ol>
)

export const SetupGuideDialog = ({
  channel,
  onClose,
}: {
  channel: GuideChannel | null
  onClose: () => void
}) => (
  <Dialog open={channel !== null} onOpenChange={(open: boolean) => !open && onClose()}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{channel === 'WHATSAPP' ? 'Configurar o WhatsApp' : 'Configurar o Telegram'}</DialogTitle>
        <DialogDescription>
          {channel === 'WHATSAPP'
            ? 'Usa a API oficial da Meta (WhatsApp Cloud API). O código já está pronto: falta a conta.'
            : 'Um bot do Telegram manda os alertas para você ou para um grupo da equipe. Leva uns 5 minutos.'}
        </DialogDescription>
      </DialogHeader>
      <div className="max-h-96 overflow-y-auto pr-1">{channel === 'WHATSAPP' ? <WhatsAppGuide /> : <TelegramGuide />}</div>
    </DialogContent>
  </Dialog>
)
