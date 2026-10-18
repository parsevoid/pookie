export interface Snippet {
  id: string;
  title: string;
  customCommand: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  category?: string;
  description?: string;
}

export function createSnippet(
  overrides: Partial<Snippet> & Pick<Snippet, 'title' | 'content'>
): Snippet {
  const title = overrides.title;
  const customCommand = overrides.customCommand?.trim() || title.trim().toLowerCase();

  return {
    id: crypto.randomUUID(),
    customCommand,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
