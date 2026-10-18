export type ConnectionType = 'local' | 'ssh' | 'ftp' | 'telnet' | 'raw_tcp' | 'serial';

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export type BackspaceMode = 'default' | 'controlH' | 'delete';

export type SSHAuthType = 'password' | 'sshKey' | 'certificate' | 'fido2' | 'passkey';

export interface Connection {
  id: string;
  name: string;
  hostname: string;
  type: ConnectionType;
  status: ConnectionStatus;
  port: number;
  username: string;
  password: string;
  label: string;
  parentGroup: string;
  tags: string[];
  backspaceMode: BackspaceMode;
  authType: SSHAuthType;
  sshKeyPath: string;
  certificatePath: string;
  createdAt: string;
  lastConnectedAt: string | null;
  sortOrder: number;
}

export function createConnection(overrides: Partial<Connection> & Pick<Connection, 'name' | 'hostname'>): Connection {
  return {
    id: crypto.randomUUID(),
    type: 'ssh',
    status: 'disconnected',
    port: 22,
    username: '',
    password: '',
    label: '',
    parentGroup: '',
    tags: [],
    backspaceMode: 'default',
    authType: 'password',
    sshKeyPath: '',
    certificatePath: '',
    createdAt: new Date().toISOString(),
    lastConnectedAt: null,
    sortOrder: 0,
    ...overrides,
  };
}

export function getDisplayName(conn: Connection): string {
  if (conn.label) return conn.label;
  if (conn.name) return conn.name;
  return conn.hostname;
}

export function buildSSHCommandLine(conn: Connection): string {
  let cmd = 'ssh';
  if (conn.port !== 22 && conn.port > 0) {
    cmd += ` -p ${conn.port}`;
  }
  if ((conn.authType === 'sshKey' || conn.authType === 'fido2' || conn.authType === 'passkey') && conn.sshKeyPath) {
    cmd += ` -i '${conn.sshKeyPath}'`;
  }
  if (conn.authType === 'certificate' && conn.certificatePath) {
    cmd += ` -i '${conn.certificatePath}'`;
  }
  const target = conn.username ? `${conn.username}@${conn.hostname}` : conn.hostname;
  cmd += ` ${target}`;
  return cmd;
}
