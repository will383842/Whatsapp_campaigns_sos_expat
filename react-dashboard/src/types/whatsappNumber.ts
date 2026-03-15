export interface WhatsAppNumber {
  id: number
  slug: string
  name: string
  phone: string
  status: 'active' | 'paused' | 'banned' | 'disconnected'
  is_default: boolean
  is_rotation_enabled: boolean
  daily_max: number
  daily_sent: number
  messages_total: number
  ban_count: number
  last_connected_at: string | null
  last_error: string | null
  created_at: string
  // Real-time fields (from Baileys via Laravel enrichment)
  connected: boolean
  has_qr: boolean
  // Warmup info (from Baileys health)
  effective_daily_max?: number
  warmup?: {
    active: boolean
    day: number
    limit: number
    endsDay: number
  }
}
