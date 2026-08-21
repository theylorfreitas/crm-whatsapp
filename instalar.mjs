// O INSTALADOR DO CRM.
//
//   npm run instalar
//
// Ele pergunta o que precisa, CONFERE cada coisa falando com o serviço de
// verdade, monta o banco, cria o seu usuário e escreve o `.env`. No fim, o CRM
// está pronto para abrir.
//
// ── POR QUE ELE CONFERE TUDO ANTES DE GRAVAR ───────────────────────────────
//
// Um instalador que só grava o que você digitou é um formulário. O problema é
// que um erro de digitação numa chave não aparece na hora: aparece três telas
// depois, como "erro ao carregar", e aí você não sabe se errou a chave, se o
// banco não subiu, ou se o CRM está quebrado.
//
// Aqui cada resposta é testada contra o serviço antes de virar linha no `.env`.
// Se a chave estiver errada, você descobre no segundo seguinte, com o nome do
// campo na frente.
//
// ── ELE PODE SER RODADO DE NOVO ────────────────────────────────────────────
//
// Nada aqui é destrutivo. Se a empresa já existe, ele usa a que existe; se o
// usuário já existe, ele aproveita; se as tabelas já estão lá, ele não recria.
// Rodar duas vezes é seguro, e isso é de propósito: metade das instalações
// param no meio por um valor errado, e você precisa poder continuar de onde
// parou sem começar do zero.

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const RAIZ = import.meta.dirname
const ARQUIVO_ENV = path.join(RAIZ, '.env')
const ESQUEMA = path.join(RAIZ, 'banco', 'schema.sql')

// ── Conversa com quem está instalando ──────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
let mudo = false
const escrever = rl._writeToOutput.bind(rl)
rl._writeToOutput = (s) => {
  if (!mudo) escrever(s)
}

const perguntar = (texto) => new Promise((r) => rl.question(texto, (v) => r(v.trim())))

/** Igual a `perguntar`, mas o que você digita não aparece na tela. */
async function perguntarSegredo(texto) {
  process.stdout.write(texto)
  mudo = true
  const v = await new Promise((r) => rl.question('', (x) => r(x.trim())))
  mudo = false
  process.stdout.write('\n')
  return v
}

async function perguntarAte(texto, conferir, { segredo = false, opcional = false } = {}) {
  for (;;) {
    const v = segredo ? await perguntarSegredo(texto) : await perguntar(texto)
    if (!v && opcional) return ''
    if (!v) {
      console.log('   Esse é obrigatório.')
      continue
    }
    process.stdout.write('   conferindo... ')
    const problema = await conferir(v)
    if (!problema) {
      console.log('ok')
      return v
    }
    console.log('')
    console.log('   ' + problema)
    console.log('')
  }
}

const titulo = (n, texto) => {
  console.log('')
  console.log(`── ${n}. ${texto} ` + '─'.repeat(Math.max(0, 60 - texto.length)))
  console.log('')
}

// ── Passo 0: onde estamos ──────────────────────────────────────────────────

console.log('')
console.log('  CRM com atendimento no WhatsApp')
console.log('  Instalação')
console.log('')

const versao = Number(process.versions.node.split('.')[0])
if (versao < 20) {
  console.error(`  Este projeto precisa do Node 20 ou mais novo. O seu é o ${process.versions.node}.`)
  console.error('  Baixe em https://nodejs.org e rode de novo.')
  process.exit(1)
}

if (fs.existsSync(ARQUIVO_ENV)) {
  console.log('  Já existe um .env aqui. Isso quer dizer que o CRM já foi instalado')
  console.log('  nesta pasta uma vez.')
  console.log('')
  const r = await perguntar('  Continuar e sobrescrever o .env? (s/N) ')
  if (r.toLowerCase() !== 's') {
    console.log('')
    console.log('  Nada foi alterado.')
    rl.close()
    process.exit(0)
  }
  // A cópia fica com a hora no nome: se o valor certo estava no arquivo antigo,
  // ele não se perdeu por causa de uma tecla errada.
  const copia = `${ARQUIVO_ENV}.anterior-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}`
  fs.copyFileSync(ARQUIVO_ENV, copia)
  console.log(`  O anterior virou ${path.basename(copia)}.`)
}

// ── Passo 1: Supabase ──────────────────────────────────────────────────────

