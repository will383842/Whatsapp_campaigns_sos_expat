const DAYS = [
  { value: 'monday', label: 'Lun' },
  { value: 'tuesday', label: 'Mar' },
  { value: 'wednesday', label: 'Mer' },
  { value: 'thursday', label: 'Jeu' },
  { value: 'friday', label: 'Ven' },
  { value: 'saturday', label: 'Sam' },
  { value: 'sunday', label: 'Dim' },
]

const TIMEZONES = [
  'Europe/Paris',
  'Europe/London',
  'Europe/Brussels',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Africa/Casablanca',
  'Africa/Dakar',
  'Africa/Abidjan',
  'Africa/Lagos',
  'Africa/Nairobi',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
]

interface Props {
  sendDays: string[]
  sendTime: string
  timezone: string
  onSendDaysChange: (days: string[]) => void
  onSendTimeChange: (time: string) => void
  onTimezoneChange: (tz: string) => void
}

export default function FrequencyConfig({
  sendDays,
  sendTime,
  timezone,
  onSendDaysChange,
  onSendTimeChange,
  onTimezoneChange,
}: Props) {
  const toggleDay = (day: string) => {
    if (sendDays.includes(day)) {
      onSendDaysChange(sendDays.filter((d) => d !== day))
    } else {
      onSendDaysChange([...sendDays, day])
    }
  }

  return (
    <div className="space-y-6">
      {/* Days */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-3">Jours d'envoi</p>
        <div className="flex gap-2 flex-wrap">
          {DAYS.map(({ value, label }) => {
            const active = sendDays.includes(value)
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleDay(value)}
                className={`w-12 h-12 rounded-full text-sm font-medium border-2 transition-colors ${
                  active
                    ? 'bg-green-600 border-green-600 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-green-400'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Fréquence :{' '}
          <span className="font-semibold text-gray-800">
            {sendDays.length} message{sendDays.length > 1 ? 's' : ''} par semaine
          </span>
        </p>
      </div>

      {/* Time */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Heure d'envoi
        </label>
        <input
          type="time"
          value={sendTime}
          onChange={(e) => onSendTimeChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {/* Timezone */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Fuseau horaire
        </label>
        <select
          value={timezone}
          onChange={(e) => onTimezoneChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
