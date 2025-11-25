import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import archiver from 'archiver';
import { randomUUID } from 'crypto';
import * as jsonDiff from 'json-diff';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';

import { extractSpecFromDescription, ProjectSeed } from './spec-extractor';
import {
  generateCursorPromptBundle,
  generateFolderScaffolding,
  generateMarkdownDocs,
  generateOpenApiSpec,
  generatePrismaSchema,
} from './exporter';
import { ChangeOperation, ChangeRequest, Spec } from '@ai-architecture-hub/core';
import { collectImpactedFiles, computeChangePreview, generateImpactSummary } from './update-engine';
import { enrichSpecWithAI } from './artefact-generator';
import { getLocalSuggestions, loadLocalLLMPlugin } from './plugins/local-llm';
import { validateProjectArchitecture } from './validation-engine';
import { generateServiceLogic, generateTests, generateFrontendComponent } from './code-generator';

// IMPORTANT: Create a .env file in this directory (`packages/api`) with these variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing required environment variables: SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env file');
}

const supabase = createClient(supabaseUrl, supabaseKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseKey);

interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    name?: string | null;
  };
}

loadLocalLLMPlugin();

// PrismaClient for Prisma 7 with PostgreSQL driver adapter
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const app = express();
const port = process.env.PORT || 5002;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const projectInclude = {
  features: true,
  adrs: true,
  invites: true,
  reviews: true,
  lock: true,
  collaborators: { include: { user: true } },
  versions: { orderBy: { number: 'desc' }, take: 10 },
} satisfies Prisma.ProjectInclude;

const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or invalid' });
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(403).json({ error: 'Invalid or expired token', details: error?.message });
  }

  if (!user.email) {
    return res.status(403).json({ error: 'Supabase user is missing an email address' });
  }

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    typeof metadata.name === 'string'
      ? metadata.name
      : typeof metadata.full_name === 'string'
        ? metadata.full_name
        : null;

  const updateData: Prisma.UserUpdateInput = { email: user.email };
  if (displayName) {
    updateData.name = displayName;
  }

  try {
    await prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email,
        name: displayName,
        password: 'managed-by-supabase',
      },
      update: updateData,
    });
  } catch (upsertError: any) {
    console.error('[auth] Failed to sync user profile:', upsertError.message);
    return res.status(500).json({ error: 'Failed to sync user profile', details: upsertError.message });
  }

  req.user = { userId: user.id, email: user.email, name: displayName };
  next();
};

// Helper utilities ---------------------------------------------------------

async function getProjectWithAccess(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { userId },
        {
          collaborators: {
            some: {
              userId,
            },
          },
        },
      ],
    },
    include: projectInclude,
  });

  if (project?.lock && new Date(project.lock.expiresAt) < new Date()) {
    await prisma.projectLock.delete({ where: { id: project.lock.id } }).catch(() => undefined);
    return prisma.project.findFirst({
      where: { id: projectId },
      include: projectInclude,
    });
  }

  return project;
}

async function getNextVersionNumber(projectId: string) {
  const latest = await prisma.version.findFirst({
    where: { projectId },
    orderBy: { number: 'desc' },
  });
  return (latest?.number ?? 0) + 1;
}

async function persistVersion(projectId: string, spec: Spec | any, diffData: any, userId: string) {
  const number = await getNextVersionNumber(projectId);
  await prisma.version.create({
    data: {
      number,
      spec: toJsonValue(spec),
      diff: toJsonValue(diffData ?? {}),
      projectId,
      createdBy: userId,
    },
  });
}

function ensureSpecFeatures(spec: Spec, features: any[]) {
  return {
    ...spec,
    features: features.map((feature) => ({
      id: feature.id,
      title: feature.title,
      description: feature.description,
      status: feature.status,
      changeRequest: feature.changeRequest ?? { summary: feature.title, operations: [] },
      preview: feature.preview ?? null,
      createdBy: feature.createdBy ?? '',
      createdAt: feature.createdAt ?? new Date().toISOString(),
      updatedAt: feature.updatedAt ?? new Date().toISOString(),
    })),
  } as Spec;
}

