import { GetLeaguesListResponse } from '../../common/leagues'

export type LeaguesActions = GetLeaguesList

export interface GetLeaguesList {
  type: '@leagues/getList'
  payload: GetLeaguesListResponse
  error?: false
}
