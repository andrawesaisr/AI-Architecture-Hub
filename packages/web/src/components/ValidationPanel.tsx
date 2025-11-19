'use client';

import { useState } from 'react';

interface ValidationError {
  type: 'error';
  category: 'entity' | 'endpoint' | 'schema' | 'dependency' | 'naming';
  message: string;
  entityId?: string;
  endpointId?: string;
  field?: string;
  severity: 'critical' | 'high' | 'medium';
}

interface ValidationWarning {
  type: 'warning';
  category: 'convention' | 'best-practice' | 'performance' | 'security';
  message: string;
  entityId?: string;
  endpointId?: string;
  suggestion?: string;
}

interface AutoFixSuggestion {
  id: string;
  description: string;
  category: string;
  autoFixable: boolean;
  changeRequest?: any;
}

interface ValidationResult {
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

interface ValidationPanelProps {
  projectId: string;
  onValidate: () => Promise<ValidationResult>;
  onApplyFix: (suggestionId: string) => Promise<void>;
}

export function ValidationPanel({ projectId, onValidate, onApplyFix }: ValidationPanelProps) {
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [applyingFix, setApplyingFix] = useState<string | null>(null);

  const handleValidate = async () => {
    setIsValidating(true);
    try {
      const result = await onValidate();
      setValidationResult(result);
    } catch (err) {
      alert('Validation failed');
    } finally {
      setIsValidating(false);
    }
  };

  const handleApplyFix = async (suggestionId: string) => {
    setApplyingFix(suggestionId);
    try {
      await onApplyFix(suggestionId);
      // Re-validate after applying fix
      await handleValidate();
    } catch (err) {
      alert('Failed to apply fix');
    } finally {
      setApplyingFix(null);
    }
  };

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Architecture Validation</h2>
        <button
          onClick={handleValidate}
          disabled={isValidating}
          className="rounded-md border border-sky-600 px-3 py-2 text-sm font-semibold text-sky-300 hover:bg-sky-600/10 disabled:opacity-50"
        >
          {isValidating ? 'Validating...' : '🔍 Validate Project'}
        </button>
      </div>

      {!validationResult && !isValidating && (
        <p className="mt-3 text-sm text-slate-400">
          Click "Validate Project" to check for consistency issues, naming violations, and missing components.
        </p>
      )}

      {validationResult && (
        <div className="mt-4 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 rounded-md border border-slate-700 bg-slate-950 p-4 md:grid-cols-4">
            <div className="text-center">
              <p className={`text-2xl font-bold ${validationResult.isValid ? 'text-emerald-300' : 'text-red-300'}`}>
                {validationResult.isValid ? '✓' : '✗'}
              </p>
              <p className="text-xs text-slate-400">{validationResult.isValid ? 'Valid' : 'Issues Found'}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-300">{validationResult.summary.criticalErrors}</p>
              <p className="text-xs text-slate-400">Critical Errors</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-300">{validationResult.summary.warnings}</p>
              <p className="text-xs text-slate-400">Warnings</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-sky-300">{validationResult.summary.autoFixableCount}</p>
              <p className="text-xs text-slate-400">Auto-Fixable</p>
            </div>
          </div>

          {/* Errors */}
          {validationResult.errors.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-red-300">❌ Errors</h3>
              <div className="space-y-2">
                {validationResult.errors.map((error, idx) => (
                  <div
                    key={idx}
                    className={`rounded-md border p-3 ${
                      error.severity === 'critical'
                        ? 'border-red-500/40 bg-red-500/10'
                        : error.severity === 'high'
                        ? 'border-orange-500/40 bg-orange-500/10'
                        : 'border-yellow-500/40 bg-yellow-500/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-red-200">{error.message}</p>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
                          <span className="rounded bg-slate-800 px-2 py-0.5">{error.category}</span>
                          <span className="rounded bg-slate-800 px-2 py-0.5">{error.severity}</span>
                          {error.entityId && <span className="rounded bg-slate-800 px-2 py-0.5">Entity: {error.entityId}</span>}
                          {error.endpointId && <span className="rounded bg-slate-800 px-2 py-0.5">Endpoint: {error.endpointId}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {validationResult.warnings.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-amber-300">⚠️ Warnings</h3>
              <div className="space-y-2">
                {validationResult.warnings.map((warning, idx) => (
                  <div key={idx} className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                    <p className="text-sm font-medium text-amber-200">{warning.message}</p>
                    {warning.suggestion && (
                      <p className="mt-1 text-xs text-amber-300">💡 Suggestion: {warning.suggestion}</p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
                      <span className="rounded bg-slate-800 px-2 py-0.5">{warning.category}</span>
                      {warning.entityId && <span className="rounded bg-slate-800 px-2 py-0.5">Entity: {warning.entityId}</span>}
                      {warning.endpointId && <span className="rounded bg-slate-800 px-2 py-0.5">Endpoint: {warning.endpointId}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Auto-Fix Suggestions */}
          {validationResult.suggestions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-sky-300">🔧 Auto-Fix Suggestions</h3>
              <div className="space-y-2">
                {validationResult.suggestions.map((suggestion) => (
                  <div key={suggestion.id} className="rounded-md border border-sky-500/40 bg-sky-500/10 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-sky-200">{suggestion.description}</p>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
                          <span className="rounded bg-slate-800 px-2 py-0.5">{suggestion.category}</span>
                          {suggestion.autoFixable && (
                            <span className="rounded bg-emerald-700 px-2 py-0.5 text-emerald-200">Auto-fixable</span>
                          )}
                        </div>
                      </div>
                      {suggestion.autoFixable && (
                        <button
                          onClick={() => handleApplyFix(suggestion.id)}
                          disabled={applyingFix === suggestion.id}
                          className="rounded-md border border-emerald-600 px-3 py-1 text-sm text-emerald-300 hover:bg-emerald-600/10 disabled:opacity-50"
                        >
                          {applyingFix === suggestion.id ? 'Applying...' : 'Apply Fix'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Success Message */}
          {validationResult.isValid && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
              <p className="text-lg font-semibold text-emerald-300">✨ Architecture is valid!</p>
              <p className="mt-1 text-sm text-emerald-200">No critical issues found. Your project structure is consistent.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
