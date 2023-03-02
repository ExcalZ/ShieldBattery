import React, { Suspense, useEffect, useState } from 'react'
import styled from 'styled-components'
import { Link, Route, Switch } from 'wouter'
import { GetLeaguesListResponse } from '../../common/leagues'
import { hasAnyPermission } from '../admin/admin-permissions'
import logger from '../logging/logger'
import { LoadingDotsArea } from '../progress/dots'
import { useAppDispatch, useAppSelector } from '../redux-hooks'
import { colorError } from '../styles/colors'
import { headline4, subtitle1 } from '../styles/typography'
import { getLeaguesList } from './action-creators'

const LoadableLeagueAdmin = React.lazy(async () => ({
  default: (await import('./league-admin')).LeagueAdmin,
}))

export function LeagueRoot(props: { params: any }) {
  const isAdmin = useAppSelector(s => hasAnyPermission(s.auth, 'manageLeagues'))

  return (
    <Suspense fallback={<LoadingDotsArea />}>
      <Switch>
        {isAdmin ? <Route path='/leagues/admin/:rest*' component={LoadableLeagueAdmin} /> : <></>}
        <Route component={LeagueList} />
      </Switch>
    </Suspense>
  )
}

const ListRoot = styled.div`
  padding: 12px 24px;
`

const TitleRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 16px;
`

const Title = styled.div`
  ${headline4};
`

const ErrorText = styled.div`
  ${subtitle1};
  color: ${colorError};
`

function LeagueList() {
  const dispatch = useAppDispatch()
  const isAdmin = useAppSelector(s => hasAnyPermission(s.auth, 'manageLeagues'))
  const [leagues, setLeagues] = useState<GetLeaguesListResponse>()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error>()

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal

    setIsLoading(true)

    dispatch(
      getLeaguesList({
        signal,
        onSuccess(res) {
          setLeagues(res)
          setIsLoading(false)
          setError(undefined)
        },
        onError(err) {
          setIsLoading(false)
          setError(err)
          logger.error(`Error loading leagues list: ${err.stack ?? err}`)
        },
      }),
    )

    return () => controller.abort()
  }, [dispatch])

  return (
    <ListRoot>
      <TitleRow>
        <Title>Leagues</Title>
        {isAdmin ? <Link href='/leagues/admin'>Manage leagues</Link> : null}
      </TitleRow>

      {!isLoading && error ? <ErrorText>Error loading leagues</ErrorText> : null}
      {leagues ? JSON.stringify(leagues) : null}
      {isLoading ? <LoadingDotsArea /> : null}
    </ListRoot>
  )
}
