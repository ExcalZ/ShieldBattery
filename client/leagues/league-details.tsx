import React, { useEffect, useMemo, useState } from 'react'
import slug from 'slug'
import styled from 'styled-components'
import { ReadonlyDeep } from 'type-fest'
import { Link, useRoute } from 'wouter'
import {
  ClientLeagueId,
  ClientLeagueUserJson,
  LeagueErrorCode,
  makeClientLeagueId,
} from '../../common/leagues'
import { matchmakingTypeToLabel } from '../../common/matchmaking'
import { RaceChar, raceCharToLabel } from '../../common/races'
import { SbUserId } from '../../common/users/sb-user'
import { useSelfUser } from '../auth/state-hooks'
import { ConnectedAvatar } from '../avatars/avatar'
import { longTimestamp, monthDay, narrowDuration } from '../i18n/date-formats'
import logger from '../logging/logger'
import { Markdown } from '../markdown/markdown'
import { RaisedButton } from '../material/button'
import { TabItem, Tabs } from '../material/tabs'
import { Tooltip } from '../material/tooltip'
import { ExternalLink } from '../navigation/external-link'
import { isFetchError } from '../network/fetch-errors'
import { LoadingDotsArea } from '../progress/dots'
import { useAppDispatch, useAppSelector } from '../redux-hooks'
import { openSnackbar } from '../snackbars/action-creators'
import { useStableCallback } from '../state-hooks'
import { colorDividers, colorError, colorTextSecondary, getRaceColor } from '../styles/colors'
import {
  caption,
  headline3,
  headline5,
  overline,
  singleLine,
  subtitle1,
  subtitle2,
} from '../styles/typography'
import { ConnectedUsername } from '../users/connected-username'
import { correctSlugForLeague, getLeagueById, joinLeague } from './action-creators'
import { LeagueImage, LeaguePlaceholderImage } from './league-image'

const PageRoot = styled.div`
  padding: 12px 24px;
`

export function LeagueDetailsPage() {
  const [match, params] = useRoute('/leagues/:id/:slugStr?')
  const { id, slugStr } = params ?? {}
  const leagueName = useAppSelector(s =>
    id ? s.leagues.byId.get(makeClientLeagueId(id))?.name : undefined,
  )

  useEffect(() => {
    if (match && leagueName && slug(leagueName) !== slugStr) {
      correctSlugForLeague(id!, leagueName)
    }
  }, [match, id, slugStr, leagueName])

  if (!match) {
    logger.error('Route not matched but page was rendered')
    return null
  }

  return (
    <PageRoot>
      <LeagueDetails id={makeClientLeagueId(params.id)} />
    </PageRoot>
  )
}

const DetailsRoot = styled.div`
  max-width: 704px;

  display: flex;
  flex-direction: column;
  gap: 16px;
`

const Title = styled.div`
  ${headline3};
`

const SummaryRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 32px;
`

const FormatAndDate = styled.div`
  ${subtitle1};
  color: ${colorTextSecondary};
  flex-shrink: 0;
`

const DateTooltip = styled(Tooltip)`
  display: inline-flex;
`

const LeagueLink = styled(ExternalLink)`
  ${subtitle1};
  ${singleLine};
  min-width: 80px;
  flex-grow: 1;
  text-align: right;
`

const TabsAndJoin = styled.div`
  display: flex;
  justify-content: space-between;
`

const InfoSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;

  & + & {
    margin-top: 16px;
  }
`

const InfoSectionHeader = styled.div`
  ${headline5};
`

const StyledMarkdown = styled(Markdown)`
  & > *:first-child {
    margin-top: 0;
  }
`

const ErrorLayout = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const ErrorText = styled.div`
  ${subtitle1};
  color: ${colorError};
`

export interface LeagueDetailsProps {
  id: ClientLeagueId
}

