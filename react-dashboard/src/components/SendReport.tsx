import type { CampaignSeries, SendLog, Group } from '../types/series'

interface Props {
  series: CampaignSeries
  logs: SendLog[]
  groups: Group[]
}

function getCellStatus(logs: SendLog[], messageId: number, groupId: number): 'sent' | 'failed' | 'pending' | 'none' {
  const log = logs.find((l) => l.message_id === messageId && l.group_id === groupId)
  if (!log) return 'none'
  return log.status === 'sent' ? 'sent' : 'failed'
}

const CELL_DISPLAY: Record<string, { symbol: string; classes: string }> = {
  sent: { symbol: '✅', classes: 'text-green-600' },
  failed: { symbol: '❌', classes: 'text-red-500' },
  pending: { symbol: '○', classes: 'text-gray-400' },
  none: { symbol: '—', classes: 'text-gray-300' },
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

  // Determine targeted groups based on targeting mode
  let targetedGroups: Group[] = []
  if (series.targeting_mode === 'by_language' && series.target_languages) {
    targetedGroups = groups.filter(
      (g) => g.is_active && series.target_languages!.includes(g.language)
    )
  } else if (series.targeting_mode === 'by_group') {
    const logGroupIds = new Set(logs.map((l) => l.group_id))
    targetedGroups = groups.filter((g) => logGroupIds.has(g.id))
  } else {
    // hybrid or fallback: show all groups with logs
    const logGroupIds = new Set(logs.map((l) => l.group_id))
    targetedGroups = groups.filter((g) => logGroupIds.has(g.id) || g.is_active)
  }

  // Sent count per message
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
                  <td key={msg.id} className={`text-center px-3 py-2.5 ${cell.classes}`}>
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

      {logs.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-6">
          Aucun envoi enregistré pour cette série.
        </p>
      )}
    </div>
  )
}
