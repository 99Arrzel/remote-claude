import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const sessions = sqliteTable('sessions', {
  id:              text('id').primaryKey(),
  name:            text('name').notNull(),
  cwd:             text('cwd').notNull(),
  status:          text('status').notNull().$type<'active' | 'exited' | 'killed'>(),
  claudeSessionId: text('claude_session_id'),
  createdAt:       integer('created_at').notNull(),
  updatedAt:       integer('updated_at').notNull(),
})

export const sessionOutput = sqliteTable('session_output', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  seq:       integer('seq').notNull(),
  type:      text('type').notNull().$type<'output' | 'exit'>(),
  data:      text('data').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  seqUnique: uniqueIndex('session_output_session_seq_idx').on(t.sessionId, t.seq),
}))

export type Session = typeof sessions.$inferSelect
export type SessionOutput = typeof sessionOutput.$inferSelect