function ensureUserOwnsLock(project: any, userId: string) {
  if (!project.lock) return true;
  const expires = new Date(project.lock.expiresAt);
  if (expires < new Date()) {
    return true;
  }
  return project.lock.lockedBy === userId;
}

function parseSpec(input: unknown): Spec {
  return input as Spec;
}

function buildChangeRequest(summary: string, operations: ChangeOperation[]): ChangeRequest {
  return { summary, operations };
}

type ProjectRoleValue = 'OWNER' | 'EDITOR' | 'REVIEWER';
type ReviewStatusValue = 'PENDING' | 'APPROVED' | 'REJECTED';
type ADRStatusValue = 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED';

function toJsonValue<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

// Authentication -----------------------------------------------------------

app.post('/signup', async (req, res) => {
  const { email, password, name } = req.body;

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) {
    return res.status(400).json({ error: 'Supabase signup failed', details: authError.message });
  }
  if (!authData.user) {
    return res.status(500).json({ error: 'User not returned from Supabase' });
  }
  
  // Create a corresponding user profile in the public schema
  try {
    await prisma.user.create({
      data: {
        id: authData.user.id, // Use the ID from Supabase auth user
        email,
        name,
        password, // Include password field as required by the schema
      },
    });
    res.status(201).json({ message: 'User created successfully', user: authData.user });
  } catch (error: any) {
    // If user profile creation fails, we should delete the auth user to keep things in sync
    console.error('[signup] Failed to create user profile:', error.message);
    console.error('[signup] Attempting to clean up auth user...');
    
    try {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      console.log('[signup] Auth user deleted successfully');
    } catch (deleteError: any) {
      console.error('[signup] Failed to delete auth user:', deleteError.message);
      console.error('[signup] You may need to manually delete this user from Supabase Dashboard');
    }
    
    res.status(400).json({ 
      error: 'Failed to create user profile', 
      details: error.message,
      note: 'Please ensure database is properly set up and try again'
    });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return res.status(400).json({ error: 'Invalid email or password', details: error.message });
  }

  res.json({ session: data.session });
});

// Projects ----------------------------------------------------------------

app.get('/projects', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { userId },
        { collaborators: { some: { userId } } },
      ],
    },
    select: {
      id: true,
      name: true,
      stack: true,
      architectureStyle: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(projects);
});

app.post('/projects', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { name, stack, architectureStyle = 'Modular', description } = req.body;
  const seed: ProjectSeed = {
    name,
    stack,
    architectureStyle,
    description,
  };

  try {
    console.log('[project] creating project:', seed);
    const baseSpec = extractSpecFromDescription(seed);
    const enrichedSpec = await enrichSpecWithAI(seed, baseSpec);
    const serializedSpec = toJsonValue(enrichedSpec);

    const project = await prisma.project.create({
      data: {
        name,
        stack,
        architectureStyle,
        description,
        spec: serializedSpec,
        userId,
        versions: {
          create: {
            number: 1,
            spec: serializedSpec,
            diff: toJsonValue({}),
            createdBy: userId,
          },
        },
        collaborators: {
          create: {
            userId,
            role: 'OWNER',
          },
        },
      },
      include: projectInclude,
    });

    res.status(201).json(project);
  } catch (error: any) {
    console.error('Project creation failed:', error.message);
    
    // Check if it's a Gemini API error
    if (error.message?.includes('overloaded') || error.message?.includes('503') || error.message?.includes('UNAVAILABLE')) {
      return res.status(503).json({ 
        error: 'AI service is currently overloaded. Please try again in a few moments.',
        retryable: true 
      });
    }
    
    // Generic error
    return res.status(500).json({ 
      error: 'Failed to create project. Please try again.',
      details: error.message 
    });
  }
});

app.get('/projects/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const project = await getProjectWithAccess(req.params.id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.json(project);
});

app.patch('/projects/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const project = await getProjectWithAccess(id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const { name, stack, architectureStyle, description } = req.body;
  const updated = await prisma.project.update({
    where: { id },
    data: {
      name,
      stack,
      architectureStyle,
      description,
    },
    include: projectInclude,
  });

  res.json(updated);
});

