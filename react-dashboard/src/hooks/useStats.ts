import { useQuery } from '@tanstack/react-query'
import api from '../api/client'
import type { Stats } from '../types/series'

export function useStats() {
  return useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: async () => {
      const res = await api.get('/api/stats')
      return res.data
    },
    refetchInterval: 30_000,
  })
}
