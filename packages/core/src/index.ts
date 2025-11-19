export interface Project {
  id: string;
  name: string;
  stack: string;
  architectureStyle: string;
  description: string;
  spec: Spec;
  versions: Version[];
  features: Feature[];
  adrs: ADR[];
  invites: ProjectInvite[];
  reviews: ProjectReview[];
  lock: ProjectLock | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Version {
  id: string;
  projectId: string;
  number: number;
  spec: Spec;
  diff: any; // A more specific type can be defined later
  createdBy: string;
  createdAt: Date;
}

export interface Spec {
  requirements: Requirement[];
  entities: Entity[];
  endpoints: Endpoint[];
  folder_structure: FolderStructure;
  features?: Feature[];
  systemOverview: string;
  contextDiagram: string;
  domainModel: DomainModelDetail[];
  apiOverview: ApiEndpointOverview[];
  databaseSchemaOverview: DatabaseSchemaOverview;
  generatedDocuments: GeneratedDocuments;
  featureIdeas: FeatureIdea[];
  [key: string]: any;
}

export interface Requirement {
  id: string;
  description: string;
}

export interface Entity {
  id: string;
  name: string;
  fields: Field[];
  relations: Relation[];
}

export interface Field {
  name: string;
  type: string;
}

export interface Relation {
  target: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
}

export interface Endpoint {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  schema: any; // A more specific type can be defined later (e.g., JSONSchema7)
}

export interface FolderStructure {
  [key: string]: FolderStructure | null;
}

export interface DomainModelDetail {
  entityId: string;
  description: string;
  properties: DomainProperty[];
  relations: Relation[];
  businessRules: string[];
  crudEndpoints: string[];
}

export interface DomainProperty {
  name: string;
  type: string;
  description?: string;
}

export interface ApiEndpointOverview {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  summary: string;
  requestSchema?: Record<string, any> | null;
  responseSchema?: Record<string, any> | null;
}

export interface DatabaseSchemaOverview {
  engine: string;
  prismaSchema: string;
  tables: TableOverview[];
}

export interface TableOverview {
  name: string;
  description?: string;
  columns: ColumnOverview[];
}

export interface ColumnOverview {
  name: string;
  type: string;
  notes?: string;
}

export interface GeneratedDocuments {
  requirements: string;
  adrSuggestions: string[];
  notes?: string;
}

export interface FeatureIdea {
  title: string;
  description: string;
  impactAreas: string[];
}

export interface Feature {
  id: string;
  title: string;
  description: string;
  status: FeatureStatus;
  changeRequest: ChangeRequest;
  preview?: ChangePreview;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export type FeatureStatus = 'draft' | 'in_review' | 'approved' | 'applied' | 'rejected';

export interface ChangeRequest {
  summary: string;
  operations: ChangeOperation[];
}

export type ChangeOperation =
  | { type: 'addRequirement'; requirement: Requirement }
  | { type: 'updateRequirement'; requirementId: string; patch: Partial<Requirement> }
  | { type: 'removeRequirement'; requirementId: string }
  | { type: 'addEntity'; entity: Entity }
  | { type: 'updateEntity'; entityId: string; patch: Partial<Entity> }
  | { type: 'removeEntity'; entityId: string }
  | { type: 'addEndpoint'; endpoint: Endpoint }
  | { type: 'updateEndpoint'; endpointId: string; patch: Partial<Endpoint> }
  | { type: 'removeEndpoint'; endpointId: string }
  | { type: 'updateFolderStructure'; folder_structure: FolderStructure };

export interface ChangePreview {
  currentSpec: Spec;
  proposedSpec: Spec;
  diff: any;
  conflicts: ChangeConflict[];
  impacts: ChangeImpact[];
}

export interface ChangeConflict {
  type: 'naming' | 'missing-field' | 'circular-relation' | 'validation';
  message: string;
  details?: Record<string, any>;
}

export interface ChangeImpact {
  description: string;
  affectedEntities?: string[];
  affectedEndpoints?: string[];
  affectedFiles?: string[];
}

export interface ADR {
  id: string;
  title: string;
  context: string;
  decision: string;
  consequences: string;
  status: ADRStatus;
  createdBy: string;
  createdAt: Date;
}

export type ADRStatus = 'proposed' | 'accepted' | 'rejected' | 'superseded';

export interface ProjectInvite {
  id: string;
  email: string;
  role: ProjectRole;
  status: InviteStatus;
  invitedBy: string;
  token: string;
  createdAt: Date;
  acceptedAt?: Date;
}

export type ProjectRole = 'owner' | 'editor' | 'reviewer';
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export interface ProjectReview {
  id: string;
  featureId: string;
  reviewerId: string;
  status: ReviewStatus;
  comment?: string;
  createdAt: Date;
}

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface ProjectLock {
  id: string;
  lockedBy: string;
  lockedAt: Date;
  expiresAt: Date;
}
