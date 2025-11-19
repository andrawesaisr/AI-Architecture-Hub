import {
  ApiEndpointOverview,
  ColumnOverview,
  DatabaseSchemaOverview,
  DomainModelDetail,
  DomainProperty,
  Endpoint,
  Entity,
  FeatureIdea,
  FolderStructure,
  GeneratedDocuments,
  Requirement,
  Spec,
} from '@ai-architecture-hub/core';
import { randomUUID } from 'crypto';

export interface ProjectSeed {
  name: string;
  stack: string;
  architectureStyle: string;
  description: string;
}

export function extractSpecFromDescription(seed: ProjectSeed): Spec {
  const requirements = extractRequirements(seed.description);
  const entities = extractEntities(seed.description);
  const endpoints = extractEndpoints(seed.description, entities);
  const folderStructure = generateFolderStructure(seed);
  const domainModel = buildDomainModel(seed, entities, endpoints);
  const apiOverview = buildApiOverview(endpoints);
  const databaseSchemaOverview = buildDatabaseOverview(seed, entities);
  const generatedDocuments = buildDocuments(seed, requirements, entities, endpoints, databaseSchemaOverview);
  const featureIdeas = generateFeatureIdeas(seed);

  return {
    requirements,
    entities,
    endpoints,
    folder_structure: folderStructure,
    features: [],
    systemOverview: buildSystemOverview(seed),
    contextDiagram: buildContextDiagram(seed, entities),
    domainModel,
    apiOverview,
    databaseSchemaOverview,
    generatedDocuments,
    featureIdeas,
  };
}

function extractRequirements(description: string): Requirement[] {
  const requirementRegex = /The system should (.+)/gi;
  const matches = [...description.matchAll(requirementRegex)];
  if (matches.length === 0) {
    return [
      {
        id: randomUUID(),
        description: description.trim(),
      },
    ];
  }

  return matches.map((match) => ({
    id: randomUUID(),
    description: match[1].trim(),
  }));
}

function extractEntities(description: string): Entity[] {
  const entityRegex = /\b([A-Z][a-zA-Z]+)\b/g;
  const entityCandidates = new Set<string>();
  let match;
  while ((match = entityRegex.exec(description)) !== null) {
    const candidate = match[1];
    if (['The', 'This', 'User', 'Users', 'System'].includes(candidate)) continue;
    entityCandidates.add(candidate);
  }

  // Don't add fallback entities - let AI enrichment handle it
  return Array.from(entityCandidates).map((name) => ({
    id: randomUUID(),
    name,
    fields: buildDefaultFieldsForEntity(name),
    relations: [],
  }));
}

function buildDefaultFieldsForEntity(name: string) {
  return [
    { name: 'id', type: 'String' },
    { name: `${name.toLowerCase()}Name`, type: 'String' },
    { name: 'createdAt', type: 'DateTime' },
    { name: 'updatedAt', type: 'DateTime' },
  ];
}

function extractEndpoints(description: string, entities: Entity[]): Endpoint[] {
  const endpointRegex = /(GET|POST|PUT|PATCH|DELETE) (\/[^\.\s]+)/gi;
  const matches = [...description.matchAll(endpointRegex)];
  const discovered = matches.map((match) => ({
    id: randomUUID(),
    method: match[1].toUpperCase() as Endpoint['method'],
    path: match[2],
    schema: {},
  }));

  // Only return discovered endpoints from description
  // Let AI enrichment generate comprehensive endpoint specifications
  return discovered;
}


function generateFolderStructure(seed: ProjectSeed): FolderStructure {
  const structure: FolderStructure = {
    src: {
      modules: {
        core: null,
        shared: null,
      },
      app: null,
      lib: null,
      infra: null,
    },
    docs: {
      'architecture.md': null,
      'requirements.md': null,
    },
    prisma: {
      'schema.prisma': null,
      migrations: null,
    },
    tests: null,
    'package.json': null,
    'tsconfig.json': null,
  };

  if (seed.architectureStyle.toLowerCase().includes('micro')) {
    structure['services'] = {
      gateway: null,
      api: null,
      worker: null,
    };
  }

  return structure;
}

function buildSystemOverview(seed: ProjectSeed): string {
  return `The ${seed.name} platform is implemented with ${seed.stack} following a ${seed.architectureStyle} architecture. ` +
    `It delivers on the following high-level goal: ${seed.description.trim()}. Modules are aligned to the primary domains, with shared infrastructure, CI/CD automation, and export-ready scaffolding.`;
}

