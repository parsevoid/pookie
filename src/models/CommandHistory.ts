export interface CommandHistory {
  id: string;
  command: string;
  output: string | null;
  exitCode: number | null;
  workingDirectory: string;
  shellType: string;
  connectionId: string | null;
  executedAt: string;
}

export function createCommandHistory(
  overrides: Partial<CommandHistory> & Pick<CommandHistory, 'command'>
): CommandHistory {
  return {
    id: crypto.randomUUID(),
    output: null,
    exitCode: null,
    workingDirectory: '',
    shellType: 'zsh',
    connectionId: null,
    executedAt: new Date().toISOString(),
    ...overrides,
  };
}
