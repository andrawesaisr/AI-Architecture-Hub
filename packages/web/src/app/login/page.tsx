'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import { login, signup } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (mode === 'signup') {
        await signup(email, password, name);
      }

      const { token } = await login(email, password);
      localStorage.setItem('token', token);
      router.push('/');
    } catch (err: any) {
      setError(err.message ?? 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
      <div className="w-full max-w-md rounded-lg bg-slate-900 p-8 shadow-xl">
        <h1 className="mb-6 text-3xl font-bold text-center">
          {mode === 'login' ? 'Sign in' : 'Create an account'}
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="name">
                Name (optional)
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white focus:border-sky-500 focus:outline-none"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white focus:border-sky-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white focus:border-sky-500 focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-sky-600 px-4 py-2 font-semibold transition hover:bg-sky-500 disabled:opacity-50"
          >
            {isSubmitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-400">
          {mode === 'login' ? 'Need an account?' : 'Already registered?'}{' '}
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="font-semibold text-sky-400 hover:text-sky-300"
          >
            {mode === 'login' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </main>
  );
}
