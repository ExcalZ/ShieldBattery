import sql from 'sql-template-strings'
import { Opaque } from 'type-fest'
import { assertUnreachable } from '../../../common/assert-unreachable'
import db, { DbClient } from '../db'
import { Dbify } from '../db/types'

export type LeagueId = Opaque<string, 'LeagueId'>

/**
 * Converts a league ID string to a properly typed version. Prefer better ways of getting a typed
 * version, such as retrieving the value from the database or using a Joi validator. This method
 * should mainly be considered for testing and internal behavior.
 */
export function makeLeagueId(id: string): LeagueId {
  return id as LeagueId
}

export interface League {
  id: LeagueId
  name: string
  description: string
  signupsAfter: Date
  startAt: Date
  endAt: Date
  imagePath?: string
  rulesAndInfo?: string
  link?: string
}

type DbLeague = Dbify<League>

function convertLeagueFromDb(props: DbLeague): League {
  return {
    id: props.id,
    name: props.name,
    description: props.description,
    signupsAfter: props.signups_after,
    startAt: props.start_at,
    endAt: props.end_at,
    imagePath: props.image_path,
    rulesAndInfo: props.rules_and_info,
    link: props.link,
  }
}

export async function createLeague(
  {
    name,
    description,
    signupsAfter,
    startAt,
    endAt,
    imagePath,
    rulesAndInfo,
    link,
  }: Omit<League, 'id'>,
  withClient?: DbClient,
): Promise<League> {
  const { client, done } = await db(withClient)
  try {
    const result = await client.query<DbLeague>(sql`
      INSERT INTO leagues (
        name, description, signups_after, start_at, end_at,
        image_path, rules_and_info, link
      ) VALUES (
        ${name}, ${description}, ${signupsAfter}, ${startAt}, ${endAt},
        ${imagePath}, ${rulesAndInfo}, ${link}
      ) RETURNING *
    `)
    return convertLeagueFromDb(result.rows[0])
  } finally {
    done()
  }
}

export async function updateLeague(
  id: LeagueId,
  updates: Partial<Omit<League, 'id'>>,
  withClient?: DbClient,
): Promise<League> {
  const { client, done } = await db(withClient)
  try {
    const query = sql`
      UPDATE leagues
      SET
    `

    let first = true
    for (const [_key, value] of Object.entries(updates)) {
      const key = _key as keyof typeof updates
      if (!first) {
        query.append(sql`, `)
      } else {
        first = false
      }

      switch (key) {
        case 'name':
          query.append(sql`name = ${value}`)
          break
        case 'description':
          query.append(sql`description = ${value}`)
          break
        case 'signupsAfter':
          query.append(sql`signups_after = ${value}`)
          break
        case 'startAt':
          query.append(sql`start_at = ${value}`)
          break
        case 'endAt':
          query.append(sql`end_at = ${value}`)
          break
        case 'imagePath':
          query.append(sql`image_path = ${value}`)
          break
        case 'rulesAndInfo':
          query.append(sql`rules_and_info = ${value}`)
          break
        case 'link':
          query.append(sql`link = ${value}`)
          break

        default:
          assertUnreachable(key)
      }
    }

    if (first) {
      throw new Error('No columns updated')
    }

    query.append(sql`
      WHERE id = ${id}
      RETURNING *
    `)

    const result = await client.query<DbLeague>(query)
    return convertLeagueFromDb(result.rows[0])
  } finally {
    done()
  }
}

export async function deleteLeague(id: LeagueId, withClient?: DbClient): Promise<void> {
  const { client, done } = await db(withClient)
  try {
    await client.query(sql`
      DELETE FROM leagues
      WHERE id = ${id}
    `)
  } finally {
    done()
  }
}

// TODO(tec27): Paginate these queries
/**
 * Returns the leagues that have ended.
 */
export async function getPastLeagues(date: Date, withClient?: DbClient): Promise<League[]> {
  const { client, done } = await db(withClient)
  try {
    const result = await client.query<DbLeague>(sql`
      SELECT *
      FROM leagues
      WHERE end_at <= ${date}
      ORDER BY end_at DESC
    `)
    return result.rows.map(convertLeagueFromDb)
  } finally {
    done()
  }
}

/**
 * Returns the leagues that are currently running.
 */
export async function getCurrentLeagues(date: Date, withClient?: DbClient): Promise<League[]> {
  const { client, done } = await db(withClient)
  try {
    const result = await client.query<DbLeague>(sql`
      SELECT *
      FROM leagues
      WHERE start_at <= ${date} AND end_at > ${date}
      ORDER BY start_at DESC
    `)
    return result.rows.map(convertLeagueFromDb)
  } finally {
    done()
  }
}

/**
 * Returns the leagues that are accepting signups but not currently running.
 */
export async function getFutureLeagues(date: Date, withClient?: DbClient): Promise<League[]> {
  const { client, done } = await db(withClient)
  try {
    // TODO(tec27): Should this sort ascending instead? It's a bit confusing with the other 2
    // queries here but might do a better job of highlighting the "latest" leagues to sign up for
    const result = await client.query<DbLeague>(sql`
      SELECT *
      FROM leagues
      WHERE end_at < ${date} AND start_at > ${date} AND signups_after <= ${date}
      ORDER BY start_at DESC
    `)
    return result.rows.map(convertLeagueFromDb)
  } finally {
    done()
  }
}

export async function getAllLeagues(withClient?: DbClient): Promise<League[]> {
  const { client, done } = await db(withClient)
  try {
    const result = await client.query<DbLeague>(sql`
      SELECT *
      FROM leagues
      ORDER BY start_at DESC
    `)
    return result.rows.map(convertLeagueFromDb)
  } finally {
    done()
  }
}
