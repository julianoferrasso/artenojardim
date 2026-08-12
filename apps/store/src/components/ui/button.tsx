import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/*
 * Hierarquia de botões da loja, nomeada pelo PAPEL NO FUNIL — não pela cor.
 *
 *   primary    a ação que move o funil adiante. No máximo uma por tela.
 *   secondary  a alternativa legítima ao lado da primária.
 *   neutral    manutenção: cancelar, voltar, salvar, filtrar, paginar.
 *   danger     destrói dado do cliente.
 *   link       ação inline dentro de um texto corrido.
 *   ghost      controle sem moldura: ícone puro.
 *
 * `emphasis` é ORTOGONAL ao papel, e é o que evita inventar meia dúzia de
 * variantes: `danger` discreto (remover um item da lista) e `danger` sólido
 * (confirmar o cancelamento do pedido) são o MESMO papel com peso diferente.
 *
 * buttonVariants é exportado separado para estilizar <Link> como botão sem
 * transformar a página em Client Component. (Não usamos `asChild`: exigiria
 * radix-ui, que a loja não tem — o admin sim.)
 *
 * As cores saem de tokens que o painel controla: --btn-primary e --btn-secondary
 * são resolvidos em deriveButtonVars, com o texto derivado por contraste. Nunca
 * escreva a cor à mão aqui.
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: '',
        secondary: '',
        neutral: '',
        danger: '',
        link: 'text-primary-ink underline-offset-4 hover:underline',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
      },
      emphasis: {
        solid: '',
        quiet: '',
      },
      size: {
        sm: 'h-9 px-3',
        default: 'h-10 px-5',
        lg: 'h-12 px-7 text-base',
        icon: 'size-10',
        /** Par do `lg`: é o coração ao lado do "Adicionar ao carrinho". */
        iconLg: 'size-12',
      },
    },
    compoundVariants: [
      // ── Sólido: o par fundo/texto, sempre com contraste garantido ──────────
      {
        variant: 'primary',
        emphasis: 'solid',
        class: 'bg-btn-primary text-btn-primary-foreground shadow-soft hover:bg-btn-primary/90',
      },
      {
        variant: 'secondary',
        emphasis: 'solid',
        class:
          'bg-btn-secondary text-btn-secondary-foreground shadow-soft hover:bg-btn-secondary/90',
      },
      {
        variant: 'neutral',
        emphasis: 'solid',
        class: 'bg-secondary text-secondary-foreground hover:bg-accent',
      },
      {
        variant: 'danger',
        emphasis: 'solid',
        class: 'bg-destructive text-destructive-foreground shadow-soft hover:bg-destructive/90',
      },

      // ── Discreto: contorno ou só texto. Usa a TINTA (derivada por contraste
      //    contra as superfícies), nunca a cor cheia, que sumiria no fundo. ───
      {
        variant: 'primary',
        emphasis: 'quiet',
        class: 'border border-btn-primary-ink bg-transparent text-btn-primary-ink hover:bg-accent',
      },
      {
        variant: 'secondary',
        emphasis: 'quiet',
        class:
          'border border-btn-secondary-ink bg-transparent text-btn-secondary-ink hover:bg-accent',
      },
      {
        variant: 'neutral',
        emphasis: 'quiet',
        class: 'border border-input bg-card text-foreground hover:bg-accent hover:text-accent-foreground',
      },
      {
        variant: 'danger',
        emphasis: 'quiet',
        class: 'bg-transparent text-muted-foreground hover:bg-accent hover:text-destructive',
      },
    ],
    defaultVariants: {
      variant: 'primary',
      emphasis: 'solid',
      size: 'default',
    },
  },
)

type ButtonProps = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>

export const Button = ({
  className,
  variant,
  emphasis,
  size,
  type = 'button',
  ...props
}: ButtonProps) => (
  <button
    type={type}
    className={cn(buttonVariants({ variant, emphasis, size }), className)}
    {...props}
  />
)
