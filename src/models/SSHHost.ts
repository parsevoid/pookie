export type AuthMethod = 'password' | 'sshKey' | 'passphrase' | 'agent' | 'fido2' | 'passkey';

export interface SSHHost {
  id: string;
  label: string;
  hostname: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  password?: string | null;
  keyPath: string | null;
  proxyJump: string | null;
  startupCommand: string | null;
  environmentVariables: Record<string, string>;
  createdAt: string;
  lastConnectedAt: string | null;
  tags?: string[];
}

export function createSSHHost(
  overrides: Partial<SSHHost> & Pick<SSHHost, 'label' | 'hostname' | 'username'>
): SSHHost {
  return {
    id: crypto.randomUUID(),
    port: 22,
    authMethod: 'sshKey',
    keyPath: null,
    proxyJump: null,
    startupCommand: null,
    environmentVariables: {},
    createdAt: new Date().toISOString(),
    lastConnectedAt: null,
    tags: [],
    ...overrides,
  };
}
