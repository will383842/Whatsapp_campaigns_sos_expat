import { useRef } from 'react'
import WhatsAppPreview from './WhatsAppPreview'

interface Props {
  value: string
  onChange: (value: string) => void
  label?: string
}

const MAX_WARN = 800
const MAX_ERROR = 1000

const EMOJIS = ['🌍', '✅', '🔥', '👉', '💡', '🎉', '📢', '⚠️']

export default function MessageEditor({ value, onChange, label }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const insertAround = (before: string, after: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.slice(start, end)
    const newVal = value.slice(0, start) + before + selected + after + value.slice(end)
    onChange(newVal)
    // Restore caret
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(start + before.length, end + before.length)
    }, 0)
  }

  const insertEmoji = (emoji: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const pos = ta.selectionStart
    const newVal = value.slice(0, pos) + emoji + value.slice(pos)
    onChange(newVal)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(pos + emoji.length, pos + emoji.length)
    }, 0)
  }

  const count = value.length
  const countColor =
    count >= MAX_ERROR ? 'text-red-600' : count >= MAX_WARN ? 'text-amber-500' : 'text-gray-400'

  return (
    <div className="space-y-3">
      {label && <p className="text-sm font-medium text-gray-700">{label}</p>}
      <div className="flex gap-4">
        {/* Editor side */}
        <div className="flex-1 space-y-2">
          {/* Toolbar */}
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => insertAround('*', '*')}
              className="px-2 py-1 text-sm font-bold border border-gray-300 rounded hover:bg-gray-100 transition"
              title="Gras (*texte*)"
            >
              B
            </button>
            <button
              type="button"
              onClick={() => insertAround('_', '_')}
              className="px-2 py-1 text-sm italic border border-gray-300 rounded hover:bg-gray-100 transition"
              title="Italique (_texte_)"
            >
              I
            </button>
            <button
              type="button"
              onClick={() => insertAround('~', '~')}
              className="px-2 py-1 text-sm line-through border border-gray-300 rounded hover:bg-gray-100 transition"
              title="Barré (~texte~)"
            >
              S
            </button>
            <span className="w-px h-5 bg-gray-300 mx-1" />
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className="text-base px-1.5 py-1 rounded hover:bg-gray-100 transition"
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={7}
            placeholder="Rédigez votre message WhatsApp..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition font-mono"
          />

          {/* Counter */}
          <div className={`text-xs text-right ${countColor}`}>
            {count} / {MAX_ERROR} caractères
            {count >= MAX_WARN && count < MAX_ERROR && (
              <span className="ml-2 text-amber-500">Attention : message long</span>
            )}
            {count >= MAX_ERROR && (
              <span className="ml-2 text-red-600 font-medium">Limite dépassée !</span>
            )}
          </div>
        </div>

        {/* Preview side */}
        <div className="w-64 shrink-0">
          <p className="text-xs text-gray-500 mb-2 font-medium">Aperçu WhatsApp</p>
          <WhatsAppPreview content={value} />
        </div>
      </div>
    </div>
  )
}
