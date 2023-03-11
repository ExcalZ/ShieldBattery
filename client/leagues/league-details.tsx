import React, { useEffect, useState } from 'react'
import slug from 'slug'
import styled from 'styled-components'
import { Link, useRoute } from 'wouter'
import { ClientLeagueId, LeagueErrorCode, makeClientLeagueId } from '../../common/leagues'
import { matchmakingTypeToLabel } from '../../common/matchmaking'
import { useSelfUser } from '../auth/state-hooks'
import { longTimestamp, monthDay } from '../i18n/date-formats'
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
import { colorError, colorTextSecondary } from '../styles/colors'
import { headline3, headline5, singleLine, subtitle1 } from '../styles/typography'
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

const TextSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;

  & + & {
    margin-top: 16px;
  }
`

const TextSectionHeader = styled.div`
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

  const isJoinable = isLoggedIn && !selfLeagueUser && league.endAt > Date.now()

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
      <TextSection>
        <TextSectionHeader>About</TextSectionHeader>
        <div>{league.description}</div>
      </TextSection>
      {league.rulesAndInfo ? (
        <TextSection>
          <TextSectionHeader>Rules and info</TextSectionHeader>
          <div>
            <StyledMarkdown source={league.rulesAndInfo} />
          </div>
        </TextSection>
      ) : undefined}
    </DetailsRoot>
  )
}
