'use client';

import { useEffect, useRef, useState } from 'react';
import { Spec, Entity, Endpoint } from '@ai-architecture-hub/core';

interface ArchitectureDiagramsProps {
  spec: Spec;
}

export function ArchitectureDiagrams({ spec }: ArchitectureDiagramsProps) {
  const [activeTab, setActiveTab] = useState<'context' | 'er' | 'flow'>('context');
  const [mermaidLoaded, setMermaidLoaded] = useState(false);

  useEffect(() => {
    // Dynamically load Mermaid.js
    if (typeof window !== 'undefined' && !mermaidLoaded) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
      script.async = true;
      script.onload = () => {
        // @ts-ignore
        window.mermaid?.initialize({ startOnLoad: true, theme: 'dark' });
        setMermaidLoaded(true);
      };
      document.body.appendChild(script);
    }
  }, [mermaidLoaded]);

  useEffect(() => {
    if (mermaidLoaded && typeof window !== 'undefined') {
      // @ts-ignore
      window.mermaid?.contentLoaded();
    }
  }, [activeTab, mermaidLoaded]);

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <h2 className="text-lg font-semibold">Architecture Diagrams</h2>
      <p className="mt-1 text-sm text-slate-400">
        Visual representations of your system architecture
      </p>

      {/* Tabs */}
      <div className="mt-4 flex gap-2 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('context')}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === 'context'
              ? 'border-b-2 border-sky-500 text-sky-400'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          Context Diagram
        </button>
        <button
          onClick={() => setActiveTab('er')}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === 'er'
              ? 'border-b-2 border-sky-500 text-sky-400'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          Entity Relationships
        </button>
        <button
          onClick={() => setActiveTab('flow')}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === 'flow'
              ? 'border-b-2 border-sky-500 text-sky-400'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          API Flow
        </button>
      </div>

      {/* Diagram Content */}
      <div className="mt-6">
        {activeTab === 'context' && <ContextDiagram spec={spec} />}
        {activeTab === 'er' && <ERDiagram spec={spec} />}
        {activeTab === 'flow' && <APIFlowDiagram spec={spec} />}
      </div>
    </section>
  );
}

function ContextDiagram({ spec }: { spec: Spec }) {
  const mermaidCode = generateContextDiagram(spec);

  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 p-6">
      <h3 className="mb-4 text-sm font-semibold text-slate-300">System Context</h3>
      <div className="mermaid" key={mermaidCode}>
        {mermaidCode}
      </div>
    </div>
  );
}

function ERDiagram({ spec }: { spec: Spec }) {
  const mermaidCode = generateERDiagram(spec);

  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 p-6">
      <h3 className="mb-4 text-sm font-semibold text-slate-300">Entity Relationship Diagram</h3>
      <div className="mermaid overflow-x-auto" key={mermaidCode}>
        {mermaidCode}
      </div>
    </div>
  );
}

function APIFlowDiagram({ spec }: { spec: Spec }) {
  const mermaidCode = generateAPIFlowDiagram(spec);

  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 p-6">
      <h3 className="mb-4 text-sm font-semibold text-slate-300">API Request Flow</h3>
      <div className="mermaid overflow-x-auto" key={mermaidCode}>
        {mermaidCode}
      </div>
    </div>
  );
}

// ============================================================================
// DIAGRAM GENERATORS
// ============================================================================

function generateContextDiagram(spec: Spec): string {
  const entities = spec.entities.slice(0, 6); // Limit to avoid clutter
  
  return `graph TB
    User[User/Client]
    API[API Server]
    DB[(Database)]
    
    User -->|HTTP Requests| API
    API -->|Queries| DB
    
    ${entities.map((entity, idx) => `
    API -->|Manages| ${entity.name}[${entity.name}]
    ${entity.name} -.->|Stored in| DB
    `).join('\n    ')}
    
    style User fill:#3b82f6,stroke:#1e40af,color:#fff
    style API fill:#10b981,stroke:#047857,color:#fff
    style DB fill:#f59e0b,stroke:#d97706,color:#fff
    ${entities.map(e => `style ${e.name} fill:#6366f1,stroke:#4f46e5,color:#fff`).join('\n    ')}
  `;
}

function generateERDiagram(spec: Spec): string {
  const entities = spec.entities;
  
  let diagram = 'erDiagram\n';
  
  // Add entities with their fields
  entities.forEach(entity => {
    diagram += `    ${entity.name} {\n`;
    entity.fields.slice(0, 8).forEach(field => {
      diagram += `        ${field.type} ${field.name}\n`;
    });
    diagram += `    }\n`;
  });
  
  // Add relationships
  entities.forEach(entity => {
    entity.relations?.forEach(relation => {
      const relationshipType = mapRelationType(relation.type);
      diagram += `    ${entity.name} ${relationshipType} ${relation.target} : "${relation.type}"\n`;
    });
  });
  
  return diagram;
}

function generateAPIFlowDiagram(spec: Spec): string {
  const endpoints = spec.endpoints.slice(0, 10); // Limit to avoid clutter
  
  return `sequenceDiagram
    participant Client
    participant API
    participant Service
    participant Database
    
    ${endpoints.map((endpoint, idx) => {
      const method = endpoint.method;
      const path = endpoint.path;
      const entityName = extractEntityFromPath(path);
      
      return `
    Note over Client,Database: ${method} ${path}
    Client->>+API: ${method} ${path}
    API->>+Service: ${method === 'GET' ? 'Query' : method === 'POST' ? 'Create' : method === 'PUT' || method === 'PATCH' ? 'Update' : 'Delete'} ${entityName}
    Service->>+Database: ${method === 'GET' ? 'SELECT' : method === 'POST' ? 'INSERT' : method === 'PUT' || method === 'PATCH' ? 'UPDATE' : 'DELETE'}
    Database-->>-Service: Result
    Service-->>-API: ${entityName} Data
    API-->>-Client: Response
      `;
    }).join('\n')}
  `;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function mapRelationType(type: string): string {
  const typeMap: Record<string, string> = {
    'one-to-one': '||--||',
    'one-to-many': '||--o{',
    'many-to-one': '}o--||',
    'many-to-many': '}o--o{',
  };
  return typeMap[type] || '||--||';
}

function extractEntityFromPath(path: string): string {
  const parts = path.split('/').filter(p => p && !p.startsWith(':'));
  const lastPart = parts[parts.length - 1] || 'Resource';
  return lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
}
