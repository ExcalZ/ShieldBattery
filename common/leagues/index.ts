import { Opaque } from 'type-fest'
import { Jsonify } from '../json'

export const LEAGUE_IMAGE_WIDTH = 704
export const LEAGUE_IMAGE_HEIGHT = 288

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

export type LeagueJson = Jsonify<League>

export function toLeagueJson(league: League) {
  return {
    id: league.id,
    name: league.name,
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
