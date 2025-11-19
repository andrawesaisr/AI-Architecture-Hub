import { Entity, Endpoint, Spec } from '@ai-architecture-hub/core';

export function generateServiceLogic(entity: Entity, stack: string): string {
  const entityName = entity.name;
  const entityNameLower = entityName.toLowerCase();
  
  if (stack.includes('Node') || stack.includes('Express')) {
    return generateNodeServiceLogic(entity);
  } else if (stack.includes('FastAPI') || stack.includes('Python')) {
    return generatePythonServiceLogic(entity);
  } else if (stack.includes('Go')) {
    return generateGoServiceLogic(entity);
  }
  
  return generateNodeServiceLogic(entity); // Default
}

function generateNodeServiceLogic(entity: Entity): string {
  const entityName = entity.name;
  const entityNameLower = entityName.toLowerCase();
  
  return `import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class ${entityName}Service {
  /**
   * Create a new ${entityName}
   */
  async create(data: Create${entityName}Input): Promise<${entityName}> {
    try {
      // Validate input
      this.validateCreateInput(data);
      
      // Check for duplicates if needed
      // await this.checkDuplicates(data);
      
      // Create entity
      const ${entityNameLower} = await prisma.${entityNameLower}.create({
        data,
      });
      
      return ${entityNameLower};
    } catch (error) {
      throw new Error(\`Failed to create ${entityName}: \${error.message}\`);
    }
  }

  /**
   * Find ${entityName} by ID
   */
  async findById(id: string): Promise<${entityName} | null> {
    try {
      return await prisma.${entityNameLower}.findUnique({
        where: { id },
        include: this.getDefaultInclude(),
      });
    } catch (error) {
      throw new Error(\`Failed to find ${entityName}: \${error.message}\`);
    }
  }

  /**
   * Find all ${entityName}s with pagination
   */
  async findAll(options: FindAllOptions = {}): Promise<PaginatedResult<${entityName}>> {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = options;
    const skip = (page - 1) * limit;
    
    try {
      const [items, total] = await Promise.all([
        prisma.${entityNameLower}.findMany({
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: this.getDefaultInclude(),
        }),
        prisma.${entityNameLower}.count(),
      ]);
      
      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      throw new Error(\`Failed to fetch ${entityName}s: \${error.message}\`);
    }
  }

  /**
   * Update ${entityName}
   */
  async update(id: string, data: Update${entityName}Input): Promise<${entityName}> {
    try {
      // Validate input
      this.validateUpdateInput(data);
      
      // Check if exists
      const existing = await this.findById(id);
      if (!existing) {
        throw new Error(\`${entityName} not found\`);
      }
      
      // Update entity
      const updated = await prisma.${entityNameLower}.update({
        where: { id },
        data,
        include: this.getDefaultInclude(),
      });
      
      return updated;
    } catch (error) {
      throw new Error(\`Failed to update ${entityName}: \${error.message}\`);
    }
  }

  /**
   * Delete ${entityName}
   */
  async delete(id: string): Promise<void> {
    try {
      // Check if exists
      const existing = await this.findById(id);
      if (!existing) {
        throw new Error(\`${entityName} not found\`);
      }
      
      // Soft delete if timestamps exist, otherwise hard delete
      await prisma.${entityNameLower}.delete({
        where: { id },
      });
    } catch (error) {
      throw new Error(\`Failed to delete ${entityName}: \${error.message}\`);
    }
  }

  /**
   * Validation helpers
   */
  private validateCreateInput(data: any): void {
    // Add validation logic here
    ${entity.fields.filter(f => f.name !== 'id').map(field => 
      `if (!data.${field.name}) throw new Error('${field.name} is required');`
    ).join('\n    ')}
  }

  private validateUpdateInput(data: any): void {
    // Add validation logic here
  }

  /**
   * Default include for relations
   */
  private getDefaultInclude() {
    return {
      ${entity.relations.map(rel => `${rel.target}: true`).join(',\n      ')}
    };
  }
}

// Types
interface Create${entityName}Input {
  ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At')).map(f => 
    `${f.name}: ${mapPrismaTypeToTS(f.type)};`
  ).join('\n  ')}
}

interface Update${entityName}Input {
  ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At')).map(f => 
    `${f.name}?: ${mapPrismaTypeToTS(f.type)};`
  ).join('\n  ')}
}

interface FindAllOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
`;
}

