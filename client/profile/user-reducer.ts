import { Immutable } from 'immer'
import { GameRecordJson } from '../../common/games/games'
import { SbUser, UserProfile } from '../../common/users/user-info'
import { immerKeyedReducer } from '../reducers/keyed-reducer'

export interface UserRequestInfo {
  /** Should be set to the current value of `window.performance.now()` when the request is made. */
  time: number
}

export interface UserState {
  /** A map of user ID -> user information. */
  byId: Map<number, SbUser>
  /** A map of username -> user ID. */
  usernameToId: Map<string, number>
  // TODO(tec27): Make a reducer specifically to handle match history
  /** A map of user ID -> recent match history. */
  idToMatchHistory: Map<number, GameRecordJson[]>
  /** A map of user ID -> user profile information. */
  idToProfile: Map<number, UserProfile>
  /**
   * The set of user IDs for which data is currently loading. This is intended to be used for
   * showing loading indicators and deduping requests.
   */
  idLoadsInProgress: Map<number, UserRequestInfo>
  /**
   * The set of usernames for which data is currently loading. This is intended to be used for
   * showing loading indicators and deduping requests.
   */
  usernameLoadsInProgress: Map<string, UserRequestInfo>
}

const DEFAULT_STATE: Immutable<UserState> = {
  byId: new Map(),
  usernameToId: new Map(),
  idToMatchHistory: new Map(),
  idToProfile: new Map(),
  idLoadsInProgress: new Map(),
  usernameLoadsInProgress: new Map(),
}

function updateUsers(state: UserState, users: SbUser[]) {
  for (const user of users) {
    const userState = state.byId.get(user.id)
    if (userState) {
      if (userState.name !== user.name) {
        state.usernameToId.delete(userState.name)
        userState.name = user.name
      }
    } else {
      state.byId.set(user.id, { id: user.id, name: user.name })
    }

    state.usernameToId.set(user.name, user.id)
  }
}

export default immerKeyedReducer(DEFAULT_STATE, {
  ['@auth/logIn'](state, action) {
    if (action.error) {
      return
    }

    const {
      payload: { user },
    } = action

    state.byId.set(user.id, { id: user.id, name: user.name })
    state.usernameToId.set(user.name, user.id)
  },

  ['@auth/loadCurrentSession'](state, action) {
    if (action.error) {
      return
    }

    const {
      payload: { user },
    } = action

    state.byId.set(user.id, { id: user.id, name: user.name })
    state.usernameToId.set(user.name, user.id)
  },

  ['@chat/retrieveUserList'](state, action) {
    if (action.error) {
      return
    }

    updateUsers(state, action.payload.users)
  },

  ['@chat/updateJoin'](state, action) {
    updateUsers(state, [action.payload.user])
  },

  ['@ladder/getRankings'](state, action) {
    if (action.error) {
      return
    }

    updateUsers(state, action.payload.users)
  },

  ['@profile/getUserProfile'](state, { payload: { user, profile, matchHistory } }) {
    updateUsers(state, [user])
    updateUsers(state, matchHistory.users)
    state.idToProfile.set(profile.userId, profile)
    state.idToMatchHistory.set(user.id, matchHistory.games)
  },

  ['@whispers/loadMessageHistory'](state, action) {
    if (action.error) {
      return
    }

    updateUsers(state, action.payload.users)
  },

  ['@whispers/updateMessage'](state, action) {
    updateUsers(state, action.payload.users)
  },

  ['@parties/init'](state, action) {
    updateUsers(state, action.payload.userInfos)
  },

  ['@parties/updateInvite'](state, action) {
    updateUsers(state, [action.payload.userInfo])
  },
})
