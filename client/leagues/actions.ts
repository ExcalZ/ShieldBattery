import { GetLeagueByIdResponse, GetLeaguesListResponse } from '../../common/leagues'

export type LeaguesActions = GetLeaguesList | GetLeague

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
