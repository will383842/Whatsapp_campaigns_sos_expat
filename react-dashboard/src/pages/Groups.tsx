import { useState, useMemo } from 'react'
import { useGroups, useSyncGroups, useUpdateGroup, useAssignNumber, useGroupParticipants, useGroupMembers } from '../hooks/useSeries'
import { useWhatsAppNumbers } from '../hooks/useWhatsAppNumbers'
import { useAuthContext } from '../contexts/AuthContext'
import { RefreshCw, Search, Users, Loader2, AlertTriangle, Check, X, MessageCircle, Edit3, Eye, Shield } from 'lucide-react'
import type { Group } from '../types/series'

const LANG_OPTIONS = [
  { value: 'fr', label: 'Francais', flag: '\u{1F1EB}\u{1F1F7}' },
  { value: 'en', label: 'English', flag: '\u{1F1EC}\u{1F1E7}' },
  { value: 'de', label: 'Deutsch', flag: '\u{1F1E9}\u{1F1EA}' },
  { value: 'pt', label: 'Portugues', flag: '\u{1F1E7}\u{1F1F7}' },
  { value: 'es', label: 'Espanol', flag: '\u{1F1EA}\u{1F1F8}' },
  { value: 'it', label: 'Italiano', flag: '\u{1F1EE}\u{1F1F9}' },
  { value: 'nl', label: 'Nederlands', flag: '\u{1F1F3}\u{1F1F1}' },
  { value: 'ar', label: 'Arabe', flag: '\u{1F1F8}\u{1F1E6}' },
  { value: 'zh', label: 'Zhongwen', flag: '\u{1F1E8}\u{1F1F3}' },
  { value: 'ru', label: 'Russkiy', flag: '\u{1F1F7}\u{1F1FA}' },
]

function getLangFlag(lang: string) {
  return LANG_OPTIONS.find((o) => o.value === lang)?.flag || ''
}

function getLangLabel(lang: string) {
  return LANG_OPTIONS.find((o) => o.value === lang)?.label || lang
}

