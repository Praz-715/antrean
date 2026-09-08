import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '../../generated/prisma/client'

/**
 * Satu instance PrismaClient untuk seluruh proses.
 *
 * Timezone driver dipaksa ke UTC ('Z'): server MySQL di dev berjalan pada
 * SYSTEM time zone (Asia/Jakarta), sedangkan seluruh DATETIME aplikasi
 * disimpan dalam UTC (§50). Tanpa ini, konversi driver akan menggeser waktu 7 jam.
 */
function buildAdapter() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL belum diset')

  const parsed = new URL(url)
  return new PrismaMariaDb({
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    connectionLimit: Number(process.env.DATABASE_POOL_SIZE || 10),
    timezone: 'Z',
    // MySQL mengembalikan BIGINT sebagai BigInt; kembalikan Number supaya JSON-safe
    bigIntAsNumber: true,
    decimalAsNumber: true,
  })
}

const globalForPrisma = globalThis as unknown as { __antreanPrisma?: PrismaClient }

export const prisma: PrismaClient
  = globalForPrisma.__antreanPrisma
    ?? new PrismaClient({
      adapter: buildAdapter(),
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    })

if (process.env.NODE_ENV !== 'production') globalForPrisma.__antreanPrisma = prisma

export type { PrismaClient }
