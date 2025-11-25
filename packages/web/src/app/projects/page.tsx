'use client';

import { useEffect, useState } from 'react';
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

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <section className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-2 border-b border-slate-800 pb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold">Projects</h1>
              <p className="text-slate-400">View and manage your architecture projects.</p>
            </div>
            <button
              onClick={() => router.push('/')}
              className="rounded-md bg-sky-600 px-4 py-2 font-semibold transition hover:bg-sky-500"
            >
              Create New Project
            </button>
          </div>
        </header>

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4">
            <p className="text-sm font-semibold text-red-300">⚠️ {error}</p>
          </div>
        )}

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">All Projects</h2>
            {isLoading && <span className="text-sm text-slate-500">Loading…</span>}
          </div>

          {projects.length === 0 && !isLoading ? (
            <div className="rounded-lg border border-dashed border-slate-800 p-12 text-center">
              <p className="mb-4 text-lg text-slate-400">No projects yet.</p>
              <button
                onClick={() => router.push('/')}
                className="rounded-md bg-sky-600 px-6 py-2 font-semibold transition hover:bg-sky-500"
              >
                Create Your First Project
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="group rounded-lg border border-slate-800 bg-slate-900 p-5 transition hover:border-sky-500 hover:shadow-lg"
                >
                  <div className="mb-3">
                    <h3 className="text-lg font-semibold text-sky-400 group-hover:text-sky-300">
                      {project.name}
                    </h3>
                    <p className="text-sm text-slate-400">{project.stack}</p>
                    <p className="text-xs text-slate-500">
                      Architecture: {project.architectureStyle}
                    </p>
                  </div>
                  <p className="mb-3 line-clamp-3 text-sm text-slate-400">
                    {project.description}
                  </p>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Created {new Date(project.createdAt).toLocaleDateString()}</span>
                    <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
