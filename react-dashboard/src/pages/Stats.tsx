import type { ReactNode } from 'react'
import { useStats } from '../hooks/useStats'
import { BarChart2, MessageSquare, CheckCircle, Users, Clock, AlertTriangle, Loader2 } from 'lucide-react'

// ── Language labels ────────────────────────────────────────────────────────────

const LANG_LABELS: Record<string, string> = {
  fr: '🇫🇷 Français',
  en: '🇬🇧 Anglais',
  de: '🇩🇪 Allemand',
  pt: '🇧🇷 Portugais',
  es: '🇪🇸 Espagnol',
  it: '🇮🇹 Italien',
  nl: '🇳🇱 Néerlandais',
  ar: '🇸🇦 Arabe',
  zh: '🇨🇳 Chinois',
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── KPI card ───────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon,
  bg,
}: {
  label: string
  value: string | number
  icon: ReactNode
  bg: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3 ${bg}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Stats() {
  const { data: stats, isLoading, error } = useStats()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={28} className="animate-spin text-green-500" />
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle size={18} className="shrink-0" />
          Erreur lors du chargement des statistiques.
        </div>
      </div>
    )
  }

  const maxLangCount = Math.max(...(stats.by_language?.map((l) => l.count) ?? [1]), 1)
  const maxDay = Math.max(...(stats.last_30_days?.map((d) => d.count) ?? [1]), 1)

  // Success rate color: green ≥ 95%, yellow 80–94%, red < 80%
  const successRate = stats.success_rate ?? 0
  const successRateColor =
    successRate >= 95
      ? 'text-emerald-600'
      : successRate >= 80
      ? 'text-yellow-600'
      : 'text-red-600'
  const successRateBg =
    successRate >= 95
      ? 'bg-emerald-50'
      : successRate >= 80
      ? 'bg-yellow-50'
      : 'bg-red-50'

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* Page title */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900">Statistiques</h1>
        <p className="text-sm text-gray-500 mt-0.5">Vue d'ensemble des campagnes WhatsApp</p>
      </div>

      {/* KPI cards — 4 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        <KpiCard
          label="Séries actives"
          value={stats.active_series}
          icon={<BarChart2 size={20} className="text-blue-600" />}
          bg="bg-blue-50"
        />
        <KpiCard
          label="Messages envoyés ce mois"
          value={stats.messages_sent_this_month.toLocaleString('fr-FR')}
          icon={<MessageSquare size={20} className="text-green-600" />}
          bg="bg-green-50"
        />
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div
            className={`inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3 ${successRateBg}`}
          >
            <CheckCircle size={20} className={successRateColor} />
          </div>
          <p className={`text-2xl font-bold ${successRateColor}`}>
            {successRate.toFixed(1)}%
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Taux de succès</p>
        </div>
        <KpiCard
          label="Groupes actifs"
          value={stats.active_groups}
          icon={<Users size={20} className="text-purple-600" />}
          bg="bg-purple-50"
        />
      </div>

      {/* Two column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

        {/* Left — Répartition par langue */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <BarChart2 size={16} className="text-gray-400" />
            Répartition par langue
          </h2>
          {!stats.by_language || stats.by_language.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune donnée</p>
          ) : (
            <div className="space-y-3">
              {[...(stats.by_language)]
                .sort((a, b) => b.count - a.count)
                .map(({ language, count }) => (
                  <div key={language} className="flex items-center gap-3">
                    <span className="text-sm w-36 shrink-0 text-gray-600 truncate">
                      {LANG_LABELS[language] ?? language}
                    </span>
                    <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.round((count / maxLangCount) * 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 w-10 text-right shrink-0">
                      {count.toLocaleString('fr-FR')}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Right — Prochain envoi */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Clock size={16} className="text-gray-400" />
            Prochain envoi
          </h2>

          {stats.next_send ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
                <Clock size={24} className="text-green-600" />
              </div>
              <p className="text-sm font-medium text-gray-800 capitalize">
                {formatDate(stats.next_send)}
              </p>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
              Aucun envoi planifié
            </div>
          )}

          {/* 30-day mini calendar grid */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-2">30 derniers jours</p>
            {!stats.last_30_days || stats.last_30_days.length === 0 ? (
              <p className="text-xs text-gray-300">Aucune donnée</p>
            ) : (
              <div className="flex gap-1 flex-wrap">
                {stats.last_30_days.map(({ date, count }) => {
                  const bg =
                    count === 0
                      ? 'bg-gray-100'
                      : count <= 2
                      ? 'bg-green-200'
                      : 'bg-green-500'
                  return (
                    <div
                      key={date}
                      title={`${new Date(date).toLocaleDateString('fr-FR')}: ${count} messages`}
                      className={`w-5 h-5 rounded-sm ${bg} cursor-default transition-colors`}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Full-width heatmap */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Activité des 30 derniers jours
        </h2>
        {!stats.last_30_days || stats.last_30_days.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune donnée</p>
        ) : (
          <div className="flex gap-1.5 flex-wrap">
            {stats.last_30_days.map(({ date, count }) => {
              const intensity = maxDay > 0 ? count / maxDay : 0
              const bg =
                count === 0
                  ? 'bg-gray-100'
                  : intensity < 0.25
                  ? 'bg-green-200'
                  : intensity < 0.5
                  ? 'bg-green-400'
                  : intensity < 0.75
                  ? 'bg-green-500'
                  : 'bg-green-700'
              return (
                <div
                  key={date}
                  title={`${new Date(date).toLocaleDateString('fr-FR')}: ${count} messages`}
                  className={`w-8 h-8 rounded-md ${bg} cursor-default transition-colors`}
                />
              )
            })}
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-3 text-xs text-gray-400">
          <span>Moins</span>
          {(['bg-gray-100', 'bg-green-200', 'bg-green-400', 'bg-green-500', 'bg-green-700'] as const).map(
            (c) => (
              <div key={c} className={`w-4 h-4 rounded-sm ${c}`} />
            )
          )}
          <span>Plus</span>
        </div>
      </div>
    </div>
  )
}
