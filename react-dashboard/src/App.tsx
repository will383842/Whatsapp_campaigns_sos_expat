import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuthContext } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Series from './pages/Series'
import SeriesCreate from './pages/SeriesCreate'
import SeriesDetail from './pages/SeriesDetail'
import Stats from './pages/Stats'
import Groups from './pages/Groups'
import WhatsAppStatus from './pages/WhatsAppStatus'
import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

// ── Query client ───────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

// ── Protected route ────────────────────────────────────────────────────────────

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuthContext()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <Loader2 size={32} className="animate-spin text-green-500" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return <>{children}</>
}

// ── Admin route ────────────────────────────────────────────────────────────────

function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading, isAdmin } = useAuthContext()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <Loader2 size={32} className="animate-spin text-green-500" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🚫</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Accès refusé</h2>
          <p className="text-sm text-gray-500">
            Vous n'avez pas les droits nécessaires pour accéder à cette page.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

// ── App routes ─────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/series" replace />} />

        <Route path="series" element={<Series />} />

        <Route
          path="series/create"
          element={
            <AdminRoute>
              <SeriesCreate />
            </AdminRoute>
          }
        />

        <Route path="series/:id" element={<SeriesDetail />} />

        <Route path="stats" element={<Stats />} />
        <Route path="groups" element={<Groups />} />
        <Route path="whatsapp" element={<WhatsAppStatus />} />
      </Route>

      <Route path="*" element={<Navigate to="/series" replace />} />
    </Routes>
  )
}

// ── App root ───────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
