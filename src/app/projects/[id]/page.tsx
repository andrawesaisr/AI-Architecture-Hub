'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  ADR,
  ChangePreview,
  ChangeRequest,
  Endpoint,
  Entity,
  Feature,
  FeatureIdea,
  GeneratedDocuments,
  Project,
  ProjectInvite,
  ProjectLock,
  Spec,
  Version,
} from '@ai-architecture-hub/core';

import { fetchWithAuth } from '@/lib/api';

interface ProjectWithRelations extends Project {
  collaborators?: Array<{ id: string; role: string; user?: { email: string } }>;
}

interface PreviewResponse {
  preview: ChangePreview;
  impactedFiles?: string[];
}

const defaultChangeRequest = JSON.stringify(
  {
    summary: 'Describe the change',
    operations: [
      {
        type: 'addEntity',
        entity: {
          id: 'entity-id',
          name: 'SampleEntity',
          fields: [
            { name: 'id', type: 'String' },
            { name: 'name', type: 'String' },
          ],
          relations: [],
        },
      },
    ],
  } satisfies ChangeRequest,
  null,
  2,
);

type EntityForm = {
  name: string;
  fieldsJson: string;
  relationsJson: string;
};

type EndpointForm = {
  method: Endpoint['method'];
  path: string;
  schemaJson: string;
};

