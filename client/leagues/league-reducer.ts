import { ReadonlyDeep } from 'type-fest'
import { ClientLeagueId, ClientLeagueUserJson, LeagueJson } from '../../common/leagues'
import { NETWORK_SITE_DISCONNECTED } from '../actions'
import { immerKeyedReducer } from '../reducers/keyed-reducer'

export interface LeagueState {
  byId: Map<ClientLeagueId, LeagueJson>
  past: ClientLeagueId[]
  current: ClientLeagueId[]
  future: ClientLeagueId[]

  selfLeagues: Map<ClientLeagueId, ClientLeagueUserJson>
}

const DEFAULT_STATE: ReadonlyDeep<LeagueState> = {
  byId: new Map(),
  past: [],
  current: [],
  future: [],

  selfLeagues: new Map(),
}

export default immerKeyedReducer(DEFAULT_STATE, {
  ['@leagues/getList'](state, { payload: { past, current, future } }) {
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
  },

  ['@leagues/get'](state, { payload: { league, selfLeagueUser } }) {
    state.byId.set(league.id, league)

    if (selfLeagueUser) {
      state.selfLeagues.set(league.id, selfLeagueUser)
    } else {
      state.selfLeagues.delete(league.id)
    }
  },

  ['@leagues/join'](state, { payload: { league, selfLeagueUser } }) {
    state.byId.set(league.id, league)
    state.selfLeagues.set(league.id, selfLeagueUser)
  },

  [NETWORK_SITE_DISCONNECTED as any]() {
    return DEFAULT_STATE
  },
})
