export type { Connection, ConnectionType, ConnectionStatus, BackspaceMode, SSHAuthType } from './Connection';
export { createConnection, getDisplayName, buildSSHCommandLine } from './Connection';

export type { AICommandSuggestion, AIModelConfig } from './AISuggestion';
export { createSuggestion, defaultModelConfig } from './AISuggestion';

export type { AIModelInfo } from './AIModelInfo';
export { defaultModels } from './AIModelInfo';

export type { Snippet } from './Snippet';
export { createSnippet } from './Snippet';

export type { SSHHost, AuthMethod } from './SSHHost';
export { createSSHHost } from './SSHHost';

export type { SSHKey, SSHKeyType } from './SSHKey';
export { createSSHKey } from './SSHKey';

export type { CommandHistory } from './CommandHistory';
export { createCommandHistory } from './CommandHistory';

export type { RemoteFile, FileIconType } from './RemoteFile';
export { getFormattedSize, getFileIconType } from './RemoteFile';
