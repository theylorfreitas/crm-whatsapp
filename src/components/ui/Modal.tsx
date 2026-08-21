import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
}

// Casca genérica de modal: fundo escurecido e desfocado + fechar por X,
// backdrop ou Esc. Vai pro <body> por portal: agora que as superfícies do app
// usam backdrop-filter — que cria bloco de contenção pra position:fixed — um
// modal aberto de dentro de um cartão ficaria preso ao tamanho do cartão.
export function Modal({ open, onClose, children, className }: ModalProps) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-md supports-[backdrop-filter]:bg-black/35"
        onClick={onClose}
      />
      <div className={`relative w-full ${className ?? ''}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  )
}
