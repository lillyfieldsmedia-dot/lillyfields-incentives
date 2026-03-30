import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  LayoutDashboard,
  PlusCircle,
  BarChart3,
  Users,
  UserCog,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { InstallPrompt } from '@/components/InstallPrompt'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
    isActive
      ? 'bg-primary text-primary-foreground'
      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
  )

const mobileNavClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex flex-col items-center gap-1 text-xs py-2 px-3 min-w-0',
    isActive ? 'text-primary' : 'text-muted-foreground'
  )

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const role = profile?.role

  const canLog = role === 'manager' || role === 'coordinator' || role === 'admin'
  const canViewReports = role === 'finance' || role === 'admin'
  const isAdmin = role === 'admin'

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', show: true },
    { to: '/log', icon: PlusCircle, label: 'Log', show: canLog },
    { to: '/reports', icon: BarChart3, label: 'Reports', show: canViewReports },
    { to: '/staff', icon: Users, label: 'Staff', show: isAdmin },
    { to: '/users', icon: UserCog, label: 'Users', show: isAdmin },
  ].filter((item) => item.show)

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Mobile header */}
      <header className="flex items-center justify-between border-b bg-white px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
            £
          </div>
          <span className="font-semibold">Lillyfields</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground capitalize">{role}</span>
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      {/* Mobile slide-out menu */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setSidebarOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute right-0 top-0 h-full w-64 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <span className="font-semibold">{profile?.full_name}</span>
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <nav className="space-y-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={navLinkClass}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-8 border-t pt-4">
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r bg-white md:flex md:flex-col">
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-bold text-white">
            £
          </div>
          <div>
            <p className="text-sm font-semibold">Lillyfields</p>
            <p className="text-xs text-muted-foreground">Incentive Tracker</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClass}>
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-4">
          <div className="mb-3 px-3">
            <p className="text-sm font-medium">{profile?.full_name}</p>
            <p className="text-xs capitalize text-muted-foreground">{role}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        <div className="mx-auto max-w-5xl p-4 md:p-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t bg-white pb-safe md:hidden">
        {navItems.slice(0, 4).map((item) => (
          <NavLink key={item.to} to={item.to} className={mobileNavClass}>
            <item.icon className="h-5 w-5" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
        <button onClick={handleSignOut} className="flex flex-col items-center gap-1 px-3 py-2 text-xs text-muted-foreground">
          <LogOut className="h-5 w-5" />
          <span>Out</span>
        </button>
      </nav>

      <InstallPrompt />
    </div>
  )
}
