import { Spec, Entity, Endpoint, Feature } from '@ai-architecture-hub/core';

export function generateOpenApiSpec(spec: Spec): any {
  const openApiSpec = {
    openapi: '3.0.0',
    info: {
      title: 'AI Architecture Hub Project',
      version: '1.0.0',
    },
    paths: {} as Record<string, any>,
  };

  spec.endpoints.forEach(endpoint => {
    const path = endpoint.path.replace(/:(\w+)/g, '{$1}');
    if (!openApiSpec.paths[path]) {
      openApiSpec.paths[path] = {};
    }
    openApiSpec.paths[path][endpoint.method.toLowerCase()] = {
      summary: `Endpoint for ${endpoint.path}`,
      parameters: endpoint.path.includes(':') ? [{
        name: endpoint.path.split(':')[1],
        in: 'path',
        required: true,
        schema: {
            type: 'string'
        }
      }] : [],
      responses: {
        '200': {
          description: 'Successful response',
        },
      },
    };
  });

  return openApiSpec;
}

export function generatePrismaSchema(spec: Spec): string {
  let schema = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
`;

  spec.entities.forEach(entity => {
    schema += `
model ${entity.name} {
  id    String @id @default(cuid())
`;
    entity.fields.forEach(field => {
      schema += `  ${field.name} ${mapToPrismaType(field.type)}
`;
    });
    schema += `}
`;
  });

  return schema;
}

function mapToPrismaType(type: string): string {
    switch (type.toLowerCase()) {
        case 'string':
            return 'String';
        case 'number':
            return 'Int';
        case 'boolean':
            return 'Boolean';
        case 'datetime':
            return 'DateTime';
        default:
            return 'String';
    }
}

export function generateFolderScaffolding(spec: Spec): Record<string, string | null> {
  const baseStructure: Record<string, string | null> = {
    'README.md': renderReadme(spec),
    'prisma/schema.prisma': generatePrismaSchema(spec),
    'openapi.json': JSON.stringify(generateOpenApiSpec(spec), null, 2),
  };

  const recursiveStructure = flattenFolderStructure(spec.folder_structure, '');
  return { ...recursiveStructure, ...baseStructure };
}

export function generateMarkdownDocs(spec: Spec): Record<string, string> {
  return {
    'docs/requirements.md': renderRequirementsDoc(spec),
    'docs/entities.md': renderEntitiesDoc(spec.entities),
    'docs/endpoints.md': renderEndpointsDoc(spec.endpoints),
    'docs/features.md': renderFeaturesDoc(spec.features ?? []),
  };
}

export function generateCursorPromptBundle(spec: Spec): string {
  const prompt = [`You are assisting with the AI Architecture Hub project.`,
    `Project stack: ${spec?.['stack'] ?? 'Next.js + Node.js + Prisma'}.`,
    `Current requirements:`,
    ...spec.requirements.map((req, index) => `${index + 1}. ${req.description}`),
    `Entities:`,
    ...spec.entities.map((entity) => `- ${entity.name} (${entity.fields.map((field) => `${field.name}:${field.type}`).join(', ')})`),
    `Endpoints:`,
    ...spec.endpoints.map((endpoint) => `- ${endpoint.method} ${endpoint.path}`),
  ];

  return prompt.join('\n');
}

function flattenFolderStructure(structure: Record<string, any>, prefix: string): Record<string, string | null> {
  const output: Record<string, string | null> = {};
  Object.entries(structure || {}).forEach(([key, value]) => {
    const fullPath = prefix ? `${prefix}/${key}` : key;
    if (value === null) {
      output[fullPath] = null;
    } else {
      Object.assign(output, flattenFolderStructure(value as Record<string, any>, fullPath));
    }
  });
  return output;
}

function renderReadme(spec: Spec): string {
  return `# AI Architecture Hub\n\n` +
    `This scaffold was generated automatically.\n\n` +
    `## Requirements\n` +
    spec.requirements.map((req) => `- ${req.description}`).join('\n');
}

function renderRequirementsDoc(spec: Spec): string {
  return ['# Requirements', ...spec.requirements.map((req) => `- ${req.description}`)].join('\n');
}

function renderEntitiesDoc(entities: Entity[]): string {
  const lines = ['# Entities'];
  entities.forEach((entity) => {
    lines.push(`\n## ${entity.name}`);
    entity.fields.forEach((field) => {
      lines.push(`- ${field.name}: ${field.type}`);
    });
    if (entity.relations.length) {
      lines.push('### Relations');
      entity.relations.forEach((relation) => {
        lines.push(`- ${relation.type} -> ${relation.target}`);
      });
    }
  });
  return lines.join('\n');
}

function renderEndpointsDoc(endpoints: Endpoint[]): string {
  const lines = ['# Endpoints'];
  endpoints.forEach((endpoint) => {
    lines.push(`- ${endpoint.method} ${endpoint.path}`);
  });
  return lines.join('\n');
}

function renderFeaturesDoc(features: Feature[]): string {
  const lines = ['# Features'];
  features.forEach((feature) => {
    lines.push(`\n## ${feature.title} (${feature.status})`);
    lines.push(feature.description);
  });
  return lines.join('\n');
}