app.delete('/projects/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const project = await getProjectWithAccess(id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  await prisma.project.delete({ where: { id } });
  res.status(204).send();
});

// Spec access --------------------------------------------------------------

app.get('/projects/:id/spec', authenticate, async (req: AuthRequest, res: Response) => {
  const project = await getProjectWithAccess(req.params.id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.json(project.spec);
});

app.patch('/projects/:id/spec', authenticate, async (req: AuthRequest, res: Response) => {
  const project = await getProjectWithAccess(req.params.id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (!ensureUserOwnsLock(project, req.user!.userId)) {
    return res.status(423).json({ error: 'Project locked by another collaborator' });
  }

  const newSpec = parseSpec(req.body.spec);
  const diffResult = jsonDiff.diff(project.spec, newSpec) ?? {};
  const serializedSpec = toJsonValue(newSpec);
  await prisma.project.update({
    where: { id: project.id },
    data: { spec: serializedSpec },
  });
  await persistVersion(project.id, newSpec, diffResult, req.user!.userId);

  const updatedProject = await getProjectWithAccess(project.id, req.user!.userId);
  res.json(updatedProject);
});

// Entity & Endpoint Editors -----------------------------------------------

app.patch('/projects/:id/entities/:entityId', authenticate, async (req: AuthRequest, res: Response) => {
  const { id, entityId } = req.params;
  const project = await getProjectWithAccess(id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const changeRequest = buildChangeRequest(`Update entity ${entityId}`, [
    { type: 'updateEntity', entityId, patch: req.body.patch },
  ]);

  const result = await applyChangeRequest(project, changeRequest, req.user!.userId, { persist: true });
  if (result.status === 'conflict') {
    return res.status(409).json(result.payload);
  }

  res.json(result.payload);
});

app.patch('/projects/:id/endpoints/:endpointId', authenticate, async (req: AuthRequest, res: Response) => {
  const { id, endpointId } = req.params;
  const project = await getProjectWithAccess(id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const changeRequest = buildChangeRequest(`Update endpoint ${endpointId}`, [
    { type: 'updateEndpoint', endpointId, patch: req.body.patch },
  ]);

  const result = await applyChangeRequest(project, changeRequest, req.user!.userId, { persist: true });
  if (result.status === 'conflict') {
    return res.status(409).json(result.payload);
  }

  res.json(result.payload);
});

app.post('/projects/:id/features', authenticate, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const project = await getProjectWithAccess(id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const { title, description, changeRequest } = req.body as {
    title: string;
    description: string;
    changeRequest: ChangeRequest;
  };

  const preview = computeChangePreview(parseSpec(project.spec), changeRequest);
  const feature = await prisma.feature.create({
    data: {
      title,
      description,
      status: 'IN_REVIEW',
      changeRequest: toJsonValue(changeRequest),
      preview: toJsonValue(preview),
      createdBy: req.user!.userId,
      projectId: id,
    },
  });

  res.status(201).json({ feature, preview });
});

// Update Engine -----------------------------------------------------------

app.post('/projects/:id/preview-change', authenticate, async (req: AuthRequest, res: Response) => {
  const project = await getProjectWithAccess(req.params.id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const changeRequest = req.body.changeRequest as ChangeRequest;
  const preview = computeChangePreview(parseSpec(project.spec), changeRequest);
  const summary = generateImpactSummary(preview);
  res.json({ 
    preview, 
    impactedFiles: collectImpactedFiles(preview),
    summary 
  });
});

app.post('/projects/:id/apply-change', authenticate, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const project = await getProjectWithAccess(id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (!ensureUserOwnsLock(project, req.user!.userId)) {
    return res.status(423).json({ error: 'Project locked by another collaborator' });
  }

  const { changeRequest, featureId } = req.body as { changeRequest: ChangeRequest; featureId?: string };

  const result = await applyChangeRequest(project, changeRequest, req.user!.userId, {
    persist: true,
    featureId,
  });

  if (result.status === 'conflict') {
    return res.status(409).json(result.payload);
  }

  res.json(result.payload);
});

// Exporter ----------------------------------------------------------------

app.get('/projects/:id/export', authenticate, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const project = await getProjectWithAccess(id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const spec = parseSpec(project.spec);
  const enrichedSpec = ensureSpecFeatures(spec, project.features);

  const openApiSpec = generateOpenApiSpec(enrichedSpec);
  const prismaSchema = generatePrismaSchema(enrichedSpec);
  const folders = generateFolderScaffolding(enrichedSpec);
  const docs = generateMarkdownDocs(enrichedSpec);

  const archive = archiver('zip', { zlib: { level: 9 } });
  res.attachment('architecture.zip');
  archive.pipe(res);

  archive.append(JSON.stringify(openApiSpec, null, 2), { name: 'openapi.json' });
  archive.append(prismaSchema, { name: 'schema.prisma' });

  Object.entries(folders).forEach(([path, content]) => {
    if (content === null) {
      archive.append('', { name: path.endsWith('/') ? path : `${path}/` });
    } else {
      archive.append(content, { name: path });
    }
  });

  Object.entries(docs).forEach(([path, content]) => {
    archive.append(content, { name: path });
  });

  archive.finalize();
});

app.post('/projects/:id/export/github', authenticate, async (req: AuthRequest, res: Response) => {
  const project = await getProjectWithAccess(req.params.id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const spec = parseSpec(project.spec);
  const enrichedSpec = ensureSpecFeatures(spec, project.features);

  const scaffolding = generateFolderScaffolding(enrichedSpec);
  const docs = generateMarkdownDocs(enrichedSpec);

  res.json({
    message: 'Simulated push-to-GitHub completed (offline mode).',
    filesPrepared: [...Object.keys(scaffolding), ...Object.keys(docs), 'openapi.json', 'schema.prisma'],
  });
});

app.get('/projects/:id/export/cursor', authenticate, async (req: AuthRequest, res: Response) => {
  const project = await getProjectWithAccess(req.params.id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const spec = parseSpec(project.spec);
  const enrichedSpec = ensureSpecFeatures(spec, project.features);

  const specForPrompt = { ...enrichedSpec, stack: project.stack } as Spec;
  const bundle = generateCursorPromptBundle(specForPrompt);
  res.type('text/plain').send(bundle);
});

app.get('/projects/:id/export/windsurf', authenticate, async (req: AuthRequest, res: Response) => {
  const project = await getProjectWithAccess(req.params.id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const spec = parseSpec(project.spec);
  const enrichedSpec = ensureSpecFeatures(spec, project.features);

  const specForPrompt = { ...enrichedSpec, stack: project.stack } as Spec;
  const bundle = generateCursorPromptBundle(specForPrompt); // Reuse Cursor format for now
  res.type('text/plain').send(bundle);
});

// Version history ---------------------------------------------------------

app.get('/projects/:id/versions', authenticate, async (req: AuthRequest, res: Response) => {
  const project = await getProjectWithAccess(req.params.id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const versions = await prisma.version.findMany({
    where: { projectId: project.id },
    orderBy: { number: 'desc' },
  });

  res.json(versions);
});

app.get('/versions/:vId/diff', authenticate, async (req: AuthRequest, res: Response) => {
  const version = await prisma.version.findUnique({ where: { id: req.params.vId } });
  if (!version) {
    return res.status(404).json({ error: 'Version not found' });
  }

  const project = await getProjectWithAccess(version.projectId, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Version not accessible' });
  }

  const previous = await prisma.version.findFirst({
    where: { projectId: version.projectId, number: { lt: version.number } },
    orderBy: { number: 'desc' },
  });

  const delta = jsonDiff.diff(previous?.spec ?? {}, version.spec) ?? {};
  res.json({ versionId: version.id, diff: delta, previousVersionId: previous?.id ?? null });
});

// Collaboration flows -----------------------------------------------------

app.post('/projects/:id/invites', authenticate, async (req: AuthRequest, res: Response) => {
  const project = await getProjectWithAccess(req.params.id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const { email, role } = req.body as { email: string; role: ProjectRoleValue };
  const token = randomUUID();

  const invite = await prisma.projectInvite.create({
    data: {
      email,
      role,
      status: 'PENDING',
      invitedBy: req.user!.userId,
      token,
      projectId: project.id,
    },
  });

  res.status(201).json(invite);
});

app.post('/projects/:id/invites/:inviteId/accept', authenticate, async (req: AuthRequest, res: Response) => {
  const { id, inviteId } = req.params;
  const project = await getProjectWithAccess(id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const invite = await prisma.projectInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.projectId !== id) {
    return res.status(404).json({ error: 'Invite not found' });
  }

  if (invite.status !== 'PENDING') {
    return res.status(400).json({ error: 'Invite already processed' });
  }

  if (invite.email !== req.user!.email) {
    return res.status(403).json({ error: 'Invite email mismatch' });
  }

  await prisma.$transaction([
    prisma.projectCollaborator.upsert({
      where: { projectId_userId: { projectId: id, userId: req.user!.userId } },
      update: { role: invite.role },
      create: { projectId: id, userId: req.user!.userId, role: invite.role },
    }),
    prisma.projectInvite.update({
      where: { id: invite.id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    }),
  ]);

  res.json({ message: 'Invite accepted' });
});

app.post('/projects/:id/lock', authenticate, async (req: AuthRequest, res: Response) => {
  const project = await getProjectWithAccess(req.params.id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const durationMinutes = Number(req.body.durationMinutes ?? 15);
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

  const lock = await prisma.projectLock.upsert({
    where: { projectId: project.id },
    update: {
      lockedBy: req.user!.userId,
      lockedAt: new Date(),
      expiresAt,
    },
    create: {
      projectId: project.id,
      lockedBy: req.user!.userId,
      expiresAt,
    },
  });

  res.json(lock);
});

app.delete('/projects/:id/lock', authenticate, async (req: AuthRequest, res: Response) => {
  const project = await getProjectWithAccess(req.params.id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  await prisma.projectLock.delete({ where: { projectId: project.id } }).catch(() => undefined);
  res.status(204).send();
});

app.post('/projects/:id/features/:featureId/reviews', authenticate, async (req: AuthRequest, res: Response) => {
  const { id, featureId } = req.params;
  const project = await getProjectWithAccess(id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const feature = await prisma.feature.findUnique({ where: { id: featureId } });
  if (!feature || feature.projectId !== id) {
    return res.status(404).json({ error: 'Feature not found' });
  }

  const review = await prisma.projectReview.create({
    data: {
      featureId,
      projectId: id,
      reviewerId: req.user!.userId,
      status: 'PENDING',
      comment: req.body.comment ?? null,
    },
  });

  await prisma.feature.update({
    where: { id: featureId },
    data: { status: 'IN_REVIEW' },
  });

  res.status(201).json(review);
});

app.post('/projects/:id/features/:featureId/reviews/:reviewId/decision', authenticate, async (req: AuthRequest, res: Response) => {
  const { id, featureId, reviewId } = req.params;
  const { status, comment } = req.body as { status: ReviewStatusValue; comment?: string };

  const feature = await prisma.feature.findUnique({ where: { id: featureId } });
  if (!feature || feature.projectId !== id) {
    return res.status(404).json({ error: 'Feature not found' });
  }

  const review = await prisma.projectReview.findUnique({ where: { id: reviewId } });
  if (!review || review.projectId !== id) {
    return res.status(404).json({ error: 'Review not found' });
  }

  if (review.reviewerId !== req.user!.userId) {
    return res.status(403).json({ error: 'Only the reviewer may record a decision' });
  }

  await prisma.projectReview.update({
    where: { id: reviewId },
    data: {
      status,
      comment,
    },
  });

  if (status === 'APPROVED') {
    await prisma.feature.update({ where: { id: featureId }, data: { status: 'APPROVED' } });
  }

  if (status === 'REJECTED') {
    await prisma.feature.update({ where: { id: featureId }, data: { status: 'REJECTED' } });
  }

  res.json({ message: 'Decision recorded' });
});

// ADRs --------------------------------------------------------------------

app.get('/projects/:id/adrs', authenticate, async (req: AuthRequest, res: Response) => {
  const project = await getProjectWithAccess(req.params.id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.json(project.adrs);
});

app.post('/projects/:id/adrs', authenticate, async (req: AuthRequest, res: Response) => {
  const project = await getProjectWithAccess(req.params.id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const { title, context, decision, consequences, status } = req.body as {
    title: string;
    context: string;
    decision: string;
    consequences: string;
    status?: ADRStatusValue;
  };

  const adr = await prisma.aDR.create({
    data: {
      title,
      context,
      decision,
      consequences,
      status: status ?? 'PROPOSED',
      createdBy: req.user!.userId,
      projectId: project.id,
    },
  });

  res.status(201).json(adr);
});

app.patch('/projects/:id/adrs/:adrId', authenticate, async (req: AuthRequest, res: Response) => {
  const { id, adrId } = req.params;
  const project = await getProjectWithAccess(id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const adr = await prisma.aDR.findUnique({ where: { id: adrId } });
  if (!adr || adr.projectId !== id) {
    return res.status(404).json({ error: 'ADR not found' });
  }

  const updated = await prisma.aDR.update({
    where: { id: adrId },
    data: {
      status: req.body.status,
      decision: req.body.decision ?? adr.decision,
      consequences: req.body.consequences ?? adr.consequences,
    },
  });

  res.json(updated);
});

// Validation --------------------------------------------------------------

app.post('/projects/:id/validate', authenticate, async (req: AuthRequest, res: Response) => {
  const project = await getProjectWithAccess(req.params.id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const spec = parseSpec(project.spec);
  const validationResult = validateProjectArchitecture(spec);
  res.json(validationResult);
});

app.post('/projects/:id/apply-autofix', authenticate, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { suggestionId } = req.body;
  
  const project = await getProjectWithAccess(id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (!ensureUserOwnsLock(project, req.user!.userId)) {
    return res.status(423).json({ error: 'Project locked by another collaborator' });
  }

  const spec = parseSpec(project.spec);
  const validationResult = validateProjectArchitecture(spec);
  const suggestion = validationResult.suggestions.find(s => s.id === suggestionId);

  if (!suggestion) {
    return res.status(404).json({ error: 'Suggestion not found' });
  }

  if (!suggestion.autoFixable || !suggestion.changeRequest) {
    return res.status(400).json({ error: 'This suggestion is not auto-fixable' });
  }

  const result = await applyChangeRequest(project, suggestion.changeRequest, req.user!.userId, {
    persist: true,
  });

  if (result.status === 'conflict') {
    return res.status(409).json(result.payload);
  }

  res.json(result.payload);
});

// Code Generation ---------------------------------------------------------

app.post('/projects/:id/generate/service/:entityId', authenticate, async (req: AuthRequest, res: Response) => {
  const project = await getProjectWithAccess(req.params.id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const spec = parseSpec(project.spec);
  const entity = spec.entities.find(e => e.id === req.params.entityId);
  if (!entity) {
    return res.status(404).json({ error: 'Entity not found' });
  }

  const serviceCode = generateServiceLogic(entity, project.stack);
  res.type('text/plain').send(serviceCode);
});

app.post('/projects/:id/generate/tests/:entityId', authenticate, async (req: AuthRequest, res: Response) => {
  const project = await getProjectWithAccess(req.params.id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const spec = parseSpec(project.spec);
  const entity = spec.entities.find(e => e.id === req.params.entityId);
  if (!entity) {
    return res.status(404).json({ error: 'Entity not found' });
  }

  const testCode = generateTests(entity, project.stack);
  res.type('text/plain').send(testCode);
});

app.post('/projects/:id/generate/component/:entityId', authenticate, async (req: AuthRequest, res: Response) => {
  const project = await getProjectWithAccess(req.params.id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const spec = parseSpec(project.spec);
  const entity = spec.entities.find(e => e.id === req.params.entityId);
  if (!entity) {
    return res.status(404).json({ error: 'Entity not found' });
  }

  const componentCode = generateFrontendComponent(entity);
  res.type('text/plain').send(componentCode);
});

app.post('/projects/:id/generate/all', authenticate, async (req: AuthRequest, res: Response) => {
  const project = await getProjectWithAccess(req.params.id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const spec = parseSpec(project.spec);
  const enrichedSpec = ensureSpecFeatures(spec, project.features);

  const generatedFiles: Record<string, string> = {};

  // Generate service logic for each entity
  for (const entity of enrichedSpec.entities) {
    const serviceName = `${entity.name.toLowerCase()}.service.ts`;
    generatedFiles[`services/${serviceName}`] = generateServiceLogic(entity, project.stack);
    
    const testName = `${entity.name.toLowerCase()}.service.test.ts`;
    generatedFiles[`tests/${testName}`] = generateTests(entity, project.stack);
    
    const componentName = `${entity.name}List.tsx`;
    generatedFiles[`components/${componentName}`] = generateFrontendComponent(entity);
  }

  res.json({ files: generatedFiles, count: Object.keys(generatedFiles).length });
});

// Storage -----------------------------------------------------------------

app.post('/storage/upload', authenticate, async (req: AuthRequest, res: Response) => {
  // Note: For file uploads, you'll need to use multer or similar middleware
  // This is a placeholder showing the endpoint structure
  res.status(501).json({ 
    error: 'File upload endpoint - implement with multer middleware',
    hint: 'Use Supabase Storage directly from frontend for better performance'
  });
});

app.get('/storage/:bucket/:path(*)', authenticate, async (req: AuthRequest, res: Response) => {
  const { bucket, path } = req.params;
  
  try {
    // Generate a signed URL for secure file access
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 3600); // 1 hour expiry

    if (error) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({ url: data.signedUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/storage/:bucket/:path(*)', authenticate, async (req: AuthRequest, res: Response) => {
  const { bucket, path } = req.params;
  
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([path]);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'File deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Local LLM integration ---------------------------------------------------

app.post('/llm/suggestions', authenticate, async (req: AuthRequest, res: Response) => {
  const { type, context, fallback } = req.body as { type: 'entityName' | 'endpointName' | 'description'; context: string; fallback?: string };
  const suggestions = await getLocalSuggestions({ type, context, fallback });
  res.json({ suggestions });
});

// Shared helpers ----------------------------------------------------------

async function applyChangeRequest(
  project: any,
  changeRequest: ChangeRequest,
  userId: string,
  options: { persist?: boolean; featureId?: string } = {},
) {
  if (options.featureId) {
    const feature = await prisma.feature.findUnique({ where: { id: options.featureId } });
    if (!feature || feature.projectId !== project.id) {
      return {
        status: 'conflict' as const,
        payload: { error: 'Feature not found for this project' },
      };
    }
    if (!['APPROVED', 'APPLIED'].includes(feature.status)) {
      return {
        status: 'conflict' as const,
        payload: { error: `Feature status ${feature.status} does not allow applying changes` },
      };
    }
  }

  const preview = computeChangePreview(parseSpec(project.spec), changeRequest);

  if (preview.conflicts.length > 0) {
    return {
      status: 'conflict' as const,
      payload: { preview, conflicts: preview.conflicts },
    };
  }

  if (options.persist) {
    const diffResult = jsonDiff.diff(project.spec, preview.proposedSpec) ?? {};
    const serializedSpec = JSON.parse(JSON.stringify(preview.proposedSpec));

    await prisma.project.update({
      where: { id: project.id },
      data: { spec: toJsonValue(serializedSpec) },
    });
    await persistVersion(project.id, serializedSpec, diffResult, userId);

    if (options.featureId) {
      await prisma.feature.update({
        where: { id: options.featureId },
        data: { status: 'APPLIED' },
      }).catch(() => undefined);
    }

    const refreshed = await getProjectWithAccess(project.id, userId);
    return {
      status: 'ok' as const,
      payload: { project: refreshed, preview },
    };
  }

  return {
    status: 'ok' as const,
    payload: { preview },
  };
}

// ------------------------------------------------------------------------

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API server listening at http://localhost:${port}`);
});
