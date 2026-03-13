import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useSeriesDetail, usePauseSeries, useResumeSeries, useCancelSeries } from '../hooks/useSeries'
import { useAuthContext } from '../contexts/AuthContext'
import { Pause, Play, XCircle, Copy, ArrowLeft, Loader2, AlertTriangle } from 'lucide-react'
import PlanningTimeline from '../components/PlanningTimeline'
import SendReport from '../components/SendReport'
import { useGroups } from '../hooks/useSeries'
import { useQuery } from '@tanstack/react-query'
import api from '../api/client'
import type { CampaignMessage, MessageTranslation, SendLog } from '../types/series'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  draft:     { label: 'Brouillon', classes: 'bg-gray-100 text-gray-600' },
  scheduled: { label: 'Planifié',  classes: 'bg-blue-100 text-blue-700' },
  active:    { label: 'Actif',     classes: 'bg-green-100 text-green-700' },
  paused:    { label: 'En pause',  classes: 'bg-yellow-100 text-yellow-700' },
  completed: { label: 'Terminé',   classes: 'bg-emerald-100 text-emerald-700' },
  failed:    { label: 'Échoué',    classes: 'bg-red-100 text-red-700' },
}

const MSG_STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  pending: { label: 'En attente', classes: 'bg-gray-100 text-gray-500' },
  sending: { label: 'En cours',   classes: 'bg-blue-100 text-blue-600' },
  sent:    { label: 'Envoyé',     classes: 'bg-green-100 text-green-700' },
  failed:  { label: 'Échoué',     classes: 'bg-red-100 text-red-600' },
}

const LANG_FLAGS: Record<string, string> = {
  fr: '🇫🇷', en: '🇬🇧', de: '🇩🇪', pt: '🇧🇷',
  es: '🇪🇸', it: '🇮🇹', nl: '🇳🇱', ar: '🇸🇦', zh: '🇨🇳',
}

// ── WhatsApp formatting renderer ──────────────────────────────────────────────

function renderWhatsApp(text: string): string {
  return text
    .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
}

// ── Message accordion ─────────────────────────────────────────────────────────

