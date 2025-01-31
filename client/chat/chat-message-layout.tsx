import React from 'react'
import { SbChannelId } from '../../common/chat'
import { SbUserId } from '../../common/users/sb-user'
import { useChatUserMenuItems, useMentionFilterClick } from '../messaging/mention-hooks'
import {
  InfoImportant,
  SeparatedInfoMessage,
  SystemImportant,
  SystemMessage,
} from '../messaging/message-layout'
import { ConnectedUsername } from '../users/connected-username'
import { ConnectedChannelName } from './connected-channel-name'

export const JoinChannelMessage = React.memo<{ time: number; userId: SbUserId }>(props => {
  const { time, userId } = props
  const filterClick = useMentionFilterClick()
  const addChatMenuItems = useChatUserMenuItems()
  return (
    <SystemMessage time={time}>
      <span>
        <SystemImportant>
          <ConnectedUsername
            userId={userId}
            filterClick={filterClick}
            modifyMenuItems={addChatMenuItems}
          />
        </SystemImportant>{' '}
        has joined the channel
      </span>
    </SystemMessage>
  )
})

export const LeaveChannelMessage = React.memo<{ time: number; userId: SbUserId }>(props => {
  const { time, userId } = props
  const filterClick = useMentionFilterClick()
  const addChatMenuItems = useChatUserMenuItems()
  return (
    <SystemMessage time={time}>
      <span>
        <SystemImportant>
          <ConnectedUsername
            userId={userId}
            filterClick={filterClick}
            modifyMenuItems={addChatMenuItems}
          />
        </SystemImportant>{' '}
        has left the channel
      </span>
    </SystemMessage>
  )
})

export const KickUserMessage = React.memo<{ time: number; userId: SbUserId }>(props => {
  const { time, userId } = props
  return (
    <SystemMessage time={time}>
      <span>
        <SystemImportant>
          <ConnectedUsername userId={userId} />
        </SystemImportant>{' '}
        has been kicked from the channel
      </span>
    </SystemMessage>
  )
})

export const BanUserMessage = React.memo<{ time: number; userId: SbUserId }>(props => {
  const { time, userId } = props
  return (
    <SystemMessage time={time}>
      <span>
        <SystemImportant>
          <ConnectedUsername userId={userId} />
        </SystemImportant>{' '}
        has been banned from the channel
      </span>
    </SystemMessage>
  )
})

export const NewChannelOwnerMessage = React.memo<{ time: number; newOwnerId: SbUserId }>(props => {
  const { time, newOwnerId } = props
  const filterClick = useMentionFilterClick()
  const addChatMenuItems = useChatUserMenuItems()
  return (
    <SystemMessage time={time}>
      <span>
        <SystemImportant>
          <ConnectedUsername
            userId={newOwnerId}
            filterClick={filterClick}
            modifyMenuItems={addChatMenuItems}
          />
        </SystemImportant>{' '}
        is the new owner of the channel
      </span>
    </SystemMessage>
  )
})

export const SelfJoinChannelMessage = React.memo<{ channelId: SbChannelId }>(props => {
  const { channelId } = props
  return (
    <SeparatedInfoMessage>
      <span>
        You joined{' '}
        <InfoImportant>
          <ConnectedChannelName channelId={channelId} />
        </InfoImportant>
      </span>
    </SeparatedInfoMessage>
  )
})
