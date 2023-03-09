import { Merge, Opaque } from 'type-fest'
import { Jsonify } from '../json'
import { MatchmakingType } from '../matchmaking'
import { decodePrettyId, encodePrettyId } from '../pretty-id'

export const LEAGUE_IMAGE_WIDTH = 704
export const LEAGUE_IMAGE_HEIGHT = 288

/** The ID of a league as stored in the database. */
export type LeagueId = Opaque<string, 'LeagueId'>
/**
 * The ID of a league as given to clients (equivalent to the DB one, just encoded in a way that
 * looks more friendly in URLs.
 */
export type ClientLeagueId = Opaque<string, 'ClientLeagueId'>

/**
 * Converts a league ID string to a properly typed version. Prefer better ways of getting a typed
 * version, such as retrieving the value from the database or using a Joi validator. This method
 * should mainly be considered for testing and internal behavior.
 */
export function makeLeagueId(id: string): LeagueId {
  return id as LeagueId
}

export function toClientLeagueId(id: LeagueId): ClientLeagueId {
  return encodePrettyId(id) as ClientLeagueId
}

export function fromClientLeagueId(id: ClientLeagueId): LeagueId {
  return decodePrettyId(id) as LeagueId
}

export interface League {
  id: LeagueId
  name: string
  matchmakingType: MatchmakingType
  description: string
  signupsAfter: Date
  startAt: Date
  endAt: Date
  imagePath?: string
  rulesAndInfo?: string
  link?: string
}

export type LeagueJson = Merge<Jsonify<League>, { id: ClientLeagueId }>

export function toLeagueJson(league: League): LeagueJson {
  return {
    id: toClientLeagueId(league.id),
    name: league.name,
    matchmakingType: league.matchmakingType,
    description: league.description,
    signupsAfter: Number(league.signupsAfter),
    startAt: Number(league.startAt),
    endAt: Number(league.endAt),
    imagePath: league.imagePath,
    rulesAndInfo: league.rulesAndInfo,
    link: league.link,
  }
}

export interface AdminGetLeaguesResponse {
  leagues: LeagueJson[]
}

export interface ServerAdminAddLeagueRequest {
  name: string
  matchmakingType: MatchmakingType
  description: string
  signupsAfter: Date
  startAt: Date
  endAt: Date
  rulesAndInfo?: string
  link?: string
}

export type AdminAddLeagueRequest = Jsonify<ServerAdminAddLeagueRequest>

export interface AdminAddLeagueResponse {
  league: LeagueJson
}

export enum LeagueErrorCode {
  NotFound = 'notFound',
}

export interface GetLeaguesListResponse {
  past: LeagueJson[]
  current: LeagueJson[]
  future: LeagueJson[]
}

export interface GetLeagueByIdResponse {
  league: LeagueJson
}