function MessageAccordion({ msg, index }: { msg: CampaignMessage; index: number }) {
  const [open, setOpen] = useState(false)
  const [activeLang, setActiveLang] = useState<string>(
    msg.translations?.[0]?.language ?? ''
  )

  const st = MSG_STATUS_CONFIG[msg.status] ?? MSG_STATUS_CONFIG.pending
  const activeTranslation: MessageTranslation | undefined =
    msg.translations?.find((t) => t.language === activeLang) ?? msg.translations?.[0]

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-600 w-24 shrink-0">
          Message {index + 1}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.classes}`}>
          {st.label}
        </span>
        <span className="text-xs text-gray-400 flex-1 truncate">
          {msg.translations?.[0]?.content?.slice(0, 80) ?? '—'}
        </span>
        <span className="text-xs text-gray-400 shrink-0">
          {new Date(msg.scheduled_at).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
          })}
        </span>
        <span className="text-gray-400 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {/* Expanded */}
      {open && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-4">
          {msg.translations && msg.translations.length > 0 ? (
            <>
              {/* Language tabs */}
              <div className="flex gap-1 mb-3 flex-wrap">
                {msg.translations.map((t) => (
                  <button
                    key={t.language}
                    onClick={() => setActiveLang(t.language)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      activeLang === t.language
                        ? 'bg-green-600 text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {LANG_FLAGS[t.language] ?? ''} {t.language.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Content */}
              {activeTranslation && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {LANG_FLAGS[activeTranslation.language] ?? ''}{' '}
                      {activeTranslation.language.toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-400">
                      {activeTranslation.translated_by === 'gpt4o' ? '🤖 GPT-4o' : '✍️ Manuel'}
                    </span>
                  </div>
                  <p
                    className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: renderWhatsApp(activeTranslation.content),
                    }}
                  />
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400 italic">Aucune traduction disponible</p>
          )}

          {msg.sent_at && (
            <p className="mt-3 text-xs text-green-600">
              Envoyé le {new Date(msg.sent_at).toLocaleString('fr-FR')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'planning' | 'messages' | 'rapport'

export default function SeriesDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin } = useAuthContext()
  const [activeTab, setActiveTab] = useState<Tab>('planning')

  const { data: series, isLoading, error } = useSeriesDetail(id!)
  const { data: groups = [] } = useGroups()
  const pause = usePauseSeries()
  const resume = useResumeSeries()
  const cancel = useCancelSeries()

  const { data: logs = [] } = useQuery<SendLog[]>({
    queryKey: ['send-logs', id],
    queryFn: async () => {
      const res = await api.get(`/api/series/${id}/logs`)
      return res.data
    },
    enabled: !!id,
  })

  // ── Loading / error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={28} className="animate-spin text-green-500" />
      </div>
    )
  }

  if (error || !series) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertTriangle size={18} className="shrink-0" />
          Erreur lors du chargement de la série.
        </div>
      </div>
    )
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  const statusCfg = STATUS_CONFIG[series.status] ?? STATUS_CONFIG.draft
  const progress =
    series.total_messages > 0
      ? Math.round((series.sent_messages / series.total_messages) * 100)
      : 0

  const canPause  = series.status === 'active' || series.status === 'scheduled'
  const canResume = series.status === 'paused'
  const canCancel = series.status !== 'completed' && series.status !== 'failed'

  const tabs: { key: Tab; label: string }[] = [
    { key: 'planning',  label: 'Planning' },
    { key: 'messages',  label: 'Messages' },
    { key: 'rapport',   label: 'Rapport' },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-5 transition-colors"
      >
        <ArrowLeft size={15} />
        Retour aux séries
      </button>

      {/* Header card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          {/* Title + badges */}
          <div className="flex items-start gap-3">
            <span className="text-3xl">{series.type === 'drip' ? '💧' : '🎯'}</span>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{series.name}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-gray-400">
                  {series.type === 'drip' ? 'Drip' : 'One-shot'}
                </span>
                <span className="text-gray-200">•</span>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.classes}`}
                >
                  {statusCfg.label}
                </span>
              </div>
            </div>
          </div>

          {/* Action bar — admin only */}
          {isAdmin && (
            <div className="flex items-center gap-2 flex-wrap">
              {canPause && (
                <button
                  onClick={() => pause.mutate(series.id)}
                  disabled={pause.isPending}
                  className="flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 px-3 py-2 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-60"
                >
                  <Pause size={14} />
                  Pause
                </button>
              )}
              {canResume && (
                <button
                  onClick={() => resume.mutate(series.id)}
                  disabled={resume.isPending}
                  className="flex items-center gap-1.5 text-sm font-medium text-green-600 hover:text-green-700 px-3 py-2 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-60"
                >
                  <Play size={14} />
                  Reprendre
                </button>
              )}
              {canCancel && (
                <button
                  onClick={() => {
                    if (confirm('Annuler définitivement cette série ?')) {
                      cancel.mutate(series.id)
                    }
                  }}
                  disabled={cancel.isPending}
                  className="flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-600 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-60"
                >
                  <XCircle size={14} />
                  Annuler
                </button>
              )}
              <button
                onClick={() => navigate(`/series/create?duplicate=${series.id}`)}
                className="flex items-center gap-1.5 text-sm font-medium text-purple-600 hover:text-purple-700 px-3 py-2 rounded-lg hover:bg-purple-50 transition-colors"
              >
                <Copy size={14} />
                Dupliquer
              </button>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
            <span>
              {series.sent_messages} / {series.total_messages} messages envoyés
            </span>
            <span className="font-semibold">{progress}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Dates + languages */}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-gray-500">
          <span>
            <span className="font-medium text-gray-600">Début :</span>{' '}
            {new Date(series.starts_at).toLocaleDateString('fr-FR', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}
          </span>
          <span>
            <span className="font-medium text-gray-600">Fin :</span>{' '}
            {series.ends_at
              ? new Date(series.ends_at).toLocaleDateString('fr-FR', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })
              : 'Non définie'}
          </span>
          {series.target_languages && series.target_languages.length > 0 && (
            <span>
              <span className="font-medium text-gray-600">Langues ciblées :</span>{' '}
              {series.target_languages.map((l) => LANG_FLAGS[l] ?? l).join(' ')}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-5 flex gap-0">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? 'border-green-500 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        {activeTab === 'planning' && (
          <PlanningTimeline messages={series.messages ?? []} series={series} />
        )}

        {activeTab === 'messages' && (
          <div className="space-y-3">
            {(series.messages ?? []).length === 0 ? (
              <p className="text-center text-gray-400 py-8">
                Aucun message dans cette série.
              </p>
            ) : (
              [...(series.messages ?? [])]
                .sort((a, b) => a.order_index - b.order_index)
                .map((msg, i) => (
                  <MessageAccordion key={msg.id} msg={msg} index={i} />
                ))
            )}
          </div>
        )}

        {activeTab === 'rapport' && (
          <SendReport series={series} logs={logs} groups={groups} />
        )}
      </div>
    </div>
  )
}
