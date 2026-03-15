export type SeriesStatus = 'draft' | 'scheduled' | 'active' | 'completed' | 'paused' | 'failed'
export type SeriesType = 'drip' | 'one_shot'
export type TargetingMode = 'by_language' | 'by_group' | 'hybrid'
export type MessageStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'partially_sent'

export interface User {
  id: number
  name: string
  email: string
  role: 'admin' | 'viewer'
  locale: string
}

export type GroupCategory = 'chatter' | 'client' | 'avocat' | 'blogger' | 'influencer' | 'group_admin' | 'expatrie_aidant'

export interface Group {
  id: number
  whatsapp_group_id: string
  name: string
  community_name: string | null
  language: string
  category: GroupCategory | null
  whatsapp_number_id: number | null
  country: string | null
  continent: string | null
  member_count: number
  is_active: boolean
  welcome_enabled: boolean
  welcome_message: string | null
}

export interface MessageTranslation {
  id: number
  message_id: number
  language: string
  content: string
  translated_by: 'manual' | 'gpt4o'
}

export interface CampaignMessage {
  id: number
  series_id: number
  order_index: number
  scheduled_at: string
  original_scheduled_at: string | null
  status: MessageStatus
  sent_at: string | null
  translations: MessageTranslation[]
}

export interface CampaignSeries {
  id: number
  name: string
  type: SeriesType
  status: SeriesStatus
  targeting_mode: TargetingMode
  target_languages: string[] | null
  target_categories: GroupCategory[] | null
  send_days: string[] | null
  messages_per_week: number | null
  send_time: string
  timezone: string
  starts_at: string
  ends_at: string | null
  total_messages: number
  sent_messages: number
  translation_mode: 'auto' | 'manual'
  source_language: string | null
  notes: string | null
  messages?: CampaignMessage[]
  series_targets?: { id: number; group_id: number; group: Group }[]
  created_at: string
}

export interface SendLog {
  id: number
  message_id: number
  group_id: number
  language: string
  content_sent: string
  status: 'sent' | 'failed' | 'quota_exceeded'
  sent_at: string | null
  error_message: string | null
  group?: Group
}

export interface Stats {
  active_series: number
  messages_sent_this_month: number
  success_rate: number
  active_groups: number
  by_language: { language: string; count: number }[]
  next_send: string | null
  last_30_days: { date: string; count: number }[]
}

export interface QueueStatusItem {
  message_id: number
  series_id: number
  series_name: string
  status: MessageStatus
  original_scheduled_at: string | null
  scheduled_at: string
  groups_sent: number
  groups_remaining: number
  groups_total: number
}

export interface QueueStatus {
  pending_messages: number
  partially_sent_messages: number
  sending_messages: number
  next_scheduled_at: string | null
  details: QueueStatusItem[]
}
