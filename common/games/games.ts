import { Immutable } from 'immer'
import { assertUnreachable } from '../assert-unreachable'
import { Jsonify } from '../json'
import { MapInfoJson } from '../maps'
import { MatchmakingType } from '../matchmaking'
import { SbUser, SbUserId } from '../users/user-info'
import { GameConfig, GameSource } from './configuration'
import { ReconciledPlayerResult } from './results'

export interface GameRecord {
  id: string
  startTime: Date
  mapId: string
  config: GameConfig
  disputable: boolean
  disputeRequested: boolean
  disputeReviewed: boolean
  gameLength: number | null
  results: [SbUserId, ReconciledPlayerResult][] | null
}

export type GameRecordJson = Jsonify<GameRecord>

export function toGameRecordJson(game: GameRecord): GameRecordJson {
  return {
    id: game.id,
    startTime: Number(game.startTime),
    mapId: game.mapId,
    config: game.config,
    disputable: game.disputable,
    disputeRequested: game.disputeRequested,
    disputeReviewed: game.disputeReviewed,
    gameLength: game.gameLength,
    results: game.results,
  }
}

export function getGameTypeLabel(game: Immutable<GameRecordJson>): string {
  // TODO(tec27): show mode (UMS, Top v Bottom, etc.?)
  if (game.config.gameSource === GameSource.Lobby) {
    return 'Custom game'
  } else if (game.config.gameSource === GameSource.Matchmaking) {
    switch (game.config.gameSourceExtra.type) {
      case MatchmakingType.Match1v1:
        return 'Ranked 1v1'
      case MatchmakingType.Match2v2:
        return 'Ranked 2v2'
    }
  }

  return assertUnreachable(game.config)
}

export interface GetGameResponse {
  game: GameRecordJson
  /** Can be undefined if the map could not be found (e.g. if it has been deleted). */
  map: MapInfoJson | undefined
  users: SbUser[]
}

/** Events that can be sent when subscribed to changes to a particular game record. */
export type GameSubscriptionEvent = GameRecordUpdate

export interface GameRecordUpdate {
  type: 'update'
  game: GameRecordJson
}
