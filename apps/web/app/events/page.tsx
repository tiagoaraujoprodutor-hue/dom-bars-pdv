'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, getToken } from '@/lib/api';
import { Topbar } from '@/components/topbar';

interface EventItem {
  id: string;
  name: string;
  status: string;
  role: string;
}

export default function EventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api<EventItem[]>('/events')
      .then(setEvents)
      .catch((e) => setError((e as Error).message));
  }, [router]);

  return (
    <>
      <Topbar />
      <div className="container">
        <div className="spread">
          <h1>Eventos</h1>
          <Link href="/events/new">
            <button>+ Novo evento</button>
          </Link>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="grid grid-3" style={{ marginTop: 16 }}>
          {events.map((ev) => (
            <Link key={ev.id} href={`/events/${ev.id}/dashboard`} className="card">
              <div className="spread">
                <strong>{ev.name}</strong>
                <span className="pill">{ev.role}</span>
              </div>
              <div className="muted" style={{ marginTop: 8 }}>
                {ev.status}
              </div>
            </Link>
          ))}
          {events.length === 0 && !error && <p className="muted">Nenhum evento ainda.</p>}
        </div>
      </div>
    </>
  );
}
