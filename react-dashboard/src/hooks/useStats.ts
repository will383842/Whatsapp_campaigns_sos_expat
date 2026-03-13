import { useQuery } from '@tanstack/react-query'
import api from '../api/client'
import type { Stats, User } from '../types/series'

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

export function useAuth() {
  return useQuery<User>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await api.get('/api/auth/me')
      return res.data
    },
    retry: false,
  })
}