export default function Groups() {
  const { isAdmin } = useAuthContext()
  const { data: groups, isLoading, error } = useGroups()
  const syncMutation = useSyncGroups()
  const updateMutation = useUpdateGroup()
  const assignNumberMutation = useAssignNumber()
  const { data: waNumbers } = useWhatsAppNumbers()

  const [search, setSearch] = useState('')
  const [filterLang, setFilterLang] = useState('all')
  const [filterActive, setFilterActive] = useState('all')
  const [filterCommunity, setFilterCommunity] = useState('all')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // Welcome message editor state
  const [editingWelcome, setEditingWelcome] = useState<Group | null>(null)
  const [welcomeDraft, setWelcomeDraft] = useState('')

  // Participants viewer state
  const [viewingParticipants, setViewingParticipants] = useState<Group | null>(null)
  const [participantsTab, setParticipantsTab] = useState<'live' | 'saved'>('live')
  const { data: participantsData, isLoading: participantsLoading } = useGroupParticipants(viewingParticipants?.id ?? null)
  const { data: membersData, isLoading: membersLoading } = useGroupMembers(viewingParticipants?.id ?? null)

  const allGroups: Group[] = groups ?? []

  // Get unique community names
  const communities = useMemo(() => {
    const names = new Set<string>()
    allGroups.forEach((g) => {
      if (g.community_name) names.add(g.community_name)
    })
    return Array.from(names).sort()
  }, [allGroups])

  // Filter
  const filtered = useMemo(() => {
    return allGroups.filter((g) => {
      if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false
      if (filterLang !== 'all' && g.language !== filterLang) return false
      if (filterActive === 'active' && !g.is_active) return false
      if (filterActive === 'inactive' && g.is_active) return false
      if (filterCommunity !== 'all') {
        if (filterCommunity === '_none' && g.community_name) return false
        if (filterCommunity !== '_none' && g.community_name !== filterCommunity) return false
      }
      return true
    })
  }, [allGroups, search, filterLang, filterActive, filterCommunity])

  // Group by community
  const sections = useMemo(() => {
    const map: Record<string, Group[]> = {}
    filtered.forEach((g) => {
      const key = g.community_name || 'Sans communaut\u00e9'
      if (!map[key]) map[key] = []
      map[key].push(g)
    })
    return Object.keys(map)
      .sort((a, b) => {
        if (a === 'Sans communaut\u00e9') return 1
        if (b === 'Sans communaut\u00e9') return -1
        return a.localeCompare(b)
      })
      .map((name) => ({ name, groups: map[name] }))
  }, [filtered])

  const activeCount = allGroups.filter((g) => g.is_active).length
  const welcomeCount = allGroups.filter((g) => g.welcome_enabled).length
  const unassignedCount = allGroups.filter((g) => g.is_active && !g.whatsapp_number_id).length

  const handleToggleActive = (group: Group) => {
    updateMutation.mutate({ id: group.id, data: { is_active: !group.is_active } })
  }

  const handleToggleWelcome = (group: Group) => {
    updateMutation.mutate({ id: group.id, data: { welcome_enabled: !group.welcome_enabled } })
  }

  const handleLanguageChange = (group: Group, language: string) => {
    updateMutation.mutate({ id: group.id, data: { language } })
  }

  const openWelcomeEditor = (group: Group) => {
    setEditingWelcome(group)
    setWelcomeDraft(group.welcome_message || '')
  }

  const saveWelcomeMessage = () => {
    if (!editingWelcome) return
    updateMutation.mutate(
      { id: editingWelcome.id, data: { welcome_message: welcomeDraft || null } },
      { onSuccess: () => setEditingWelcome(null) }
    )
  }

  const toggleCollapse = (name: string) => {
    setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }))
  }

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
          <span>Erreur lors du chargement des groupes.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Groupes WhatsApp</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {allGroups.length} groupes ({activeCount} actifs) &middot; {communities.length} communaut&eacute;s &middot; {welcomeCount} avec bienvenue
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {syncMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            <span>{syncMutation.isPending ? 'Synchronisation...' : 'Sync WhatsApp'}</span>
          </button>
        )}
      </div>

      {/* Sync result */}
      {syncMutation.isSuccess && syncMutation.data && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          <Check size={16} />
          <span>
            Sync termin&eacute;e : {syncMutation.data.created} cr&eacute;&eacute;s, {syncMutation.data.updated} mis &agrave; jour, {syncMutation.data.skipped} ignor&eacute;s. Total : {syncMutation.data.total_in_db}
          </span>
        </div>
      )}

      {syncMutation.isError && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle size={16} />
          <span>Erreur de synchronisation</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher un groupe..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <select
          value={filterCommunity}
          onChange={(e) => setFilterCommunity(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="all">Toutes les communaut&eacute;s</option>
          <option value="_none">Sans communaut&eacute;</option>
          {communities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={filterLang}
          onChange={(e) => setFilterLang(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="all">Toutes les langues</option>
          {LANG_OPTIONS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.flag} {l.label}
            </option>
          ))}
        </select>
        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="all">Tous</option>
          <option value="active">Actifs</option>
          <option value="inactive">Inactifs</option>
        </select>
      </div>

      {/* Anti-ban warning */}
      {unassignedCount > 0 && (
        <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-xl flex items-start gap-3">
          <AlertTriangle size={18} className="text-orange-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-700">
              {unassignedCount} groupe(s) actif(s) sans numéro WhatsApp assigné
            </p>
            <p className="text-xs text-orange-600 mt-0.5">
              Ces groupes utilisent le mode Auto (rotation entre numéros), ce qui augmente le risque de ban.
              Assignez un numéro fixe via la colonne "Numéro" ci-dessous.
            </p>
          </div>
        </div>
      )}

      {/* Groups by community */}
      {sections.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Users size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Aucun groupe trouv&eacute;</p>
        </div>
      )}

      <div className="space-y-4">
        {sections.map((section) => {
          const isCollapsed = collapsed[section.name] === true
          const activeInSection = section.groups.filter((g) => g.is_active).length

          return (
            <div key={section.name} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              {/* Community header */}
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50">
                <button
                  type="button"
                  onClick={() => toggleCollapse(section.name)}
                  className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                  <span className="text-gray-400 text-sm">{isCollapsed ? '\u25B6' : '\u25BC'}</span>
                  <span className="font-semibold text-gray-800">{section.name}</span>
                  <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                    {section.groups.length} groupes
                  </span>
                  <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                    {activeInSection} actifs
                  </span>
                </button>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => section.groups.forEach((g) => { if (!g.welcome_enabled) updateMutation.mutate({ id: g.id, data: { welcome_enabled: true } }) })}
                      className="text-xs px-2.5 py-1 text-purple-700 bg-purple-100 rounded-md hover:bg-purple-200 transition-colors"
                    >
                      Bienvenue ON
                    </button>
                    <button
                      type="button"
                      onClick={() => section.groups.forEach((g) => { if (!g.is_active) updateMutation.mutate({ id: g.id, data: { is_active: true } }) })}
                      className="text-xs px-2.5 py-1 text-green-700 bg-green-100 rounded-md hover:bg-green-200 transition-colors"
                    >
                      Tout activer
                    </button>
                    <button
                      type="button"
                      onClick={() => section.groups.forEach((g) => { if (g.is_active) updateMutation.mutate({ id: g.id, data: { is_active: false } }) })}
                      className="text-xs px-2.5 py-1 text-red-700 bg-red-100 rounded-md hover:bg-red-200 transition-colors"
                    >
                      Tout d&eacute;sactiver
                    </button>
                  </div>
                )}
              </div>

              {/* Group rows */}
              {!isCollapsed && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-5 py-2 font-medium text-gray-500 text-xs uppercase tracking-wider">Nom</th>
                      <th className="text-center px-4 py-2 font-medium text-gray-500 text-xs uppercase tracking-wider w-24">Membres</th>
                      <th className="text-center px-4 py-2 font-medium text-gray-500 text-xs uppercase tracking-wider w-40">Langue</th>
                      <th className="text-center px-4 py-2 font-medium text-gray-500 text-xs uppercase tracking-wider w-24">Actif</th>
                      {isAdmin && (
                        <th className="text-center px-4 py-2 font-medium text-gray-500 text-xs uppercase tracking-wider w-36">Numéro</th>
                      )}
                      {isAdmin && (
                        <th className="text-center px-4 py-2 font-medium text-gray-500 text-xs uppercase tracking-wider w-32">Bienvenue</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {section.groups.map((group) => (
                      <tr
                        key={group.id}
                        className={'border-b border-gray-50 hover:bg-gray-50 transition-colors' + (!group.is_active ? ' opacity-50' : '')}
                      >
                        <td className="px-5 py-2.5">
                          <p className="font-medium text-gray-900 text-sm">{group.name}</p>
                        </td>
                        <td className="text-center px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => setViewingParticipants(group)}
                            className="text-gray-600 hover:text-green-600 transition-colors flex items-center gap-1 mx-auto"
                            title="Voir les membres"
                          >
                            <Eye size={13} />
                            <span>{group.member_count}</span>
                          </button>
                        </td>
                        <td className="text-center px-4 py-2.5">
                          {isAdmin ? (
                            <select
                              value={group.language}
                              onChange={(e) => handleLanguageChange(group, e.target.value)}
                              className="px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                            >
                              {LANG_OPTIONS.map((l) => (
                                <option key={l.value} value={l.value}>
                                  {l.flag} {l.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs">{getLangFlag(group.language)} {getLangLabel(group.language)}</span>
                          )}
                        </td>
                        <td className="text-center px-4 py-2.5">
                          {isAdmin ? (
                            <button
                              type="button"
                              onClick={() => handleToggleActive(group)}
                              className={'p-1.5 rounded-lg transition-colors ' + (
                                group.is_active
                                  ? 'bg-green-100 text-green-600 hover:bg-green-200'
                                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                              )}
                            >
                              {group.is_active ? <Check size={16} /> : <X size={16} />}
                            </button>
                          ) : (
                            <span className={'text-xs font-medium ' + (group.is_active ? 'text-green-600' : 'text-gray-400')}>
                              {group.is_active ? 'Oui' : 'Non'}
                            </span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="text-center px-4 py-2.5">
                            <select
                              value={group.whatsapp_number_id ?? ''}
                              onChange={(e) => {
                                const val = e.target.value ? Number(e.target.value) : null
                                assignNumberMutation.mutate({ whatsapp_number_id: val, group_ids: [group.id] })
                              }}
                              className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            >
                              <option value="">Auto</option>
                              {waNumbers?.map((n) => (
                                <option key={n.id} value={n.id}>{n.name}</option>
                              ))}
                            </select>
                          </td>
                        )}
                        {isAdmin && (
                          <td className="text-center px-4 py-2.5">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleToggleWelcome(group)}
                                className={'p-1.5 rounded-lg transition-colors ' + (
                                  group.welcome_enabled
                                    ? 'bg-purple-100 text-purple-600 hover:bg-purple-200'
                                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                )}
                                title={group.welcome_enabled ? 'Bienvenue actif' : 'Bienvenue inactif'}
                              >
                                <MessageCircle size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => openWelcomeEditor(group)}
                                className="p-1.5 rounded-lg bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
                                title="Modifier le message"
                              >
                                <Edit3 size={14} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
      </div>

      {/* Participants modal */}
      {viewingParticipants && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-semibold text-gray-900">Membres du groupe</h3>
                <p className="text-xs text-gray-500 mt-0.5">{viewingParticipants.name}</p>
              </div>
              <button
                type="button"
                onClick={() => { setViewingParticipants(null); setParticipantsTab('live') }}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-6 shrink-0">
              <button
                type="button"
                onClick={() => setParticipantsTab('live')}
                className={'px-3 py-2 text-xs font-medium border-b-2 transition-colors ' + (
                  participantsTab === 'live'
                    ? 'border-green-500 text-green-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                Tous les participants ({participantsData?.count ?? '...'})
              </button>
              <button
                type="button"
                onClick={() => setParticipantsTab('saved')}
                className={'px-3 py-2 text-xs font-medium border-b-2 transition-colors ' + (
                  participantsTab === 'saved'
                    ? 'border-green-500 text-green-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                Nouveaux membres ({membersData?.count ?? '...'})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-3">
              {/* Live WhatsApp participants */}
              {participantsTab === 'live' && (
                <>
                  {participantsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={24} className="animate-spin text-green-500" />
                    </div>
                  ) : participantsData?.participants ? (
                    <div className="space-y-1">
                      {participantsData.participants.map((p) => (
                        <div key={p.phone} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50">
                          <span className="text-sm text-gray-800">+{p.phone}</span>
                          {p.admin && (
                            <span className={'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ' + (
                              p.admin === 'superadmin'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-blue-100 text-blue-700'
                            )}>
                              <Shield size={10} />
                              {p.admin === 'superadmin' ? 'Super Admin' : 'Admin'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-sm text-red-600">
                      <AlertTriangle size={16} />
                      <span>Impossible de charger les participants.</span>
                    </div>
                  )}
                </>
              )}

              {/* Saved members (from database, with names) */}
              {participantsTab === 'saved' && (
                <>
                  {membersLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={24} className="animate-spin text-green-500" />
                    </div>
                  ) : membersData?.members && membersData.members.length > 0 ? (
                    <div className="space-y-1">
                      {membersData.members.map((m) => (
                        <div key={m.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{m.display_name}</p>
                            <p className="text-xs text-gray-400">+{m.phone}{m.joined_at ? ' \u00b7 ' + new Date(m.joined_at).toLocaleDateString('fr-FR') : ''}</p>
                          </div>
                          {m.welcome_sent && (
                            <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Bienvenue envoy&eacute;</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <Users size={28} className="mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Aucun nouveau membre enregistr&eacute;</p>
                      <p className="text-xs mt-1">Les membres seront enregistr&eacute;s automatiquement quand ils rejoignent un groupe avec le welcome activ&eacute;.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Welcome message editor modal */}
      {editingWelcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Message de bienvenue</h3>
              <p className="text-xs text-gray-500 mt-0.5">{editingWelcome.name}</p>
            </div>
            <div className="px-6 py-4">
              <p className="text-xs text-gray-500 mb-3">
                Variables disponibles : <code className="bg-gray-100 px-1 rounded">{'{name}'}</code> (pr&eacute;nom du membre), <code className="bg-gray-100 px-1 rounded">{'{group_name}'}</code> (nom du groupe). Laissez vide pour utiliser le message par d&eacute;faut dans la langue du groupe.
              </p>
              <textarea
                value={welcomeDraft}
                onChange={(e) => setWelcomeDraft(e.target.value)}
                rows={6}
                placeholder="Laissez vide pour le message par defaut..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>
            <div className="px-6 py-3 bg-gray-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingWelcome(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={saveWelcomeMessage}
                disabled={updateMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {updateMutation.isPending ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
