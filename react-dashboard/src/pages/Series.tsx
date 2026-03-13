import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, AlertTriangle, Loader2 } from 'lucide-react'
import { useSeriesList } from '../hooks/useSeries'
import { useAuthContext } from '../contexts/AuthContext'
import SeriesCard from '../components/SeriesCard'
import type { SeriesStatus } from '../types/series'

type Filter = 'all' | SeriesStatus

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  { key: 'draft', label: 'Brouillon' },
  { key: 'scheduled', label: 'Planifiées' },
  { key: 'active', label: 'Actives' },
  { key: 'paused', label: 'En pause' },
  { key: 'completed', label: 'Terminées' },
  { key: 'failed', label: 'Échouées' },
]

export default function Series() {
  const { data: series, isLoading, error } = useSeriesList()
  const { isAdmin } = useAuthContext()
  const [filter, setFilter] = useState<Filter>('all')

  const filtered = (series ?? []).filter(
    (s) => filter === 'all' || s.status === filter
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Séries de campagne</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {series?.length ?? 0} série{(series?.length ?? 0) > 1 ? 's' : ''} au total
          </p>
        </div>
        {isAdmin && (
          <Link
            to="/series/create"
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Plus size={16} />
            Nouvelle série
          </Link>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === key
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-green-500" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertTriangle size={18} className="shrink-0" />
          Erreur lors du chargement des séries.
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && filtered.length === 0 && (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">📭</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-1">Aucune série trouvée</h3>
          <p className="text-sm text-gray-400 mb-6">
            {filter === 'all'
              ? "Vous n'avez pas encore créé de série."
              : `Aucune série avec le statut "${filter}".`}
          </p>
          {isAdmin && filter === 'all' && (
            <Link
              to="/series/create"
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus size={15} />
              Créer votre première série
            </Link>
          )}
        </div>
      )}

      {/* Grid */}
      {!isLoading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <SeriesCard key={s.id} series={s} />
          ))}
        </div>
      )}
    </div>
  )
}
