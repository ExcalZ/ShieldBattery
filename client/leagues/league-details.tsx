import React from 'react'

export interface LeagueDetailsProps {
  params: {
    id: string
  }
}

export function LeagueDetails(props: LeagueDetailsProps) {
  return <span>hello {props.params.id}!</span>
}
