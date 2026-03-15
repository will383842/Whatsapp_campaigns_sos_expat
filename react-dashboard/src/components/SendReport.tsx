import type { CampaignSeries, SendLog, Group } from '../types/series'

interface Props {
  series: CampaignSeries
  logs: SendLog[]
  groups: Group[]
}

function getCellStatus(logs: SendLog[], messageId: number, groupId: number): 'sent' | 'failed' | 'quota_exceeded' | 'pending' | 'none' {
  const log = logs.find((l) => l.message_id === messageId && l.group_id === groupId)
  if (!log) return 'none'
  if (log.status === 'sent') return 'sent'
  if (log.status === 'quota_exceeded') return 'quota_exceeded'
  return 'failed'
}

const CELL_DISPLAY: Record<string, { symbol: string; classes: string; label: string }> = {
  sent:           { symbol: '✅', classes: 'text-green-600',  label: 'Envoyé' },
  failed:         { symbol: '❌', classes: 'text-red-500',    label: 'Échoué' },
  quota_exceeded: { symbol: '🟠', classes: 'text-orange-500', label: 'En attente (quota)' },
  pending:        { symbol: '○',  classes: 'text-gray-400',   label: 'En attente' },
  none:           { symbol: '—',  classes: 'text-gray-300',   label: 'Non ciblé' },
}

export default function SendReport({ series, logs, groups }: Props) {
  const messages = series.messages ?? []

  if (messages.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        Aucun message dans cette série.
      </div>
    )
  }

  // Determine targeted groups based on targeting mode (respecting category filter)
  const matchesCat = (g: Group) =>
    !series.target_categories || series.target_categories.length === 0 || series.target_categories.includes(g.category as any)

  let targetedGroups: Group[] = []
  if (series.targeting_mode === 'by_language' && series.target_languages) {
    targetedGroups = groups.filter(
      (g) => g.is_active && series.target_languages!.includes(g.language) && matchesCat(g)
    )
  } else if (series.targeting_mode === 'by_group') {
    const logGroupIds = new Set(logs.map((l) => l.group_id))
    targetedGroups = groups.filter((g) => logGroupIds.has(g.id))
  } else {
    // hybrid or fallback: show all groups with logs
    const logGroupIds = new Set(logs.map((l) => l.group_id))
    targetedGroups = groups.filter((g) => logGroupIds.has(g.id) || g.is_active)
  }

  // Count per message
  const sentCountByMsg = messages.map((msg) =>
    logs.filter((l) => l.message_id === msg.id && l.status === 'sent').length
  )

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-3 py-2.5 font-medium text-gray-600 min-w-48">Groupe</th>
            {messages.map((msg, i) => (
              <th
                key={msg.id}
                className="text-center px-3 py-2.5 font-medium text-gray-600 min-w-16"
              >
                M{i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {targetedGroups.map((group) => (
            <tr key={group.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <td className="px-3 py-2.5 text-gray-700 font-medium truncate max-w-48">{group.name}</td>
              {messages.map((msg) => {
                const status = getCellStatus(logs, msg.id, group.id)
                const cell = CELL_DISPLAY[status]
                return (
                  <td key={msg.id} className={`text-center px-3 py-2.5 ${cell.classes}`} title={cell.label}>
                    {cell.symbol}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
        {/* Summary row */}
        <tfoot>
          <tr className="bg-gray-50 border-t-2 border-gray-200">
            <td className="px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">
              Total envoyé
            </td>
            {sentCountByMsg.map((count, i) => (
              <td key={i} className="text-center px-3 py-2.5 text-xs font-semibold text-gray-700">
                {count}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 px-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">✅ Envoyé</span>
        <span className="flex items-center gap-1">❌ Échoué</span>
        <span className="flex items-center gap-1">🟠 En attente quota</span>
        <span className="flex items-center gap-1 text-gray-400">○ En attente</span>
      </div>

      {logs.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-6">
          Aucun envoi enregistré pour cette série.
        </p>
      )}
    </div>
  )
}
