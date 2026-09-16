import { integer, sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamps = () => text('created_at').notNull();

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  passwordSalt: text('password_salt').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),
  walletAddress: text('wallet_address'),
  did: text('did'),
  createdAt: timestamps(),
  revoked: integer('revoked', { mode: 'boolean' }).notNull().default(false),
  revokedAt: text('revoked_at'),
}, table => ({ emailUnique: uniqueIndex('users_email_unique').on(table.email) }));

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull(),
  createdAt: timestamps(),
  lastUsedAt: text('last_used_at'),
}, table => ({ userIndex: index('api_keys_user_id_idx').on(table.userId) }));

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  walletAddress: text('wallet_address').notNull(),
  type: text('type', { enum: ['did_registration', 'credential_anchor', 'audit_log', 'sybil_publish'] }).notNull(),
  txHash: text('tx_hash').notNull(),
  status: text('status', { enum: ['pending', 'confirmed', 'failed'] }).notNull(),
  chainId: text('chain_id').notNull(),
  createdAt: timestamps(),
  confirmedAt: text('confirmed_at'),
  errorMessage: text('error_message'),
}, table => ({ userIndex: index('transactions_user_id_idx').on(table.userId), txHashUnique: uniqueIndex('transactions_tx_hash_unique').on(table.txHash) }));

export const credentials = sqliteTable('credentials', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  credentialId: text('credential_id').notNull(),
  issuerName: text('issuer_name').notNull(),
  issuedAt: text('issued_at').notNull(),
  expirationDate: text('expiration_date'),
  anchorTxHash: text('anchor_tx_hash'),
  revoked: integer('revoked', { mode: 'boolean' }).notNull().default(false),
}, table => ({ userIndex: index('credentials_user_id_idx').on(table.userId), credentialUnique: uniqueIndex('credentials_credential_id_unique').on(table.credentialId) }));

export const adminAuditLog = sqliteTable('admin_audit_log', {
  id: text('id').primaryKey(),
  adminUserId: text('admin_user_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  targetUserId: text('target_user_id').references(() => users.id),
  details: text('details').notNull().default('{}'),
  createdAt: timestamps(),
}, table => ({ adminIndex: index('admin_audit_admin_user_id_idx').on(table.adminUserId), targetIndex: index('admin_audit_target_user_id_idx').on(table.targetUserId) }));

export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
}, table => ({ userIndex: index('sessions_user_id_idx').on(table.userId) }));

export const spentChallenges = sqliteTable('spent_challenges', {
  challengeKey: text('challenge_key').primaryKey(),
  spentAt: integer('spent_at').notNull(),
});

export const fraudFlags = sqliteTable('fraud_flags', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  decision: text('decision').notNull(),
  analysis: text('analysis').notNull(),
  createdAt: timestamps(),
}, table => ({ userIndex: index('fraud_flags_user_id_idx').on(table.userId), createdIndex: index('fraud_flags_created_at_idx').on(table.createdAt) }));

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['info', 'error', 'admin'] }).notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  createdAt: timestamps(),
  readAt: text('read_at'),
}, table => ({ userIndex: index('notifications_user_id_idx').on(table.userId), createdIndex: index('notifications_created_at_idx').on(table.createdAt), unreadIndex: index('notifications_read_at_idx').on(table.readAt) }));

export const schema = { users, apiKeys, transactions, credentials, adminAuditLog, sessions, spentChallenges, fraudFlags, notifications };