function generatePythonServiceLogic(entity: Entity): string {
  const entityName = entity.name;
  const entityNameSnake = toSnakeCase(entityName);
  
  return `from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc
from . import models, schemas

class ${entityName}Service:
    """Service for ${entityName} operations"""
    
    def create(self, db: Session, data: schemas.${entityName}Create) -> models.${entityName}:
        """Create a new ${entityName}"""
        # Validate input
        self._validate_create(data)
        
        # Create entity
        db_${entityNameSnake} = models.${entityName}(**data.dict())
        db.add(db_${entityNameSnake})
        db.commit()
        db.refresh(db_${entityNameSnake})
        
        return db_${entityNameSnake}
    
    def get_by_id(self, db: Session, id: int) -> Optional[models.${entityName}]:
        """Get ${entityName} by ID"""
        return db.query(models.${entityName}).filter(models.${entityName}.id == id).first()
    
    def get_all(
        self,
        db: Session,
        skip: int = 0,
        limit: int = 10,
        sort_by: str = "created_at",
        sort_order: str = "desc"
    ) -> List[models.${entityName}]:
        """Get all ${entityName}s with pagination"""
        query = db.query(models.${entityName})
        
        # Apply sorting
        order_func = desc if sort_order == "desc" else asc
        query = query.order_by(order_func(getattr(models.${entityName}, sort_by)))
        
        return query.offset(skip).limit(limit).all()
    
    def update(
        self,
        db: Session,
        id: int,
        data: schemas.${entityName}Update
    ) -> Optional[models.${entityName}]:
        """Update ${entityName}"""
        db_${entityNameSnake} = self.get_by_id(db, id)
        if not db_${entityNameSnake}:
            return None
        
        # Update fields
        for key, value in data.dict(exclude_unset=True).items():
            setattr(db_${entityNameSnake}, key, value)
        
        db.commit()
        db.refresh(db_${entityNameSnake})
        return db_${entityNameSnake}
    
    def delete(self, db: Session, id: int) -> bool:
        """Delete ${entityName}"""
        db_${entityNameSnake} = self.get_by_id(db, id)
        if not db_${entityNameSnake}:
            return False
        
        db.delete(db_${entityNameSnake})
        db.commit()
        return True
    
    def _validate_create(self, data: schemas.${entityName}Create) -> None:
        """Validate create input"""
        # Add validation logic here
        pass
`;
}

function generateGoServiceLogic(entity: Entity): string {
  const entityName = entity.name;
  const entityNameLower = entityName.toLowerCase();
  
  return `package service

import (
    "context"
    "errors"
    "time"
)

type ${entityName}Service struct {
    repo ${entityName}Repository
}

func New${entityName}Service(repo ${entityName}Repository) *${entityName}Service {
    return &${entityName}Service{repo: repo}
}

// Create creates a new ${entityName}
func (s *${entityName}Service) Create(ctx context.Context, input Create${entityName}Input) (*${entityName}, error) {
    // Validate input
    if err := s.validateCreate(input); err != nil {
        return nil, err
    }
    
    // Create entity
    ${entityNameLower} := &${entityName}{
        ${entity.fields.filter(f => f.name !== 'id').map(f => 
          `${capitalize(f.name)}: input.${capitalize(f.name)},`
        ).join('\n        ')}
        CreatedAt: time.Now(),
        UpdatedAt: time.Now(),
    }
    
    if err := s.repo.Create(ctx, ${entityNameLower}); err != nil {
        return nil, err
    }
    
    return ${entityNameLower}, nil
}

// GetByID retrieves a ${entityName} by ID
func (s *${entityName}Service) GetByID(ctx context.Context, id string) (*${entityName}, error) {
    return s.repo.GetByID(ctx, id)
}

// GetAll retrieves all ${entityName}s with pagination
func (s *${entityName}Service) GetAll(ctx context.Context, opts GetAllOptions) ([]*${entityName}, int, error) {
    return s.repo.GetAll(ctx, opts)
}

// Update updates a ${entityName}
func (s *${entityName}Service) Update(ctx context.Context, id string, input Update${entityName}Input) (*${entityName}, error) {
    // Check if exists
    existing, err := s.GetByID(ctx, id)
    if err != nil {
        return nil, err
    }
    if existing == nil {
        return nil, errors.New("${entityName} not found")
    }
    
    // Update fields
    ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At')).map(f => 
      `if input.${capitalize(f.name)} != nil {
        existing.${capitalize(f.name)} = *input.${capitalize(f.name)}
    }`
    ).join('\n    ')}
    existing.UpdatedAt = time.Now()
    
    if err := s.repo.Update(ctx, existing); err != nil {
        return nil, err
    }
    
    return existing, nil
}

// Delete deletes a ${entityName}
func (s *${entityName}Service) Delete(ctx context.Context, id string) error {
    return s.repo.Delete(ctx, id)
}

func (s *${entityName}Service) validateCreate(input Create${entityName}Input) error {
    // Add validation logic here
    return nil
}
`;
}

// ============================================================================
// TEST GENERATION
// ============================================================================

export function generateTests(entity: Entity, stack: string): string {
  if (stack.includes('Node') || stack.includes('Express')) {
    return generateNodeTests(entity);
  } else if (stack.includes('FastAPI') || stack.includes('Python')) {
    return generatePythonTests(entity);
  }
  
  return generateNodeTests(entity);
}