titulo(1, 'O banco de dados (Supabase)')
console.log('  Crie uma conta grátis em https://supabase.com, crie um projeto,')
console.log('  e abra Settings > API. É de lá que saem os três valores abaixo.')
console.log('')

let supabaseUrl = ''
supabaseUrl = await perguntarAte('  Project URL (https://algo.supabase.co): ', async (v) => {
  let u
  try {
    u = new URL(v)
  } catch {
    return 'Isso não parece um endereço. Copie o campo "Project URL" inteiro.'
  }
  if (!u.hostname.endsWith('.supabase.co')) return 'O endereço do Supabase termina em .supabase.co.'
  try {
    const r = await fetch(u.origin + '/rest/v1/', { signal: AbortSignal.timeout(15000) })
    // Sem chave ele responde 401, e 401 aqui é ótima notícia: quer dizer que o
    // projeto existe e está no ar.
    if (r.status === 401 || r.status === 200) return null
    return `O endereço respondeu ${r.status}. Confira se o projeto está ativo.`
  } catch {
    return 'Não consegui alcançar esse endereço. Confira a digitação e a sua internet.'
  }
})
supabaseUrl = new URL(supabaseUrl).origin

const anonKey = await perguntarAte(
  '  anon / publishable key: ',
  async (v) => {
    const r = await fetch(supabaseUrl + '/rest/v1/', { headers: { apikey: v } })
    if (r.status === 401) return 'Essa chave não foi aceita. Copie o campo "anon public" inteiro.'
    return null
  },
  { segredo: true },
)

const serviceKey = await perguntarAte(
  '  service_role / secret key: ',
  async (v) => {
    if (v === anonKey) return 'Essa é a mesma chave anterior. A service_role é a outra, marcada como secreta.'
    const r = await fetch(supabaseUrl + '/auth/v1/admin/users?per_page=1', {
      headers: { apikey: v, Authorization: `Bearer ${v}` },
    })
    if (r.status === 401 || r.status === 403) {
      return 'Essa chave não abre a administração. Confira se copiou a "service_role", e não a "anon".'
    }
    if (!r.ok) return `O Supabase respondeu ${r.status}.`
    return null
  },
  { segredo: true },
)

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

// ── Passo 2: as tabelas ────────────────────────────────────────────────────

titulo(2, 'As tabelas do CRM')

async function tabelasJaExistem() {
  const { error } = await admin.from('crm_chats').select('id').limit(1)
  return !error
}

