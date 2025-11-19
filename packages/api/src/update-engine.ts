import * as jsonDiff from 'json-diff';
import {
  ChangeConflict,
  ChangeImpact,
  ChangeOperation,
  ChangePreview,
  ChangeRequest,
  Endpoint,
  Entity,
  Spec,
} from '@ai-architecture-hub/core';

interface ApplyResult {
  spec: Spec;
  conflicts: ChangeConflict[];
  impacts: ChangeImpact[];
}

export function computeChangePreview(currentSpec: Spec, changeRequest: ChangeRequest): ChangePreview {
  const { spec: proposedSpec, conflicts, impacts } = applyChangeRequestToSpec(currentSpec, changeRequest);
  const delta = jsonDiff.diff(currentSpec, proposedSpec) ?? {};

  return {
    currentSpec,
    proposedSpec,
    diff: delta,
    conflicts,
    impacts,
  };
}

export function applyChangeRequestToSpec(currentSpec: Spec, changeRequest: ChangeRequest): ApplyResult {
  const workingSpec: Spec = JSON.parse(JSON.stringify(currentSpec));
  const conflicts: ChangeConflict[] = [];
  const impacts: ChangeImpact[] = [];

  for (const operation of changeRequest.operations) {
    switch (operation.type) {
      case 'addRequirement': {
        const exists = workingSpec.requirements.some((req) => req.id === operation.requirement.id);
        if (exists) {
          conflicts.push({
            type: 'naming',
            message: `Requirement with id ${operation.requirement.id} already exists`,
            details: { requirementId: operation.requirement.id },
          });
          break;
        }
        workingSpec.requirements.push(operation.requirement);
        impacts.push({ description: 'Requirement added', affectedFiles: ['docs/requirements.md'] });
        break;
      }
      case 'updateRequirement': {
        const requirement = workingSpec.requirements.find((req) => req.id === operation.requirementId);
        if (!requirement) {
          conflicts.push({
            type: 'missing-field',
            message: `Requirement ${operation.requirementId} not found`,
            details: { requirementId: operation.requirementId },
          });
          break;
        }
        Object.assign(requirement, operation.patch);
        impacts.push({ description: 'Requirement updated', affectedFiles: ['docs/requirements.md'] });
        break;
      }
      case 'removeRequirement': {
        const initialLength = workingSpec.requirements.length;
        workingSpec.requirements = workingSpec.requirements.filter((req) => req.id !== operation.requirementId);
        if (initialLength === workingSpec.requirements.length) {
          conflicts.push({
            type: 'missing-field',
            message: `Requirement ${operation.requirementId} not found for removal`,
            details: { requirementId: operation.requirementId },
          });
        } else {
          impacts.push({ description: 'Requirement removed', affectedFiles: ['docs/requirements.md'] });
        }
        break;
      }
      case 'addEntity': {
        const nameExists = workingSpec.entities.some((entity) => entity.name === operation.entity.name);
        if (nameExists) {
          conflicts.push({
            type: 'naming',
            message: `Entity with name ${operation.entity.name} already exists`,
            details: { entityName: operation.entity.name },
          });
          break;
        }
        workingSpec.entities.push(operation.entity);
        impacts.push({
          description: `Entity ${operation.entity.name} added`,
          affectedEntities: [operation.entity.name],
          affectedFiles: ['prisma/schema.prisma', `src/entities/${operation.entity.name}.ts`],
        });
        break;
      }
      case 'updateEntity': {
        const entity = workingSpec.entities.find((item) => item.id === operation.entityId);
        if (!entity) {
          conflicts.push({
            type: 'missing-field',
            message: `Entity ${operation.entityId} not found`,
            details: { entityId: operation.entityId },
          });
          break;
        }
        if (operation.patch.name) {
          const duplicate = workingSpec.entities.some(
            (other) => other.id !== operation.entityId && other.name === operation.patch.name,
          );
          if (duplicate) {
            conflicts.push({
              type: 'naming',
              message: `Entity name ${operation.patch.name} already in use`,
              details: { entityId: operation.entityId, newName: operation.patch.name },
            });
            break;
          }
        }
        Object.assign(entity, operation.patch);
        impacts.push({
          description: `Entity ${entity.name} updated`,
          affectedEntities: [entity.name],
          affectedFiles: ['prisma/schema.prisma', `src/entities/${entity.name}.ts`],
        });
        break;
      }
      case 'removeEntity': {
        const entity = workingSpec.entities.find((item) => item.id === operation.entityId);
        if (!entity) {
          conflicts.push({
            type: 'missing-field',
            message: `Entity ${operation.entityId} not found for removal`,
            details: { entityId: operation.entityId },
          });
          break;
        }
        workingSpec.entities = workingSpec.entities.filter((item) => item.id !== operation.entityId);
        impacts.push({
          description: `Entity ${entity.name} removed`,
          affectedEntities: [entity.name],
          affectedFiles: ['prisma/schema.prisma'],
        });
        break;
      }
      case 'addEndpoint': {
        const pathExists = workingSpec.endpoints.some(
          (endpoint) => endpoint.path === operation.endpoint.path && endpoint.method === operation.endpoint.method,
        );
        if (pathExists) {
          conflicts.push({
            type: 'naming',
            message: `Endpoint ${operation.endpoint.method} ${operation.endpoint.path} already exists`,
            details: { method: operation.endpoint.method, path: operation.endpoint.path },
          });
          break;
        }
        workingSpec.endpoints.push(operation.endpoint);
        impacts.push({
          description: `Endpoint ${operation.endpoint.method} ${operation.endpoint.path} added`,
          affectedEndpoints: [`${operation.endpoint.method} ${operation.endpoint.path}`],
          affectedFiles: ['openapi.json', `src/routes/${sanitizePath(operation.endpoint.path)}.ts`],
        });
        break;
      }
      case 'updateEndpoint': {
        const endpoint = workingSpec.endpoints.find((item) => item.id === operation.endpointId);
        if (!endpoint) {
          conflicts.push({
            type: 'missing-field',
            message: `Endpoint ${operation.endpointId} not found`,
            details: { endpointId: operation.endpointId },
          });
          break;
        }
        if (operation.patch.path || operation.patch.method) {
          const newPath = operation.patch.path ?? endpoint.path;
          const newMethod = operation.patch.method ?? endpoint.method;
          const duplicate = workingSpec.endpoints.some(
            (other) => other.id !== operation.endpointId && other.path === newPath && other.method === newMethod,
          );
          if (duplicate) {
            conflicts.push({
              type: 'naming',
              message: `Endpoint ${newMethod} ${newPath} already exists`,
              details: { endpointId: operation.endpointId, path: newPath, method: newMethod },
            });
            break;
          }
        }
        Object.assign(endpoint, operation.patch);
        impacts.push({
          description: `Endpoint ${endpoint.method} ${endpoint.path} updated`,
          affectedEndpoints: [`${endpoint.method} ${endpoint.path}`],
          affectedFiles: ['openapi.json', `src/routes/${sanitizePath(endpoint.path)}.ts`],
        });
        break;
      }
      case 'removeEndpoint': {
        const endpoint = workingSpec.endpoints.find((item) => item.id === operation.endpointId);
        if (!endpoint) {
          conflicts.push({
            type: 'missing-field',
            message: `Endpoint ${operation.endpointId} not found for removal`,
            details: { endpointId: operation.endpointId },
          });
          break;
        }
        workingSpec.endpoints = workingSpec.endpoints.filter((item) => item.id !== operation.endpointId);
        impacts.push({
          description: `Endpoint ${endpoint.method} ${endpoint.path} removed`,
          affectedEndpoints: [`${endpoint.method} ${endpoint.path}`],
          affectedFiles: ['openapi.json'],
        });
        break;
      }
      case 'updateFolderStructure': {
        workingSpec.folder_structure = operation.folder_structure;
        impacts.push({ description: 'Folder structure updated', affectedFiles: ['scaffolding'] });
        break;
      }
      default: {
        const exhaustiveCheck: never = operation;
        conflicts.push({
          type: 'validation',
          message: `Unsupported operation ${(exhaustiveCheck as any)?.type ?? 'unknown'}`,
        });
      }
    }
  }

  conflicts.push(...validateSpec(workingSpec));

  return { spec: workingSpec, conflicts, impacts };
}

