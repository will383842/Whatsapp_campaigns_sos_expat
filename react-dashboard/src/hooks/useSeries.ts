import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import type { CampaignSeries, Group } from '../types/series'

// ── Series list ──────────────────────────────────────────────────────────────

export function useSeriesList() {
  return useQuery<CampaignSeries[]>({
    queryKey: ['series'],
    queryFn: async () => {
      const res = await api.get('/api/series')
      return Array.isArray(res.data) ? res.data : (res.data?.data ?? [])
    },
  })
}

// ── Series detail ─────────────────────────────────────────────────────────────

export function useSeriesDetail(id: number | string) {
  return useQuery<CampaignSeries>({
    queryKey: ['series', id],
    queryFn: async () => {
      const res = await api.get(`/api/series/${id}`)
      return res.data
    },
    enabled: !!id,
  })
}

// ── Create ────────────────────────────────────────────────────────────────────

export function useCreateSeries() {
  const qc = useQueryClient()
  return useMutation<CampaignSeries, Error, Partial<CampaignSeries>>({
    mutationFn: async (data) => {
      const res = await api.post('/api/series', data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['series'] })
    },
  })
}

// ── Update ────────────────────────────────────────────────────────────────────

export function useUpdateSeries() {
  const qc = useQueryClient()
  return useMutation<CampaignSeries, Error, { id: number; data: Partial<CampaignSeries> }>({
    mutationFn: async ({ id, data }) => {
      const res = await api.put(`/api/series/${id}`, data)
      return res.data
    },
    onSuccess: (_res, variables) => {
      qc.invalidateQueries({ queryKey: ['series'] })
      qc.invalidateQueries({ queryKey: ['series', variables.id] })
    },
  })
}

// ── Delete ────────────────────────────────────────────────────────────────────

export function useDeleteSeries() {
  const qc = useQueryClient()
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await api.delete(`/api/series/${id}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['series'] })
    },
  })
}

// ── Schedule ──────────────────────────────────────────────────────────────────

export function useScheduleSeries() {
  const qc = useQueryClient()
  return useMutation<CampaignSeries, Error, number>({
    mutationFn: async (id) => {
      const res = await api.post(`/api/series/${id}/schedule`)
      return res.data
    },
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: ['series'] })
      qc.invalidateQueries({ queryKey: ['series', id] })
    },
  })
}

// ── Pause ─────────────────────────────────────────────────────────────────────

export function usePauseSeries() {
  const qc = useQueryClient()
  return useMutation<CampaignSeries, Error, number>({
    mutationFn: async (id) => {
      const res = await api.post(`/api/series/${id}/pause`)
      return res.data
    },
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: ['series'] })
      qc.invalidateQueries({ queryKey: ['series', id] })
    },
  })
}

// ── Resume ────────────────────────────────────────────────────────────────────

export function useResumeSeries() {
  const qc = useQueryClient()
  return useMutation<CampaignSeries, Error, number>({
    mutationFn: async (id) => {
      const res = await api.post(`/api/series/${id}/resume`)
      return res.data
    },
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: ['series'] })
      qc.invalidateQueries({ queryKey: ['series', id] })
    },
  })
}

// ── Cancel ────────────────────────────────────────────────────────────────────

export function useCancelSeries() {
  const qc = useQueryClient()
  return useMutation<CampaignSeries, Error, number>({
    mutationFn: async (id) => {
      const res = await api.post(`/api/series/${id}/cancel`)
      return res.data
    },
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: ['series'] })
      qc.invalidateQueries({ queryKey: ['series', id] })
    },
  })
}

// ── Translate messages ────────────────────────────────────────────────────────

export function useTranslateSeries(id: number | string) {
  const qc = useQueryClient()
  return useMutation<CampaignSeries, Error, void>({
    mutationFn: async () => {
      const res = await api.post(`/api/series/${id}/messages/translate`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['series', id] })
    },
  })
}

// ── Groups ────────────────────────────────────────────────────────────────────

export function useGroups() {
  return useQuery<Group[]>({
    queryKey: ['groups'],
    queryFn: async () => {
      const res = await api.get('/api/groups')
      return res.data
    },
  })
}
