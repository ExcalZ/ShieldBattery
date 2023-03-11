import {
  GetLeagueByIdResponse,
  GetLeaguesListResponse,
  JoinLeagueResponse,
} from '../../common/leagues'

export type LeaguesActions = GetLeaguesList | GetLeague | JoinLeague

export interface GetLeaguesList {
  type: '@leagues/getList'
  payload: GetLeaguesListResponse
  error?: false
}

export interface GetLeague {
  type: '@leagues/get'
  payload: GetLeagueByIdResponse
  error?: false
}

export interface JoinLeague {
  type: '@leagues/join'
  payload: JoinLeagueResponse
  error?: false
}
