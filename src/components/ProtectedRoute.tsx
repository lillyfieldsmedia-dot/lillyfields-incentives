import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { UserRole } from '@/lib/database.types'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!profile) {
    return (
      <div className="flex h-screen items-center justify-center p-4 text-center">
        <div>
          <p className="text-lg font-medium">Account not set up</p>
          <p className="text-muted-foreground">Your profile hasn't been created yet. Contact an admin.</p>
        </div>
      </div>
    )
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
