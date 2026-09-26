import { Kysely } from 'kysely'
import { db, Database } from '../db/database.js'

export function createAuthService(db: Kysely<Database>) {
  return {
    async findUserById(id: number) {
      return db
        .selectFrom('users')
        .select(['id', 'username', 'email', 'admin', 'default_profile_id', 'password_changed_at'])
        .where('id', '=', id)
        .executeTakeFirst()
    },

    async userExistsByUsername(username: string) {
      return db
        .selectFrom('users')
        .select('id')
        .where(db.fn('LOWER', ['username']), '=', username.toLowerCase())
        .executeTakeFirst()
    },

    async findUserByEmail(email: string) {
      return db
        .selectFrom('users')
        .select('id')
        .where(db.fn('LOWER', ['email']), '=', email.toLowerCase())
        .executeTakeFirst()
    },

    async findUserForLogin(username: string) {
      return db
        .selectFrom('users')
        .selectAll()
        .where(db.fn('LOWER', ['username']), '=', username.toLowerCase())
        .executeTakeFirst()
    },

    async createUser({ username, password, email }: { username: string; password: string; email: string | null }) {
      return db
        .insertInto('users')
        .values({
          username,
          password,
          email,
          admin: false,
        })
        .returningAll()
        .executeTakeFirst()
    },

    async updateDefaultProfile(userId: number, profileId: number | null) {
      await db
        .updateTable('users')
        .set({ default_profile_id: profileId, updated_at: new Date().toISOString() })
        .where('id', '=', userId)
        .execute()
    },

    async hasPassword(userId: number): Promise<boolean> {
      const row = await db
        .selectFrom('users')
        .select('password')
        .where('id', '=', userId)
        .executeTakeFirst()
      return row?.password != null
    },

    async setPassword(userId: number, passwordHash: string) {
      await db
        .updateTable('users')
        .set({ password: passwordHash, updated_at: new Date().toISOString() })
        .where('id', '=', userId)
        .execute()
    },

    async getPasswordHash(userId: number): Promise<string | null> {
      const row = await db
        .selectFrom('users')
        .select('password')
        .where('id', '=', userId)
        .executeTakeFirst()
      return row?.password ?? null
    },

    // Derives a unique username from a Google email's local part (e.g.
    // "pat.farrell@gmail.com" -> "patfarrell"), appending a numeric suffix
    // on collision. Falls back to "user" if the local part sanitizes to
    // nothing (e.g. an email starting with only symbols/digits-as-separators).
    async createUserFromGoogle({ email }: { email: string }) {
      const localPart = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'user'
      const base = localPart.length >= 3 ? localPart : localPart.padEnd(3, '0')
      let username = base
      let suffix = 1
      while (await this.userExistsByUsername(username)) {
        suffix += 1
        username = `${base}${suffix}`
      }
      return db
        .insertInto('users')
        .values({
          username,
          password: null,
          email,
          admin: false,
        })
        .returningAll()
        .executeTakeFirst()
    },

    async createPasswordResetToken(userId: number, tokenHash: string, expiresAt: Date) {
      await db
        .insertInto('password_reset_tokens')
        .values({
          user_id: userId,
          token_hash: tokenHash,
          expires_at: expiresAt,
        })
        .execute()
    },

    async invalidateUnusedPasswordResetTokensForUser(userId: number) {
      await db
        .updateTable('password_reset_tokens')
        .set({ used_at: new Date() })
        .where('user_id', '=', userId)
        .where('used_at', 'is', null)
        .execute()
    },

    async countRecentPasswordResetTokens(userId: number, since: Date): Promise<number> {
      const result = await db
        .selectFrom('password_reset_tokens')
        .select(db.fn.count('id').as('count'))
        .where('user_id', '=', userId)
        .where('created_at', '>=', since)
        .executeTakeFirst()
      return Number(result?.count ?? 0)
    },

    async findValidPasswordResetToken(tokenHash: string) {
      return db
        .selectFrom('password_reset_tokens')
        .select(['id', 'user_id'])
        .where('token_hash', '=', tokenHash)
        .where('used_at', 'is', null)
        .where('expires_at', '>', new Date())
        .executeTakeFirst()
    },

    // Runs as one transaction: a partial failure here (e.g. crash between
    // marking the token used and updating the password) must not leave the
    // account in a state where the token is burned but the password
    // unchanged, or vice versa.
    async completePasswordReset(tokenId: number, userId: number, passwordHash: string) {
      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable('users')
          .set({ password: passwordHash, password_changed_at: new Date(), updated_at: new Date().toISOString() })
          .where('id', '=', userId)
          .execute()

        await trx
          .updateTable('password_reset_tokens')
          .set({ used_at: new Date() })
          .where('id', '=', tokenId)
          .execute()

        await trx
          .deleteFrom('password_reset_tokens')
          .where('user_id', '=', userId)
          .where('id', '!=', tokenId)
          .execute()
      })
    },
  }
}

export const authService = createAuthService(db)
