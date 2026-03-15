import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import type { CampaignSeries, Group, QueueStatus } from '../types/series'

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

// ── Activate (draft → scheduled) ─────────────────────────────────────────────

export function useActivateSeries() {
  const qc = useQueryClient()
  return useMutation<CampaignSeries, Error, number>({
    mutationFn: async (id) => {
      const res = await api.post(`/api/series/${id}/activate`)
      return res.data
    },
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: ['series'] })
      qc.invalidateQueries({ queryKey: ['series', id] })
    },
  })
}

// ── Deactivate (scheduled → draft) ──────────────────────────────────────────

export function useDeactivateSeries() {
  const qc = useQueryClient()
  return useMutation<CampaignSeries, Error, number>({
    mutationFn: async (id) => {
      const res = await api.post(`/api/series/${id}/deactivate`)
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

// ── Queue status ──────────────────────────────────────────────────────────────

export function useQueueStatus() {
  return useQuery<QueueStatus>({
    queryKey: ['queue-status'],
    queryFn: async () => {
      const res = await api.get('/api/queue/status')
      return res.data
    },
    refetchInterval: 30000, // poll every 30s
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

// ── Sync groups from WhatsApp ─────────────────────────────────────────────────

interface SyncResult {
  success: boolean
  created: number
  updated: number
  skipped: number
  total_in_db: number
}

export function useSyncGroups() {
  const qc = useQueryClient()
  return useMutation<SyncResult, Error, void>({
    mutationFn: async () => {
      const res = await api.post('/api/groups/sync')
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}

// ── Update group ──────────────────────────────────────────────────────────────

export function useUpdateGroup() {
  const qc = useQueryClient()
  return useMutation<Group, Error, { id: number; data: Partial<Group> }>({
    mutationFn: async ({ id, data }) => {
      const res = await api.put(`/api/groups/${id}`, data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}

// ── WhatsApp connection status ────────────────────────────────────────────────

export interface WhatsAppStatus {
  status: string
  connected: boolean
  phone: string | null
  error?: string
}

export function useWhatsAppStatus() {
  return useQuery<WhatsAppStatus>({
    queryKey: ['whatsapp-status'],
    queryFn: async () => {
      const res = await api.get('/api/whatsapp/status')
      return res.data
    },
    refetchInterval: 30000, // poll every 30s
  })
}

export interface WhatsAppQr {
  connected: boolean
  qr: string | null
  error?: string
}

export function useWhatsAppQr(enabled: boolean) {
  return useQuery<WhatsAppQr>({
    queryKey: ['whatsapp-qr'],
    queryFn: async () => {
      const res = await api.get('/api/whatsapp/qr')
      return res.data
    },
    enabled,
    refetchInterval: 5000, // poll every 5s when waiting for QR
  })
}

export function useWhatsAppRestart() {
  const qc = useQueryClient()
  return useMutation<{ success: boolean; message: string; connected: boolean }, Error, void>({
    mutationFn: async () => {
      const res = await api.post('/api/whatsapp/restart')
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-status'] })
      qc.invalidateQueries({ queryKey: ['whatsapp-qr'] })
    },
  })
}

// ── Group participants ────────────────────────────────────────────────────────

export interface Participant {
  phone: string
  admin: 'admin' | 'superadmin' | null
}

export interface ParticipantsResult {
  success: boolean
  group_name: string
  count: number
  participants: Participant[]
}

export function useGroupParticipants(groupId: number | null) {
  return useQuery<ParticipantsResult>({
    queryKey: ['group-participants', groupId],
    queryFn: async () => {
      const res = await api.get(`/api/groups/${groupId}/participants`)
      return res.data
    },
    enabled: !!groupId,
  })
}

// ── Group members (from database) ────────────────────────────────────────────

export interface StoredMember {
  id: number
  phone: string
  push_name: string | null
  display_name: string
  is_admin: boolean
  welcome_sent: boolean
  joined_at: string | null
}

export interface MembersResult {
  count: number
  members: StoredMember[]
}

export function useGroupMembers(groupId: number | null) {
  return useQuery<MembersResult>({
    queryKey: ['group-members', groupId],
    queryFn: async () => {
      const res = await api.get(`/api/groups/${groupId}/members`)
      return res.data
    },
    enabled: !!groupId,
  })
}
