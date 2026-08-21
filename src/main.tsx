import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ModoGravacaoProvider } from './context/ModoGravacao'
import { queryClient } from './lib/queryClient'
import { FiltroDeVidro } from './components/ui/liquid-glass'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* O filtro do vidro líquido entra UMA vez no documento: as peças de vidro
        o citam pelo id. Montado dentro de um layout ele nasceria de novo a cada
        troca de tela, e id repetido num documento é comportamento indefinido. */}
    <FiltroDeVidro />
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          {/* Por fora do AuthProvider: o modo gravação precisa valer também na
              tela de login, que é onde um e-mail aparece digitado em texto puro. */}
          <ModoGravacaoProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ModoGravacaoProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
