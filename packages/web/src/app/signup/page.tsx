'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsSubmitting(true);

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            // Pass the user's name to be stored in user_metadata
            name,
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      setMessage('Signup successful! Please check your email to confirm your account.');
      // Clear form on success
      setName('');
      setEmail('');
      setPassword('');

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-slate-950 text-white">
      <div className="w-full max-w-md rounded-lg bg-slate-900 p-8 shadow-xl">
        <h1 className="text-4xl font-bold mb-8 text-center">Sign Up</h1>
        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block mb-2 font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 border rounded-md bg-slate-800 border-slate-700 text-white focus:border-sky-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="block mb-2 font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 border rounded-md bg-slate-800 border-slate-700 text-white focus:border-sky-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="block mb-2 font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 border rounded-md bg-slate-800 border-slate-700 text-white focus:border-sky-500 focus:outline-none"
              required
            />
          </div>
          {error && <p className="text-red-500">{error}</p>}
          {message && <p className="text-green-500">{message}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-500 disabled:opacity-50"
          >
            {isSubmitting ? 'Signing up...' : 'Sign Up'}
          </button>
        </form>
        <p className="mt-4 text-center text-slate-400">
          Already have an account?{' '}
          <a href="/login" className="text-sky-400 hover:underline">
            Login
          </a>
        </p>
      </div>
    </main>
  );
}
