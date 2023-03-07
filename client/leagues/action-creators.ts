import {
  AdminAddLeagueRequest,
  AdminAddLeagueResponse,
  AdminGetLeaguesResponse,
  GetLeaguesListResponse,
} from '../../common/leagues'
import { apiUrl, urlPath } from '../../common/urls'
import { ThunkAction } from '../dispatch-registry'
import { push } from '../navigation/routing'
import { abortableThunk, RequestHandlingSpec } from '../network/abortable-thunk'
import { fetchJson } from '../network/fetch'

/** Navigates to the leagues list. */
export function navigateToLeagues(transitionFn = push) {
  transitionFn(urlPath`/leagues/`)
}

export function getLeaguesList(spec: RequestHandlingSpec<void>): ThunkAction {
  return abortableThunk(spec, async dispatch => {
    const result = await fetchJson<GetLeaguesListResponse>(apiUrl`leagues/`, {
      signal: spec.signal,
    })

    dispatch({
      type: '@leagues/getList',
      payload: result,
    })
  })
}

export function adminGetLeagues(spec: RequestHandlingSpec<AdminGetLeaguesResponse>): ThunkAction {
  return abortableThunk(spec, async () => {
    return await fetchJson(apiUrl`admin/leagues/`, { signal: spec.signal })
  })
}

export function adminAddLeague(
  league: AdminAddLeagueRequest & { image?: Blob },
  spec: RequestHandlingSpec<AdminAddLeagueResponse>,
): ThunkAction {
  return abortableThunk(spec, async () => {
    const formData = new FormData()
    for (const [key, value] of Object.entries(league)) {
      formData.append(key, String(value))
    }

    if (league.image) {
      formData.append('image', league.image)
    }

    return await fetchJson(apiUrl`admin/leagues/`, {
      method: 'POST',
      signal: spec.signal,
      body: formData,
    })
  })
}
