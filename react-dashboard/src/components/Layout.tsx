import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BarChart2, List, LogOut, MessageSquare, Users, Wifi, WifiOff, Smartphone } from 'lucide-react'
import { useAuthContext } from '../contexts/AuthContext'
import { useWhatsAppStatus } from '../hooks/useSeries'

const navItems = [
  { to: '/series', label: 'Séries', icon: List },
  { to: '/groups', label: 'Groupes', icon: Users },
  { to: '/stats', label: 'Statistiques', icon: BarChart2 },
]

export default function Layout() {
  const { user, isAdmin, logout } = useAuthContext()
  const navigate = useNavigate()
  const { data: waStatus } = useWhatsAppStatus()

  const waConnected = waStatus?.connected === true

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex flex-col bg-gray-900 text-white shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-700">
          <div className="w-9 h-9 bg-green-500 rounded-lg flex items-center justify-center shrink-0">
            <MessageSquare size={18} className="text-white" />
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight">Campaigns</p>
            <p className="text-xs text-gray-400 leading-tight">SOS-Expat</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-green-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}

          {/* WhatsApp status link */}
          <NavLink
            to="/whatsapp"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-green-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            {waConnected ? <Wifi size={18} /> : <WifiOff size={18} />}
            <span className="flex-1">WhatsApp</span>
            <span className={'w-2.5 h-2.5 rounded-full shrink-0 ' + (waConnected ? 'bg-green-400' : 'bg-red-400')} />
          </NavLink>

          {/* WhatsApp Numbers link (admin only) */}
          {isAdmin && (
            <NavLink
              to="/whatsapp/numbers"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-green-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Smartphone size={18} />
              <span className="flex-1">Numéros</span>
            </NavLink>
          )}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-gray-700">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name}</p>
              <span
                className={`inline-block text-xs px-2 py-0.5 rounded-full mt-0.5 font-medium ${
                  isAdmin ? 'bg-green-700 text-green-100' : 'bg-gray-700 text-gray-300'
                }`}
              >
                {isAdmin ? 'Admin' : 'Lecteur'}
              </span>
            </div>
            <button
              onClick={handleLogout}
              title="Se déconnecter"
              className="ml-2 p-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
