import { ReadonlyDeep } from 'type-fest'
import { LeagueJson } from '../../common/leagues'
import { NETWORK_SITE_DISCONNECTED } from '../actions'
import { immerKeyedReducer } from '../reducers/keyed-reducer'

export interface LeagueState {
  byId: Map<string, LeagueJson>
  past: string[]
  current: string[]
  future: string[]
  isLoaded: boolean
}

const DEFAULT_STATE: ReadonlyDeep<LeagueState> = {
  byId: new Map(),
  past: [],
  current: [],
  future: [],
  isLoaded: false,
}

export default immerKeyedReducer(DEFAULT_STATE, {
  ['@leagues/getList'](state, { payload: { past, current, future } }) {
    state.byId = new Map([...past, ...current, ...future].map(l => [l.id, l]))
    state.past = past.map(l => l.id)
    state.current = current.map(l => l.id)
    state.future = future.map(l => l.id)
    state.isLoaded = true
  },

  [NETWORK_SITE_DISCONNECTED as any]() {
    return DEFAULT_STATE
  },
})
