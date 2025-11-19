import {
  ApiEndpointOverview,
  DatabaseSchemaOverview,
  DomainModelDetail,
  Endpoint,
  FeatureIdea,
  FolderStructure,
  GeneratedDocuments,
  Spec,
} from '@ai-architecture-hub/core';
import { generateWithGemini } from './gemini-client';
import { ProjectSeed } from './spec-extractor';
import { randomUUID } from 'crypto';

interface GeminiSpecPayload {
  systemOverview?: string;
  contextDiagram?: string;
  domainModel?: DomainModelDetail[];
  apiOverview?: ApiEndpointOverview[];
  folderStructure?: FolderStructure;
  databaseSchemaOverview?: DatabaseSchemaOverview;
  generatedDocuments?: GeneratedDocuments;
  featureIdeas?: FeatureIdea[];
}

export async function enrichSpecWithAI(seed: ProjectSeed, spec: Spec): Promise<Spec> {
  const prompt = buildPrompt(seed, spec);
  const raw = await generateWithGemini({ prompt });
  if (!raw) {
    return spec;
  }

  const parsed = parseGeminiPayload(raw);
  if (!parsed) {
    return spec;
  }

  const endpoints = mapApiOverviewToEndpoints(parsed.apiOverview, spec.endpoints);
  console.log('[enrichment] mapped endpoints count:', endpoints.length);
  if (endpoints.length > 0) {
    console.log('[enrichment] sample endpoint:', JSON.stringify(endpoints[0], null, 2));
  }

  return {
    ...spec,
    systemOverview: parsed.systemOverview ?? spec.systemOverview,
    contextDiagram: parsed.contextDiagram ?? spec.contextDiagram,
    domainModel: parsed.domainModel?.length ? parsed.domainModel : spec.domainModel,
    apiOverview: parsed.apiOverview?.length ? parsed.apiOverview : spec.apiOverview,
    endpoints,
    folder_structure: parsed.folderStructure ?? spec.folder_structure,
    databaseSchemaOverview: parsed.databaseSchemaOverview
      ? { ...spec.databaseSchemaOverview, ...parsed.databaseSchemaOverview }
      : spec.databaseSchemaOverview,
    generatedDocuments: parsed.generatedDocuments
      ? { ...spec.generatedDocuments, ...parsed.generatedDocuments }
      : spec.generatedDocuments,
    featureIdeas: parsed.featureIdeas?.length ? parsed.featureIdeas : spec.featureIdeas,
  };
}

function buildPrompt(seed: ProjectSeed, spec: Spec): string {
  return `You are an expert software architect. Based on the following project brief create a JSON payload ` +
    `that enriches an existing architecture spec.\n\n` +
    `Project:\n${JSON.stringify(seed, null, 2)}\n\n` +
    `Current Spec Snapshot:\n${JSON.stringify({
      systemOverview: spec.systemOverview,
      domainModel: spec.domainModel,
      apiOverview: spec.apiOverview,
      folder_structure: spec.folder_structure,
      databaseSchemaOverview: spec.databaseSchemaOverview,
      generatedDocuments: spec.generatedDocuments,
    }, null, 2)}\n\n` +
    `Respond ONLY with strict JSON matching this TypeScript type:\n` +
    `interface Payload {\n  systemOverview: string;\n  contextDiagram: string;\n  domainModel: DomainModelDetail[];\n  apiOverview: ApiEndpointOverview[];\n  folderStructure: FolderStructure;\n  databaseSchemaOverview: DatabaseSchemaOverview;\n  generatedDocuments: GeneratedDocuments;\n  featureIdeas: FeatureIdea[];\n}\n\n` +
    `FolderStructure is a nested object representing the project file/folder tree. Use null for files, nested objects for directories.\n` +
    `Example: { "src": { "controllers": null, "models": null }, "package.json": null }\n\n` +
    `Do not include backticks. Keep diagrams as Mermaid when appropriate.`;
}

function parseGeminiPayload(raw: string): GeminiSpecPayload | null {
  let text = raw.trim();
  
  // Remove markdown code blocks if present
  if (text.startsWith('```json')) {
    text = text.replace(/^```json\s*\n/, '').replace(/\n```\s*$/, '');
  } else if (text.startsWith('```')) {
    text = text.replace(/^```\s*\n/, '').replace(/\n```\s*$/, '');
  }
  
  text = text.trim();
  
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    console.warn('[gemini] no valid JSON object found in response');
    return null;
  }

  const jsonText = text.slice(jsonStart, jsonEnd + 1);
  
  try {
    const parsed = JSON.parse(jsonText);
    console.log('[gemini] successfully parsed enriched spec with keys:', Object.keys(parsed));
    return parsed as GeminiSpecPayload;
  } catch (error) {
    console.warn('[gemini] failed to parse JSON payload:', (error as Error).message);
    console.warn('[gemini] attempted to parse:', jsonText.substring(0, 200));
    return null;
  }
}

function mapApiOverviewToEndpoints(
  apiOverview: ApiEndpointOverview[] | undefined,
  fallback: Endpoint[] = [],
): Endpoint[] {
  if (!apiOverview || apiOverview.length === 0) {
    console.log('[enrichment] no apiOverview provided, using fallback');
    return fallback;
  }

  console.log('[enrichment] mapping', apiOverview.length, 'endpoints from API overview');
  if (apiOverview.length > 0) {
    console.log('[enrichment] sample API overview item:', JSON.stringify(apiOverview[0], null, 2));
  }

  return apiOverview.map((endpoint) => ({
    id: endpoint.id ?? randomUUID(),
    method: endpoint.method,
    path: endpoint.path,
    schema: {
      summary: endpoint.summary ?? '',
      request: endpoint.requestSchema ?? null,
      response: endpoint.responseSchema ?? null,
    },
  }));
}
