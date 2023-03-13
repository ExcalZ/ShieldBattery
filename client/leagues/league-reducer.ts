import { ReadonlyDeep } from 'type-fest'
import { ClientLeagueId, ClientLeagueUserJson, LeagueJson } from '../../common/leagues'
import { SbUserId } from '../../common/users/sb-user'
import { NETWORK_SITE_DISCONNECTED } from '../actions'
import { immerKeyedReducer } from '../reducers/keyed-reducer'

export interface LeagueState {
  byId: Map<ClientLeagueId, LeagueJson>
  past: ClientLeagueId[]
  current: ClientLeagueId[]
  future: ClientLeagueId[]

  selfLeagues: Map<ClientLeagueId, ClientLeagueUserJson>

  topTen: Map<ClientLeagueId, SbUserId[]>
  topTenUsers: Map<ClientLeagueId, Map<SbUserId, ClientLeagueUserJson>>
}

const DEFAULT_STATE: ReadonlyDeep<LeagueState> = {
  byId: new Map(),
  past: [],
  current: [],
  future: [],

  selfLeagues: new Map(),

  topTen: new Map(),
  topTenUsers: new Map(),
}

export default immerKeyedReducer(DEFAULT_STATE, {
  ['@leagues/getList'](state, { payload: { past, current, future, selfLeagues } }) {
    for (const league of past) {
      state.byId.set(league.id, league)
    }
    for (const league of current) {
      state.byId.set(league.id, league)
    }
    for (const league of future) {
      state.byId.set(league.id, league)
    }

    state.past = past.map(l => l.id)
    state.current = current.map(l => l.id)
    state.future = future.map(l => l.id)

    state.selfLeagues = new Map(selfLeagues.map(l => [l.leagueId, l]))
  },

  ['@leagues/get'](state, { payload: { league, selfLeagueUser, topTen, topTenLeagueUsers } }) {
    state.byId.set(league.id, league)

    if (selfLeagueUser) {
      state.selfLeagues.set(league.id, selfLeagueUser)
    } else {
      state.selfLeagues.delete(league.id)
    }

    state.topTen.set(league.id, topTen)
    state.topTenUsers.set(league.id, new Map(topTenLeagueUsers.map(l => [l.userId, l])))
  },

  ['@leagues/join'](state, { payload: { league, selfLeagueUser } }) {
    state.byId.set(league.id, league)
    state.selfLeagues.set(league.id, selfLeagueUser)
  },

  [NETWORK_SITE_DISCONNECTED as any]() {
    return DEFAULT_STATE
  },
})
