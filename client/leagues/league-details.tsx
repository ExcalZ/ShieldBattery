import React from 'react'
import { useRoute } from 'wouter'
import logger from '../logging/logger'

export function LeagueDetails() {
  const [match, params] = useRoute('/leagues/:id/:slugStr?')

  if (!match) {
    logger.error('Route not matched but page was rendered')
    return null
  }

  return (
    <span>
      hello {params.id}! You're called {params.slugStr}
    </span>
  )
}
