import { useState } from 'react'
import { Search } from 'lucide-react'
import type { Group } from '../types/series'

interface Props {
  selected: number[]
  onChange: (ids: number[]) => void
  groups: Group[]
}

const LANG_FLAGS: Record<string, string> = {
  fr: '🇫🇷',
  en: '🇬🇧',
  de: '🇩🇪',
  pt: '🇧🇷',
  es: '🇪🇸',
  it: '🇮🇹',
  nl: '🇳🇱',
  ar: '🇸🇦',
  zh: '🇨🇳',
}

export default function GroupSelector({ selected, onChange, groups }: Props) {
  const [search, setSearch] = useState('')

  const activeGroups = groups.filter((g) => g.is_active)
  const filtered = activeGroups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    g.language.toLowerCase().includes(search.toLowerCase())
  )

  const toggle = (id: number) => {
    if (selected.includes(id)) {
      onChange(selected.filter((i) => i !== id))
    } else {
      onChange([...selected, id])
    }
  }

  const selectAll = () => onChange(filtered.map((g) => g.id))
  const deselectAll = () => onChange([])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">
          Groupes sélectionnés : <span className="text-green-600 font-semibold">{selected.length}</span>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="text-xs text-green-600 hover:text-green-700 font-medium"
          >
            Tout sélectionner
          </button>
          <span className="text-gray-300">|</span>
          <button
            type="button"
            onClick={deselectAll}
            className="text-xs text-gray-500 hover:text-gray-700 font-medium"
          >
            Tout désélectionner
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un groupe..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
      </div>

      {/* List */}
      <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">Aucun groupe trouvé</p>
        ) : (
          filtered.map((group) => {
            const isSelected = selected.includes(group.id)
            return (
              <label
                key={group.id}
                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                  isSelected ? 'bg-green-50' : 'hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(group.id)}
                  className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <span className="text-base">{LANG_FLAGS[group.language] ?? '🌍'}</span>
                <span className="text-sm text-gray-800 flex-1 truncate">{group.name}</span>
                <span className="text-xs text-gray-400 shrink-0">{group.member_count} membres</span>
              </label>
            )
          })
        )}
      </div>

      <p className="text-xs text-gray-500">
        {filtered.length} groupe{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''} sur {activeGroups.length} actifs
      </p>
    </div>
  )
}
