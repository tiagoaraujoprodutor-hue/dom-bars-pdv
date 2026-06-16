'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { logout } from '@/lib/auth';

export function Topbar({ eventId }: { eventId?: string }) {
  const router = useRouter();
  return (
    <nav className="topbar">
      <strong>PDV</strong>
      <Link href="/events">Eventos</Link>
      {eventId && (
        <>
          <Link href={`/events/${eventId}/dashboard`}>Dashboard</Link>
          <Link href={`/events/${eventId}/products`}>Produtos</Link>
          <Link href={`/events/${eventId}/users`}>Usuários</Link>
          <Link href={`/events/${eventId}/reports`}>Relatórios</Link>
        </>
      )}
      <span style={{ marginLeft: 'auto' }} />
      <button
        className="secondary"
        onClick={() => {
          logout();
          router.push('/login');
        }}
      >
        Sair
      </button>
    </nav>
  );
}
