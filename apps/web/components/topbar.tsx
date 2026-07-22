'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { logout } from '@/lib/auth';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  eventos: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /></>,
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  produtos: <><path d="M3 7l9-4 9 4-9 4-9-4Z" /><path d="M3 7v10l9 4 9-4V7" /></>,
  atendentes: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.5a3.2 3.2 0 0 1 0 6M20.5 20a5.5 5.5 0 0 0-4-5.3" /></>,
  usuarios: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>,
  relatorios: <><path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M9 12h6M9 16h6M9 8h2" /></>,
  sair: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
};

export function Topbar({ eventId }: { eventId?: string }) {
  const router = useRouter();
  const pathname = usePathname() ?? '';

  const links = eventId
    ? [
        { href: `/events/${eventId}/dashboard`, label: 'Dashboard', icon: 'dashboard' },
        { href: `/events/${eventId}/products`, label: 'Produtos', icon: 'produtos' },
        { href: `/events/${eventId}/attendants`, label: 'Atendentes', icon: 'atendentes' },
        { href: `/events/${eventId}/users`, label: 'Usuários', icon: 'usuarios' },
        { href: `/events/${eventId}/reports`, label: 'Relatórios', icon: 'relatorios' },
      ]
    : [];

  return (
    <aside className="sidebar">
      <div className="side-brand">
        <span className="logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="#04231a" strokeWidth={2.2} strokeLinejoin="round">
            <path d="M5 3h14l-1 7a6 6 0 0 1-12 0L5 3Z" />
            <path d="M12 16v5M8 21h8" strokeLinecap="round" />
          </svg>
        </span>
        <div className="txt">
          <b>Dom Bars</b>
          <span>PDV Eventos</span>
        </div>
      </div>

      <nav className="side-nav">
        <Link href="/events" className={pathname === '/events' ? 'active' : ''}>
          <Icon>{ICONS.eventos}</Icon>
          <span className="lbl">Eventos</span>
        </Link>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={pathname.startsWith(l.href) ? 'active' : ''}>
            <Icon>{ICONS[l.icon]}</Icon>
            <span className="lbl">{l.label}</span>
          </Link>
        ))}
      </nav>

      <div className="side-foot">
        <button
          className="secondary"
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          onClick={() => {
            logout();
            router.push('/login');
          }}
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            {ICONS.sair}
          </svg>
          <span className="lbl">Sair</span>
        </button>
      </div>
    </aside>
  );
}
