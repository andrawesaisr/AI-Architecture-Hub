import { Spec, Entity, Endpoint } from '@ai-architecture-hub/core';

export interface ValidationError {
  type: 'error';
  category: 'entity' | 'endpoint' | 'schema' | 'dependency' | 'naming';
  message: string;
  entityId?: string;
  endpointId?: string;
  field?: string;
  severity: 'critical' | 'high' | 'medium';
}

export interface ValidationWarning {
  type: 'warning';
  category: 'convention' | 'best-practice' | 'performance' | 'security';
  message: string;
  entityId?: string;
  endpointId?: string;
  suggestion?: string;
}

export interface AutoFixSuggestion {
  id: string;
  description: string;
  category: string;
  autoFixable: boolean;
  changeRequest?: any;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: AutoFixSuggestion[];
  summary: {
    totalIssues: number;
    criticalErrors: number;
    warnings: number;
    autoFixableCount: number;
  };
}

/**
 * Validates the entire project architecture for consistency and best practices
 */
export function validateProjectArchitecture(spec: Spec): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const suggestions: AutoFixSuggestion[] = [];

  // Handle null/undefined spec
  if (!spec) {
    return {
      isValid: false,
      errors: [{ type: 'error', category: 'schema', message: 'Spec is null or undefined', severity: 'critical' }],
      warnings: [],
      suggestions: [],
      summary: { totalIssues: 1, criticalErrors: 1, warnings: 0, autoFixableCount: 0 },
    };
  }

  // Ensure spec has required arrays
  if (!spec.entities) spec.entities = [];
  if (!spec.endpoints) spec.endpoints = [];

  // Run all validation checks
  errors.push(...validateEntities(spec));
  errors.push(...validateEndpoints(spec));
  errors.push(...validateEntityRelationships(spec));
  errors.push(...validateEndpointEntityMapping(spec));
  
  warnings.push(...checkNamingConventions(spec));
  warnings.push(...checkBestPractices(spec));
  warnings.push(...checkMissingCRUDEndpoints(spec));
  
  suggestions.push(...generateAutoFixSuggestions(errors, warnings, spec));

  const criticalErrors = errors.filter(e => e.severity === 'critical').length;
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions,
    summary: {
      totalIssues: errors.length + warnings.length,
      criticalErrors,
      warnings: warnings.length,
      autoFixableCount: suggestions.filter(s => s.autoFixable).length,
    },
  };
}

/**
 * Validate entity definitions
 */
function validateEntities(spec: Spec): ValidationError[] {
  const errors: ValidationError[] = [];
  const entityNames = new Set<string>();

  // Handle empty entities array
  if (!spec.entities || spec.entities.length === 0) {
    return errors;
  }

  for (const entity of spec.entities) {
    // Skip if entity is invalid
    if (!entity || !entity.name) continue;
    // Check for duplicate entity names
    if (entityNames.has(entity.name)) {
      errors.push({
        type: 'error',
        category: 'entity',
        message: `Duplicate entity name: ${entity.name}`,
        entityId: entity.id,
        severity: 'critical',
      });
    }
    entityNames.add(entity.name);

    // Check for empty entity name
    if (!entity.name || entity.name.trim() === '') {
      errors.push({
        type: 'error',
        category: 'entity',
        message: `Entity ${entity.id} has no name`,
        entityId: entity.id,
        severity: 'critical',
      });
    }

    // Check for entities without fields
    if (!entity.fields || entity.fields.length === 0) {
      errors.push({
        type: 'error',
        category: 'entity',
        message: `Entity ${entity.name} has no fields defined`,
        entityId: entity.id,
        severity: 'high',
      });
    }

    // Check for duplicate field names
    const fieldNames = new Set<string>();
    for (const field of entity.fields || []) {
      if (fieldNames.has(field.name)) {
        errors.push({
          type: 'error',
          category: 'entity',
          message: `Duplicate field name '${field.name}' in entity ${entity.name}`,
          entityId: entity.id,
          field: field.name,
          severity: 'high',
        });
      }
      fieldNames.add(field.name);

      // Check for invalid field types
      if (!field.type || field.type.trim() === '') {
        errors.push({
          type: 'error',
          category: 'schema',
          message: `Field '${field.name}' in entity ${entity.name} has no type`,
          entityId: entity.id,
          field: field.name,
          severity: 'high',
        });
      }
    }

    // Check for missing ID field
    const hasIdField = entity.fields?.some(f => 
      f.name === 'id' || f.name === `${entity.name.toLowerCase()}Id`
    );
    if (!hasIdField) {
      errors.push({
        type: 'error',
        category: 'schema',
        message: `Entity ${entity.name} is missing an 'id' field`,
        entityId: entity.id,
        severity: 'medium',
      });
    }
  }

  return errors;
}