export default function ProjectDetail({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectWithRelations | null>(null);
  const [spec, setSpec] = useState<Spec | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedDiff, setSelectedDiff] = useState<any>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [changeRequestText, setChangeRequestText] = useState(defaultChangeRequest);
  const [featureTitle, setFeatureTitle] = useState('');
  const [featureDescription, setFeatureDescription] = useState('');
  const [featureSuggestions, setFeatureSuggestions] = useState<string[]>([]);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'EDITOR' });
  const [adrForm, setAdrForm] = useState({ title: '', context: '', decision: '', consequences: '' });
  const [entityForms, setEntityForms] = useState<Record<string, EntityForm>>({});
  const [endpointForms, setEndpointForms] = useState<Record<string, EndpointForm>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const changeRequestObject = useMemo(() => {
    try {
      return JSON.parse(changeRequestText) as ChangeRequest;
    } catch (err) {
      return null;
    }
  }, [changeRequestText]);

  useEffect(() => {
    const initialise = async () => {
      setIsLoading(true);
      try {
        await Promise.all([reloadProject(), reloadVersions()]);
      } catch (err: any) {
        setError(err.message ?? 'Failed to load project');
      } finally {
        setIsLoading(false);
      }
    };

    initialise();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    if (!spec) return;
    const entities = Array.isArray(spec.entities) ? spec.entities : [];
    const endpointsCurrent = Array.isArray(spec.endpoints) ? spec.endpoints : [];
    const entityState: Record<string, EntityForm> = {};
    entities.forEach((entity) => {
      entityState[entity.id] = {
        name: entity.name,
        fieldsJson: JSON.stringify(entity.fields, null, 2),
        relationsJson: JSON.stringify(entity.relations, null, 2),
      };
    });
    setEntityForms(entityState);

    const endpointState: Record<string, EndpointForm> = {};
    endpointsCurrent.forEach((endpoint) => {
      endpointState[endpoint.id] = {
        method: endpoint.method,
        path: endpoint.path,
        schemaJson: JSON.stringify(endpoint.schema, null, 2),
      };
    });
    setEndpointForms(endpointState);
  }, [spec]);

  async function reloadProject() {
    const response = await fetchWithAuth(`/projects/${params.id}`);
    if (!response.ok) throw new Error('Failed to load project');
    const data = (await response.json()) as ProjectWithRelations;
    setProject(data);
    setSpec(data.spec);
  }

  async function reloadVersions() {
    const response = await fetchWithAuth(`/projects/${params.id}/versions`);
    if (!response.ok) throw new Error('Failed to load versions');
    const data = await response.json();
    setVersions(data);
  }

  const handleEntitySave = async (entityId: string) => {
    const form = entityForms[entityId];
    if (!form) return;

    try {
      const fields = JSON.parse(form.fieldsJson);
      const relations = JSON.parse(form.relationsJson);
      const patch: Partial<Entity> = {
        name: form.name,
        fields,
        relations,
      };
      const response = await fetchWithAuth(`/projects/${params.id}/entities/${entityId}`, {
        method: 'PATCH',
        body: JSON.stringify({ patch }),
      });

      if (response.status === 409) {
        const data = await response.json();
        setPreview(data);
        alert('Conflicts detected while saving entity. Review preview section.');
        return;
      }

      if (!response.ok) throw new Error('Failed to update entity');
      const data = await response.json();
      await reloadProjectWithPayload(data);
    } catch (err: any) {
      alert(err.message ?? 'Entity update failed. Ensure fields and relations are valid JSON.');
    }
  };

  const handleEndpointSave = async (endpointId: string) => {
    const form = endpointForms[endpointId];
    if (!form) return;

    try {
      const schema = JSON.parse(form.schemaJson);
      const patch: Partial<Endpoint> = {
        method: form.method,
        path: form.path,
        schema,
      };
      const response = await fetchWithAuth(`/projects/${params.id}/endpoints/${endpointId}`, {
        method: 'PATCH',
        body: JSON.stringify({ patch }),
      });

      if (response.status === 409) {
        const data = await response.json();
        setPreview(data);
        alert('Conflicts detected while saving endpoint. Review preview section.');
        return;
      }

      if (!response.ok) throw new Error('Failed to update endpoint');
      const data = await response.json();
      await reloadProjectWithPayload(data);
    } catch (err: any) {
      alert(err.message ?? 'Endpoint update failed. Ensure schema JSON is valid.');
    }
  };

  const reloadProjectWithPayload = async (payload: any) => {
    if (payload?.project) {
      setProject(payload.project);
      setSpec(payload.project.spec);
    } else {
      await reloadProject();
    }
    await reloadVersions();
    setPreview(payload.preview ?? null);
  };

  const handlePreview = async () => {
    if (!changeRequestObject) {
      alert('Change request JSON is invalid.');
      return;
    }

    const response = await fetchWithAuth(`/projects/${params.id}/preview-change`, {
      method: 'POST',
      body: JSON.stringify({ changeRequest: changeRequestObject }),
    });
    if (!response.ok) {
      alert('Unable to preview change.');
      return;
    }
    const data = await response.json();
    setPreview(data);
  };

  const handleApplyChange = async () => {
    if (!changeRequestObject) {
      alert('Change request JSON is invalid.');
      return;
    }

    const response = await fetchWithAuth(`/projects/${params.id}/apply-change`, {
      method: 'POST',
      body: JSON.stringify({ changeRequest: changeRequestObject }),
    });

    if (response.status === 409) {
      const data = await response.json();
      setPreview(data);
      alert('Change cannot be applied due to conflicts.');
      return;
    }

    if (!response.ok) {
      alert('Failed to apply change. Ensure project is locked or change request valid.');
      return;
    }

    const data = await response.json();
    await reloadProjectWithPayload(data);
    setChangeRequestText(defaultChangeRequest);
  };

  const handleCreateFeature = async () => {
    if (!changeRequestObject) {
      alert('Change request JSON is invalid.');
      return;
    }
    if (!featureTitle) {
      alert('Feature title is required.');
      return;
    }

    const response = await fetchWithAuth(`/projects/${params.id}/features`, {
      method: 'POST',
      body: JSON.stringify({
        title: featureTitle,
        description: featureDescription,
        changeRequest: changeRequestObject,
      }),
    });

    if (!response.ok) {
      alert('Failed to create feature.');
      return;
    }

    await reloadProject();
    setFeatureTitle('');
    setFeatureDescription('');
    setFeatureSuggestions([]);
  };

  const handleFeatureSuggestions = async () => {
    if (!featureTitle) {
      alert('Enter a feature title to contextualise suggestions.');
      return;
    }

    const response = await fetchWithAuth('/llm/suggestions', {
      method: 'POST',
      body: JSON.stringify({ type: 'description', context: featureTitle }),
    });

    if (!response.ok) {
      alert('No suggestions available.');
      return;
    }

    const data = await response.json();
    setFeatureSuggestions(data.suggestions ?? []);
  };

  const handleViewDiff = async (versionId: string) => {
    const response = await fetchWithAuth(`/versions/${versionId}/diff`);
    if (!response.ok) {
      alert('Unable to load diff.');
      return;
    }
    const data = await response.json();
    setSelectedDiff(data);
  };

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault();
    const response = await fetchWithAuth(`/projects/${params.id}/invites`, {
      method: 'POST',
      body: JSON.stringify(inviteForm),
    });
    if (!response.ok) {
      alert('Failed to send invite.');
      return;
    }
    await reloadProject();
    setInviteForm({ email: '', role: 'EDITOR' });
  };

  const handleCreateADR = async (event: FormEvent) => {
    event.preventDefault();
    const response = await fetchWithAuth(`/projects/${params.id}/adrs`, {
      method: 'POST',
      body: JSON.stringify(adrForm),
    });
    if (!response.ok) {
      alert('Failed to log ADR.');
      return;
    }
    await reloadProject();
    setAdrForm({ title: '', context: '', decision: '', consequences: '' });
  };

  const handleLock = async (durationMinutes = 20) => {
    const response = await fetchWithAuth(`/projects/${params.id}/lock`, {
      method: 'POST',
      body: JSON.stringify({ durationMinutes }),
    });
    if (!response.ok) {
      alert('Unable to acquire lock.');
      return;
    }
    await reloadProject();
  };

  const handleUnlock = async () => {
    const response = await fetchWithAuth(`/projects/${params.id}/lock`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      alert('Unable to release lock.');
      return;
    }
    await reloadProject();
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p>Loading project…</p>
      </main>
    );
  }

  if (error || !project || !spec) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-red-400">
        <div className="text-center">
          <p className="text-xl font-semibold">Unable to load project.</p>
          {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
          <button
            onClick={() => router.push('/')}
            className="mt-6 rounded-md border border-red-500 px-4 py-2 text-sm text-red-200 hover:bg-red-500/20"
          >
            Back to dashboard
          </button>
        </div>
      </main>
    );
  }

  const lockActive = project.lock && new Date(project.lock.expiresAt) > new Date();

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-10">
        <header className="flex flex-col gap-2 border-b border-slate-800 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">{project.name}</h1>
              <p className="text-sm text-slate-400">{project.stack}</p>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <button
                onClick={() => router.push('/')}
                className="rounded-md border border-slate-700 px-3 py-1 transition hover:border-sky-500 hover:text-sky-400"
              >
                Back to dashboard
              </button>
              <button
                onClick={lockActive ? handleUnlock : () => handleLock()}
                className={`rounded-md px-3 py-1 font-semibold transition ${
                  lockActive ? 'border border-amber-500 text-amber-400 hover:bg-amber-500/10' : 'border border-emerald-500 text-emerald-400 hover:bg-emerald-500/10'
                }`}
              >
                {lockActive ? 'Release lock' : 'Lock for editing'}
              </button>
              {lockActive && project.lock && (
                <span className="text-xs text-slate-500">
                  Locked by {project.lock.lockedBy} until {new Date(project.lock.expiresAt).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
          <p className="text-sm text-slate-300">{project.description}</p>
        </header>

        <section className="grid gap-8 lg:grid-cols-[2fr,1fr]">
          <div className="space-y-8">
            <ArchitectureOverview spec={spec} />
            <DomainBrowser spec={spec} />
            <ApiContractPreview spec={spec} />
            <EntityEditor
              spec={spec}
              entityForms={entityForms}
              setEntityForms={setEntityForms}
              onSave={handleEntitySave}
            />
            <EndpointEditor
              spec={spec}
              endpointForms={endpointForms}
              setEndpointForms={setEndpointForms}
              onSave={handleEndpointSave}
            />
            <FeatureWorkbench
              changeRequestText={changeRequestText}
              setChangeRequestText={setChangeRequestText}
              onPreview={handlePreview}
              onApply={handleApplyChange}
              featureTitle={featureTitle}
              setFeatureTitle={setFeatureTitle}
              featureDescription={featureDescription}
              setFeatureDescription={setFeatureDescription}
              featureSuggestions={featureSuggestions}
              onCreateFeature={handleCreateFeature}
              onSuggest={handleFeatureSuggestions}
            />
            <SpecPreview spec={spec} />
          </div>

          <aside className="space-y-8">
            <PreviewPanel preview={preview} />
            <FeatureList features={project.features} />
            <VersionList versions={versions} onViewDiff={handleViewDiff} />
            {selectedDiff && <DiffViewer diff={selectedDiff} />}
            <DocumentsPanel documents={spec.generatedDocuments} />
            <FeatureIdeasPanel ideas={spec.featureIdeas} />
            <CollaborationPanel
              invites={project.invites as ProjectInvite[]}
              collaborators={project.collaborators ?? []}
              inviteForm={inviteForm}
              setInviteForm={setInviteForm}
              onInvite={handleInvite}
            />
            <ADRPanel adrs={project.adrs as ADR[]} adrForm={adrForm} setAdrForm={setAdrForm} onCreate={handleCreateADR} />
          </aside>
        </section>
      </div>
    </main>
  );
}

function EntityEditor({
  spec,
  entityForms,
  setEntityForms,
  onSave,
}: {
  spec: Spec;
  entityForms: Record<string, EntityForm>;
  setEntityForms: React.Dispatch<React.SetStateAction<Record<string, EntityForm>>>;
  onSave: (entityId: string) => void;
}) {
  const entities = Array.isArray(spec.entities) ? spec.entities : [];
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Entities</h2>
        <span className="text-xs text-slate-500">{entities.length} total</span>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        Update entity names, fields, and relations. Fields and relations expect valid JSON arrays.
      </p>
      <div className="mt-4 space-y-6">
        {entities.map((entity) => {
          const form = entityForms[entity.id];
          return (
            <div key={entity.id} className="rounded-md border border-slate-800 bg-slate-950 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-sky-400">{entity.name}</h3>
                <button
                  onClick={() => onSave(entity.id)}
                  className="rounded-md border border-sky-600 px-3 py-1 text-sm text-sky-300 hover:bg-sky-600/10"
                >
                  Save entity
                </button>
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <label className="text-sm text-slate-400">
                  Name
                  <input
                    value={form?.name ?? ''}
                    onChange={(event) =>
                      setEntityForms((prev) => ({
                        ...prev,
                        [entity.id]: { ...prev[entity.id], name: event.target.value },
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white focus:border-sky-500 focus:outline-none"
                  />
                </label>
                <label className="text-sm text-slate-400">
                  Fields
                  <textarea
                    value={form?.fieldsJson ?? ''}
                    onChange={(event) =>
                      setEntityForms((prev) => ({
                        ...prev,
                        [entity.id]: { ...prev[entity.id], fieldsJson: event.target.value },
                      }))
                    }
                    rows={6}
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  />
                </label>
                <label className="text-sm text-slate-400 md:col-span-2">
                  Relations
                  <textarea
                    value={form?.relationsJson ?? ''}
                    onChange={(event) =>
                      setEntityForms((prev) => ({
                        ...prev,
                        [entity.id]: { ...prev[entity.id], relationsJson: event.target.value },
                      }))
                    }
                    rows={4}
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EndpointEditor({
  spec,
  endpointForms,
  setEndpointForms,
  onSave,
}: {
  spec: Spec;
  endpointForms: Record<string, EndpointForm>;
  setEndpointForms: React.Dispatch<React.SetStateAction<Record<string, EndpointForm>>>;
  onSave: (endpointId: string) => void;
}) {
  const endpoints = Array.isArray(spec.endpoints) ? spec.endpoints : [];
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Endpoints</h2>
        <span className="text-xs text-slate-500">{endpoints.length} total</span>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        Adjust endpoint methods, paths, and response schema JSON.
      </p>
      <div className="mt-4 space-y-6">
        {endpoints.map((endpoint) => {
          const form = endpointForms[endpoint.id];
          return (
            <div key={endpoint.id} className="rounded-md border border-slate-800 bg-slate-950 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-emerald-400">
                  {endpoint.method} {endpoint.path}
                </h3>
                <button
                  onClick={() => onSave(endpoint.id)}
                  className="rounded-md border border-emerald-600 px-3 py-1 text-sm text-emerald-300 hover:bg-emerald-600/10"
                >
                  Save endpoint
                </button>
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <label className="text-sm text-slate-400">
                  Method
                  <input
                    value={form?.method ?? 'GET'}
                    onChange={(event) =>
                      setEndpointForms((prev) => ({
                        ...prev,
                        [endpoint.id]: {
                          ...prev[endpoint.id],
                          method: event.target.value.toUpperCase() as Endpoint['method'],
                        },
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white focus:border-emerald-500 focus:outline-none"
                  />
                </label>
                <label className="text-sm text-slate-400">
                  Path
                  <input
                    value={form?.path ?? ''}
                    onChange={(event) =>
                      setEndpointForms((prev) => ({
                        ...prev,
                        [endpoint.id]: { ...prev[endpoint.id], path: event.target.value },
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white focus:border-emerald-500 focus:outline-none"
                  />
                </label>
                <label className="text-sm text-slate-400 md:col-span-2">
                  Schema JSON
                  <textarea
                    value={form?.schemaJson ?? ''}
                    onChange={(event) =>
                      setEndpointForms((prev) => ({
                        ...prev,
                        [endpoint.id]: { ...prev[endpoint.id], schemaJson: event.target.value },
                      }))
                    }
                    rows={6}
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FeatureWorkbench({
  changeRequestText,
  setChangeRequestText,
  onPreview,
  onApply,
  featureTitle,
  setFeatureTitle,
  featureDescription,
  setFeatureDescription,
  featureSuggestions,
  onCreateFeature,
  onSuggest,
}: {
  changeRequestText: string;
  setChangeRequestText: (value: string) => void;
  onPreview: () => void;
  onApply: () => void;
  featureTitle: string;
  setFeatureTitle: (value: string) => void;
  featureDescription: string;
  setFeatureDescription: (value: string) => void;
  featureSuggestions: string[];
  onCreateFeature: () => void;
  onSuggest: () => void;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <h2 className="text-lg font-semibold">Change workbench</h2>
      <p className="mt-1 text-sm text-slate-400">
        Prototype a change, preview the impact, optionally persist as a new spec version, or capture it as a feature for review.
      </p>
      <div className="mt-4 space-y-4">
        <textarea
          value={changeRequestText}
          onChange={(event) => setChangeRequestText(event.target.value)}
          rows={12}
          className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
        />
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onPreview}
            className="rounded-md border border-sky-600 px-3 py-2 text-sm font-semibold text-sky-300 hover:bg-sky-600/10"
          >
            Preview change
          </button>
          <button
            onClick={onApply}
            className="rounded-md border border-emerald-600 px-3 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-600/10"
          >
            Apply change
          </button>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-950 p-4">
          <h3 className="text-base font-semibold text-slate-200">Create feature from change</h3>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-400">
              Title
              <input
                value={featureTitle}
                onChange={(event) => setFeatureTitle(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white focus:border-sky-500 focus:outline-none"
              />
            </label>
            <label className="text-sm text-slate-400">
              Description
              <textarea
                value={featureDescription}
                onChange={(event) => setFeatureDescription(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white focus:border-sky-500 focus:outline-none"
              />
            </label>
          </div>
          {featureSuggestions.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">Suggestions</p>
              <ul className="space-y-2 text-sm text-slate-300">
                {featureSuggestions.map((suggestion) => (
                  <li key={suggestion} className="rounded-md border border-slate-800 bg-slate-900 p-2">
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              onClick={onCreateFeature}
              className="rounded-md border border-purple-600 px-3 py-2 text-sm font-semibold text-purple-300 hover:bg-purple-600/10"
            >
              Submit feature for review
            </button>
            <button
              onClick={onSuggest}
              className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Get description suggestions
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function SpecPreview({ spec }: { spec: Spec }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <h2 className="text-lg font-semibold">Spec snapshot</h2>
      <p className="mt-1 text-sm text-slate-400">Full spec stored in the versioned history.</p>
      <pre className="mt-3 max-h-80 overflow-auto rounded-md border border-slate-800 bg-slate-950 p-4 text-xs text-slate-300 whitespace-pre-wrap break-words">
        {JSON.stringify(spec, null, 2)}
      </pre>
    </section>
  );
}

function PreviewPanel({ preview }: { preview: PreviewResponse | null }) {
  if (!preview) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg text-sm text-slate-500">
        Preview changes and conflicts will appear here.
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-200">Change preview</h2>
        <span className="text-xs text-slate-500">Diff &amp; validation results</span>
      </div>
      {preview.impactedFiles && preview.impactedFiles.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Impacted files</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            {preview.impactedFiles.map((file) => (
              <li key={file} className="rounded-md border border-slate-800 bg-slate-950 p-2">
                {file}
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview.preview.conflicts.length > 0 && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3">
          <p className="text-sm font-semibold text-red-300">Conflicts</p>
          <ul className="mt-2 space-y-2 text-sm text-red-200">
            {preview.preview.conflicts.map((conflict, index) => (
              <li key={`${conflict.message}-${index}`}>{conflict.message}</li>
            ))}
          </ul>
        </div>
      )}
      <details className="rounded-md border border-slate-800 bg-slate-950">
        <summary className="cursor-pointer px-3 py-2 text-sm text-slate-300">Preview diff</summary>
        <pre className="max-h-60 overflow-auto px-3 py-2 text-xs text-slate-200 whitespace-pre-wrap break-words">
          {JSON.stringify(preview.preview.diff, null, 2)}
        </pre>
      </details>
    </section>
  );
}

function FeatureList({ features }: { features: Feature[] }) {
  if (!features || features.length === 0) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg text-sm text-slate-500">
        Features will appear here once captured.
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <h2 className="text-lg font-semibold text-slate-200">Features</h2>
      <ul className="space-y-3 text-sm text-slate-300">
        {features.map((feature) => (
          <li key={feature.id} className="rounded-md border border-slate-800 bg-slate-950 p-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-purple-300">{feature.title}</p>
              <span className="text-xs uppercase tracking-wide text-slate-500">{feature.status}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">{feature.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function VersionList({ versions, onViewDiff }: { versions: Version[]; onViewDiff: (versionId: string) => void }) {
  if (versions.length === 0) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg text-sm text-slate-500">
        No versions recorded yet.
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <h2 className="text-lg font-semibold text-slate-200">Version history</h2>
      <ul className="space-y-2 text-sm text-slate-300">
        {versions.map((version) => (
          <li key={version.id} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950 p-3">
            <div>
              <p className="font-semibold">Version {version.number}</p>
              <p className="text-xs text-slate-500">{new Date(version.createdAt).toLocaleString()}</p>
            </div>
            <button
              onClick={() => onViewDiff(version.id)}
              className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
            >
              View diff
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DiffViewer({ diff }: { diff: any }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <h2 className="text-lg font-semibold text-slate-200">Version diff</h2>
      <pre className="mt-3 max-h-64 overflow-auto rounded-md border border-slate-800 bg-slate-950 p-4 text-xs text-slate-200 whitespace-pre-wrap break-words">
        {JSON.stringify(diff, null, 2)}
      </pre>
    </section>
  );
}

function CollaborationPanel({
  invites,
  collaborators,
  inviteForm,
  setInviteForm,
  onInvite,
}: {
  invites: ProjectInvite[];
  collaborators: Array<{ id: string; role: string; user?: { email: string } }>;
  inviteForm: { email: string; role: string };
  setInviteForm: (value: { email: string; role: string }) => void;
  onInvite: (event: FormEvent) => void;
}) {
  return (
    <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <h2 className="text-lg font-semibold text-slate-200">Collaboration</h2>
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Active collaborators</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-300">
          {collaborators.map((member) => (
            <li key={member.id} className="rounded-md border border-slate-800 bg-slate-950 p-2">
              {member.user?.email ?? member.id} — {member.role}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Invites</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-400">
          {invites.map((invite) => (
            <li key={invite.id} className="rounded-md border border-slate-800 bg-slate-950 p-2">
              {invite.email} — {invite.role} ({invite.status})
            </li>
          ))}
        </ul>
      </div>
      <form onSubmit={onInvite} className="space-y-3 text-sm text-slate-400">
        <label className="block">
          Email
          <input
            value={inviteForm.email}
            onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })}
            type="email"
            required
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white focus:border-sky-500 focus:outline-none"
          />
        </label>
        <label className="block">
          Role
          <select
            value={inviteForm.role}
            onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value })}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white focus:border-sky-500 focus:outline-none"
          >
            <option value="EDITOR">Editor</option>
            <option value="REVIEWER">Reviewer</option>
          </select>
        </label>
        <button
          type="submit"
          className="w-full rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
        >
          Send invite
        </button>
      </form>
    </section>
  );
}

function ADRPanel({
  adrs,
  adrForm,
  setAdrForm,
  onCreate,
}: {
  adrs: ADR[];
  adrForm: { title: string; context: string; decision: string; consequences: string };
  setAdrForm: (value: { title: string; context: string; decision: string; consequences: string }) => void;
  onCreate: (event: FormEvent) => void;
}) {
  return (
    <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-200">Architecture decisions</h2>
        <span className="text-xs text-slate-500">{adrs.length} recorded</span>
      </div>
      <ul className="space-y-2 text-sm text-slate-300">
        {adrs.map((adr) => (
          <li key={adr.id} className="rounded-md border border-slate-800 bg-slate-950 p-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-amber-300">{adr.title}</p>
              <span className="text-xs uppercase tracking-wide text-slate-500">{adr.status}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">{adr.context}</p>
            <p className="mt-1 text-xs text-emerald-300">Decision: {adr.decision}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={onCreate} className="space-y-3 text-sm text-slate-400">
        <label className="block">
          Title
          <input
            value={adrForm.title}
            onChange={(event) => setAdrForm({ ...adrForm, title: event.target.value })}
            required
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white focus:border-amber-500 focus:outline-none"
          />
        </label>
        <label className="block">
          Context
          <textarea
            value={adrForm.context}
            onChange={(event) => setAdrForm({ ...adrForm, context: event.target.value })}
            rows={3}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white focus:border-amber-500 focus:outline-none"
          />
        </label>
        <label className="block">
          Decision
          <textarea
            value={adrForm.decision}
            onChange={(event) => setAdrForm({ ...adrForm, decision: event.target.value })}
            rows={2}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white focus:border-amber-500 focus:outline-none"
          />
        </label>
        <label className="block">
          Consequences
          <textarea
            value={adrForm.consequences}
            onChange={(event) => setAdrForm({ ...adrForm, consequences: event.target.value })}
            rows={2}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white focus:border-amber-500 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-md border border-amber-500 px-3 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-500/10"
        >
          Log ADR
        </button>
      </form>
    </section>
  );
}

function DocumentsPanel({ documents }: { documents: GeneratedDocuments | undefined }) {
  if (!documents) {
    return null;
  }
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <h2 className="text-lg font-semibold text-slate-200">Generated docs</h2>
      <details className="mt-3 rounded-md border border-slate-800 bg-slate-950">
        <summary className="cursor-pointer px-3 py-2 text-sm text-slate-300">Requirements.md</summary>
        <pre className="max-h-60 overflow-auto px-3 py-2 text-xs text-slate-200 whitespace-pre-wrap break-words">
          {documents.requirements}
        </pre>
      </details>
      {documents.adrSuggestions?.length ? (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">ADR suggestions</p>
          <ul className="mt-1 list-disc space-y-1 pl-6 text-sm text-slate-300">
            {documents.adrSuggestions.map((adr) => (
              <li key={adr}>{adr}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function FeatureIdeasPanel({ ideas }: { ideas: FeatureIdea[] | undefined }) {
  const featureIdeas = Array.isArray(ideas) ? ideas : [];
  if (!featureIdeas.length) {
    return null;
  }
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <h2 className="text-lg font-semibold text-slate-200">Suggested feature ideas</h2>
      <ul className="mt-3 space-y-2 text-sm text-slate-300">
        {featureIdeas.map((idea, index) => (
          <li key={(idea.title ?? idea.name) ?? `idea-${index}`} className="rounded-md border border-slate-800 bg-slate-950 p-3">
            <p className="font-semibold text-purple-300">{idea.title ?? idea.name}</p>
            {idea.description && <p className="mt-1 text-xs text-slate-400">{idea.description}</p>}
            {idea.impactAreas && idea.impactAreas.length > 0 && (
              <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">Impact: {idea.impactAreas.join(', ')}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ArchitectureOverview({ spec }: { spec: Spec }) {
  if (!spec.systemOverview && !spec.contextDiagram) {
    return null;
  }
  const database = spec.databaseSchemaOverview ?? { engine: 'PostgreSQL', tables: [] };
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <h2 className="text-lg font-semibold text-slate-200">Architecture overview</h2>
      {spec.systemOverview && (
        <p className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
          {spec.systemOverview}
        </p>
      )}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {spec.contextDiagram && (
          <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Context diagram</p>
            <pre className="mt-2 max-h-48 overflow-auto text-xs text-slate-300 whitespace-pre-wrap">
              {spec.contextDiagram}
            </pre>
          </div>
        )}
        <div className="rounded-md border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">
          <p className="text-xs uppercase tracking-wide text-slate-500">Database</p>
          <p>Engine: {database.engine}</p>
          <p>Tables: {database.tables?.length ?? 0}</p>
        </div>
      </div>
    </section>
  );
}

function DomainBrowser({ spec }: { spec: Spec }) {
  const domainModel = Array.isArray(spec.domainModel) ? spec.domainModel : [];
  if (!domainModel.length) {
    return null;
  }
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <h2 className="text-lg font-semibold text-slate-200">Domain model</h2>
      <div className="mt-4 space-y-4">
        {domainModel.map((model, index) => (
          <details key={model.entityId ?? `model-${index}`} className="rounded-md border border-slate-800 bg-slate-950">
            <summary className="cursor-pointer px-4 py-2 text-sm font-semibold text-slate-200">
              {model.description ?? 'Domain entity'}
            </summary>
            <div className="space-y-3 px-4 py-3 text-sm text-slate-300">
              {model.properties?.length ? (
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Properties</p>
                  <ul className="mt-1 space-y-1">
                    {model.properties.map((property, propIndex) => (
                      <li key={property.name ?? `property-${propIndex}`} className="rounded border border-slate-800 bg-slate-900 px-3 py-2">
                        <span className="font-semibold text-slate-200">{property.name}</span> — {property.type}
                        {property.description && (
                          <span className="block text-xs text-slate-500">{property.description}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {model.businessRules?.length ? (
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Business rules</p>
                  <ul className="mt-1 list-disc space-y-1 pl-6">
                    {model.businessRules.map((rule, ruleIndex) => (
                      <li key={`${rule}-${ruleIndex}`}>{rule}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {model.crudEndpoints?.length ? (
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Endpoints</p>
                  <ul className="mt-1 space-y-1 text-xs">
                    {model.crudEndpoints.map((endpoint, endpointIndex) => (
                      <li key={`${endpoint}-${endpointIndex}`} className="rounded border border-slate-800 bg-slate-900 px-2 py-1">
                        {endpoint}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function ApiContractPreview({ spec }: { spec: Spec }) {
  const apiOverview = Array.isArray(spec.apiOverview) ? spec.apiOverview : [];
  if (!apiOverview.length) {
    return null;
  }
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <h2 className="text-lg font-semibold text-slate-200">API contract preview</h2>
      <ul className="mt-3 space-y-2 text-sm text-slate-300">
        {apiOverview.map((endpoint, index) => (
          <li key={endpoint.id ?? `endpoint-${index}`} className="rounded-md border border-slate-800 bg-slate-950 p-3">
            <div className="flex items-center gap-3">
              <span className="rounded bg-slate-800 px-2 py-1 text-xs uppercase text-slate-200">{endpoint.method}</span>
              <span className="font-mono text-sm text-slate-100">{endpoint.path}</span>
            </div>
            {endpoint.summary && <p className="mt-2 text-xs text-slate-400">{endpoint.summary}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
