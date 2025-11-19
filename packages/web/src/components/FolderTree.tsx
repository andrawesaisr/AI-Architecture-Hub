'use client';

import { useState } from 'react';
import { FolderStructure } from '@ai-architecture-hub/core';

interface FolderTreeProps {
  structure: FolderStructure;
  path?: string;
}

export function FolderTree({ structure, path = '' }: FolderTreeProps) {
  return (
    <div className="space-y-1">
      {Object.entries(structure).map(([name, content]) => (
        <FolderTreeNode key={name} name={name} content={content} path={`${path}/${name}`} />
      ))}
    </div>
  );
}

interface FolderTreeNodeProps {
  name: string;
  content: FolderStructure | null;
  path: string;
}

function FolderTreeNode({ name, content, path }: FolderTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const isFolder = content !== null && typeof content === 'object';

  if (!isFolder) {
    return (
      <div className="flex items-center gap-2 py-1 pl-4 text-sm text-slate-300 hover:bg-slate-800/50 rounded">
        <span className="text-slate-500">📄</span>
        <span className="font-mono text-xs">{name}</span>
      </div>
    );
  }

  const hasChildren = Object.keys(content).length > 0;

  return (
    <div>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 py-1 pl-2 text-sm text-slate-200 hover:bg-slate-800/50 rounded transition"
      >
        <span className="text-slate-400">{isExpanded ? '📂' : '📁'}</span>
        <span className="font-mono text-xs font-semibold">{name}/</span>
        {hasChildren && (
          <span className="ml-auto text-[10px] text-slate-500">
            {Object.keys(content).length} items
          </span>
        )}
      </button>
      {isExpanded && hasChildren && (
        <div className="ml-4 border-l border-slate-700 pl-2">
          <FolderTree structure={content} path={path} />
        </div>
      )}
    </div>
  );
}
