'use client';

import Image from 'next/image';
import { SyntheticEvent, useState } from 'react';
import { KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm({ configured }: { configured: boolean }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const login = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || '暂时无法登录');
      window.location.assign('/');
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '暂时无法登录');
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 py-10 text-foreground">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex items-center justify-center gap-3">
          <Image src="/app-icon.png" alt="" width={48} height={48} className="size-12 rounded-2xl shadow-[0_12px_30px_rgba(79,70,229,.24)]" priority />
          <div>
            <p className="text-xl font-bold tracking-[-0.03em]">序时</p>
            <p className="text-sm text-muted-foreground">私人事项规划</p>
          </div>
        </div>

        <section className="rounded-[28px] border border-border bg-card p-6 shadow-[0_24px_80px_rgba(15,23,42,.08)] sm:p-8">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-[-0.035em]">访问验证</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">输入服务器配置的访问 Token，验证通过后才能读取或修改事项数据。</p>

          {configured ? (
            <form className="mt-7 space-y-5" onSubmit={login}>
              <div className="space-y-2">
                <Label htmlFor="access-token">访问 Token</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="access-token" type="password" autoComplete="current-password" value={token} onChange={(event) => setToken(event.target.value)} className="h-12 rounded-xl pl-10" required />
                </div>
              </div>
              {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
              <Button type="submit" className="h-12 w-full rounded-xl" disabled={submitting || !token}>
                {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                {submitting ? '正在验证' : '进入序时'}
              </Button>
            </form>
          ) : (
            <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900" role="alert">
              服务器尚未配置访问密钥。请设置 ACCESS_TOKEN 和 SESSION_SECRET 后重新启动。
            </div>
          )}
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">Token 只发送给当前站点，不会保存在浏览器脚本可读取的位置。</p>
      </div>
    </main>
  );
}
