import type { SupabaseClient } from '@supabase/supabase-js'
import type { WhatsappEnv } from './config/env.js'
import { CloudApi } from './cloud.js'
import type { ContaUazapi } from './uazapi.js'

// POR ONDE CADA CONEXÃO FALA.
//
// O sistema tem clientes nos dois canais ao mesmo tempo, e a escolha é de cada um:
//
//   uazapi   QR Code, chip no celular. Entrega BOTÃO — medido, com instância
//            pareada por QR: texto, botões e botão de copiar chegaram tocáveis
//            no aparelho. Substituiu o provedor antigo, que não entregava o interativo.
//
//   oficial  Cloud API da Meta. Botão de conta comercial. Em troca exige
//            empresa verificada, cartão cadastrado e o número MIGRADO — que sai
//            do WhatsApp comum e não abre mais no celular.
//
// Por que isto não é uma variável de ambiente: era, e estava errado. Ligar a
// Cloud API pelo `.env` trocava o canal do sistema INTEIRO — o primeiro cliente
// ganharia botão e todos os outros perderiam o WhatsApp no mesmo instante.
// Vale igual pra uazapi: cada instância mora num servidor diferente, e o
// servidor é dado da CONEXÃO, não do sistema.
//
// Os tokens vivem em `crm_connection_secrets`, tabela sem política de RLS que
// só o service_role alcança. Não podem encostar em `crm_connections`: o
// navegador lê essa tabela direto, e o RLS decide quem vê a LINHA, não quem vê
// a COLUNA.

/** Quanto tempo uma credencial lida do banco vale sem reler. */
const VALIDADE_MS = 60_000

/** Por onde uma conexão fala. Exatamente um dos dois é preenchido. */
export interface Canal {
  cloud: CloudApi | null
  uazapi: ContaUazapi | null
}

interface Lembrado {
  canal: Canal
  ate: number
}

const MUDO: Canal = { cloud: null, uazapi: null }

export class Canais {
  private readonly cache = new Map<string, Lembrado>()

  constructor(
    private readonly db: SupabaseClient,
    private readonly env: WhatsappEnv,
    private readonly log?: { warn: (o: Record<string, unknown>, m: string) => void },
  ) {}

  /**
   * Por onde esta conexão fala. Os dois nulos = ela não fala por lugar nenhum,
   * e quem chamou precisa avisar em vez de fingir que enviou.
   *
   * O cache existe porque isto é consultado a CADA mensagem enviada, e uma ida
   * ao banco por mensagem transformaria um disparo de mil contatos em mil
   * consultas. Um minuto é curto o bastante pra que trocar o token no painel
   * valha logo, e longo o bastante pra sumir com o custo.
   */
  async canalDe(sessao: string): Promise<Canal> {
    const agora = Date.now()
    const lembrado = this.cache.get(sessao)
    if (lembrado && lembrado.ate > agora) return lembrado.canal

    const canal = await this.buscar(sessao)
    this.cache.set(sessao, { canal, ate: agora + VALIDADE_MS })
    return canal
  }

  /** Atalho pra quem só precisa saber se é a conta oficial. */
  async cloudDe(sessao: string): Promise<CloudApi | null> {
    return (await this.canalDe(sessao)).cloud
  }

  /** Esquece o que sabia. Chamado quando a conexão é reconfigurada. */
  esquecer(sessao?: string): void {
    if (sessao) this.cache.delete(sessao)
    else this.cache.clear()
  }

  private async buscar(sessao: string): Promise<Canal> {
    const { data: conexao } = await this.db
      .from('crm_connections')
      .select('id, kind, cloud_phone_id, uazapi_server')
      .or(filtroDeSessao(sessao))
      .maybeSingle()

    if (!conexao) return MUDO

    // Os dois tipos de credencial moram na mesma linha do cofre. Uma consulta
    // só, e o que vier vazio simplesmente não é o caso desta conexão.
    const { data: segredo } = await this.db
      .from('crm_connection_secrets')
      .select('cloud_token, uazapi_token')
      .eq('connection_id', conexao.id)
      .maybeSingle()

    if (conexao.kind === 'oficial') {
      if (!conexao.cloud_phone_id) {
        this.log?.warn({ sessao }, 'conexão marcada como oficial mas sem o ID do número — nada será enviado por ela')
        return MUDO
      }
      if (!segredo?.cloud_token) {
        this.log?.warn({ sessao }, 'conexão oficial sem token guardado — nada será enviado por ela')
        return MUDO
      }
      return {
        cloud: new CloudApi(
          { token: segredo.cloud_token, phoneId: conexao.cloud_phone_id, versao: this.env.WHATSAPP_CLOUD_VERSAO },
          this.log as never,
        ),
        uazapi: null,
      }
    }

    // Não oficial. Sem servidor ou sem token, a conexão ainda não foi pareada —
    // é o estado normal de quem acabou de criar e ainda não leu o QR Code.
    if (!conexao.uazapi_server || !segredo?.uazapi_token) return MUDO

    return { cloud: null, uazapi: { servidor: conexao.uazapi_server, token: segredo.uazapi_token } }
  }

  /**
   * De qual conexão é este webhook da Meta.
   *
   * A Meta não sabe o que é uma "conexão" nossa: ela diz de qual NÚMERO o
   * evento veio (`phone_number_id`). O casamento é por essa coluna, e é ela que
   * o índice do 0033 cobre — sem ele, cada mensagem recebida varreria as
   * conexões de todos os clientes do sistema.
   */
  async porNumeroDaMeta(phoneNumberId: string): Promise<{ id: string; clientId: string } | null> {
    const { data } = await this.db
      .from('crm_connections')
      .select('id, client_id')
      .eq('cloud_phone_id', phoneNumberId)
      .eq('kind', 'oficial')
      .maybeSingle()
    return data ? { id: data.id, clientId: data.client_id } : null
  }
}

/**
 * A conexão é achada pelo `instance_id` ou, quando ele é nulo, pelo `id`.
 *
 * Repetido de app.ts de propósito: `id` é uuid, e pedir ao Postgres que compare
 * essa coluna com um nome de sessão comum aborta a consulta INTEIRA com 22P02 —
 * nem o casamento por `instance_id` sobrevive. Foi isso que já fez toda mensagem
 * recebida virar "instância desconhecida".
 */
function filtroDeSessao(sessao: string): string {
  const porInstancia = `instance_id.eq.${sessao}`
  const ehUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessao)
  return ehUuid ? `${porInstancia},id.eq.${sessao}` : porInstancia
}
