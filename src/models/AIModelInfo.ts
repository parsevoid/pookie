export interface AIModelInfo {
  name: string;
  displayName: string;
  parameterSize: string;
  description: string;
  tags: string[];
  isDownloaded: boolean;
  isSelected: boolean;
  isEnabled: boolean;
}

export const defaultModels: AIModelInfo[] = [
  {
    name: 'kali-terminus-350m',
    displayName: 'Kali Linux 350M (Kali-Terminus-v2)',
    parameterSize: '350M',
    description: 'Specialized 350M parameter model for real-time terminal suggestions, Kali Linux tools, and DevOps commands. Operates with <1ms latency.',
    tags: ['Kali Linux', '350M', 'Real-Time Suggestions', 'Built-in', 'Active'],
    isDownloaded: true,
    isSelected: true,
    isEnabled: true,
  },
  {
    name: 'reasoning-small',
    displayName: 'Terminal Reasoning Model (@ Questions)',
    parameterSize: '1.5B',
    description: 'Converts natural questions and tasks (prefix @) into strictly executable shell commands, annotating explanations as # comments.',
    tags: ['Reasoning (@)', 'Commands Only', '# Comments', 'Active'],
    isDownloaded: true,
    isSelected: false,
    isEnabled: true,
  },
  {
    name: 'Qwen-2.5-1.5B',
    displayName: 'Qwen 2.5 1.5B Instruct',
    parameterSize: '1.5B',
    description: 'Compact general shell command generation LLM. Downloads on first use (~1GB).',
    tags: ['Recommended', 'Fast', 'Accurate'],
    isDownloaded: false,
    isSelected: false,
    isEnabled: true,
  },
  {
    name: 'Phi-4-Mini',
    displayName: 'Phi-4 Mini 3.8B',
    parameterSize: '3.8B',
    description: 'Higher accuracy for complex multi-step commands and shell scripting. Requires ~3.5GB RAM.',
    tags: ['Reasoning', 'Power-User', 'Accurate'],
    isDownloaded: false,
    isSelected: false,
    isEnabled: true,
  },
];
