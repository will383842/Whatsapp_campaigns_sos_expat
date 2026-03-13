import { useNavigate } from 'react-router-dom'
import {
  Play,
  Pause,
  X,
  Copy,
  Pencil,
  ChevronRight,
  Clock,
  Globe,
  Users,
} from 'lucide-react'
import type { CampaignSeries } from '../types/series'
import {
  usePauseSeries,
  useResumeSeries,
  useCancelSeries,
} from '../hooks/useSeries'
import { useAuthContext } from '../contexts/AuthContext'

interface Props {
  series: CampaignSeries
}

const STATUS_CONFIG: Record<
  string,
  { label: string; classes: string }
> = {
  draft: { label: 'Brouillon', classes: 'bg-gray-100 text-gray-600' },
  scheduled: { label: 'Planifié', classes: 'bg-blue-100 text-blue-700' },
  active: { label: 'Actif', classes: 'bg-green-100 text-green-700' },
  completed: { label: 'Terminé', classes: 'bg-purple-100 text-purple-700' },
  paused: { label: 'En pause', classes: 'bg-amber-100 text-amber-700' },
  failed: { label: 'Échoué', classes: 'bg-red-100 text-red-700' },
}

const LANG_FLAGS: Record<string, string> = {
  fr: '🇫🇷', en: '🇬🇧', de: '🇩🇪', pt: '🇧🇷', es: '🇪🇸',
  it: '🇮🇹', nl: '🇳🇱', ar: '🇸🇦', zh: '🇨🇳',
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  })
}

export default function SeriesCard({ series }: Props) {
  const navigate = useNavigate()
  const { isAdmin } = useAuthContext()

  const pause = usePauseSeries()
  const resume = useResumeSeries()
  const cancel = useCancelSeries()

  const statusCfg = STATUS_CONFIG[series.status] ?? STATUS_CONFIG.draft
  const progress = series.total_messages > 0
    ? Math.round((series.sent_messages / series.total_messages) * 100)
    : 0

  const canPause = series.status === 'active' || series.status === 'scheduled'
  const canResume = series.status === 'paused'
  const canCancel = series.status !== 'completed' && series.status !== 'failed'

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl shrink-0">
            {series.type === 'drip' ? '💧' : '🎯'}
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{series.name}</h3>
            <span className="text-xs text-gray-400">
              {series.type === 'drip' ? 'Drip' : 'One-shot'}
            </span>
          </div>
        </div>
        <span
          className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${statusCfg.classes}`}
        >
          {statusCfg.label}
        </span>
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          <span>{series.sent_messages} / {series.total_messages} messages envoyés</span>
          <span className="font-medium">{progress}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              series.status === 'failed' ? 'bg-red-400' : 'bg-green-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        {series.target_languages && series.target_languages.length > 0 ? (
          <span className="flex items-center gap-1">
            <Globe size={12} />
            {series.target_languages.map((l) => LANG_FLAGS[l] ?? l).join(' ')}
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <Users size={12} />
            Par groupe
          </span>
        )}
        {series.send_time && (
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {series.send_time}
          </span>
        )}
        {series.ends_at && (
          <span>Fin : {formatDate(series.ends_at)}</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-gray-100">
        <button
          onClick={() => navigate(`/series/${series.id}`)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:text-gray-900 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          Détail
          <ChevronRight size={12} />
        </button>

        {isAdmin && (
          <>
            <button
              onClick={() => navigate(`/series/${series.id}?edit=1`)}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <Pencil size={12} />
              Modifier
            </button>

            <button
              onClick={() => navigate(`/series/create?duplicate=${series.id}`)}
              className="flex items-center gap-1.5 text-xs font-medium text-purple-600 hover:text-purple-700 px-2.5 py-1.5 rounded-lg hover:bg-purple-50 transition-colors"
            >
              <Copy size={12} />
              Dupliquer
            </button>

            {canPause && (
              <button
                onClick={() => pause.mutate(series.id)}
                disabled={pause.isPending}
                className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 px-2.5 py-1.5 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-60"
              >
                <Pause size={12} />
                Pause
              </button>
            )}

            {canResume && (
              <button
                onClick={() => resume.mutate(series.id)}
                disabled={resume.isPending}
                className="flex items-center gap-1.5 text-xs font-medium text-green-600 hover:text-green-700 px-2.5 py-1.5 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-60"
              >
                <Play size={12} />
                Reprendre
              </button>
            )}

            {canCancel && (
              <button
                onClick={() => {
                  if (confirm('Annuler cette série ?')) cancel.mutate(series.id)
                }}
                disabled={cancel.isPending}
                className="flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-60 ml-auto"
              >
                <X size={12} />
                Annuler
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
