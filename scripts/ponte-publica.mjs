// O ENDEREÇO PÚBLICO DA PONTE, DE PÉ O TEMPO TODO.
//
//   node scripts/ponte-publica.mjs
//
// O PROBLEMA. A ponte de WhatsApp escuta em 127.0.0.1:4200, e a uazapi precisa
// alcançá-la de fora pra entregar o que o cliente escreve. Quem faz essa ligação
// aqui é um túnel rápido do Cloudflare, e ele tem dois defeitos que juntos
// derrubam o canal em silêncio:
//
//   1. ele cai (rede, suspensão da máquina, o próprio Cloudflare reciclando);
//   2. quando volta, volta com OUTRO nome.
//
// O nome antigo fica gravado no `.env` e no webhook da instância. A partir daí
// tudo continua parecendo certo: a tela diz "conectada", o envio funciona, e o
// que o cliente responde é entregue num endereço que não existe mais. Foi assim
// que um canal fica mudo, e o sintoma só aparece quando alguém manda uma
// mensagem de teste e nada aconteceu.
//
// O QUE ESTE PROGRAMA FAZ. Ele mantém o túnel de pé e ESCREVE o endereço de
// agora em `.tunnel/endereco.json`. A ponte relê esse arquivo a cada poucos
// segundos (ver `whatsapp/src/config/enderecoPublico.ts`), e o vigia das sessões
// reaponta o webhook da uazapi na rodada seguinte. Ninguém reinicia nada: a
// janela de silêncio deixa de ser "até alguém perceber" e passa a ser o tempo de
// uma rodada do vigia, que é de dois minutos.
//
// Ele também CONFERE, e não só supervisiona o processo: um túnel pode continuar
// vivo e parar de entregar. A cada meio minuto ele bate na própria ponte pelo
// endereço público. Duas falhas seguidas e o túnel é derrubado de propósito,
// pra subir limpo com um nome novo.
//
// ISTO NÃO É A SOLUÇÃO DEFINITIVA, e é honesto dizer. Túnel rápido é anônimo e
// descartável por natureza. A resposta de verdade é um endereço FIXO: um túnel
// nomeado do Cloudflare com domínio próprio, ou a VPS. Enquanto esse endereço
// não existe, este programa é o que transforma uma queda de horas numa queda de
// dois minutos.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as esperar } from 'node:timers/promises'

const RAIZ = path.resolve(import.meta.dirname, '..')
const PASTA = path.join(RAIZ, '.tunnel')
const ARQUIVO = path.join(PASTA, 'endereco.json')
const LOG = path.join(PASTA, 'cloudflared.log')

const PORTA = Number(process.env.PORTA_DA_PONTE ?? 4200)
const ALVO = `http://127.0.0.1:${PORTA}`

/** Onde o cloudflared costuma estar no Windows, quando não está no PATH. */
const CANDIDATOS = [
  'cloudflared',
  'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
  'C:\\Program Files\\cloudflared\\cloudflared.exe',
]

/** De quanto em quanto tempo o endereço é conferido de fora. */
const CONFERIR_MS = 30_000
/** Quantas conferências seguidas falhando derrubam o túnel de propósito. */
const FALHAS_ATE_RECOMECAR = 2
/** Espera antes de subir de novo, dobrando, pra não martelar o Cloudflare. */
const ESPERA_INICIAL_MS = 5_000
const ESPERA_MAXIMA_MS = 2 * 60_000

fs.mkdirSync(PASTA, { recursive: true })

function acharCloudflared() {
  for (const c of CANDIDATOS) {
    if (c === 'cloudflared' || fs.existsSync(c)) return c
  }
  return null
}

const EXE = acharCloudflared()
if (!EXE) {
  console.error('cloudflared nao encontrado. Instale, ou ponha no PATH, e rode de novo.')
  process.exit(1)
}

