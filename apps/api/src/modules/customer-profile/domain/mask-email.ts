/**
 * Mascara a parte local de um e-mail, preservando o domínio.
 *
 *   joao.silva@gmail.com  ->  j••••••••a@gmail.com
 *
 * Existe para o aviso enviado à caixa ANTIGA poder dizer PARA ONDE a troca foi
 * pedida sem entregar o endereço inteiro: quem lê aquele aviso pode não ser mais
 * quem controla a conta, e o endereço completo do atacante não é informação que
 * a vítima precise para reagir — trocar a senha basta.
 *
 * O domínio fica visível de propósito: é o que permite ao dono reconhecer "isso
 * não é meu" num relance.
 */
export const maskEmail = (email: string): string => {
  const at = email.lastIndexOf('@')
  // Sem '@' não é e-mail que a gente saiba mascarar. Devolver o valor cru seria
  // vazar justamente o que a função existe para esconder.
  if (at <= 0) return '•••'

  const local = email.slice(0, at)
  const domain = email.slice(at)

  // Com 1 ou 2 caracteres não há o que preservar sem entregar o endereço: um
  // "a•@x.com" identifica tanto quanto o original.
  if (local.length <= 2) return `${'•'.repeat(local.length)}${domain}`

  return `${local[0]}${'•'.repeat(local.length - 2)}${local[local.length - 1]}${domain}`
}
