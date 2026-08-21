import { Routes, Route, Navigate } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { CrmPage } from './pages/CrmPage'

// AS ROTAS DO CRM.
//
// Três caminhos e um redirecionamento. `section` é a seção do menu (chats,
// fluxos, kanban…) e `subsection` é o que ela abre por dentro: o id de um fluxo,
// de um quadro, ou a aba das Configurações.
//
// A raiz manda para /crm porque não há mais nada nesta instalação. Quem entrar
// pelo endereço sem caminho nenhum quer o CRM.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/crm" element={<CrmPage />} />
      <Route path="/crm/:section" element={<CrmPage />} />
      <Route path="/crm/:section/:subsection" element={<CrmPage />} />
      <Route path="*" element={<Navigate to="/crm" replace />} />
    </Routes>
  )
}