function anotarEndereco(url) {
  // Escreve num arquivo temporário e RENOMEIA. Escrever direto deixa uma janela
  // de alguns microssegundos em que o arquivo está pela metade, e é exatamente
  // nessa janela que a ponte pode ler: ela leria um JSON quebrado e concluiria
  // que não há endereço público nenhum, recusando pareamento sem motivo.
  const temp = `${ARQUIVO}.tmp`
  fs.writeFileSync(temp, JSON.stringify({ url, quando: new Date().toISOString() }, null, 2))
  fs.renameSync(temp, ARQUIVO)
}

function esquecerEndereco() {
  // Sem túnel, o certo é NÃO ter endereço: um endereço morto no arquivo faria a
  // ponte aceitar parear um número que não teria como receber. Apagar devolve o
  // comando pro `.env`, e se ele também estiver velho o vigia marca a conexão em
  // erro, que é o estado verdadeiro.
  try {
    fs.rmSync(ARQUIVO, { force: true })
  } catch {
    /* já não estava lá */
  }
}

async function respondePor(url) {
  const r = await fetch(`${url.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(10_000) }).catch(() => null)
  return !!r?.ok
}

let processo = null
let encerrando = false

function derrubar() {
  if (processo && !processo.killed) {
    try {
      processo.kill()
    } catch {
      /* já morreu */
    }
  }
  processo = null
}

process.on('SIGINT', () => {
  encerrando = true
  console.log('\nencerrando: apagando o endereco e derrubando o tunel')
  esquecerEndereco()
  derrubar()
  process.exit(0)
})

/** Sobe o túnel e devolve o endereço que o Cloudflare deu, ou null. */
async function subir() {
  const registro = fs.createWriteStream(LOG, { flags: 'a' })
  processo = spawn(EXE, ['tunnel', '--url', ALVO, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'] })

  let endereco = null
  const achar = (pedaco) => {
    registro.write(pedaco)
    const m = String(pedaco).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
    if (m && !endereco) endereco = m[0]
  }
  processo.stdout.on('data', achar)
  processo.stderr.on('data', achar)

  processo.on('exit', (codigo) => {
    if (!encerrando) console.log(`o tunel caiu (codigo ${codigo})`)
    processo = null
  })

  // O nome sai nos primeiros segundos. Trinta é folga larga para uma rede ruim.
  for (let i = 0; i < 60; i++) {
    if (endereco) break
    if (!processo) return null
    await esperar(500)
  }
  if (!endereco) {
    derrubar()
    return null
  }

  // ANUNCIAR SÓ DEPOIS DE FUNCIONAR. O Cloudflare imprime o nome antes de a rota
  // estar pronta; escrever nesse instante faria o vigia apontar o webhook pra um
  // endereço que ainda dá 502 por alguns segundos.
  for (let i = 0; i < 20; i++) {
    if (await respondePor(endereco)) return endereco
    await esperar(1_000)
  }
  console.log(`o tunel subiu em ${endereco} mas o endereco nao respondeu; recomecando`)
  derrubar()
  return null
}

console.log(`supervisor do endereco publico: ${ALVO}`)
console.log(`o endereco de agora fica em ${path.relative(RAIZ, ARQUIVO)}`)

let espera = ESPERA_INICIAL_MS
for (;;) {
  esquecerEndereco()
  const endereco = await subir()

  if (!endereco) {
    console.log(`nao consegui subir; tentando de novo em ${Math.round(espera / 1000)}s`)
    await esperar(espera)
    espera = Math.min(espera * 2, ESPERA_MAXIMA_MS)
    continue
  }

  espera = ESPERA_INICIAL_MS
  anotarEndereco(endereco)
  console.log(`${new Date().toLocaleTimeString()}  no ar: ${endereco}`)

  let falhas = 0
  while (processo) {
    await esperar(CONFERIR_MS)
    if (!processo) break
    if (await respondePor(endereco)) {
      falhas = 0
      continue
    }
    falhas += 1
    console.log(`o endereco nao respondeu (${falhas}/${FALHAS_ATE_RECOMECAR})`)
    if (falhas >= FALHAS_ATE_RECOMECAR) {
      console.log('derrubando o tunel de proposito para subir com um nome novo')
      derrubar()
      break
    }
  }
}
