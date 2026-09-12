import { KeyPairData, VerifiableCredential } from '../types';

interface StoredIdentity {
  keyPairData: KeyPairData;
  credentials: VerifiableCredential[];
}

interface StoredEnvelope {
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
}

const databaseName = 'aegisdid-vault';
const storeName = 'identity';
const identityKey = 'current';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getEncryptionKey(database: IDBDatabase): Promise<CryptoKey> {
  const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get('encryption-key');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (existing) return existing;

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(storeName, 'readwrite').objectStore(storeName).put(key, 'encryption-key');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  return key;
}

export async function saveIdentity(identity: StoredIdentity): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const database = await openDatabase();
  const key = await getEncryptionKey(database);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(identity));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(storeName, 'readwrite').objectStore(storeName).put({ iv: iv.buffer, ciphertext }, identityKey);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  database.close();
}

export async function loadIdentity(): Promise<StoredIdentity | null> {
  if (typeof indexedDB === 'undefined') return null;
  const database = await openDatabase();
  const envelope = await new Promise<StoredEnvelope | undefined>((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(identityKey);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (!envelope) { database.close(); return null; }
  const key = await getEncryptionKey(database);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: envelope.iv }, key, envelope.ciphertext);
  database.close();
  return JSON.parse(new TextDecoder().decode(plaintext)) as StoredIdentity;
}

export async function clearIdentity(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(storeName, 'readwrite').objectStore(storeName).delete(identityKey);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  database.close();
}