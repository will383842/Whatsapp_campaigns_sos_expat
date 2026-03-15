import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import type { WhatsAppNumber } from '../types/whatsappNumber'

// ── List all numbers ─────────────────────────────────────────────────────────

export function useWhatsAppNumbers() {
  return useQuery<WhatsAppNumber[]>({
    queryKey: ['whatsapp-numbers'],
    queryFn: async () => {
      const res = await api.get('/api/whatsapp-numbers')
      return res.data
    },
    refetchInterval: 10_000, // poll every 10s
  })
}

// ── Create ───────────────────────────────────────────────────────────────────

interface CreatePayload {
  name: string
  phone: string
  slug?: string
  daily_max?: number
}

interface CreateResult {
  number: WhatsAppNumber
  qr: string | null
}

export function useCreateWhatsAppNumber() {
  const qc = useQueryClient()
  return useMutation<CreateResult, Error, CreatePayload>({
    mutationFn: async (data) => {
      const res = await api.post('/api/whatsapp-numbers', data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-numbers'] })
    },
  })
}

// ── Update ───────────────────────────────────────────────────────────────────

export function useUpdateWhatsAppNumber() {
  const qc = useQueryClient()
  return useMutation<WhatsAppNumber, Error, { id: number; data: Partial<WhatsAppNumber> }>({
    mutationFn: async ({ id, data }) => {
      const res = await api.put(`/api/whatsapp-numbers/${id}`, data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-numbers'] })
    },
  })
}

// ── Delete ───────────────────────────────────────────────────────────────────

export function useDeleteWhatsAppNumber() {
  const qc = useQueryClient()
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await api.delete(`/api/whatsapp-numbers/${id}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-numbers'] })
    },
  })
}

// ── Pause ────────────────────────────────────────────────────────────────────

export function usePauseWhatsAppNumber() {
  const qc = useQueryClient()
  return useMutation<WhatsAppNumber, Error, number>({
    mutationFn: async (id) => {
      const res = await api.post(`/api/whatsapp-numbers/${id}/pause`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-numbers'] })
    },
  })
}

// ── Resume ───────────────────────────────────────────────────────────────────

export function useResumeWhatsAppNumber() {
  const qc = useQueryClient()
  return useMutation<WhatsAppNumber, Error, number>({
    mutationFn: async (id) => {
      const res = await api.post(`/api/whatsapp-numbers/${id}/resume`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-numbers'] })
    },
  })
}

// ── Restart ──────────────────────────────────────────────────────────────────

interface RestartResult {
  number: WhatsAppNumber
  qr: string | null
}

export function useRestartWhatsAppNumber() {
  const qc = useQueryClient()
  return useMutation<RestartResult, Error, { id: number; force?: boolean }>({
    mutationFn: async ({ id, force }) => {
      const res = await api.post(`/api/whatsapp-numbers/${id}/restart`, { force })
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-numbers'] })
      qc.invalidateQueries({ queryKey: ['whatsapp-number-qr'] })
    },
  })
}

// ── QR Code ──────────────────────────────────────────────────────────────────

interface QrResult {
  connected: boolean
  qr: string | null
}

export function useWhatsAppNumberQr(id: number | null) {
  return useQuery<QrResult>({
    queryKey: ['whatsapp-number-qr', id],
    queryFn: async () => {
      const res = await api.get(`/api/whatsapp-numbers/${id}/qr`)
      return res.data
    },
    enabled: !!id,
    refetchInterval: 5_000, // poll every 5s
    staleTime: 0,
    gcTime: 0,
  })
}

// ── Set Default ──────────────────────────────────────────────────────────────

export function useSetDefaultWhatsAppNumber() {
  const qc = useQueryClient()
  return useMutation<WhatsAppNumber, Error, number>({
    mutationFn: async (id) => {
      const res = await api.post(`/api/whatsapp-numbers/${id}/set-default`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-numbers'] })
    },
  })
}
