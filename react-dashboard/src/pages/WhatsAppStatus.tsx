import { useWhatsAppStatus, useWhatsAppQr, useWhatsAppRestart } from '../hooks/useSeries'
import { useAuthContext } from '../contexts/AuthContext'
import { Wifi, WifiOff, RefreshCw, Loader2, AlertTriangle, Check, Phone, QrCode } from 'lucide-react'

export default function WhatsAppStatus() {
  const { isAdmin } = useAuthContext()
  const { data: status, isLoading, error } = useWhatsAppStatus()
  const restartMutation = useWhatsAppRestart()

  const showQr = status && !status.connected
  const { data: qrData } = useWhatsAppQr(!!showQr)

  const isConnected = status?.connected === true
  const isUnreachable = status?.status === 'unreachable'

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
          <span>Erreur lors de la verification du statut WhatsApp.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Connexion WhatsApp</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Statut de la connexion et gestion de l'appareil
        </p>
      </div>

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
            isConnected
              ? 'bg-green-100'
              : isUnreachable
                ? 'bg-orange-100'
                : 'bg-red-100'
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
              {isConnected ? 'WhatsApp connecte' : isUnreachable ? 'Service injoignable' : 'WhatsApp deconnecte'}
            </h2>
            <p className={'text-sm ' + (
              isConnected ? 'text-green-600' : isUnreachable ? 'text-orange-600' : 'text-red-600'
            )}>
              {isConnected
                ? 'L\'appareil est lie et pret a envoyer des messages.'
                : isUnreachable
                  ? 'Le service Baileys ne repond pas. Verifiez que le conteneur Docker est en cours d\'execution.'
                  : 'L\'appareil n\'est pas connecte. Scannez le QR code ou relancez la connexion.'}
            </p>
          </div>
          <div className={'w-4 h-4 rounded-full ' + (
            isConnected ? 'bg-green-500' : isUnreachable ? 'bg-orange-500' : 'bg-red-500'
          ) + ' animate-pulse'} />
        </div>

        {/* Phone info */}
        {isConnected && status?.phone && (
          <div className="mt-4 pt-4 border-t border-green-200 flex items-center gap-2 text-sm text-green-700">
            <Phone size={14} />
            <span>Telephone : {status.phone.split(':')[0]}</span>
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
            <span>{restartMutation.isPending ? 'Reconnexion...' : 'Relancer la connexion'}</span>
          </button>
        </div>
      )}

      {/* Restart result */}
      {restartMutation.isSuccess && (
        <div className="mb-6 flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          <Check size={16} />
          <span>{restartMutation.data?.message || 'Reconnexion lancee'}</span>
        </div>
      )}

      {restartMutation.isError && (
        <div className="mb-6 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle size={16} />
          <span>Erreur de reconnexion. Verifiez le serveur.</span>
        </div>
      )}

      {/* QR Code section */}
      {!isConnected && !isUnreachable && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <QrCode size={20} className="text-gray-600" />
            <h3 className="font-semibold text-gray-800">Scanner le QR Code</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Ouvrez WhatsApp sur votre telephone &rarr; Appareils connectes &rarr; Connecter un appareil &rarr; Scannez le code ci-dessous.
          </p>

          <div className="flex justify-center p-6 bg-gray-50 rounded-xl">
            {qrData?.qr ? (
              <img
                src={qrData.qr}
                alt="QR Code WhatsApp"
                className="rounded-lg"
                style={{ width: 300, height: 300 }}
              />
            ) : (
              <div className="text-center py-8">
                <Loader2 size={24} className="animate-spin text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">En attente du QR code...</p>
                <p className="text-xs text-gray-300 mt-1">Le QR code apparaitra automatiquement.</p>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400 text-center mt-3">
            Le QR code se renouvelle automatiquement toutes les 5 secondes.
          </p>
        </div>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h4 className="font-medium text-gray-800 text-sm mb-2">Reconnexion automatique</h4>
          <p className="text-xs text-gray-500">
            Si la connexion WhatsApp se coupe, le service tente automatiquement de se reconnecter toutes les 5 secondes. Un heartbeat verifie la connexion toutes les 60 secondes.
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h4 className="font-medium text-gray-800 text-sm mb-2">Deconnexion forcee</h4>
          <p className="text-xs text-gray-500">
            Si vous etes deconnecte de WhatsApp (delogge), les identifiants doivent etre re-scannes via le QR code. Cliquez sur "Relancer la connexion" pour generer un nouveau QR.
          </p>
        </div>
      </div>
    </div>
  )
}
