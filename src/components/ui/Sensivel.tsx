import type { ReactNode } from 'react'
import { useModoGravacao } from '../../context/ModoGravacao'

// O QUE NÃO PODE APARECER NA GRAVAÇÃO.
//
// Envolve qualquer coisa que identifique uma pessoa ou abra uma porta: e-mail,
// telefone, chave de API, token, valor de contrato, nome de quem mandou
// mensagem. Com o modo gravação ligado, o conteúdo fica borrado e não dá pra
// selecionar nem copiar.
//
// `rotulo` troca o texto por uma etiqueta neutra em vez de borrar. Use quando o
// borrão sozinho não resolve: um borrão do tamanho de um e-mail ainda entrega o
// tamanho do e-mail, e num campo curto (um PIN, um código de 6 dígitos) isso já
// é informação demais.

interface SensivelProps {
  children: ReactNode
  /** Texto neutro que substitui o conteúdo, em vez de borrar. */
  rotulo?: string
  className?: string
  /**
   * A tag de saída. `span` por padrão; `div` dentro de bloco.
   *
   * Parágrafo e título entram na lista porque o dado sensível às vezes É o
   * título da coisa (o nome de um conteúdo, o de uma empresa). Forçar `div`
   * nesses casos apagaria a semântica só pra caber no componente, e um leitor
   * de tela deixaria de anunciar o cabeçalho.
   */
  as?: 'span' | 'div' | 'p' | 'h2' | 'h3'
}

export function Sensivel({ children, rotulo, className = '', as = 'span' }: SensivelProps) {
  const Tag = as

  if (rotulo) {
    return (
      <Tag className={className}>
        {/* Os dois existem sempre no HTML e o CSS escolhe qual mostrar. Trocar
            por JS deixaria um quadro com o dado limpo antes da troca, e um
            quadro basta: é só pausar o vídeo. */}
        <span className="so-gravando text-ink-4">{rotulo}</span>
        <span className="so-normal">{children}</span>
      </Tag>
    )
  }

  return (
    <Tag className={`sensivel ${className}`} data-sensivel="">
      {children}
    </Tag>
  )
}

// SÓ O TELEFONE, COM A CONVERSA À VISTA.
//
// Borrar a conversa inteira protege bem e demonstra mal: uma gravação do CRM
// com todas as bolhas embaçadas não mostra o produto funcionando, que é o
// motivo de estar gravando. O que precisa sumir é o que identifica a pessoa, e
// numa conversa isso é o número.
//
// O NÚMERO TAMBÉM MORA DENTRO DO TEXTO. "Chegou atendimento novo de
// +55 21 99928…" é mensagem de sistema, aparece na prévia da lista, e nenhum
// campo de telefone protege contra ela. Por isso a máscara age sobre o texto,
// e não sobre o campo.
//
// Ao contrário do borrão, isto acontece em JavaScript. O modo é lido do
// localStorage já no primeiro render, então não existe quadro com o número
// limpo antes da troca.

/** Troca sequências que parecem telefone por um traço, preservando o resto. */
export function mascararTelefones(texto: string): string {
  // Nove ou mais dígitos, aceitando +, espaço, parêntese, ponto e traço no
  // meio. Cobre "+55 00 90000-0000", "(21) 99928 1234" e "5500000000000".
  // O `\(?` inicial evita deixar um parêntese órfão em "(21) 99928-1234":
  // sem ele a máscara começa no dígito e sobra um "(" solto na frase.
  return texto.replace(/\(?\+?\d[\d\s().-]{7,}\d\)?/g, (achado) => {
    const digitos = achado.replace(/\D/g, '')
    // Menos de 9 dígitos raramente é telefone: é preço, quantidade, hora.
    // Deixa passar, senão a máscara come o conteúdo que se queria mostrar.
    return digitos.length >= 9 ? '••• ••••' : achado
  })
}

/**
 * O texto como ele é, com os telefones mascarados durante a gravação.
 *
 * Use no corpo da mensagem e na prévia da lista. Para o CAMPO de telefone,
 * continue usando `Sensivel`: lá o dado é o número inteiro, e mascarar dentro
 * de um campo chamado "Telefone" seria teatro.
 */
export function SemTelefone({ children }: { children: string }) {
  const { ligado } = useModoGravacao()
  return <>{ligado ? mascararTelefones(children) : children}</>
}
