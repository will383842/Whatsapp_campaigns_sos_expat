import { Link } from 'react-router-dom'
import { useWhatsAppStatus, useWhatsAppQr, useWhatsAppRestart } from '../hooks/useSeries'
import { useWhatsAppNumbers } from '../hooks/useWhatsAppNumbers'
import { useAuthContext } from '../contexts/AuthContext'
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Check,
  Phone,
  QrCode,
  ArrowRight,
  Smartphone,
} from 'lucide-react'

export default function WhatsAppStatus() {
  const { isAdmin } = useAuthContext()
  const { data: status, isLoading, error } = useWhatsAppStatus()
  const { data: numbers } = useWhatsAppNumbers()
  const restartMutation = useWhatsAppRestart()

  const showQr = status && !status.connected
  const { data: qrData } = useWhatsAppQr(!!showQr)

  const isConnected = status?.connected === true
  const isUnreachable = status?.status === 'unreachable'

  // Multi-instance stats (use effective max for warmup accuracy)
  const connectedCount = numbers?.filter(n => n.connected).length ?? 0
  const totalCount = numbers?.length ?? 0
  const totalDailySent = numbers?.reduce((s, n) => s + n.daily_sent, 0) ?? 0
  const totalEffectiveMax = numbers?.reduce((s, n) => s + (n.effective_daily_max ?? n.daily_max), 0) ?? 0
  const downNumbers = numbers?.filter(n => !n.connected && n.status !== 'paused' && n.status !== 'banned') ?? []

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
          <AlertTriangle size={18} className="shrink-0" />
          <span>Erreur lors de la v{'\u00e9'}rification du statut WhatsApp.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Connexion WhatsApp</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Statut de la connexion et gestion des num{'\u00e9'}ros
          </p>
        </div>
        {isAdmin && (
          <Link
            to="/whatsapp/numbers"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
          >
            <Smartphone size={16} />
            G{'\u00e9'}rer les num{'\u00e9'}ros
            <ArrowRight size={14} />
          </Link>
        )}
      </div>

      {/* Multi-instance summary */}
      {numbers && numbers.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className={`p-4 rounded-xl border text-center ${connectedCount > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center justify-center gap-2 mb-1">
              {connectedCount > 0 ? <Wifi size={16} className="text-green-500" /> : <WifiOff size={16} className="text-red-500" />}
              <span className="text-xl font-bold text-gray-900">{connectedCount}/{totalCount}</span>
            </div>
            <p className="text-xs text-gray-500">Num{'\u00e9'}ros connect{'\u00e9'}s</p>
          </div>
          <div className="p-4 rounded-xl border bg-white border-gray-200 text-center">
            <span className="text-xl font-bold text-gray-900">{totalDailySent}/{totalEffectiveMax}</span>
            <p className="text-xs text-gray-500">Capacit{'\u00e9'} effective</p>
          </div>
          <div className="p-4 rounded-xl border bg-white border-gray-200 text-center">
            <span className="text-xl font-bold text-gray-900">{totalEffectiveMax - totalDailySent}</span>
            <p className="text-xs text-gray-500">Messages restants</p>
          </div>
        </div>
      )}

      {/* Alerts for down numbers */}
      {downNumbers.length > 0 && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-center gap-2 text-sm font-medium text-red-700 mb-2">
            <AlertTriangle size={16} />
            <span>{downNumbers.length} num{'\u00e9'}ro(s) d{'\u00e9'}connect{'\u00e9'}(s)</span>
          </div>
          <div className="space-y-1">
            {downNumbers.map(n => (
              <div key={n.id} className="text-xs text-red-600 flex items-center gap-2">
                <WifiOff size={12} />
                <span>{n.name} (+{n.phone})</span>
                {n.last_error && <span className="text-red-400 truncate">{'\u2014'} {n.last_error}</span>}
              </div>
            ))}
          </div>
          {isAdmin && (
            <Link
              to="/whatsapp/numbers"
              className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-red-700 hover:text-red-900 underline"
            >
              Scanner les QR codes <ArrowRight size={10} />
            </Link>
          )}
        </div>
      )}

      {/* Status card */}
      <div className={'p-6 rounded-2xl border shadow-sm mb-6 ' + (
        isConnected
          ? 'bg-green-50 border-green-200'
          : isUnreachable
            ? 'bg-orange-50 border-orange-200'
            : 'bg-red-50 border-red-200'
      )}>
        <div className="flex items-center gap-4">
          <div className={'w-14 h-14 rounded-xl flex items-center justify-center ' + (
            isConnected ? 'bg-green-100' : isUnreachable ? 'bg-orange-100' : 'bg-red-100'
          )}>
            {isConnected ? (
              <Wifi size={28} className="text-green-600" />
            ) : isUnreachable ? (
              <AlertTriangle size={28} className="text-orange-600" />
            ) : (
              <WifiOff size={28} className="text-red-600" />
            )}
          </div>
          <div className="flex-1">
            <h2 className={'text-lg font-semibold ' + (
              isConnected ? 'text-green-800' : isUnreachable ? 'text-orange-800' : 'text-red-800'
            )}>
              {isConnected ? 'Service WhatsApp actif' : isUnreachable ? 'Service injoignable' : 'WhatsApp d\u00e9connect\u00e9'}
            </h2>
            <p className={'text-sm ' + (
              isConnected ? 'text-green-600' : isUnreachable ? 'text-orange-600' : 'text-red-600'
            )}>
              {isConnected
                ? `${connectedCount} num\u00e9ro(s) actif(s) et pr\u00eat(s) \u00e0 envoyer.`
                : isUnreachable
                  ? 'Le service Baileys ne r\u00e9pond pas. V\u00e9rifiez le conteneur Docker.'
                  : 'Aucun num\u00e9ro connect\u00e9. Scannez les QR codes depuis la page Num\u00e9ros.'}
            </p>
          </div>
          <div className={'w-4 h-4 rounded-full ' + (
            isConnected ? 'bg-green-500' : isUnreachable ? 'bg-orange-500' : 'bg-red-500'
          ) + (isConnected ? '' : ' animate-pulse')} />
        </div>

        {isConnected && status?.phone && (
          <div className="mt-4 pt-4 border-t border-green-200 flex items-center gap-2 text-sm text-green-700">
            <Phone size={14} />
            <span>Num{'\u00e9'}ro principal : {status.phone.split(':')[0]}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      {isAdmin && (
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => restartMutation.mutate()}
            disabled={restartMutation.isPending}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {restartMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            <span>{restartMutation.isPending ? 'Reconnexion...' : 'Relancer toutes les connexions'}</span>
          </button>
        </div>
      )}

      {restartMutation.isSuccess && (
        <div className="mb-6 flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          <Check size={16} />
          <span>{restartMutation.data?.message || 'Reconnexion lanc\u00e9e'}</span>
        </div>
      )}

      {restartMutation.isError && (
        <div className="mb-6 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle size={16} />
          <span>Erreur de reconnexion. V{'\u00e9'}rifiez le serveur.</span>
        </div>
      )}

      {/* QR Code section (legacy fallback) */}
      {!isConnected && !isUnreachable && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <QrCode size={20} className="text-gray-600" />
            <h3 className="font-semibold text-gray-800">Scanner le QR Code</h3>
          </div>
          {isAdmin && (
            <>
              <p className="text-sm text-gray-500 mb-2">
                Pour une gestion d{'\u00e9'}taill{'\u00e9'}e des num{'\u00e9'}ros et QR codes, utilisez la page d{'\u00e9'}di{'\u00e9'}e :
              </p>
              <Link
                to="/whatsapp/numbers"
                className="inline-flex items-center gap-2 text-sm font-medium text-green-600 hover:text-green-800 mb-4"
              >
                <Smartphone size={14} /> G{'\u00e9'}rer les num{'\u00e9'}ros WhatsApp <ArrowRight size={12} />
              </Link>
            </>
          )}

          <div className="flex justify-center p-6 bg-gray-50 rounded-xl">
            {qrData?.qr ? (
              <img src={qrData.qr} alt="QR Code WhatsApp" className="rounded-lg" style={{ width: 300, height: 300 }} />
            ) : (
              <div className="text-center py-8">
                <Loader2 size={24} className="animate-spin text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">En attente du QR code...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h4 className="font-medium text-gray-800 text-sm mb-2">Multi-num{'\u00e9'}ros</h4>
          <p className="text-xs text-gray-500">
            Les messages sont distribu{'\u00e9'}s entre les num{'\u00e9'}ros connect{'\u00e9'}s avec affinit{'\u00e9'} groupe. Chaque num{'\u00e9'}ro a son propre quota journalier et un warmup progressif sur 4 semaines.
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h4 className="font-medium text-gray-800 text-sm mb-2">Reconnexion automatique</h4>
          <p className="text-xs text-gray-500">
            Si une connexion se coupe, le service tente automatiquement de se reconnecter. Un heartbeat v{'\u00e9'}rifie chaque connexion toutes les 60 secondes. Les bans sont d{'\u00e9'}tect{'\u00e9'}s automatiquement.
          </p>
        </div>
      </div>
    </div>
  )
}
