import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { getAuthStatus } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const requestHeaders = await headers();
  const auth = await getAuthStatus(requestHeaders.get('cookie'));
  if (auth.authenticated) redirect('/');

  return <LoginForm configured={auth.configured} />;
}
