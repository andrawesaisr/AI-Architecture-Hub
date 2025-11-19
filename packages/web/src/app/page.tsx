'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { fetchWithAuth } from '@/lib/api';

interface ProjectSummary {
  id: string;
  name: string;
  stack: string;
  architectureStyle: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    stack: 'Next.js + NestJS + Prisma',
    architectureStyle: 'Modular Monolith',
    description: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const response = await fetchWithAuth('/projects');
        if (!response.ok) throw new Error('Failed to load projects');
        const data = await response.json();
        setProjects(data);
      } catch (err: any) {
        setError(err.message ?? 'Unable to load projects');
      } finally {
        setIsLoading(false);
      }
    };

    loadProjects();
  }, []);

  const handleCreateProject = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetchWithAuth('/projects', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Handle specific error cases
        if (response.status === 503) {
          throw new Error(errorData.error || 'AI service is currently overloaded. Please try again in a few moments.');
        }
        
        throw new Error(errorData.error || 'Failed to create project');
      }
      
      const project = await response.json();
      setProjects((prev) => [project, ...prev]);
      router.push(`/projects/${project.id}`);
    } catch (err: any) {
      setError(err.message ?? 'Project creation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <section className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-2 border-b border-slate-800 pb-6">
          <h1 className="text-4xl font-bold">AI Architecture Hub</h1>
          <p className="text-slate-400">Manage architecture specs, collaborate, and export scaffolding.</p>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <button
              onClick={() => router.push('/login')}
              className="rounded-md border border-slate-700 px-3 py-1 transition hover:border-sky-500 hover:text-sky-400"
            >
              Switch account
            </button>
            <span>Token stored locally after sign-in.</span>
          </div>
        </header>

        <section className="grid gap-8 lg:grid-cols-[2fr,3fr]">
          <form onSubmit={handleCreateProject} className="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg">
            <h2 className="text-xl font-semibold">Create a new project</h2>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="name">
                Name
              </label>
              <input
                id="name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
                className="w-full rounded-md border border-slate-700 bg-slate-800 p-2 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="mb-1 block text-sm font-medium" htmlFor="stack">
                Tech stack
                <select
                  id="stack"
                  value={form.stack}
                  onChange={(event) => setForm({ ...form, stack: event.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 focus:border-sky-500 focus:outline-none"
                >
                  <option value="Next.js + NestJS + Prisma">Next.js + NestJS + Prisma</option>
                  <option value="Node.js + Express + PostgreSQL">Node.js + Express + PostgreSQL</option>
                  <option value="FastAPI + PostgreSQL">FastAPI + PostgreSQL</option>
                  <option value="Go + Fiber + PostgreSQL">Go + Fiber + PostgreSQL</option>
                  <option value="Serverless (AWS Lambda + DynamoDB)">Serverless (AWS Lambda + DynamoDB)</option>
                </select>
              </label>
              <label className="mb-1 block text-sm font-medium" htmlFor="architectureStyle">
                Architecture style
                <select
                  id="architectureStyle"
                  value={form.architectureStyle}
                  onChange={(event) => setForm({ ...form, architectureStyle: event.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 focus:border-sky-500 focus:outline-none"
                >
                  <option>Modular Monolith</option>
                  <option>Microservices</option>
                  <option>Monolith</option>
                  <option>Serverless</option>
                  <option>Event-Driven</option>
                </select>
              </label>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="description">
                Description
              </label>
              <textarea
                id="description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                required
                rows={6}
                placeholder="Describe the problem space, requirements, and desired behaviours."
                className="w-full rounded-md border border-slate-700 bg-slate-800 p-3 focus:border-sky-500 focus:outline-none"
              />
            </div>
            {error && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3">
                <p className="text-sm font-semibold text-red-300">⚠️ {error}</p>
              </div>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-sky-600 px-4 py-2 font-semibold transition hover:bg-sky-500 disabled:opacity-50"
            >
              {isSubmitting ? 'Generating skeleton…' : 'Create project'}
            </button>
          </form>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Your projects</h2>
              {isLoading && <span className="text-sm text-slate-500">Loading…</span>}
            </div>
            {projects.length === 0 && !isLoading ? (
              <p className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-slate-500">
                No projects yet. Use the form to create one.
              </p>
            ) : (
              <ul className="space-y-3">
                {projects.map((project) => (
                  <li key={project.id} className="rounded-lg border border-slate-800 bg-slate-900 p-4 transition hover:border-sky-500">
                    <div className="flex items-start justify-between">
                      <div>
                        <Link href={`/projects/${project.id}`} className="text-lg font-semibold text-sky-400 hover:text-sky-300">
                          {project.name}
                        </Link>
                        <p className="text-sm text-slate-400">{project.stack}</p>
                        <p className="text-xs text-slate-500">Architecture: {project.architectureStyle}</p>
                      </div>
                      <span className="text-xs text-slate-500">Updated {new Date(project.updatedAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{project.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
