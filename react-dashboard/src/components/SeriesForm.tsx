import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  GripVertical,
  Zap,
  Check,
} from 'lucide-react'
import type { CampaignSeries, Group } from '../types/series'
import MessageEditor from './MessageEditor'
import LanguageSelector from './LanguageSelector'
import GroupSelector from './GroupSelector'
import FrequencyConfig from './FrequencyConfig'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MessageDraft {
  id: string
  content: string
  translations: Record<string, string>
}

interface FormData {
  name: string
  type: 'drip' | 'one_shot'
  notes: string
  targeting_mode: 'by_language' | 'by_group' | 'hybrid'
  target_languages: string[]
  target_categories: string[]
  target_groups: number[]
  messages: MessageDraft[]
  translation_mode: 'auto' | 'manual'
  source_language: string
  send_days: string[]
  send_time: string
  timezone: string
  starts_at: string
  scheduled_at: string // for one_shot
}

interface Props {
  onSubmit: (data: Partial<CampaignSeries> & { messages: MessageDraft[] }) => void
  initialData?: Partial<CampaignSeries>
  groups: Group[]
  isTranslating?: boolean
  onTranslate?: () => void
}

const STEPS = [
  'Informations',
  'Ciblage',
  'Messages',
  'Traduction',
  'Fréquence',
  'Récapitulatif',
]

const LANG_LABELS: Record<string, string> = {
  fr: 'Français',
  en: 'Anglais',
  de: 'Allemand',
  pt: 'Portugais',
  es: 'Espagnol',
  it: 'Italien',
  nl: 'Néerlandais',
  ar: 'Arabe',
  zh: 'Chinois',
  hi: 'Hindi',
  ru: 'Russe',
}

const DAY_MAP: Record<string, string> = {
  monday: 'Lun',
  tuesday: 'Mar',
  wednesday: 'Mer',
  thursday: 'Jeu',
  friday: 'Ven',
  saturday: 'Sam',
  sunday: 'Dim',
}

// ── Sortable message item ─────────────────────────────────────────────────────

