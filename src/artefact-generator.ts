import {
  ApiEndpointOverview,
  DatabaseSchemaOverview,
  DomainModelDetail,
  Endpoint,
  FeatureIdea,
  GeneratedDocuments,
  Spec,
} from '@ai-architecture-hub/core';
import { randomUUID } from 'crypto';
import { generateWithGemini } from './gemini-client';
import { ProjectSeed } from './spec-extractor';

interface GeminiSpecPayload {
  systemOverview?: string;
  contextDiagram?: string;
  domainModel?: DomainModelDetail[];
  apiOverview?: ApiEndpointOverview[];
  databaseSchemaOverview?: DatabaseSchemaOverview;
  generatedDocuments?: GeneratedDocuments;
  featureIdeas?: FeatureIdea[];
}

export async function enrichSpecWithAI(seed: ProjectSeed, spec: Spec): Promise<Spec> {
  const prompt = buildPrompt(seed, spec);
  const raw = await generateWithGemini({ prompt });
  if (!raw) {
    console.warn('[gemini] no response received. Check GEMINI_API_KEY or package install.');
    console.warn('[gemini] prompt used:', prompt.slice(0, 500));
    return spec;
  }

  console.log('[gemini] raw response:', raw.slice(0, 2000));
  const parsed = parseGeminiPayload(raw);
  if (!parsed) {
    console.warn('[gemini] failed to parse response, falling back to deterministic spec.');
    return spec;
  }

  return {
    ...spec,
    systemOverview: parsed.systemOverview ?? spec.systemOverview,
    contextDiagram: parsed.contextDiagram ?? spec.contextDiagram,
    domainModel: parsed.domainModel?.length ? parsed.domainModel : spec.domainModel,
    apiOverview: parsed.apiOverview?.length ? parsed.apiOverview : spec.apiOverview,
    endpoints: parsed.apiOverview?.length ? mapApiOverviewToEndpoints(parsed.apiOverview) : spec.endpoints,
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
      databaseSchemaOverview: spec.databaseSchemaOverview,
      generatedDocuments: spec.generatedDocuments,
    }, null, 2)}\n\n` +
    `Respond ONLY with strict JSON matching this TypeScript type:\n` +
    `interface Payload {\n  systemOverview: string;\n  contextDiagram: string;\n  domainModel: DomainModelDetail[];\n  apiOverview: ApiEndpointOverview[];\n  databaseSchemaOverview: DatabaseSchemaOverview;\n  generatedDocuments: GeneratedDocuments;\n  featureIdeas: FeatureIdea[];\n}\n` +
    `Do not include backticks. Keep diagrams as Mermaid when appropriate.`;
}

function parseGeminiPayload(raw: string): GeminiSpecPayload | null {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    console.warn('[gemini] response did not contain valid JSON boundaries.');
    return null;
  }

  try {
    const jsonText = trimmed.slice(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonText);
    return parsed as GeminiSpecPayload;
  } catch (error) {
    console.warn('[gemini] failed to parse JSON payload:', (error as Error).message);
    console.warn('[gemini] offending payload snippet:', raw.slice(0, 1000));
    return null;
  }
}

function mapApiOverviewToEndpoints(apiOverview: ApiEndpointOverview[]): Endpoint[] {
  return apiOverview.map((endpoint) => ({
    id: endpoint.id ?? randomUUID(),
    method: endpoint.method,
    path: endpoint.path,
    schema: {
      summary: endpoint.summary,
      request: endpoint.requestSchema ?? null,
      response: endpoint.responseSchema ?? null,
    },
  }));
}
