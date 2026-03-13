import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useCreateSeries, useGroups, useSeriesDetail } from '../hooks/useSeries'
import SeriesForm from '../components/SeriesForm'
import type { CampaignSeries } from '../types/series'

export default function SeriesCreate() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const duplicateId = searchParams.get('duplicate')

  const create = useCreateSeries()
  const { data: groups = [] } = useGroups()

  // If duplicating, load original series
  const { data: original } = useSeriesDetail(duplicateId ?? '')

  const handleSubmit = async (
    data: Partial<CampaignSeries> & { messages: { id: string; content: string; translations: Record<string, string> }[] }
  ) => {
    try {
      const result = await create.mutateAsync(data as Partial<CampaignSeries>)
      navigate(`/series/${result.id}`)
    } catch (err) {
      console.error('Erreur création série:', err)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate('/series')}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {duplicateId ? 'Dupliquer une série' : 'Nouvelle série'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {duplicateId
              ? 'Créez une copie de la série sélectionnée'
              : 'Configurez votre nouvelle campagne WhatsApp'}
          </p>
        </div>
      </div>

      {create.error && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          Erreur lors de la création : {(create.error as Error).message}
        </div>
      )}

      <SeriesForm
        onSubmit={handleSubmit}
        initialData={duplicateId && original ? { ...original, id: undefined as unknown as number, name: `Copie de ${original.name}` } : undefined}
        groups={groups}
        isTranslating={false}
        onTranslate={undefined}
      />
    </div>
  )
}