function buildContextDiagram(seed: ProjectSeed, entities: Entity[]): string {
  const actor = entities.some((entity) => entity.name.toLowerCase().includes('user')) ? 'User' : 'PrimaryActor';
  return `graph TD\n    ${actor} -->|Interacts via UI| Frontend\n    Frontend -->|HTTPS| API_Gateway\n    API_Gateway --> App_Service\n    App_Service --> Database\n    App_Service --> External_Integrations\n    note right of App_Service: Implemented using ${seed.stack}`;
}

function buildDomainModel(seed: ProjectSeed, entities: Entity[], endpoints: Endpoint[]): DomainModelDetail[] {
  return entities.map((entity) => {
    const properties: DomainProperty[] = entity.fields.map((field) => ({
      name: field.name,
      type: field.type,
      description: describeField(field.name, entity.name),
    }));

    const crudEndpoints = endpoints
      .filter((endpoint) => endpoint.path.includes(entity.name.toLowerCase()))
      .map((endpoint) => `${endpoint.method} ${endpoint.path}`);

    return {
      entityId: entity.id,
      description: `${entity.name} aggregates the data and behavior required for ${seed.name}.`,
      properties,
      relations: entity.relations,
      businessRules: generateBusinessRules(entity),
      crudEndpoints,
    };
  });
}

function describeField(fieldName: string, entityName: string): string {
  const lower = fieldName.toLowerCase();
  if (lower === 'id') return `Unique identifier for the ${entityName}.`;
  if (lower.includes('email')) return 'Email address used for contact and identity.';
  if (lower.includes('status')) return `Lifecycle status flag for ${entityName}.`;
  if (lower.includes('name')) return `Friendly display name for the ${entityName}.`;
  return '';
}

function generateBusinessRules(entity: Entity): string[] {
  const rules: string[] = [];
  if (entity.fields.some((field) => field.name.toLowerCase().includes('email'))) {
    rules.push('Email must be unique and validated.');
  }
  if (entity.fields.some((field) => field.name.toLowerCase().includes('status'))) {
    rules.push('Status transitions should be validated via domain services.');
  }
  if (rules.length === 0) {
    rules.push(`All updates to ${entity.name} should be audited.`);
  }
  return rules;
}

function buildApiOverview(endpoints: Endpoint[]): ApiEndpointOverview[] {
  return endpoints.map((endpoint) => ({
    id: endpoint.id,
    method: endpoint.method,
    path: endpoint.path,
    summary: `Handles ${endpoint.method} requests for ${endpoint.path}.`,
    requestSchema: endpoint.schema?.request ?? null,
    responseSchema: endpoint.schema?.response ?? null,
  }));
}

function buildDatabaseOverview(seed: ProjectSeed, entities: Entity[]): DatabaseSchemaOverview {
  const tables = entities.map((entity) => ({
    name: entity.name,
    description: `${entity.name} persistence for ${seed.name}.`,
    columns: entity.fields.map((field) => ({
      name: field.name,
      type: mapFieldTypeToDb(field.type),
      notes: describeField(field.name, entity.name),
    } as ColumnOverview)),
  }));

  return {
    engine: 'PostgreSQL',
    prismaSchema: '',
    tables,
  };
}

function mapFieldTypeToDb(type: string): string {
  switch (type.toLowerCase()) {
    case 'string':
      return 'TEXT';
    case 'number':
      return 'INTEGER';
    case 'boolean':
      return 'BOOLEAN';
    case 'datetime':
      return 'TIMESTAMP';
    default:
      return 'TEXT';
  }
}

function buildDocuments(
  seed: ProjectSeed,
  requirements: Requirement[],
  entities: Entity[],
  endpoints: Endpoint[],
  database: DatabaseSchemaOverview,
): GeneratedDocuments {
  const requirementsDoc = ['# Requirements', ...requirements.map((req) => `- ${req.description}`)].join('\n');
  const adrSuggestions = [
    `Adopt ${seed.architectureStyle} to balance modularity and operational overhead.`,
    `Use ${seed.stack} as the default stack for service implementation.`,
  ];

  const notes = `Entities: ${entities.map((entity) => entity.name).join(', ')}. ` +
    `Endpoints: ${endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`).join(', ')}. ` +
    `Database engine: ${database.engine}.`;

  return {
    requirements: requirementsDoc,
    adrSuggestions,
    notes,
  };
}

function generateFeatureIdeas(seed: ProjectSeed): FeatureIdea[] {
  return [
    {
      title: 'Audit Logging',
      description: 'Capture domain events for traceability across critical workflows.',
      impactAreas: ['Observability', 'Security'],
    },
    {
      title: 'Role-Based Access Control',
      description: 'Introduce permission tiers for administrative and end-user flows.',
      impactAreas: ['Security', 'User Management'],
    },
    {
      title: 'Reporting Dashboard',
      description: `Create analytical dashboards derived from ${seed.name} domain data.`,
      impactAreas: ['Insights', 'Product'],
    },
  ];
}
