import { supabase } from '../supabaseClient'

// A EMPRESA DESTA INSTALAÇÃO.
//
// Uma só, criada pelo instalador. Todas as tabelas do CRM carregam `client_id`,
// e é este id que vai para todas as seções.
//
// A consulta é `limit(1)` e não `single()` de propósito: `single()` explode
// quando não há linha, e "ainda não instalei" não é erro de programação, é um
// estado normal que a tela sabe explicar.

export interface Empresa {
  id: string
  nome: string
  slug: string
}

export async function fetchEmpresa(): Promise<Empresa | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, company_name, workspace_slug')
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) throw error
  const linha = (data ?? [])[0]
  if (!linha) return null

  return {
    id: linha.id as string,
    nome: (linha.company_name as string) ?? 'Minha empresa',
    // O slug vem com barra na frente em algumas gravações antigas; a tela de
    // Configurações quer ele puro.
    slug: String(linha.workspace_slug ?? '').replace(/^\//, ''),
  }
}
