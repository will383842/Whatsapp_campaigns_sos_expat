import type { Group } from '../types/series'

interface Props {
  selected: string[]
  onChange: (langs: string[]) => void
  groups: Group[]
}

const LANGUAGES: { code: string; label: string; flag: string }[] = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'Anglais', flag: '🇬🇧' },
  { code: 'de', label: 'Allemand', flag: '🇩🇪' },
  { code: 'pt', label: 'Portugais', flag: '🇧🇷' },
  { code: 'es', label: 'Espagnol', flag: '🇪🇸' },
  { code: 'it', label: 'Italien', flag: '🇮🇹' },
  { code: 'nl', label: 'Néerlandais', flag: '🇳🇱' },
  { code: 'ar', label: 'Arabe', flag: '🇸🇦' },
  { code: 'zh', label: 'Chinois', flag: '🇨🇳' },
  { code: 'hi', label: 'Hindi', flag: '🇮🇳' },
  { code: 'ru', label: 'Russe', flag: '🇷🇺' },
]

export default function LanguageSelector({ selected, onChange, groups }: Props) {
  const toggle = (code: string) => {
    if (selected.includes(code)) {
      onChange(selected.filter((l) => l !== code))
    } else {
      onChange([...selected, code])
    }
  }

  const countForLang = (code: string) =>
    groups.filter((g) => g.language === code && g.is_active).length

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700 mb-3">Langues ciblées</p>
      <div className="grid grid-cols-2 gap-2">
        {LANGUAGES.map(({ code, label, flag }) => {
          const count = countForLang(code)
          const isSelected = selected.includes(code)
          return (
            <label
              key={code}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                isSelected
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(code)}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span className="text-lg">{flag}</span>
              <span className="text-sm font-medium text-gray-700 flex-1">{label}</span>
              <span className="text-xs text-gray-400 shrink-0">{count} groupe{count > 1 ? 's' : ''}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
