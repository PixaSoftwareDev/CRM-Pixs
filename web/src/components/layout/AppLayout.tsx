import { type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { MobileNav } from './MobileNav'

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface-raised">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        {/* pb-20 on mobile leaves room for the bottom nav */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">{children}</main>
      </div>
      <MobileNav />
    </div>
  )
}
