/**
 * O telefone como se lê, não como o WhatsApp guarda. `5500000000000` obriga a
 * pessoa a contar dígito por dígito pra conferir com quem está falando.
 */
export function formatarTelefone(bruto: string): string {
  const so = bruto.replace(/\D/g, '')
  const br = so.startsWith('55') ? so.slice(2) : null
  if (br && (br.length === 10 || br.length === 11)) {
    const ddd = br.slice(0, 2)
    const resto = br.slice(2)
    const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4)
    return `(${ddd}) ${meio}-${resto.slice(meio.length)}`
  }
  // Número de fora do Brasil (ou id que o provedor ainda não resolveu): mostrar o
  // que veio é melhor do que forçar um formato que não é o dele.
  return so.length > 0 ? `+${so}` : bruto
}
