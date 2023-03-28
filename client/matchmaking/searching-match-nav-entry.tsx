import React from 'react'
import styled from 'styled-components'
import { MatchmakingType, matchmakingTypeToLabel } from '../../common/matchmaking'
import CancelSearchIcon from '../icons/material/close-24px.svg'
import { SubheaderButton } from '../material/left-nav/subheader-button'
import { useStableCallback } from '../state-hooks'
import { colorTextSecondary } from '../styles/colors'
import { body2, cabin, TitleOld } from '../styles/typography'
import { ElapsedTime } from './elapsed-time'
import { useTranslation } from 'react-i18next'

const SearchingContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  height: 48px;
`

const SearchTitle = styled(TitleOld)`
  ${cabin};
  font-weight: 500;
  margin: 0 16px;
`

const StyledElapsedTime = styled(ElapsedTime)`
  ${body2};
  color: ${colorTextSecondary};
  margin: 0 16px;
`

const AcceptingText = styled.div`
  ${body2};
  color: ${colorTextSecondary};
  margin: 0 16px;
`

export interface SearchingMatchNavEntryProps {
  isMatched: boolean
  startTime: number
  matchmakingType: MatchmakingType
  onCancelSearch: () => void
}

export function SearchingMatchNavEntry(props: SearchingMatchNavEntryProps) {
  const onCancelClick = useStableCallback(props.onCancelSearch)
  const { t } = useTranslation()

  return (
    <>
      <SearchingContainer>
        <SearchTitle>
          {props.isMatched
            ? {t('matchmaking.findMatch.matchFoundText', 'Match found!')}
            : {t('matchmaking.findMatch.searchingForText', `Searching for ${matchmakingTypeToLabel(props.matchmakingType)}`)}}
        </SearchTitle>
        {!props.isMatched ? (
          <SubheaderButton
            icon={<CancelSearchIcon />}
            title={t('matchmaking.findMatch.cancelSearchButtonText', 'Cancel search')}
            onClick={onCancelClick}
          />
        ) : null}
      </SearchingContainer>
      {props.isMatched ? (
        <AcceptingText>'\u2026'</AcceptingText>
      ) : (
        <StyledElapsedTime prefix={{t('common.time', 'Time: ')}} startTimeMs={props.startTime} />
      )}
    </>
  )
}
