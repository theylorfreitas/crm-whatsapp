import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Utilitário padrão do shadcn: junta classes condicionais (clsx) e resolve
// conflitos de Tailwind mantendo a última (twMerge) — assim `cn('p-2', 'p-4')`
// vira 'p-4' em vez de deixar as duas brigando na cascata.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
