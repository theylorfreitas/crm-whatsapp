import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 5183 não é enfeite: é a porta que o CORS_ORIGIN do backend, o site_url
    // do Supabase e o devUrl do Tauri já esperam. No padrão do Vite (5173) o
    // navegador toma bloqueio de CORS em toda chamada ao backend, e o login
    // volta pra uma URL que não existe.
    //
    // strictPort faz a subida FALHAR quando a 5183 está ocupada. Sem ele o
    // Vite escorrega pra próxima porta livre e devolve o mesmo problema, só
    // que disfarçado de "abriu normal".
    port: 5183,
    strictPort: true,
    // Escutar nos DOIS loopbacks, e não só no que o Node escolher sozinho.
    //
    // No padrão, o Vite abre em `localhost`, e no Windows isso vira só `::1`:
    // `http://localhost:5183` abre e `http://127.0.0.1:5183` leva conexão
    // recusada. Quem tem IPv6 desligado, ou um navegador que tenta o IPv4
    // primeiro e não volta atrás, vê "o localhost não abre" com o servidor
    // no ar do lado.
    //
    // `::` e não `0.0.0.0`: o segundo é IPv4 puro e QUEBRA o `::1`, trocando
    // um lado quebrado pelo outro. `::` é dupla pilha e atende os três
    // endereços, conferido um a um.
    //
    // Isso também abre a porta na rede local, que numa máquina de trabalho é
    // o que já se quer pra testar no celular. Em rede pública, não.
    host: '::',
  },
  resolve: {
    // "@" aponta pra src — é o alias que os componentes do shadcn assumem
    // (`@/lib/utils`, `@/components/ui/...`). O TypeScript tem o mesmo
    // mapeamento em tsconfig.app.json; os dois precisam concordar.
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
