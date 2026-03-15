import type { CampaignMessage, CampaignSeries } from '../types/series'

interface Props {
  messages: CampaignMessage[]
  series: CampaignSeries
}

const STATUS_ICON: Record<string, { icon: string; color: string }> = {
  sent: { icon: '✓', color: 'bg-green-500 text-white' },
  failed: { icon: '✕', color: 'bg-red-500 text-white' },
  sending: { icon: '●', color: 'bg-blue-500 text-white animate-pulse' },
  pending: { icon: '○', color: 'bg-gray-200 text-gray-400' },
  partially_sent: { icon: '◐', color: 'bg-gradient-to-r from-green-500 to-orange-400 text-white' },
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function groupByMonth(messages: CampaignMessage[]) {
  const groups: Record<string, CampaignMessage[]> = {}
  messages.forEach((msg) => {
    const key = new Date(msg.scheduled_at).toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric',
    })
    if (!groups[key]) groups[key] = []
    groups[key].push(msg)
  })
  return groups
}

export default function PlanningTimeline({ messages, series }: Props) {
  if (!messages || messages.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p>Aucun message planifié</p>
      </div>
    )
  }

  const sorted = [...messages].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  )
  const byMonth = groupByMonth(sorted)

  return (
    <div className="space-y-6">
      {Object.entries(byMonth).map(([month, msgs]) => (
        <div key={month}>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
            {month}
          </h3>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200" />

            <div className="space-y-3">
              {msgs.map((msg) => {
                const status = msg.status ?? 'pending'
                const si = STATUS_ICON[status] ?? STATUS_ICON.pending
                const msgIndex = sorted.indexOf(msg) + 1
                const primaryTranslation =
                  msg.translations?.find((t) => t.language === series.source_language) ??
                  msg.translations?.[0]

                // Check if message was rescheduled (carry-over)
                const isRescheduled =
                  msg.original_scheduled_at &&
                  msg.original_scheduled_at !== msg.scheduled_at

                return (
                  <div key={msg.id} className="flex items-start gap-4 pl-0">
                    {/* Icon */}
                    <div
                      className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 border-2 border-white shadow-sm ${si.color}`}
                    >
                      {si.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-xs font-semibold text-gray-600">
                            Message {msgIndex}
                          </span>
                          {status === 'partially_sent' && (
                            <span className="ml-2 text-xs font-medium text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                              Partiellement envoyé
                            </span>
                          )}
                          {primaryTranslation && (
                            <p className="text-sm text-gray-700 mt-0.5 line-clamp-2">
                              {primaryTranslation.content}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-medium text-gray-700">
                            {formatDate(msg.scheduled_at)}
                          </p>
                          <p className="text-xs text-gray-400">{formatTime(msg.scheduled_at)}</p>
                        </div>
                      </div>
                      {isRescheduled && (
                        <p className="text-xs text-orange-500 mt-1">
                          ↻ Initialement prévu le {formatDate(msg.original_scheduled_at!)}, reporté (quota)
                        </p>
                      )}
                      {msg.sent_at && (
                        <p className="text-xs text-green-600 mt-1">
                          Envoyé le {formatDate(msg.sent_at)}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