function validateSpec(spec: Spec): ChangeConflict[] {
  const conflicts: ChangeConflict[] = [];

  const entityNames = new Set<string>();
  for (const entity of spec.entities) {
    if (entityNames.has(entity.name)) {
      conflicts.push({
        type: 'naming',
        message: `Duplicate entity name detected: ${entity.name}`,
        details: { entityName: entity.name },
      });
    } else {
      entityNames.add(entity.name);
    }

    entity.fields.forEach((field) => {
      if (!field.name || !field.type) {
        conflicts.push({
          type: 'missing-field',
          message: `Entity ${entity.name} has an invalid field definition`,
          details: { entityName: entity.name, field },
        });
      }
    });
  }

  const endpointSignatures = new Set<string>();
  for (const endpoint of spec.endpoints) {
    const signature = `${endpoint.method}:${endpoint.path}`;
    if (endpointSignatures.has(signature)) {
      conflicts.push({
        type: 'naming',
        message: `Duplicate endpoint detected: ${endpoint.method} ${endpoint.path}`,
        details: { method: endpoint.method, path: endpoint.path },
      });
    } else {
      endpointSignatures.add(signature);
    }
  }

  conflicts.push(...validateCircularRelations(spec.entities));

  return conflicts;
}

function validateCircularRelations(entities: Entity[]): ChangeConflict[] {
  const conflicts: ChangeConflict[] = [];
  const entityMap = new Map<string, Entity>();
  entities.forEach((entity) => entityMap.set(entity.id, entity));

  const visited = new Set<string>();
  const stack = new Set<string>();

  const visit = (entity: Entity): boolean => {
    if (stack.has(entity.id)) {
      conflicts.push({
        type: 'circular-relation',
        message: `Circular relation detected involving ${entity.name}`,
        details: { entityId: entity.id, entityName: entity.name },
      });
      return true;
    }

    if (visited.has(entity.id)) {
      return false;
    }

    visited.add(entity.id);
    stack.add(entity.id);

    for (const relation of entity.relations) {
      const targetEntity = entities.find((item) => item.name === relation.target || item.id === relation.target);
      if (targetEntity && visit(targetEntity)) {
        return true;
      }
    }

    stack.delete(entity.id);
    return false;
  };

  entities.forEach((entity) => {
    if (!visited.has(entity.id)) {
      visit(entity);
    }
  });

  return conflicts;
}