if (await tabelasJaExistem()) {
  console.log('  As tabelas já estão no lugar. Pulando esta parte.')
} else {
  console.log('  Agora o banco precisa receber as tabelas do CRM. São 56, com as')
  console.log('  regras de segurança (RLS) já ligadas.')
  console.log('')
  console.log('  Eu consigo fazer isso sozinho se você me der a "connection string"')
  console.log('  do banco. Ela fica em Settings > Database > Connection string, na')
  console.log('  aba Session pooler, e parece com isto:')
  console.log('')
  console.log('    postgresql://postgres.abcdef:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres')
  console.log('')
  console.log('  Se preferir não colar isso aqui, deixe em branco e eu te mostro')
  console.log('  como aplicar na mão. Leva o mesmo tempo.')
  console.log('')

  const conexao = await perguntarSegredo('  Connection string (ou Enter para pular): ')

  let aplicado = false
  if (conexao) {
    try {
      // O `pg` é carregado só aqui: quem for aplicar o esquema na mão não
      // precisa nem ter o pacote instalado para o instalador funcionar.
      const { default: pg } = await import('pg')
      const url = new URL(conexao)
      const db = new pg.Client({
        host: url.hostname,
        port: Number(url.port || 5432),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.replace(/^\//, '') || 'postgres',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000,
      })
      process.stdout.write('  conectando no banco... ')
      await db.connect()
      console.log('ok')
      process.stdout.write('  aplicando as tabelas... ')
      await db.query(fs.readFileSync(ESQUEMA, 'utf8'))
      await db.end()
      console.log('pronto')
      aplicado = true
    } catch (e) {
      console.log('')
      console.log('  Não deu: ' + String(e.message).split('\n')[0])
      console.log('  Sem problema, dá para fazer na mão logo abaixo.')
    }
  }

  if (!aplicado) {
    console.log('')
    console.log('  FAÇA ASSIM:')
    console.log('')
    console.log('   1. Abra o seu projeto no Supabase.')
    console.log('   2. No menu da esquerda, clique em SQL Editor.')
    console.log('   3. Abra o arquivo abaixo num editor de texto e copie TUDO:')
    console.log('')
    console.log('        ' + ESQUEMA)
    console.log('')
    console.log('   4. Cole no SQL Editor e clique em Run.')
    console.log('')
    await perguntar('  Quando terminar, aperte Enter aqui. ')
  }

  process.stdout.write('  conferindo se as tabelas chegaram... ')
  if (!(await tabelasJaExistem())) {
    console.log('')
    console.log('')
    console.log('  As tabelas ainda não estão lá.')
    console.log('  Rode `npm run instalar` de novo depois de aplicar o banco/schema.sql.')
    rl.close()
    process.exit(1)
  }
  console.log('ok')
}

// ── Passo 3: a sua empresa ─────────────────────────────────────────────────

titulo(3, 'A sua empresa')

const { data: empresas } = await admin
  .from('clients')
  .select('id, company_name')
  .order('created_at', { ascending: true })
  .limit(1)

let empresa = (empresas ?? [])[0]
if (empresa) {
  console.log(`  Já existe: ${empresa.company_name}. Vou usar essa.`)
} else {
  const nome = await perguntarAte('  Nome da empresa: ', async () => null)
  const slug =
    nome
      .toLowerCase()
      .normalize('NFD')
      // Os acentos, que o NFD separou da letra. Escrito por código e não pelo
      // caractere: um til solto num arquivo fonte some no primeiro editor que
      // salvar com outra codificação.
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'minha-empresa'

  const { data, error } = await admin
    .from('clients')
    .insert({ company_name: nome, workspace_slug: slug, status: 'ATIVO' })
    .select('id, company_name')
    .single()

  if (error) {
    console.log('')
    console.log('  Não consegui criar a empresa: ' + error.message)
    rl.close()
    process.exit(1)
  }
  empresa = data
  console.log(`  Criada: ${empresa.company_name}`)
}

// ── Passo 4: o seu usuário ─────────────────────────────────────────────────

titulo(4, 'O seu acesso')
console.log('  Este é o usuário dono: ele enxerga e configura tudo.')
console.log('')

const email = await perguntarAte('  Seu e-mail: ', async (v) =>
  /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : 'Isso não parece um e-mail.',
)

const { data: existentes } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
let usuario = (existentes?.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase())

if (usuario) {
  console.log('  Esse e-mail já tem conta. Vou só garantir que ele é o dono.')
} else {
  const senha = await perguntarAte(
    '  Senha (mínimo 8 caracteres): ',
    async (v) => (v.length >= 8 ? null : 'Curta demais. Use pelo menos 8 caracteres.'),
    { segredo: true },
  )
  const nomeCompleto = await perguntar('  Seu nome (Enter para pular): ')

  // `email_confirm: true` porque quem instala é o dono do projeto: mandar um
  // e-mail de confirmação para ele mesmo, na conta que ele acabou de criar, é
  // cerimônia que só serve para travar a instalação se o e-mail não chegar.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: nomeCompleto ? { full_name: nomeCompleto } : {},
  })
  if (error) {
    console.log('')
    console.log('  Não consegui criar o usuário: ' + error.message)
    rl.close()
    process.exit(1)
  }
  usuario = data.user
  console.log('  Usuário criado.')
}

const { error: erroPerfil } = await admin
  .from('profiles')
  .upsert(
    {
      id: usuario.id,
      role: 'owner',
      client_id: empresa.id,
      full_name: usuario.user_metadata?.full_name ?? null,
    },
    { onConflict: 'id' },
  )

if (erroPerfil) {
  console.log('')
  console.log('  O usuário existe, mas não consegui marcar ele como dono: ' + erroPerfil.message)
  rl.close()
  process.exit(1)
}
console.log('  Marcado como dono da empresa.')

// ── Passo 5: o WhatsApp ────────────────────────────────────────────────────

titulo(5, 'O canal de WhatsApp (uazapi)')
console.log('  A uazapi é quem conversa com o WhatsApp de verdade. É um serviço')
console.log('  pago, e é o que entrega menu com botão, áudio e mídia.')
console.log('')
console.log('  Você pode pular agora e configurar depois: o CRM abre e funciona')
console.log('  sem isso, só não recebe mensagem.')
console.log('')

let uazapiServer = ''
let uazapiToken = ''

