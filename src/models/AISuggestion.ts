export type SuggestionMode = 'suggestion' | 'reasoning' | 'snippet';

export interface AICommandSuggestion {
  command: string;
  explanation: string;
  model: string;
  confidence: number;
  mode?: SuggestionMode;
  prefixTag?: string;
  snippetTitle?: string;
  infoLines?: string[];
  commands?: string[];
  query?: string;
}

export function createSuggestion(
  command: string,
  explanation: string,
  model: string = 'Kali-Terminus-v2',
  confidence: number = 0.95,
  mode: SuggestionMode = 'suggestion',
  prefixTag?: string,
  snippetTitle?: string,
  infoLines?: string[],
  commands?: string[],
  query?: string
): AICommandSuggestion {
  return { command, explanation, model, confidence, mode, prefixTag, snippetTitle, infoLines, commands, query };
}

export interface AIModelConfig {
  modelName: string;
  apiEndpoint: string;
  apiKey: string;
  isEnabled: boolean;
  temperature: number;
}

export const defaultModelConfig: AIModelConfig = {
  modelName: 'Kali-Terminus-v2',
  apiEndpoint: 'http://localhost:11434/v1/chat/completions',
  apiKey: '',
  isEnabled: true,
  temperature: 0.2,
};
