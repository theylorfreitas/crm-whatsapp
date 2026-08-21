import { QueryClient } from '@tanstack/react-query'

// Cliente único do react-query pro app inteiro. staleTime curto: as telas
// recarregam dados ao voltar o foco, mas sem martelar o banco a cada render.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