const querAgora = (await perguntar('  Configurar o WhatsApp agora? (S/n) ')).toLowerCase()
if (querAgora !== 'n') {
  uazapiServer = await perguntarAte(
    '  Endereço do seu servidor uazapi (https://algo.uazapi.com): ',
    async (v) => {
      try {
        new URL(v)
      } catch {
        return 'Isso não parece um endereço.'
      }
      return null
    },
    { opcional: true },
  )
  if (uazapiServer) {
    uazapiServer = new URL(uazapiServer).origin
    uazapiToken = await perguntarAte(
      '  Token de administrador: ',
      async (v) => {
        try {
          const r = await fetch(uazapiServer + '/instance/all', {
            headers: { admintoken: v },
            signal: AbortSignal.timeout(15000),
          })
          if (r.status === 401 || r.status === 403) return 'O servidor não aceitou esse token.'
          if (!r.ok) return `O servidor respondeu ${r.status}.`
          return null
        } catch {
          return 'Não consegui falar com esse servidor.'
        }
      },
      { segredo: true, opcional: true },
    )
  }
}

// ── Passo 6: o .env ────────────────────────────────────────────────────────

titulo(6, 'Gravando a configuração')

// A senha que separa "webhook do meu provedor" de "qualquer um na internet
// mandando mensagem falsa para o meu CRM". Gerada aqui porque uma senha que a
// pessoa inventa na pressa costuma ser o nome da empresa.
const tokenDaPonte = crypto.randomBytes(32).toString('hex')

const linhas = [
  '# Gerado por `npm run instalar`. Não vai para o Git.',
  '# Para trocar um valor, edite aqui e reinicie os processos.',
  '',
  '# ── Supabase ──────────────────────────────────────────────────────────',
  `SUPABASE_URL=${supabaseUrl}`,
  `VITE_SUPABASE_URL=${supabaseUrl}`,
  `VITE_SUPABASE_ANON_KEY=${anonKey}`,
  `SUPABASE_ANON_KEY=${anonKey}`,
  '',
  '# Esta ignora TODA regra de segurança do banco. Só o servidor usa.',
  '# Repare que não existe VITE_ para ela: o que tem VITE_ vai para o',
  '# navegador, e esta chave no navegador é o banco inteiro aberto.',
  `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
  '',
  '# ── A API ─────────────────────────────────────────────────────────────',
  'PORT=4000',
  'NODE_ENV=development',
  'CORS_ORIGIN=http://localhost:5183',
  'APP_URL=http://localhost:5183',
  'VITE_API_URL=http://localhost:4000',
  'PUBLIC_API_URL=http://localhost:4000',
  '',
  '# ── WhatsApp ──────────────────────────────────────────────────────────',
  `UAZAPI_SERVER=${uazapiServer}`,
  `UAZAPI_ADMIN_TOKEN=${uazapiToken}`,
  'WHATSAPP_BRIDGE_PORT=4200',
  'WHATSAPP_BRIDGE_URL=http://localhost:4200',
  'BACKEND_URL=http://localhost:4000',
  `WHATSAPP_BRIDGE_TOKEN=${tokenDaPonte}`,
  '',
  '# Em desenvolvimento, `npm run tunel` preenche isto sozinho.',
  '# Em produção, ponha aqui o seu domínio fixo.',
  'WHATSAPP_BRIDGE_PUBLIC_URL=',
  '',
]

fs.writeFileSync(ARQUIVO_ENV, linhas.join('\n'))
console.log('  .env escrito.')

// ── Fim ────────────────────────────────────────────────────────────────────

console.log('')
console.log('  ' + '═'.repeat(64))
console.log('  Instalado.')
console.log('  ' + '═'.repeat(64))
console.log('')
console.log('  Para abrir o CRM, deixe estes três rodando, cada um num terminal:')
console.log('')
console.log('    npm run dev         a tela      http://localhost:5183')
console.log('    npm run backend     a API')
console.log('    npm run whatsapp    a ponte do WhatsApp')
console.log('')
console.log(`  Entre com ${email}.`)
console.log('')
if (!uazapiToken) {
  console.log('  O WhatsApp ficou para depois. Quando for configurar, leia')
  console.log('  manual/03-conectar-o-whatsapp.md.')
} else {
  console.log('  Para parear o seu número, abra Conexões no CRM e leia o QR Code.')
  console.log('  O passo a passo está em manual/03-conectar-o-whatsapp.md.')
}
console.log('')

rl.close()