export function LeagueDetails({ id }: LeagueDetailsProps) {
  const dispatch = useAppDispatch()
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState<Error>()

  const isLoggedIn = useSelfUser().id !== -1
  const league = useAppSelector(s => s.leagues.byId.get(id))
  const selfLeagueUser = useAppSelector(s => s.leagues.selfLeagues.get(id))
  const topTen = useAppSelector(s => s.leagues.topTen.get(id))
  const topTenUsers = useAppSelector(s => s.leagues.topTenUsers.get(id))

  const [isJoining, setIsJoining] = useState(false)
  const onJoinClick = useStableCallback(() => {
    setIsJoining(true)

    dispatch(
      joinLeague(id, {
        onSuccess() {
          setIsJoining(false)
          dispatch(openSnackbar({ message: 'League joined' }))
        },
        onError(err) {
          setIsJoining(false)
          if (isFetchError(err) && err.code === LeagueErrorCode.AlreadyEnded) {
            dispatch(
              openSnackbar({ message: "Couldn't join because the league has already ended" }),
            )
          } else {
            dispatch(
              openSnackbar({
                message: `Couldn't join league: ${
                  isFetchError(err) ? err.statusText : err.message
                }`,
              }),
            )
          }
          logger.error(`Error joining league: ${err.stack ?? err}`)
        },
      }),
    )
  })

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal

    setError(undefined)
    setIsFetching(true)

    dispatch(
      getLeagueById(id, {
        signal,
        onSuccess(res) {
          setIsFetching(false)
          setError(undefined)
        },
        onError(err) {
          setIsFetching(false)
          setError(err)
          logger.error(`Error loading leagues list: ${err.stack ?? err}`)
        },
      }),
    )

    return () => controller.abort()
  }, [id, dispatch])

  if (error) {
    if (isFetchError(error) && error.code === LeagueErrorCode.NotFound) {
      return (
        <ErrorLayout>
          <ErrorText>League not found</ErrorText>
          <Link href='/leagues'>Go back to list</Link>
        </ErrorLayout>
      )
    } else {
      return (
        <ErrorLayout>
          <ErrorText>
            There was an error retrieving this league:{' '}
            {(error as any).statusText ?? error.toString()}
          </ErrorText>

          <Link href='/leagues'>Go back to list</Link>
        </ErrorLayout>
      )
    }
  } else if (!league) {
    return <LoadingDotsArea />
  }

  // TODO(tec27): Handle cases where year differs to smartly show that info
  const dateText = `${monthDay.format(league.startAt)} to ${monthDay.format(league.endAt)}`
  const dateTooltip = `${longTimestamp.format(league.startAt)} to ${longTimestamp.format(
    league.endAt,
  )}`

  const curTime = Date.now()
  const isJoinable = isLoggedIn && !selfLeagueUser && league.endAt > curTime

  return (
    <DetailsRoot>
      <div>
        <Title>{league.name}</Title>
        <SummaryRow>
          <FormatAndDate>
            {matchmakingTypeToLabel(league.matchmakingType)} ·{' '}
            <DateTooltip text={dateTooltip} position={'right'}>
              {dateText}
            </DateTooltip>
          </FormatAndDate>
          {league.link ? <LeagueLink href={league.link}>{league.link}</LeagueLink> : undefined}
        </SummaryRow>
      </div>
      <TabsAndJoin>
        <Tabs activeTab='info' onChange={() => {}}>
          <TabItem value='info' text='Info' />
          <TabItem value='leaderboard' text='Leaderboard' />
        </Tabs>
        {(isJoinable || selfLeagueUser) && (!isFetching || selfLeagueUser) ? (
          <RaisedButton
            label={selfLeagueUser ? 'Joined' : 'Join'}
            disabled={!!selfLeagueUser || isJoining}
            onClick={onJoinClick}
          />
        ) : undefined}
      </TabsAndJoin>
      {league.imagePath ? <LeagueImage src={league.imagePath} /> : <LeaguePlaceholderImage />}
      <InfoSection>
        <InfoSectionHeader>About</InfoSectionHeader>
        <div>{league.description}</div>
      </InfoSection>
      {league.rulesAndInfo ? (
        <InfoSection>
          <InfoSectionHeader>Rules and info</InfoSectionHeader>
          <div>
            <StyledMarkdown source={league.rulesAndInfo} />
          </div>
        </InfoSection>
      ) : undefined}
      {topTen?.length && topTenUsers ? (
        <InfoSection>
          <InfoSectionHeader>Top 10</InfoSectionHeader>
          <Leaderboard leaderboard={topTen} leagueUsers={topTenUsers} curTime={curTime} />
        </InfoSection>
      ) : undefined}
    </DetailsRoot>
  )
}

const LeaderboardRoot = styled.div`
  padding: 0 0 16px;

  border: 1px solid ${colorDividers};
  border-radius: 2px;
`

const LeaderboardHeader = styled.div`
  ${overline};
  width: 100%;
  height: 48px;
  --sb-leaderboard-row-height: 48px;

  display: flex;
  align-items: center;

  color: ${colorTextSecondary};
`

