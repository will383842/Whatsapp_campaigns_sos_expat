import { useState, useEffect } from 'react'
import { useAuthContext } from '../contexts/AuthContext'
import {
  useWhatsAppNumbers,
  useCreateWhatsAppNumber,
  useUpdateWhatsAppNumber,
  useDeleteWhatsAppNumber,
  usePauseWhatsAppNumber,
  useResumeWhatsAppNumber,
  useRestartWhatsAppNumber,
  useWhatsAppNumberQr,
  useSetDefaultWhatsAppNumber,
} from '../hooks/useWhatsAppNumbers'
import type { WhatsAppNumber } from '../types/whatsappNumber'
import {
  Loader2,
  AlertTriangle,
  Plus,
  Star,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  Smartphone,
  Wifi,
  WifiOff,
  X,
  Check,
} from 'lucide-react'

// ── Feedback toast (inline, no dependency) ───────────────────────────────────

function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  return {
    toast,
    success: (message: string) => setToast({ message, type: 'success' }),
    error: (message: string) => setToast({ message, type: 'error' }),
  }
}

function Toast({ toast }: { toast: { message: string; type: 'success' | 'error' } | null }) {
  if (!toast) return null
  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
      toast.type === 'success'
        ? 'bg-green-600 text-white'
        : 'bg-red-600 text-white'
    }`}>
      {toast.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
      {toast.message}
    </div>
  )
}

// ── QR Code inline component ─────────────────────────────────────────────────

function InlineQr({ numberId }: { numberId: number }) {
  const { data } = useWhatsAppNumberQr(numberId)

  if (data?.connected) return null

  return (
    <div className="mt-3 flex justify-center p-4 bg-gray-50 rounded-xl">
      {data?.qr ? (
        <img
          src={data.qr}
          alt="QR Code"
          className="rounded-lg"
          style={{ width: 220, height: 220 }}
        />
      ) : (
        <div className="text-center py-6">
          <Loader2 size={20} className="animate-spin text-gray-400 mx-auto mb-2" />
          <p className="text-xs text-gray-400">En attente du QR code...</p>
        </div>
      )}
    </div>
  )
}

// ── Number Card ──────────────────────────────────────────────────────────────

function NumberCard({
  number,
  isAdmin,
  onSuccess,
  onError,
}: {
  number: WhatsAppNumber
  isAdmin: boolean
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}) {
  const pauseMutation = usePauseWhatsAppNumber()
  const resumeMutation = useResumeWhatsAppNumber()
  const restartMutation = useRestartWhatsAppNumber()
  const deleteMutation = useDeleteWhatsAppNumber()
  const setDefaultMutation = useSetDefaultWhatsAppNumber()
  const updateMutation = useUpdateWhatsAppNumber()

  const [editingQuota, setEditingQuota] = useState(false)
  const [quotaValue, setQuotaValue] = useState(number.daily_max)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isConnected = number.connected
  const isPaused = number.status === 'paused'
  const isBanned = number.status === 'banned'

  const formatPhone = (phone: string) => {
    if (phone.startsWith('33') && phone.length === 11) {
      return `+${phone.slice(0, 2)} ${phone.slice(2, 3)} ${phone.slice(3, 5)} ${phone.slice(5, 7)} ${phone.slice(7, 9)} ${phone.slice(9)}`
    }
    return `+${phone}`
  }

  const statusColor = isConnected
    ? 'bg-green-50 border-green-200'
    : isPaused
      ? 'bg-yellow-50 border-yellow-200'
      : isBanned
        ? 'bg-red-50 border-red-200'
        : 'bg-gray-50 border-gray-200'

  const statusDot = isConnected
    ? 'bg-green-500'
    : isPaused
      ? 'bg-yellow-500'
      : isBanned
        ? 'bg-red-500'
        : 'bg-gray-400'

  const statusLabel = isConnected
    ? 'Connect\u00e9'
    : isPaused
      ? 'En pause'
      : isBanned
        ? 'Banni'
        : 'D\u00e9connect\u00e9'

  return (
    <div className={`p-5 rounded-2xl border shadow-sm ${statusColor}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isConnected ? 'bg-green-100' : 'bg-gray-100'}`}>
            <Smartphone size={20} className={isConnected ? 'text-green-600' : 'text-gray-500'} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">{number.name}</h3>
              {number.is_default && (
                <span className="flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                  <Star size={10} /> Par d\u00e9faut
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">{formatPhone(number.phone)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${statusDot}${!isConnected ? ' animate-pulse' : ''}`} />
          <span className="text-xs font-medium text-gray-600">{statusLabel}</span>
        </div>
      </div>

      {/* Warmup indicator */}
      {number.warmup?.active && (
        <div className="flex items-center gap-2 text-xs mb-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-700">
          <span>&#9200;</span>
          <span>
            <b>Warmup jour {number.warmup.day}/{number.warmup.endsDay}</b> — Limite : {number.warmup.limit} msgs/jour
            (monte progressivement jusqu'{'\u00e0'} {number.daily_max})
          </span>
        </div>
      )}

      {/* Ban warning */}
      {isBanned && (
        <div className="flex items-center gap-2 text-xs mb-2 p-2 bg-red-100 border border-red-300 rounded-lg text-red-800">
          <span>&#128683;</span>
          <span>
            <b>Num{'\u00e9'}ro banni par WhatsApp</b> ({number.ban_count} ban{number.ban_count > 1 ? 's' : ''}).
            Attendez 24-48h avant de r{'\u00e9'}essayer. Red{'\u00e9'}marrez manuellement pour retenter.
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
        <span>{number.daily_sent}/{number.effective_daily_max ?? number.daily_max} msgs aujourd'hui</span>
        <span>|</span>
        <span>Total : {number.messages_total}</span>
        {number.ban_count > 0 && (
          <>
            <span>|</span>
            <span className="text-red-600">{number.ban_count} ban(s)</span>
          </>
        )}
      </div>

      {/* Rotation toggle */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm text-gray-600">Rotation :</span>
        {isAdmin ? (
          <button
            onClick={() => updateMutation.mutate(
              { id: number.id, data: { is_rotation_enabled: !number.is_rotation_enabled } },
              {
                onSuccess: () => onSuccess(`Rotation ${number.is_rotation_enabled ? 'd\u00e9sactiv\u00e9e' : 'activ\u00e9e'} pour ${number.name}`),
                onError: () => onError('Erreur lors de la modification de la rotation'),
              },
            )}
            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
              number.is_rotation_enabled
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {number.is_rotation_enabled ? 'ON' : 'OFF'}
          </button>
        ) : (
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            number.is_rotation_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {number.is_rotation_enabled ? 'ON' : 'OFF'}
          </span>
        )}

        {/* Quota editing */}
        {isAdmin && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-gray-500">Quota :</span>
            {editingQuota ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={quotaValue}
                  onChange={(e) => setQuotaValue(Number(e.target.value))}
                  className="w-16 text-xs border border-gray-300 rounded px-2 py-1"
                />
                <button
                  onClick={() => {
                    updateMutation.mutate(
                      { id: number.id, data: { daily_max: quotaValue } },
                      {
                        onSuccess: () => { onSuccess(`Quota mis \u00e0 jour : ${quotaValue}/jour`); setEditingQuota(false) },
                        onError: () => onError('Erreur lors de la mise \u00e0 jour du quota'),
                      },
                    )
                  }}
                  className="text-green-600 hover:text-green-800"
                >
                  <Check size={14} />
                </button>
                <button onClick={() => setEditingQuota(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setQuotaValue(number.daily_max); setEditingQuota(true) }}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                {number.daily_max}/jour
              </button>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {number.last_error && (
        <div className="flex items-center gap-2 text-xs text-red-600 mb-3 p-2 bg-red-50 rounded-lg">
          <AlertTriangle size={12} />
          <span className="truncate">{number.last_error}</span>
        </div>
      )}

      {/* QR Code for disconnected instances */}
      {!isConnected && !isPaused && <InlineQr numberId={number.id} />}

      {/* Actions */}
      {isAdmin && (
        <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-200">
          {isPaused ? (
            <button
              onClick={() => resumeMutation.mutate(number.id, {
                onSuccess: () => onSuccess(`${number.name} remis en rotation`),
                onError: () => onError(`Erreur lors de la reprise de ${number.name}`),
              })}
              disabled={resumeMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {resumeMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              Reprendre
            </button>
          ) : (
            <button
              onClick={() => pauseMutation.mutate(number.id, {
                onSuccess: () => onSuccess(`${number.name} mis en pause`),
                onError: () => onError(`Erreur lors de la mise en pause de ${number.name}`),
              })}
              disabled={pauseMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50"
            >
              {pauseMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Pause size={12} />}
              Pause
            </button>
          )}

          <button
            onClick={() => restartMutation.mutate({ id: number.id, force: !isConnected }, {
              onSuccess: () => onSuccess(`${number.name} red\u00e9marr\u00e9`),
              onError: () => onError(`Erreur lors du red\u00e9marrage de ${number.name}`),
            })}
            disabled={restartMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
          >
            {restartMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Restart
          </button>

          {!number.is_default && (
            <button
              onClick={() => setDefaultMutation.mutate(number.id, {
                onSuccess: () => onSuccess(`${number.name} d\u00e9fini comme num\u00e9ro par d\u00e9faut`),
                onError: () => onError('Erreur lors du changement de num\u00e9ro par d\u00e9faut'),
              })}
              disabled={setDefaultMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {setDefaultMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} />}
              Par d\u00e9faut
            </button>
          )}

          {!number.is_default && (
            confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => deleteMutation.mutate(number.id, {
                    onSuccess: () => { onSuccess(`${number.name} supprim\u00e9`); setConfirmDelete(false) },
                    onError: () => { onError('Erreur lors de la suppression'); setConfirmDelete(false) },
                  })}
                  disabled={deleteMutation.isPending}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
                  Confirmer
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
              >
                <Trash2 size={12} /> Supprimer
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ── Add Number Modal ─────────────────────────────────────────────────────────

function AddNumberModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (msg: string) => void }) {
  const createMutation = useCreateWhatsAppNumber()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [slug, setSlug] = useState('')
  const [dailyMax, setDailyMax] = useState(50)
  const [createdQr, setCreatedQr] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<number | null>(null)

  // Poll QR after creation
  const { data: qrData } = useWhatsAppNumberQr(createdId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(
      { name, phone, slug: slug || undefined, daily_max: dailyMax },
      {
        onSuccess: (data) => {
          onSuccess(`Num\u00e9ro "${name}" ajout\u00e9`)
          setCreatedQr(data.qr)
          setCreatedId(data.number.id)
        },
      },
    )
  }

  // If connected after scanning, close
  if (qrData?.connected && createdId) {
    onClose()
  }

  // Show QR after creation
  if (createdId) {
    const currentQr = qrData?.qr || createdQr
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Scanner le QR code</h3>
          <p className="text-sm text-gray-500 mb-4">
            Ouvrez WhatsApp sur le t\u00e9l\u00e9phone {name} &rarr; Appareils connect\u00e9s &rarr; Scanner
          </p>
          <div className="flex justify-center p-4 bg-gray-50 rounded-xl mb-4">
            {currentQr ? (
              <img src={currentQr} alt="QR Code" className="rounded-lg" style={{ width: 260, height: 260 }} />
            ) : (
              <div className="py-12">
                <Loader2 size={24} className="animate-spin text-gray-400 mx-auto mb-2" />
                <p className="text-xs text-gray-400">En attente du QR code...</p>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 mb-4">Le QR code se renouvelle automatiquement.</p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg"
          >
            Fermer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Ajouter un num\u00e9ro</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="SIM Free #2"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">T\u00e9l\u00e9phone (sans +)</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="33743613873"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug (optionnel)</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9-]/g, ''))}
              placeholder="sim-3 (auto-g\u00e9n\u00e9r\u00e9 si vide)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quota journalier</label>
            <input
              type="number"
              value={dailyMax}
              onChange={(e) => setDailyMax(Number(e.target.value))}
              min={1}
              max={500}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          {createMutation.isError && (
            <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertTriangle size={12} />
              <span>Erreur lors de la cr\u00e9ation. V\u00e9rifiez que le num\u00e9ro n'existe pas d\u00e9j\u00e0.</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || !name || !phone}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {createMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              Ajouter
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function WhatsAppNumbers() {
  const { isAdmin } = useAuthContext()
  const { data: numbers, isLoading, error } = useWhatsAppNumbers()
  const [showAddModal, setShowAddModal] = useState(false)
  const { toast, success, error: showError } = useToast()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={28} className="animate-spin text-green-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle size={18} />
          <span>Erreur lors du chargement des num\u00e9ros WhatsApp.</span>
        </div>
      </div>
    )
  }

  const connectedCount = numbers?.filter(n => n.connected).length ?? 0
  const totalCount = numbers?.length ?? 0
  const bannedCount = numbers?.filter(n => n.status === 'banned').length ?? 0
  const totalDailySent = numbers?.reduce((s, n) => s + n.daily_sent, 0) ?? 0
  const totalDailyMax = numbers?.reduce((s, n) => s + n.daily_max, 0) ?? 0
  // Effective max considers warmup limits
  const totalEffectiveMax = numbers?.reduce((s, n) => s + (n.effective_daily_max ?? n.daily_max), 0) ?? 0
  const warmupNumbers = numbers?.filter(n => n.warmup?.active) ?? []

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Toast toast={toast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Num{'\u00e9'}ros WhatsApp</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gestion des num{'\u00e9'}ros et rotation d'envoi
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus size={16} />
            Ajouter
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            {connectedCount > 0 ? <Wifi size={16} className="text-green-500" /> : <WifiOff size={16} className="text-red-500" />}
            <span className="text-2xl font-bold text-gray-900">{connectedCount}/{totalCount}</span>
          </div>
          <p className="text-xs text-gray-500">Connect{'\u00e9'}s</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <span className="text-2xl font-bold text-gray-900">{totalDailySent}/{totalEffectiveMax}</span>
          <p className="text-xs text-gray-500">Envoy{'\u00e9'}s / Capacit{'\u00e9'} effective</p>
          {totalEffectiveMax < totalDailyMax && (
            <p className="text-xs text-blue-500 mt-0.5">({totalDailyMax} apr{'\u00e8'}s warmup)</p>
          )}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <span className="text-2xl font-bold text-green-600">{totalEffectiveMax - totalDailySent}</span>
          <p className="text-xs text-gray-500">Groupes restants aujourd'hui</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <span className="text-2xl font-bold text-gray-900">{totalEffectiveMax}</span>
          <p className="text-xs text-gray-500">Groupes max/jour</p>
          <p className="text-xs text-gray-400 mt-0.5">(toutes instances)</p>
        </div>
      </div>

      {/* Warmup info banner */}
      {warmupNumbers.length > 0 && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-700 mb-2">
            <span>&#9200;</span>
            <span>{warmupNumbers.length} num{'\u00e9'}ro(s) en warmup</span>
          </div>
          <p className="text-xs text-blue-600 mb-2">
            Les nouveaux num{'\u00e9'}ros montent progressivement en volume sur 4 semaines pour {'\u00e9'}viter les bans WhatsApp.
            La capacit{'\u00e9'} totale augmentera automatiquement chaque jour.
          </p>
          <div className="text-xs text-blue-500 space-y-0.5">
            {warmupNumbers.map(n => (
              <div key={n.id}>
                {n.name} : jour {n.warmup?.day}/{n.warmup?.endsDay} — {n.warmup?.limit} msgs/jour
                (plein r{'\u00e9'}gime : {n.daily_max}/jour)
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Banned numbers alert */}
      {bannedCount > 0 && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-center gap-2 text-sm font-medium text-red-700 mb-1">
            <span>&#128683;</span>
            <span>{bannedCount} num{'\u00e9'}ro(s) banni(s)</span>
          </div>
          <p className="text-xs text-red-600">
            Ces num{'\u00e9'}ros sont automatiquement retir{'\u00e9'}s de la rotation. Attendez 24-48h puis red{'\u00e9'}marrez manuellement.
          </p>
        </div>
      )}

      {/* Number cards */}
      <div className="space-y-4">
        {numbers?.map((number) => (
          <NumberCard key={number.id} number={number} isAdmin={isAdmin} onSuccess={success} onError={showError} />
        ))}
      </div>

      {numbers?.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Smartphone size={40} className="mx-auto mb-3 opacity-50" />
          <p>Aucun num\u00e9ro configur\u00e9.</p>
          {isAdmin && <p className="text-sm mt-1">Cliquez sur &laquo; Ajouter &raquo; pour commencer.</p>}
        </div>
      )}

      {/* Add modal */}
      {showAddModal && <AddNumberModal onClose={() => setShowAddModal(false)} onSuccess={success} />}
    </div>
  )
}