function sanitizePath(path: string): string {
  return path
    .replace(/\//g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '') || 'root';
}

export function collectImpactedFiles(preview: ChangePreview): string[] {
  const files = new Set<string>();
  preview.impacts.forEach((impact) => {
    (impact.affectedFiles ?? []).forEach((file) => files.add(file));
  });
  return Array.from(files);
}

export interface ImpactSummary {
  totalChanges: number;
  modifiedEntities: number;
  modifiedEndpoints: number;
  modifiedFiles: number;
  newEntities: string[];
  newEndpoints: string[];
  removedEntities: string[];
  removedEndpoints: string[];
  hasConflicts: boolean;
  conflictCount: number;
}

export function generateImpactSummary(preview: ChangePreview): ImpactSummary {
  const entities = new Set<string>();
  const endpoints = new Set<string>();
  const files = new Set<string>();
  const newEntities: string[] = [];
  const newEndpoints: string[] = [];
  const removedEntities: string[] = [];
  const removedEndpoints: string[] = [];

  preview.impacts.forEach((impact) => {
    (impact.affectedEntities ?? []).forEach((entity) => entities.add(entity));
    (impact.affectedEndpoints ?? []).forEach((endpoint) => endpoints.add(endpoint));
    (impact.affectedFiles ?? []).forEach((file) => files.add(file));

    if (impact.description.includes('added')) {
      if (impact.affectedEntities) newEntities.push(...impact.affectedEntities);
      if (impact.affectedEndpoints) newEndpoints.push(...impact.affectedEndpoints);
    }
    if (impact.description.includes('removed')) {
      if (impact.affectedEntities) removedEntities.push(...impact.affectedEntities);
      if (impact.affectedEndpoints) removedEndpoints.push(...impact.affectedEndpoints);
    }
  });

  return {
    totalChanges: preview.impacts.length,
    modifiedEntities: entities.size,
    modifiedEndpoints: endpoints.size,
    modifiedFiles: files.size,
    newEntities,
    newEndpoints,
    removedEntities,
    removedEndpoints,
    hasConflicts: preview.conflicts.length > 0,
    conflictCount: preview.conflicts.length,
  };
}
