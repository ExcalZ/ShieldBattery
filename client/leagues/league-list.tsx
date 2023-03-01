import React, { Suspense } from 'react'
import { Link, Route, Switch } from 'wouter'
import { hasAnyPermission } from '../admin/admin-permissions'
import { LoadingDotsArea } from '../progress/dots'
import { useAppSelector } from '../redux-hooks'

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

function LeagueList() {
  const isAdmin = useAppSelector(s => hasAnyPermission(s.auth, 'manageLeagues'))

  return (
    <div>
      {isAdmin ? <Link href='/leagues/admin'>Manage leagues</Link> : null}
      <div>hello!</div>
    </div>
  )
}
