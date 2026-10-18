export type SSHKeyType = 'ED25519' | 'RSA' | 'ECDSA' | 'ED25519-SK' | 'ECDSA-SK' | 'FIDO2-Passkey';

export interface SSHKey {
  id: string;
  name: string;
  privateKeyPath: string;
  publicKeyPath: string;
  keyType: SSHKeyType;
  fingerprint: string;
  publicKeyContent: string;
  createdAt: string;
  path?: string;
  type?: string;
  isDefault?: boolean;
  isPasskey?: boolean;
}

export function createSSHKey(
  overrides: Partial<SSHKey> & Pick<SSHKey, 'name' | 'privateKeyPath'>
): SSHKey {
  return {
    id: crypto.randomUUID(),
    publicKeyPath: '',
    keyType: 'ED25519',
    fingerprint: '',
    publicKeyContent: '',
    createdAt: new Date().toISOString(),
    path: overrides.privateKeyPath,
    type: 'ED25519',
    isDefault: false,
    ...overrides,
  };
}
