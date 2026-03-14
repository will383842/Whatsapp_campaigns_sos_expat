import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useSeriesDetail, usePauseSeries, useResumeSeries, useCancelSeries, useTranslateSeries, useActivateSeries, useDeactivateSeries } from '../hooks/useSeries'
import { useAuthContext } from '../contexts/AuthContext'
import { Pause, Play, XCircle, Copy, ArrowLeft, Loader2, AlertTriangle, Zap, Power, FileText, Users, ChevronDown, ChevronUp } from 'lucide-react'
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
  const [showGroups, setShowGroups] = useState(false)

  const { data: series, isLoading, error } = useSeriesDetail(id!)
  const { data: groups = [] } = useGroups()
  const pause = usePauseSeries()
  const resume = useResumeSeries()
  const cancel = useCancelSeries()
  const activate = useActivateSeries()
  const deactivate = useDeactivateSeries()
  const translate = useTranslateSeries(id!)

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

  // Compute targeted groups
  const targetedGroups = (() => {
    if (series.targeting_mode === 'by_language' && series.target_languages) {
      return groups.filter((g) => g.is_active && series.target_languages!.includes(g.language))
    }
    if (series.targeting_mode === 'by_group' && series.series_targets) {
      return series.series_targets.map((t) => t.group).filter(Boolean)
    }
    if (series.targeting_mode === 'hybrid') {
      const targetGroupIds = new Set((series.series_targets ?? []).map((t) => t.group_id))
      return groups.filter(
        (g) => g.is_active && (series.target_languages?.includes(g.language) || targetGroupIds.has(g.id))
      )
    }
    return []
  })()

  const totalMembers = targetedGroups.reduce((sum, g) => sum + (g.member_count ?? 0), 0)

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
              {series.status === 'draft' && (
                <button
                  onClick={() => activate.mutate(series.id)}
                  disabled={activate.isPending}
                  className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-60"
                >
                  {activate.isPending ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                  Activer
                </button>
              )}
              {series.status === 'scheduled' && (
                <button
                  onClick={() => deactivate.mutate(series.id)}
                  disabled={deactivate.isPending}
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-60"
                >
                  {deactivate.isPending ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  Brouillon
                </button>
              )}
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
              {series.translation_mode === 'auto' && series.status === 'draft' && (
                <button
                  onClick={() => translate.mutate()}
                  disabled={translate.isPending}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50"
                >
                  {translate.isPending ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                  Traduire (GPT-4o)
                </button>
              )}
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

        {/* Targeted groups section */}
        {targetedGroups.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowGroups((v) => !v)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              <Users size={15} className="text-green-600" />
              <span>{targetedGroups.length} groupes ciblés</span>
              <span className="text-xs text-gray-400">({totalMembers.toLocaleString('fr-FR')} membres)</span>
              {showGroups ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showGroups && (
              <div className="mt-3 max-h-64 overflow-y-auto border border-gray-100 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Groupe</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Communauté</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-500">Langue</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Membres</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {targetedGroups.map((g) => (
                      <tr key={g.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-800">{g.name}</td>
                        <td className="px-3 py-2 text-gray-400">{g.community_name ?? '—'}</td>
                        <td className="px-3 py-2 text-center">{LANG_FLAGS[g.language] ?? g.language}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{g.member_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
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
