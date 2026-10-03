import { Navigate, Route, Routes } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Painel from './pages/Painel'
import Espaco from './pages/Espaco'
import Lixo from './pages/Lixo'
import Antigos from './pages/Antigos'
import Duplicados from './pages/Duplicados'
import Suspeitos from './pages/Suspeitos'
import Historico from './pages/Historico'
import Configuracoes from './pages/Configuracoes'

export default function App() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <Routes>
          <Route path="/" element={<Painel />} />
          <Route path="/espaco" element={<Espaco />} />
          <Route path="/lixo" element={<Lixo />} />
          <Route path="/antigos" element={<Antigos />} />
          <Route path="/duplicados" element={<Duplicados />} />
          <Route path="/suspeitos" element={<Suspeitos />} />
          <Route path="/historico" element={<Historico />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