function generateNodeTests(entity: Entity): string {
  const entityName = entity.name;
  const entityNameLower = entityName.toLowerCase();
  
  return `import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ${entityName}Service } from './${entityNameLower}.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const service = new ${entityName}Service();

describe('${entityName}Service', () => {
  beforeEach(async () => {
    // Clean up database before each test
    await prisma.${entityNameLower}.deleteMany();
  });

  afterEach(async () => {
    // Clean up after tests
    await prisma.${entityNameLower}.deleteMany();
  });

  describe('create', () => {
    it('should create a new ${entityName}', async () => {
      const data = {
        ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At')).map(f => 
          `${f.name}: ${getMockValue(f.type)},`
        ).join('\n        ')}
      };

      const result = await service.create(data);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At')).map(f => 
        `expect(result.${f.name}).toBe(data.${f.name});`
      ).join('\n      ')}
    });

    it('should throw error when required fields are missing', async () => {
      const data = {};

      await expect(service.create(data)).rejects.toThrow();
    });
  });

  describe('findById', () => {
    it('should find ${entityName} by ID', async () => {
      const created = await service.create({
        ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At')).map(f => 
          `${f.name}: ${getMockValue(f.type)},`
        ).join('\n        ')}
      });

      const result = await service.findById(created.id);

      expect(result).toBeDefined();
      expect(result?.id).toBe(created.id);
    });

    it('should return null for non-existent ID', async () => {
      const result = await service.findById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      // Create test data
      await Promise.all([
        service.create({ ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At'))[0]?.name}: ${getMockValue(entity.fields[0]?.type)} }),
        service.create({ ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At'))[0]?.name}: ${getMockValue(entity.fields[0]?.type)} }),
      ]);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('update', () => {
    it('should update ${entityName}', async () => {
      const created = await service.create({
        ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At')).map(f => 
          `${f.name}: ${getMockValue(f.type)},`
        ).join('\n        ')}
      });

      const updateData = {
        ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At'))[0]?.name}: ${getMockValue(entity.fields[0]?.type)},
      };

      const result = await service.update(created.id, updateData);

      expect(result).toBeDefined();
      expect(result.${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At'))[0]?.name}).toBe(updateData.${entity.fields[0]?.name});
    });

    it('should throw error for non-existent ID', async () => {
      await expect(service.update('non-existent-id', {})).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('should delete ${entityName}', async () => {
      const created = await service.create({
        ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At')).map(f => 
          `${f.name}: ${getMockValue(f.type)},`
        ).join('\n        ')}
      });

      await service.delete(created.id);

      const result = await service.findById(created.id);
      expect(result).toBeNull();
    });

    it('should throw error for non-existent ID', async () => {
      await expect(service.delete('non-existent-id')).rejects.toThrow();
    });
  });
});
`;
}

function generatePythonTests(entity: Entity): string {
  const entityName = entity.name;
  const entityNameSnake = toSnakeCase(entityName);
  
  return `import pytest
from sqlalchemy.orm import Session
from app.services.${entityNameSnake}_service import ${entityName}Service
from app import schemas

@pytest.fixture
def service():
    return ${entityName}Service()

@pytest.fixture
def db_session():
    # Setup test database session
    # This should be configured in conftest.py
    pass

class Test${entityName}Service:
    def test_create_${entityNameSnake}(self, service: ${entityName}Service, db_session: Session):
        """Test creating a new ${entityName}"""
        data = schemas.${entityName}Create(
            ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At')).map(f => 
              `${toSnakeCase(f.name)}=${getMockValue(f.type)}`
            ).join(',\n            ')}
        )
        
        result = service.create(db_session, data)
        
        assert result.id is not None
        ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At')).map(f => 
          `assert result.${toSnakeCase(f.name)} == data.${toSnakeCase(f.name)}`
        ).join('\n        ')}
    
    def test_get_by_id(self, service: ${entityName}Service, db_session: Session):
        """Test getting ${entityName} by ID"""
        # Create test data
        data = schemas.${entityName}Create(
            ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At')).map(f => 
              `${toSnakeCase(f.name)}=${getMockValue(f.type)}`
            ).join(',\n            ')}
        )
        created = service.create(db_session, data)
        
        # Get by ID
        result = service.get_by_id(db_session, created.id)
        
        assert result is not None
        assert result.id == created.id
    
    def test_get_all(self, service: ${entityName}Service, db_session: Session):
        """Test getting all ${entityName}s"""
        # Create test data
        for i in range(3):
            data = schemas.${entityName}Create(
                ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At'))[0]?.name}=f"test_{i}"
            )
            service.create(db_session, data)
        
        # Get all
        results = service.get_all(db_session, skip=0, limit=10)
        
        assert len(results) == 3
    
    def test_update(self, service: ${entityName}Service, db_session: Session):
        """Test updating ${entityName}"""
        # Create test data
        data = schemas.${entityName}Create(
            ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At')).map(f => 
              `${toSnakeCase(f.name)}=${getMockValue(f.type)}`
            ).join(',\n            ')}
        )
        created = service.create(db_session, data)
        
        # Update
        update_data = schemas.${entityName}Update(
            ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At'))[0]?.name}="updated_value"
        )
        result = service.update(db_session, created.id, update_data)
        
        assert result is not None
        assert result.${toSnakeCase(entity.fields[0]?.name)} == "updated_value"
    
    def test_delete(self, service: ${entityName}Service, db_session: Session):
        """Test deleting ${entityName}"""
        # Create test data
        data = schemas.${entityName}Create(
            ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At')).map(f => 
              `${toSnakeCase(f.name)}=${getMockValue(f.type)}`
            ).join(',\n            ')}
        )
        created = service.create(db_session, data)
        
        # Delete
        result = service.delete(db_session, created.id)
        
        assert result is True
        assert service.get_by_id(db_session, created.id) is None
`;
}