function SortableMessage({
  msg,
  index,
  onChange,
  onDelete,
}: {
  msg: MessageDraft
  index: number
  onChange: (id: string, content: string) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: msg.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={style} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors"
        >
          <GripVertical size={18} />
        </button>
        <span className="text-sm font-semibold text-gray-600">Message {index + 1}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => onDelete(msg.id)}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        >
          <Trash2 size={15} />
        </button>
      </div>
      <MessageEditor
        value={msg.content}
        onChange={(val) => onChange(msg.id, val)}
        label=""
      />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SeriesForm({ onSubmit, initialData, groups, isTranslating, onTranslate }: Props) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormData>({
    name: initialData?.name ?? '',
    type: initialData?.type ?? 'drip',
    notes: initialData?.notes ?? '',
    targeting_mode: initialData?.targeting_mode ?? 'by_language',
    target_languages: initialData?.target_languages ?? [],
    target_categories: initialData?.target_categories ?? [],
    target_groups: [],
    messages: [],
    translation_mode: initialData?.translation_mode ?? 'auto',
    source_language: initialData?.source_language ?? 'fr',
    send_days: initialData?.send_days ?? [],
    send_time: initialData?.send_time ?? '09:00',
    timezone: initialData?.timezone ?? 'Europe/Paris',
    starts_at: initialData?.starts_at?.slice(0, 10) ?? '',
    scheduled_at: '',
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ── Helpers ───────────────────────────────────────────────────────────────

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const addMessage = () =>
    setForm((prev) => ({
      ...prev,
      messages: [
        ...prev.messages,
        { id: `msg-${Date.now()}`, content: '', translations: {} },
      ],
    }))

  const updateMessageContent = (id: string, content: string) =>
    setForm((prev) => ({
      ...prev,
      messages: prev.messages.map((m) => (m.id === id ? { ...m, content } : m)),
    }))

  const deleteMessage = (id: string) =>
    setForm((prev) => ({
      ...prev,
      messages: prev.messages.filter((m) => m.id !== id),
    }))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setForm((prev) => {
        const oldIndex = prev.messages.findIndex((m) => m.id === active.id)
        const newIndex = prev.messages.findIndex((m) => m.id === over.id)
        return { ...prev, messages: arrayMove(prev.messages, oldIndex, newIndex) }
      })
    }
  }

  const updateTranslation = (msgId: string, lang: string, content: string) =>
    setForm((prev) => ({
      ...prev,
      messages: prev.messages.map((m) =>
        m.id === msgId
          ? { ...m, translations: { ...m.translations, [lang]: content } }
          : m
      ),
    }))

  // ── Targeted group count ──────────────────────────────────────────────────

  const countTargetedGroups = () => {
    const active = groups.filter((g) => g.is_active)
    const matchesCat = (g: typeof active[0]) =>
      form.target_categories.length === 0 || form.target_categories.includes(g.category ?? '')
    if (form.targeting_mode === 'by_language') {
      return active.filter((g) => form.target_languages.includes(g.language) && matchesCat(g)).length
    }
    if (form.targeting_mode === 'by_group') {
      return form.target_groups.length
    }
    // hybrid
    const byLang = active.filter((g) => form.target_languages.includes(g.language) && matchesCat(g)).map((g) => g.id)
    const merged = new Set([...byLang, ...form.target_groups])
    return merged.size
  }

  // ── Planning preview ──────────────────────────────────────────────────────

  const buildPlanningPreview = () => {
    if (!form.starts_at || form.send_days.length === 0) return []
    const DAY_INDEX: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6,
    }
    const days = form.send_days.map((d) => DAY_INDEX[d]).sort((a, b) => a - b)
    const dates: Date[] = []
    const current = new Date(form.starts_at + 'T' + form.send_time + ':00')
    let safetyCount = 0
    while (dates.length < form.messages.length && safetyCount < 365) {
      if (days.includes(current.getDay())) {
        dates.push(new Date(current))
      }
      current.setDate(current.getDate() + 1)
      safetyCount++
    }
    return dates
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  const canNext = () => {
    if (step === 0) return form.name.trim().length > 0
    if (step === 1) {
      if (form.targeting_mode === 'by_language' || form.targeting_mode === 'hybrid')
        return form.target_languages.length > 0
      return form.target_groups.length > 0
    }
    if (step === 2) return form.messages.length > 0
    return true
  }

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1))
  const prev = () => setStep((s) => Math.max(s - 1, 0))

  const nextStep = () => next()
  const prevStep = () => prev()

  const handleSubmit = () => {
    onSubmit({
      name: form.name,
      type: form.type,
      notes: form.notes || undefined,
      targeting_mode: form.targeting_mode,
      target_languages: form.targeting_mode !== 'by_group' ? form.target_languages : undefined,
      target_categories: form.target_categories.length > 0 ? form.target_categories : undefined,
      send_days: form.type === 'drip' ? form.send_days : undefined,
      send_time: form.send_time,
      timezone: form.timezone,
      starts_at: form.starts_at,
      translation_mode: form.translation_mode,
      source_language: form.source_language,
      messages: form.messages,
    } as Partial<CampaignSeries> & { messages: MessageDraft[] })
  }

  const planningDates = buildPlanningPreview()

  // ── Render steps ──────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto">
      {/* Step indicators */}
      <div className="flex items-center mb-8">
        {STEPS.map((label, i) => {
          const isActive = i === step
          const isDone = i < step
          return (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isDone
                      ? 'bg-green-500 text-white'
                      : isActive
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {isDone ? <Check size={14} /> : i + 1}
                </div>
                <span
                  className={`text-xs mt-1 font-medium ${
                    isActive ? 'text-gray-900' : 'text-gray-400'
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 mb-4 ${isDone ? 'bg-green-400' : 'bg-gray-200'}`}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* ── Step 0: Informations générales ───────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Informations générales</h2>
            <p className="text-sm text-gray-500">Nommez et définissez le type de votre série.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nom de la série <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ex: Bienvenue aux nouveaux membres"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Type de série</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'drip', label: 'Drip', emoji: '💧', desc: 'Messages espacés sur plusieurs jours' },
                { value: 'one_shot', label: 'One-shot', emoji: '🎯', desc: 'Un seul envoi groupé' },
              ].map(({ value, label, emoji, desc }) => (
                <label
                  key={value}
                  className={`flex flex-col gap-1 p-4 border-2 rounded-xl cursor-pointer transition-colors ${
                    form.type === value
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value={value}
                    checked={form.type === value}
                    onChange={() => set('type', value as 'drip' | 'one_shot')}
                    className="sr-only"
                  />
                  <span className="text-2xl">{emoji}</span>
                  <span className="font-semibold text-gray-800">{label}</span>
                  <span className="text-xs text-gray-500">{desc}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Notes internes <span className="text-gray-400">(optionnel)</span>
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              placeholder="Notes visibles uniquement par l'équipe..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>
      )}

      {/* ── Step 1: Ciblage ───────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Ciblage des groupes</h2>
            <p className="text-sm text-gray-500">Choisissez comment cibler votre audience.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Mode de ciblage</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'by_language', label: 'Par langue' },
                { value: 'by_group', label: 'Par groupe' },
                { value: 'hybrid', label: 'Hybride' },
              ].map(({ value, label }) => (
                <label
                  key={value}
                  className={`flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer text-sm font-medium transition-colors ${
                    form.targeting_mode === value
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="targeting_mode"
                    value={value}
                    checked={form.targeting_mode === value}
                    onChange={() => set('targeting_mode', value as FormData['targeting_mode'])}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {(form.targeting_mode === 'by_language' || form.targeting_mode === 'hybrid') && (
            <LanguageSelector
              selected={form.target_languages}
              onChange={(langs) => set('target_languages', langs)}
              groups={groups}
            />
          )}

          {/* Category filter — optional, filters groups by type */}
          {form.targeting_mode !== 'by_group' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Catégories de groupes <span className="text-gray-400 font-normal">(optionnel — toutes si vide)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'chatter', label: 'Chatters' },
                  { value: 'client', label: 'Clients' },
                  { value: 'avocat', label: 'Avocats' },
                  { value: 'blogger', label: 'Bloggers' },
                  { value: 'influencer', label: 'Influencers' },
                  { value: 'group_admin', label: 'Group Admins' },
                  { value: 'expatrie_aidant', label: 'Expatriés Aidants' },
                ].map(({ value, label }) => {
                  const isSelected = form.target_categories.includes(value)
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        const next = isSelected
                          ? form.target_categories.filter((c) => c !== value)
                          : [...form.target_categories, value]
                        set('target_categories', next)
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        isSelected
                          ? 'bg-green-100 border-green-400 text-green-700'
                          : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                {countTargetedGroups()} groupe(s) ciblé(s)
              </p>
            </div>
          )}

          {(form.targeting_mode === 'by_group' || form.targeting_mode === 'hybrid') && (
            <GroupSelector
              selected={form.target_groups}
              onChange={(ids) => set('target_groups', ids)}
              groups={groups}
            />
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700 font-medium">
            Cette série sera envoyée dans{' '}
            <span className="font-bold">{countTargetedGroups()}</span>{' '}
            groupe{countTargetedGroups() > 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* ── Step 2: Messages ──────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Messages</h2>
            <p className="text-sm text-gray-500">
              Rédigez vos messages. Utilisez *gras*, _italique_, ~barré~.
            </p>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={form.messages.map((m) => m.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {form.messages.map((msg, i) => (
                  <SortableMessage
                    key={msg.id}
                    msg={msg}
                    index={i}
                    onChange={updateMessageContent}
                    onDelete={deleteMessage}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {form.messages.length === 0 && (
            <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl text-gray-400">
              Aucun message — cliquez sur "Ajouter un message" pour commencer
            </div>
          )}

          <button
            type="button"
            onClick={addMessage}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-green-300 rounded-xl text-green-600 hover:bg-green-50 transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            Ajouter un message
          </button>
        </div>
      )}

      {/* ── Step 3: Traduction ────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Traduction</h2>
            <p className="text-sm text-gray-500">Configurez la traduction de vos messages.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Mode de traduction</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'auto', label: 'Auto GPT-4o', emoji: '🤖', desc: 'Traduction automatique par IA' },
                { value: 'manual', label: 'Manuel', emoji: '✍️', desc: 'Saisie manuelle par langue' },
              ].map(({ value, label, emoji, desc }) => (
                <label
                  key={value}
                  className={`flex flex-col gap-1 p-4 border-2 rounded-xl cursor-pointer transition-colors ${
                    form.translation_mode === value
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="translation_mode"
                    value={value}
                    checked={form.translation_mode === value}
                    onChange={() => set('translation_mode', value as 'auto' | 'manual')}
                    className="sr-only"
                  />
                  <span className="text-2xl">{emoji}</span>
                  <span className="font-semibold text-gray-800">{label}</span>
                  <span className="text-xs text-gray-500">{desc}</span>
                </label>
              ))}
            </div>
          </div>

          {form.translation_mode === 'auto' && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
              <p className="text-sm text-gray-600">
                GPT-4o va traduire automatiquement les{' '}
                <strong>{form.messages.length}</strong> message(s) dans{' '}
                <strong>{form.target_languages.length}</strong> langue(s).
              </p>
              {onTranslate ? (
                <button
                  type="button"
                  onClick={onTranslate}
                  disabled={isTranslating || form.messages.length === 0}
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Zap size={15} />
                  {isTranslating ? 'Traduction en cours...' : 'Traduire toute la série'}
                </button>
              ) : (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
                  💡 La traduction automatique par GPT-4o sera disponible depuis la page détail après la création de la série.
                </div>
              )}
            </div>
          )}

          {form.translation_mode === 'manual' && (
            <div className="space-y-6">
              {form.messages.map((msg, msgIdx) => (
                <div key={msg.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-gray-700">Message {msgIdx + 1}</p>
                  <div className="text-xs text-gray-500 font-mono bg-gray-50 p-2 rounded">
                    {msg.content || <em>Contenu vide</em>}
                  </div>
                  <div className="space-y-3">
                    {form.target_languages.map((lang) => (
                      <div key={lang}>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {LANG_LABELS[lang] ?? lang}
                        </label>
                        <textarea
                          value={msg.translations[lang] ?? ''}
                          onChange={(e) => updateTranslation(msg.id, lang, e.target.value)}
                          rows={3}
                          placeholder={`Traduction en ${LANG_LABELS[lang] ?? lang}...`}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Step 4: Fréquence (drip only) ────────────────────────────────── */}
      {step === 4 && form.type === 'drip' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Fréquence & Planning</h2>
            <p className="text-sm text-gray-500">Définissez le rythme d'envoi de vos messages.</p>
          </div>

          <FrequencyConfig
            sendDays={form.send_days}
            sendTime={form.send_time}
            timezone={form.timezone}
            onSendDaysChange={(days) => set('send_days', days)}
            onSendTimeChange={(time) => set('send_time', time)}
            onTimezoneChange={(tz) => set('timezone', tz)}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Date de début <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.starts_at}
              onChange={(e) => set('starts_at', e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {planningDates.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Aperçu du planning</p>
              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-52 overflow-y-auto">
                {planningDates.map((date, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="font-medium text-gray-700">Message {i + 1}</span>
                    <span className="text-gray-500">
                      {date.toLocaleDateString('fr-FR', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}{' '}
                      à {form.send_time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 4 for one_shot: Date/heure unique ───────────────────────── */}
      {step === 4 && form.type === 'one_shot' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Date d'envoi</h2>
            <p className="text-sm text-gray-500">Planifiez l'envoi unique de cette série.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
              <input
                type="date"
                value={form.starts_at}
                onChange={(e) => set('starts_at', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Heure</label>
              <input
                type="time"
                value={form.send_time}
                onChange={(e) => set('send_time', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Step 5: Récapitulatif ─────────────────────────────────────────── */}
      {step === 5 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Récapitulatif</h2>
            <p className="text-sm text-gray-500">Vérifiez les informations avant de lancer la série.</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            <SummaryRow label="Nom" value={form.name} />
            <SummaryRow label="Type" value={form.type === 'drip' ? '💧 Drip' : '🎯 One-shot'} />
            <SummaryRow
              label="Ciblage"
              value={
                form.targeting_mode === 'by_language'
                  ? `Par langue : ${form.target_languages.map((l) => LANG_LABELS[l] ?? l).join(', ')}`
                  : form.targeting_mode === 'by_group'
                  ? `Par groupe : ${form.target_groups.length} groupe(s)`
                  : `Hybride : ${form.target_languages.length} langue(s) + ${form.target_groups.length} groupe(s)`
              }
            />
            {form.target_categories.length > 0 && (
              <SummaryRow
                label="Catégories"
                value={form.target_categories.map((c) => {
                  const labels: Record<string, string> = { chatter: 'Chatters', client: 'Clients', avocat: 'Avocats', blogger: 'Bloggers', influencer: 'Influencers', group_admin: 'Group Admins', expatrie_aidant: 'Expatriés Aidants' }
                  return labels[c] ?? c
                }).join(', ')}
              />
            )}
            <SummaryRow label="Groupes ciblés" value={`${countTargetedGroups()} groupe(s)`} />
            <SummaryRow label="Nombre de messages" value={`${form.messages.length} message(s)`} />
            <SummaryRow
              label="Traduction"
              value={form.translation_mode === 'auto' ? '🤖 Auto GPT-4o' : '✍️ Manuel'}
            />
            {form.type === 'drip' && (
              <>
                <SummaryRow
                  label="Jours d'envoi"
                  value={form.send_days.map((d) => DAY_MAP[d]).join(', ') || 'Non défini'}
                />
                <SummaryRow label="Heure d'envoi" value={`${form.send_time} (${form.timezone})`} />
                <SummaryRow label="Date de début" value={form.starts_at || 'Non défini'} />
              </>
            )}
            {form.type === 'one_shot' && (
              <SummaryRow label="Date d'envoi" value={`${form.starts_at} à ${form.send_time}`} />
            )}
            {form.notes && <SummaryRow label="Notes" value={form.notes} />}
          </div>

          {planningDates.length > 0 && form.type === 'drip' && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Planning d'envoi</p>
              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {planningDates.map((date, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="font-medium text-gray-700">Message {i + 1}</span>
                    <span className="text-gray-500">
                      {date.toLocaleDateString('fr-FR', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}{' '}
                      à {form.send_time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
        <button
          type="button"
          onClick={prevStep}
          disabled={step === 0}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={16} />
          Précédent
        </button>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={nextStep}
            disabled={!canNext()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Suivant
            <ChevronRight size={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Zap size={15} />
            Lancer la série
          </button>
        )}
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4 px-4 py-3">
      <span className="text-sm text-gray-500 w-36 shrink-0">{label}</span>
      <span className="text-sm text-gray-900 font-medium">{value}</span>
    </div>
  )
}