/**
 * Validate endpoint definitions
 */
function validateEndpoints(spec: Spec): ValidationError[] {
  const errors: ValidationError[] = [];
  const endpointKeys = new Set<string>();

  // Handle empty endpoints array
  if (!spec.endpoints || spec.endpoints.length === 0) {
    return errors;
  }

  for (const endpoint of spec.endpoints) {
    // Skip if endpoint is invalid
    if (!endpoint || !endpoint.method || !endpoint.path) continue;
    // Check for empty path
    if (!endpoint.path || endpoint.path.trim() === '') {
      errors.push({
        type: 'error',
        category: 'endpoint',
        message: `Endpoint ${endpoint.id} has no path`,
        endpointId: endpoint.id,
        severity: 'critical',
      });
    }

    // Check for invalid HTTP method
    const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    if (!validMethods.includes(endpoint.method)) {
      errors.push({
        type: 'error',
        category: 'endpoint',
        message: `Endpoint ${endpoint.path} has invalid HTTP method: ${endpoint.method}`,
        endpointId: endpoint.id,
        severity: 'high',
      });
    }

    // Check for duplicate endpoint (same method + path)
    const key = `${endpoint.method} ${endpoint.path}`;
    if (!endpointKeys.has(key)) {
      endpointKeys.add(key);
    } else {
      errors.push({
        type: 'error',
        category: 'endpoint',
        message: `Duplicate endpoint: ${key}`,
        severity: 'critical',
      });
    }
  }

  return errors;
}

/**
 * Validate entity relationships
 */
function validateEntityRelationships(spec: Spec): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Handle empty entities array
  if (!spec.entities || spec.entities.length === 0) {
    return errors;
  }
  
  const entityIds = new Set(spec.entities.map(e => e.id));
  const entityNames = new Set(spec.entities.map(e => e.name));

  for (const entity of spec.entities) {
    // Skip if entity has no relations
    if (!entity.relations || entity.relations.length === 0) continue;
    for (const relation of entity.relations || []) {
      // Check if target entity exists
      if (!entityIds.has(relation.target) && !entityNames.has(relation.target)) {
        errors.push({
          type: 'error',
          category: 'dependency',
          message: `Entity ${entity.name} has relation to non-existent entity: ${relation.target}`,
          entityId: entity.id,
          severity: 'high',
        });
      }

      // Check for valid relation type
      const validTypes = ['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many'];
      if (!validTypes.includes(relation.type)) {
        errors.push({
          type: 'error',
          category: 'schema',
          message: `Invalid relation type '${relation.type}' in entity ${entity.name}`,
          entityId: entity.id,
          severity: 'medium',
        });
      }
    }
  }

  return errors;
}

/**
 * Validate that endpoints reference valid entities
 */
function validateEndpointEntityMapping(spec: Spec): ValidationError[] {
  const errors: ValidationError[] = [];
  const entityNames = new Set(spec.entities.map(e => e.name.toLowerCase()));

  for (const endpoint of spec.endpoints) {
    // Skip if path is undefined or empty
    if (!endpoint.path) continue;
    
    // Extract potential entity name from path (e.g., /api/users -> users)
    const pathParts = endpoint.path.split('/').filter(p => p && !p.startsWith(':'));
    const potentialEntityName = pathParts[pathParts.length - 1]?.toLowerCase();

    // Check if endpoint references an entity in its schema
    const schemaStr = JSON.stringify(endpoint.schema || {});
    const referencedEntities = spec.entities.filter(e => 
      schemaStr.includes(e.name) || schemaStr.includes(e.id)
    );

    // Warn if endpoint seems to reference non-existent entity
    if (potentialEntityName && !entityNames.has(potentialEntityName) && 
        !entityNames.has(potentialEntityName.slice(0, -1))) { // Check singular form
      // This is just a warning as not all endpoints need to map to entities
      // Skip for now to avoid false positives
    }
  }

  return errors;
}

/**
 * Check naming conventions
 */