const LeaderboardRow = styled.div`
  ${subtitle1};
  position: relative;
  width: 100%;
  height: 72px;
  --sb-leaderboard-row-height: 72px;

  display: flex;
  align-items: center;

  &::after {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    content: '';
    pointer-events: none;
  }

  &:hover {
    &::after {
      background-color: rgba(255, 255, 255, 0.04);
    }
  }
`

const BaseCell = styled.div`
  height: var(--sb-leaderboard-row-height);
  display: flex;
  align-items: center;
`

const NumericCell = styled(BaseCell)`
  justify-content: flex-end;
  text-align: right;
`

const TextCell = styled(BaseCell)`
  justify-content: flex-start;
  text-align: left;
`

const RankCell = styled(NumericCell)`
  width: 80px;
  padding: 0 16px;
`

const PlayerCell = styled(TextCell)`
  width: 176px;
  padding: 0 16px;

  flex-grow: 1;
`

const PointsCell = styled(NumericCell)`
  width: 56px;
`

const WinLossCell = styled(NumericCell)`
  width: 112px;
`

const LastPlayedCell = styled(NumericCell)`
  width: 156px;
  padding: 0 16px 0 32px;
`

interface LeaderboardEntry {
  rank: number
  leagueUser: ReadonlyDeep<ClientLeagueUserJson>
}

function Leaderboard({
  leaderboard,
  leagueUsers,
  curTime,
}: {
  leaderboard: ReadonlyArray<SbUserId>
  leagueUsers: ReadonlyDeep<Map<SbUserId, ClientLeagueUserJson>>
  curTime: number
}) {
  const leaderboardEntries = useMemo(() => {
    const result: LeaderboardEntry[] = []
    let curRank = 1

    for (const userId of leaderboard) {
      const leagueUser = leagueUsers.get(userId)!
      const rank =
        result.length && result.at(-1)!.leagueUser.points > leagueUser.points ? ++curRank : curRank
      result.push({ rank, leagueUser })
    }

    return result
  }, [leaderboard, leagueUsers])

  return (
    <LeaderboardRoot>
      <LeaderboardHeader>
        <RankCell>Rank</RankCell>
        <PlayerCell>Player</PlayerCell>
        <PointsCell>Points</PointsCell>
        <WinLossCell>Win/loss</WinLossCell>
        <LastPlayedCell>Last played</LastPlayedCell>
      </LeaderboardHeader>
      {leaderboardEntries.map(({ rank, leagueUser }) => (
        <LeaderboardRow key={leagueUser.userId}>
          <RankCell>{rank}</RankCell>
          <LeaderboardPlayer player={leagueUser} />
          <PointsCell>{Math.round(leagueUser.points)}</PointsCell>
          <WinLossCell>
            {leagueUser.wins} &ndash; {leagueUser.losses}
          </WinLossCell>
          <LastPlayedCell>
            {leagueUser.lastPlayedDate
              ? narrowDuration.format(leagueUser.lastPlayedDate, curTime)
              : undefined}
          </LastPlayedCell>
        </LeaderboardRow>
      ))}
    </LeaderboardRoot>
  )
}

const StyledAvatar = styled(ConnectedAvatar)`
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  margin-right: 16px;
`

const PlayerNameAndRace = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`

const PlayerName = styled(ConnectedUsername)`
  ${subtitle2};
  ${singleLine};
`

const PlayerRace = styled.div<{ $race: RaceChar }>`
  ${caption};
  color: ${props => getRaceColor(props.$race)};
`

function LeaderboardPlayer({ player }: { player: ReadonlyDeep<ClientLeagueUserJson> }) {
  const raceStats: Array<[number, RaceChar]> = [
    [player.pWins + player.pLosses, 'p'],
    [player.tWins + player.tLosses, 't'],
    [player.zWins + player.zLosses, 'z'],
    [player.rWins + player.rLosses, 'r'],
  ]
  raceStats.sort((a, b) => b[0] - a[0])
  const mostPlayedRace = raceStats[0][1]

  return (
    <PlayerCell>
      <StyledAvatar userId={player.userId} />
      <PlayerNameAndRace>
        <PlayerName userId={player.userId} />
        <PlayerRace $race={mostPlayedRace}>{raceCharToLabel(mostPlayedRace)}</PlayerRace>
      </PlayerNameAndRace>
    </PlayerCell>
  )
}
