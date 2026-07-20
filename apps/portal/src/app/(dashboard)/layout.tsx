import { redirect } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { getSessionUserAndRole } from '@/lib/auth/admin';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await getSessionUserAndRole();

  if (!user) redirect('/login');

  return (
    <div className="min-h-screen">
      <Nav email={user.email ?? null} isAdmin={role === 'admin'} />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