function checkNamingConventions(spec: Spec): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (!spec.entities || spec.entities.length === 0) {
    return warnings;
  }

  for (const entity of spec.entities) {
    if (!entity || !entity.name) continue;
    // Entity names should be PascalCase
    if (entity.name && !/^[A-Z][a-zA-Z0-9]*$/.test(entity.name)) {
      warnings.push({
        type: 'warning',
        category: 'convention',
        message: `Entity name '${entity.name}' should be PascalCase (e.g., 'UserProfile')`,
        entityId: entity.id,
        suggestion: toPascalCase(entity.name),
      });
    }

    // Field names should be camelCase
    for (const field of entity.fields || []) {
      if (field.name && !/^[a-z][a-zA-Z0-9]*$/.test(field.name)) {
        warnings.push({
          type: 'warning',
          category: 'convention',
          message: `Field name '${field.name}' in ${entity.name} should be camelCase`,
          entityId: entity.id,
          suggestion: toCamelCase(field.name),
        });
      }
    }
  }

  if (!spec.endpoints) {
    return warnings;
  }

  for (const endpoint of spec.endpoints) {
    if (!endpoint || !endpoint.path) continue;
    // Endpoint paths should be lowercase with hyphens
    if (endpoint.path && !/^\/[a-z0-9\-/:]*$/.test(endpoint.path)) {
      warnings.push({
        type: 'warning',
        category: 'convention',
        message: `Endpoint path '${endpoint.path}' should use lowercase with hyphens`,
        endpointId: endpoint.id,
        suggestion: endpoint.path.toLowerCase().replace(/_/g, '-'),
      });
    }
  }

  return warnings;
}

/**
 * Check best practices
 */
function checkBestPractices(spec: Spec): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (!spec.entities || spec.entities.length === 0) {
    return warnings;
  }

  // Check for entities without timestamps
  for (const entity of spec.entities) {
    if (!entity || !entity.name) continue;
    const hasCreatedAt = entity.fields?.some(f => f.name === 'createdAt');
    const hasUpdatedAt = entity.fields?.some(f => f.name === 'updatedAt');

    if (!hasCreatedAt || !hasUpdatedAt) {
      warnings.push({
        type: 'warning',
        category: 'best-practice',
        message: `Entity ${entity.name} should have 'createdAt' and 'updatedAt' timestamp fields`,
        entityId: entity.id,
        suggestion: 'Add timestamp fields for audit trail',
      });
    }
  }

  if (!spec.endpoints || spec.endpoints.length === 0) {
    return warnings;
  }

  // Check for GET endpoints without pagination
  for (const endpoint of spec.endpoints) {
    if (!endpoint || !endpoint.method || !endpoint.path) continue;
    if (endpoint.method === 'GET' && endpoint.path.includes('list') || 
        (endpoint.method === 'GET' && !endpoint.path.includes(':id'))) {
      const schemaStr = JSON.stringify(endpoint.schema || {});
      if (!schemaStr.includes('page') && !schemaStr.includes('limit') && !schemaStr.includes('offset')) {
        warnings.push({
          type: 'warning',
          category: 'best-practice',
          message: `GET endpoint ${endpoint.path} should support pagination`,
          endpointId: endpoint.id,
          suggestion: 'Add pagination parameters (page, limit, offset)',
        });
      }
    }
  }

  return warnings;
}

/**
 * Check for missing CRUD endpoints
 */
function checkMissingCRUDEndpoints(spec: Spec): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (!spec.entities || spec.entities.length === 0 || !spec.endpoints) {
    return warnings;
  }

  for (const entity of spec.entities) {
    if (!entity || !entity.name) continue;
    
    const entityPath = `/${entity.name.toLowerCase()}s`;
    const entityPathSingular = `/${entity.name.toLowerCase()}`;

    const hasCreate = spec.endpoints.some(e => 
      e && e.method && e.path && 
      e.method === 'POST' && (e.path.includes(entityPath) || e.path.includes(entityPathSingular))
    );
    const hasRead = spec.endpoints.some(e => 
      e && e.method && e.path &&
      e.method === 'GET' && (e.path.includes(entityPath) || e.path.includes(entityPathSingular))
    );
    const hasUpdate = spec.endpoints.some(e => 
      e && e.method && e.path &&
      (e.method === 'PUT' || e.method === 'PATCH') && 
      (e.path.includes(entityPath) || e.path.includes(entityPathSingular))
    );
    const hasDelete = spec.endpoints.some(e => 
      e && e.method && e.path &&
      e.method === 'DELETE' && (e.path.includes(entityPath) || e.path.includes(entityPathSingular))
    );

    const missingOperations = [];
    if (!hasCreate) missingOperations.push('CREATE');
    if (!hasRead) missingOperations.push('READ');
    if (!hasUpdate) missingOperations.push('UPDATE');
    if (!hasDelete) missingOperations.push('DELETE');

    if (missingOperations.length > 0) {
      warnings.push({
        type: 'warning',
        category: 'best-practice',
        message: `Entity ${entity.name} is missing CRUD endpoints: ${missingOperations.join(', ')}`,
        entityId: entity.id,
        suggestion: `Consider adding ${missingOperations.join(', ')} endpoints for ${entity.name}`,
      });
    }
  }

  return warnings;
}

