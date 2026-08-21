import { supabase } from '../supabaseClient'

// Upload das mídias usadas nos blocos de fluxo (imagem, vídeo, áudio, arquivo,
// sticker e imagem de cartão do carrossel).
//
// O arquivo vai pro Storage do Supabase e o fluxo guarda só a URL pública. É
// por isso que o mesmo campo aceita "Arquivo" ou "URL" na tela: os dois
// acabam virando a mesma coisa pro motor, uma URL que o WhatsApp busca.

const BUCKET = 'crm-fluxos'

/** Limites que o WhatsApp aplica. Recusar aqui evita descobrir no envio. */
export const LIMITES: Record<string, { mb: number; tipos: string; aceita: string }> = {
  imagem: { mb: 5, tipos: 'JPG, PNG, WebP', aceita: 'image/jpeg,image/png,image/webp' },
  video: { mb: 16, tipos: 'MP4', aceita: 'video/mp4' },
  audio: { mb: 16, tipos: 'MP3 e OGG', aceita: 'audio/mpeg,audio/ogg' },
  arquivo: { mb: 20, tipos: 'PDF, DOC, DOCX, TXT, XLS, XLSX', aceita: '.pdf,.doc,.docx,.txt,.xls,.xlsx' },
  sticker: { mb: 2, tipos: 'JPG, PNG, WebP', aceita: 'image/jpeg,image/png,image/webp' },
}

export async function enviarMidiaDoFluxo(clientId: string, kind: string, file: File): Promise<string> {
  const limite = LIMITES[kind]
  if (limite && file.size > limite.mb * 1024 * 1024) {
    throw new Error(`Arquivo de ${(file.size / 1024 / 1024).toFixed(1)} MB. O limite para ${kind} é ${limite.mb} MB.`)
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const caminho = `${clientId}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(caminho, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  })
  if (error) {
    // O erro cru do Storage ("Bucket not found") não diz o que fazer.
    if (/bucket/i.test(error.message)) {
      throw new Error(`O bucket "${BUCKET}" não existe no Storage do Supabase. Crie-o como público e tente de novo.`)
    }
    throw error
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(caminho)
  return data.publicUrl
}
