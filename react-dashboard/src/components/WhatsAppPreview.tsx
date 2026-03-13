interface Props {
  content: string
  time?: string
}

function parseWhatsApp(text: string): string {
  // Bold: *text*
  let result = text.replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
  // Italic: _text_
  result = result.replace(/_([^_]+)_/g, '<em>$1</em>')
  // Strikethrough: ~text~
  result = result.replace(/~([^~]+)~/g, '<s>$1</s>')
  // Line breaks
  result = result.replace(/\n/g, '<br />')
  return result
}

export default function WhatsAppPreview({ content, time = '09:00' }: Props) {
  return (
    <div className="bg-[#0b141a] rounded-xl p-4 min-h-[180px] flex flex-col">
      {/* Header bar */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/10">
        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
          SOS
        </div>
        <div>
          <p className="text-white text-xs font-semibold leading-none">SOS-Expat</p>
          <p className="text-gray-400 text-[10px] mt-0.5">en ligne</p>
        </div>
      </div>

      {/* Message bubble */}
      <div className="flex justify-end">
        <div className="relative bg-[#005c4b] text-white text-sm rounded-lg rounded-tr-none max-w-[85%] px-3 pt-2 pb-4 shadow">
          {content ? (
            <span
              dangerouslySetInnerHTML={{ __html: parseWhatsApp(content) }}
              className="break-words leading-relaxed"
            />
          ) : (
            <span className="text-white/40 italic">Votre message…</span>
          )}
          {/* Time */}
          <span className="absolute bottom-1 right-2 text-[10px] text-white/60">{time}</span>
        </div>
      </div>
    </div>
  )
}