/**
 * Generate auto-fix suggestions
 */
function generateAutoFixSuggestions(
  errors: ValidationError[],
  warnings: ValidationWarning[],
  spec: Spec
): AutoFixSuggestion[] {
  const suggestions: AutoFixSuggestion[] = [];

  // Suggest adding missing CRUD endpoints
  for (const warning of warnings) {
    if (warning.category === 'best-practice' && warning.message.includes('missing CRUD endpoints')) {
      const entity = spec.entities.find(e => e.id === warning.entityId);
      if (entity) {
        suggestions.push({
          id: `add-crud-${entity.id}`,
          description: `Add missing CRUD endpoints for ${entity.name}`,
          category: 'endpoint-generation',
          autoFixable: true,
          changeRequest: {
            summary: `Add CRUD endpoints for ${entity.name}`,
            operations: generateCRUDOperations(entity, spec),
          },
        });
      }
    }
  }

  // Suggest adding timestamp fields
  for (const warning of warnings) {
    if (warning.message.includes('timestamp fields')) {
      const entity = spec.entities.find(e => e.id === warning.entityId);
      if (entity) {
        suggestions.push({
          id: `add-timestamps-${entity.id}`,
          description: `Add createdAt and updatedAt fields to ${entity.name}`,
          category: 'entity-enhancement',
          autoFixable: true,
          changeRequest: {
            summary: `Add timestamp fields to ${entity.name}`,
            operations: [{
              type: 'updateEntity',
              entityId: entity.id,
              patch: {
                fields: [
                  ...entity.fields,
                  { name: 'createdAt', type: 'DateTime', required: true },
                  { name: 'updatedAt', type: 'DateTime', required: true },
                ],
              },
            }],
          },
        });
      }
    }
  }

  return suggestions;
}

/**
 * Generate CRUD operations for an entity
 */
function generateCRUDOperations(entity: Entity, spec: Spec): any[] {
  const operations = [];
  const entityPath = `/${entity.name.toLowerCase()}s`;
  const entityPathWithId = `${entityPath}/:id`;

  // Check what's missing
  const hasCreate = spec.endpoints.some(e => e.method === 'POST' && e.path.includes(entityPath));
  const hasRead = spec.endpoints.some(e => e.method === 'GET' && e.path.includes(entityPath));
  const hasUpdate = spec.endpoints.some(e => 
    (e.method === 'PUT' || e.method === 'PATCH') && e.path.includes(entityPathWithId)
  );
  const hasDelete = spec.endpoints.some(e => e.method === 'DELETE' && e.path.includes(entityPathWithId));

  if (!hasCreate) {
    operations.push({
      type: 'addEndpoint',
      endpoint: {
        id: `create-${entity.id}`,
        method: 'POST',
        path: entityPath,
        description: `Create a new ${entity.name}`,
        schema: {
          request: { type: 'object', properties: {} },
          response: { type: 'object', properties: {} },
        },
      },
    });
  }

  if (!hasRead) {
    operations.push({
      type: 'addEndpoint',
      endpoint: {
        id: `list-${entity.id}`,
        method: 'GET',
        path: entityPath,
        description: `List all ${entity.name}s`,
        schema: {
          response: { type: 'array', items: {} },
        },
      },
    });
  }

  if (!hasUpdate) {
    operations.push({
      type: 'addEndpoint',
      endpoint: {
        id: `update-${entity.id}`,
        method: 'PATCH',
        path: entityPathWithId,
        description: `Update a ${entity.name}`,
        schema: {
          request: { type: 'object', properties: {} },
          response: { type: 'object', properties: {} },
        },
      },
    });
  }

  if (!hasDelete) {
    operations.push({
      type: 'addEndpoint',
      endpoint: {
        id: `delete-${entity.id}`,
        method: 'DELETE',
        path: entityPathWithId,
        description: `Delete a ${entity.name}`,
        schema: {
          response: { type: 'object', properties: { success: { type: 'boolean' } } },
        },
      },
    });
  }

  return operations;
}

// Helper functions
function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
