type SuggestionType = 'entityName' | 'endpointName' | 'description';

interface SuggestionInput {
  type: SuggestionType;
  context: string;
  fallback?: string;
}

interface LocalLLMPlugin {
  suggest(input: SuggestionInput): Promise<string[]> | string[];
}

let pluginInstance: LocalLLMPlugin | null = null;
let pluginLoaded = false;

export function loadLocalLLMPlugin(): void {
  if (pluginLoaded) return;
  pluginLoaded = true;
  const pluginPath = process.env.LOCAL_LLM_PLUGIN_PATH;
  if (!pluginPath) {
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pluginModule = require(pluginPath);
    pluginInstance = pluginModule.default ?? pluginModule;
    if (typeof pluginInstance?.suggest !== 'function') {
      pluginInstance = null;
      console.warn(`Local LLM plugin at ${pluginPath} does not expose a suggest function.`);
    }
  } catch (error) {
    console.warn(`Failed to load local LLM plugin from ${pluginPath}: ${(error as Error).message}`);
  }
}

export async function getLocalSuggestions(input: SuggestionInput): Promise<string[]> {
  if (pluginInstance) {
    try {
      const suggestions = await pluginInstance.suggest(input);
      if (Array.isArray(suggestions) && suggestions.length > 0) {
        return suggestions;
      }
    } catch (error) {
      console.warn(`Local LLM plugin suggest failed: ${(error as Error).message}`);
    }
  }

  return fallbackSuggestions(input);
}

function fallbackSuggestions(input: SuggestionInput): string[] {
  switch (input.type) {
    case 'entityName':
      return generateEntityNameFallbacks(input.context);
    case 'endpointName':
      return generateEndpointFallbacks(input.context);
    case 'description':
    default:
      return generateDescriptionFallbacks(input.context);
  }
}

function generateEntityNameFallbacks(context: string): string[] {
  const base = context.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(' ')[0] || 'Entity';
  return [base, `${base}Record`, `${base}Model`];
}

function generateEndpointFallbacks(context: string): string[] {
  const normalized = context.toLowerCase();
  if (normalized.includes('list') || normalized.includes('all')) {
    return ['GET /items', 'GET /items/:id'];
  }
  if (normalized.includes('create')) {
    return ['POST /items'];
  }
  return ['GET /resource', 'POST /resource'];
}

function generateDescriptionFallbacks(context: string): string[] {
  return [
    `Generate detailed description for ${context}.`,
    `Outline responsibilities and dependencies for ${context}.`,
  ];
}

export type { SuggestionType, SuggestionInput };