// ============================================================================
// FRONTEND COMPONENT GENERATION
// ============================================================================

export function generateFrontendComponent(entity: Entity): string {
  const entityName = entity.name;
  const entityNameLower = entityName.toLowerCase();
  const entityNamePlural = `${entityName}s`;
  
  return `'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface ${entityName} {
  id: string;
  ${entity.fields.map(f => `${f.name}: ${mapPrismaTypeToTS(f.type)};`).join('\n  ')}
}

export default function ${entityNamePlural}Page() {
  const router = useRouter();
  const [${entityNameLower}s, set${entityNamePlural}] = useState<${entityName}[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At')).map(f => 
      `${f.name}: '',`
    ).join('\n    ')}
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const response = await fetch('/api/${entityNameLower}s');
      if (!response.ok) throw new Error('Failed to load data');
      const data = await response.json();
      set${entityNamePlural}(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const response = await fetch('/api/${entityNameLower}s', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!response.ok) throw new Error('Failed to create');
      await loadData();
      setFormData({
        ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At')).map(f => 
          `${f.name}: '',`
        ).join('\n        ')}
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return;
    try {
      const response = await fetch(\`/api/${entityNameLower}s/\${id}\`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete');
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">${entityNamePlural}</h1>

      {/* Create Form */}
      <form onSubmit={handleCreate} className="mb-8 p-6 bg-white rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Create New ${entityName}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At')).map(f => `
          <div>
            <label className="block text-sm font-medium mb-1">${capitalize(f.name)}</label>
            <input
              type="${getInputType(f.type)}"
              value={formData.${f.name}}
              onChange={(e) => setFormData({ ...formData, ${f.name}: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
              required
            />
          </div>`).join('')}
        </div>
        <button
          type="submit"
          disabled={isCreating}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isCreating ? 'Creating...' : 'Create ${entityName}'}
        </button>
      </form>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-600">
          {error}
        </div>
      )}

      {/* List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {${entityNameLower}s.map((${entityNameLower}) => (
          <div key={${entityNameLower}.id} className="p-6 bg-white rounded-lg shadow">
            ${entity.fields.filter(f => f.name !== 'id' && !f.name.includes('At')).slice(0, 3).map(f => `
            <div className="mb-2">
              <span className="font-semibold">${capitalize(f.name)}:</span> {${entityNameLower}.${f.name}}
            </div>`).join('')}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => router.push(\`/${entityNameLower}s/\${${entityNameLower}.id}\`)}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
              >
                View
              </button>
              <button
                onClick={() => handleDelete(${entityNameLower}.id)}
                className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {${entityNameLower}s.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No ${entityNameLower}s found. Create one above.
        </div>
      )}
    </div>
  );
}
`;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function mapPrismaTypeToTS(type: string): string {
  const typeMap: Record<string, string> = {
    'String': 'string',
    'Int': 'number',
    'Float': 'number',
    'Boolean': 'boolean',
    'DateTime': 'Date',
    'Json': 'any',
  };
  return typeMap[type] || 'any';
}

function getMockValue(type: string): string {
  const mockMap: Record<string, string> = {
    'String': '"test-value"',
    'Int': '123',
    'Float': '123.45',
    'Boolean': 'true',
    'DateTime': 'new Date()',
    'Json': '{}',
  };
  return mockMap[type] || '""';
}

function getInputType(type: string): string {
  const inputMap: Record<string, string> = {
    'String': 'text',
    'Int': 'number',
    'Float': 'number',
    'Boolean': 'checkbox',
    'DateTime': 'datetime-local',
  };
  return inputMap[type] || 'text';
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replace(/^_/, '');
}
