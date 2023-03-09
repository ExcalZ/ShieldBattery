import React, { useCallback, useEffect, useId, useState } from 'react'
import styled from 'styled-components'
import { Route, Switch } from 'wouter'
import { LeagueJson, LEAGUE_IMAGE_HEIGHT, LEAGUE_IMAGE_WIDTH } from '../../common/leagues'
import FileInput from '../forms/file-input'
import { FormHook, useForm } from '../forms/form-hook'
import SubmitOnEnter from '../forms/submit-on-enter'
import { required } from '../forms/validators'
import AddIcon from '../icons/material/add-24px.svg'
import { RaisedButton } from '../material/button'
import { TextField } from '../material/text-field'
import { push } from '../navigation/routing'
import { useAppDispatch } from '../redux-hooks'
import { colorDividers, colorError, colorTextSecondary } from '../styles/colors'
import { body1, headline4, subtitle1 } from '../styles/typography'
import { adminAddLeague, adminGetLeagues } from './action-creators'

const Root = styled.div`
  padding: 8px;
`

const Title = styled.div`
  ${headline4};
`

const ErrorText = styled.div`
  ${subtitle1};
  color: ${colorError};
`

const ListRoot = styled.div``

export function LeagueAdmin() {
  const dispatch = useAppDispatch()
  const [leagues, setLeagues] = useState<LeagueJson[]>([])
  const [error, setError] = useState<Error>()

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal

    dispatch(
      adminGetLeagues({
        signal,
        onSuccess: res => {
          setLeagues(res.leagues)
          setError(undefined)
        },
        onError: err => {
          setError(err)
        },
      }),
    )

    return () => controller.abort()
  }, [dispatch])

  return (
    <Root>
      <Switch>
        <Route path='/leagues/admin/new' component={CreateLeague} />
        <Route path='/leagues/admin/:id' component={EditLeague} />
        <Route>
          <ListRoot>
            <Title>Manage leagues</Title>
            <RaisedButton
              label='Add league'
              iconStart={<AddIcon />}
              onClick={() => push('/leagues/admin/new')}
            />
            {error ? <ErrorText>{error.message}</ErrorText> : null}
            {leagues.map(l => (
              <div key={l.id}>{JSON.stringify(l)}</div>
            ))}
          </ListRoot>
        </Route>
      </Switch>
    </Root>
  )
}

const CreateLeagueRoot = styled.div``

const CreateLeagueFormAndPreview = styled.div`
  margin-top: 8px;

  display: flex;
  gap: 16px;
`

const CreateLeagueForm = styled.form`
  flex-shrink: 0;
  width: 400px;
  padding: 8px;

  display: flex;
  flex-direction: column;
  gap: 12px;

  border: 1px solid ${colorDividers};
  border-radius: 2px;
`

const FieldLabel = styled.label`
  ${body1};
  display: block;

  color: ${colorTextSecondary};
`

const CreateLeaguePreview = styled.div`
  flex-grow: 1;
  max-width: 720px;
  padding: 8px;

  border: 1px solid ${colorDividers};
  border-radius: 2px;
`

const DateInput = styled.input`
  color: rgba(0, 0, 0, 0.87);
  padding: 4px 0;
  margin: 8px 0;
`

const DateError = styled.div`
  ${body1};
  color: ${colorError};
`

function BadValidatedDateInput<ModelType>({
  id,
  label,
  binds,
}: {
  id: string
  label: string
  binds: ReturnType<FormHook<ModelType>['bindInput']>
}) {
  const { errorText, ...rest } = binds
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <DateInput {...(rest as any)} id={id} type='datetime-local' tabIndex={0} />
      {errorText ? <DateError>{errorText}</DateError> : null}
    </div>
  )
}

interface CreateLeagueModel {
  name: string
  description: string
  signupsAfter: string
  startAt: string
  endAt: string
  rulesAndInfo?: string
  link?: string
  image?: File
}

function CreateLeague() {
  const baseId = useId()

  const dispatch = useAppDispatch()
  const [error, setError] = useState<Error>()
  const onFormSubmit = useCallback(
    (model: CreateLeagueModel) => {
      dispatch(
        adminAddLeague(
          {
            name: model.name,
            description: model.description,
            signupsAfter: Date.parse(model.signupsAfter),
            startAt: Date.parse(model.startAt),
            endAt: Date.parse(model.endAt),
            rulesAndInfo: model.rulesAndInfo,
            link: model.link,
            image: model.image,
          },
          {
            onSuccess: () => {
              setError(undefined)
              // TODO(tec27): Cause refresh of list of leagues
              history.back()
            },
            onError: err => {
              setError(err)
            },
          },
        ),
      )
    },
    [dispatch],
  )

  const { onSubmit, bindInput, bindCustom } = useForm<CreateLeagueModel>(
    {
      name: '',
      description: '',
      signupsAfter: '',
      startAt: '',
      endAt: '',
    },
    {
      name: required('Name is required'),
      description: required('Description is required'),
      signupsAfter: value =>
        !value || Date.parse(value) < Date.now() ? 'Signups must start in the future' : undefined,
      startAt: (value, model) =>
        !value || Date.parse(value) < Date.parse(model.signupsAfter)
          ? 'Start date must be after signup date'
          : undefined,
      endAt: (value, model) =>
        !value || Date.parse(value) < Date.parse(model.startAt)
          ? 'End date must be after start date'
          : undefined,
      link: value => {
        if (!value) {
          return undefined
        }

        try {
          const _ = new URL(value)
          return undefined
        } catch (err) {
          return 'If provided, link must be a valid URL'
        }
      },
    },
    { onSubmit: onFormSubmit },
  )

  return (
    <CreateLeagueRoot>
      <Title>Create league</Title>
      {error ? <ErrorText>{error.message}</ErrorText> : null}
      <CreateLeagueFormAndPreview>
        <CreateLeagueForm noValidate={true} onSubmit={onSubmit}>
          <SubmitOnEnter />

          <div>
            <FieldLabel htmlFor={`${baseId}-image`}>
              Image ({LEAGUE_IMAGE_WIDTH}x{LEAGUE_IMAGE_HEIGHT}px recommended)
            </FieldLabel>
            <FileInput
              {...bindCustom('image')}
              id={`${baseId}-image`}
              accept='image/*'
              multiple={false}
            />
          </div>

          <TextField
            {...bindInput('name')}
            label='Name'
            floatingLabel={true}
            dense={true}
            inputProps={{ tabIndex: 0 }}
          />
          <TextField
            {...bindInput('description')}
            label='Description (max ~20 words)'
            floatingLabel={true}
            dense={true}
            inputProps={{ tabIndex: 0 }}
          />

          <BadValidatedDateInput
            binds={bindInput('signupsAfter')}
            id={`${baseId}-signupsAfter`}
            label='Signups after'
          />
          <BadValidatedDateInput
            binds={bindInput('startAt')}
            id={`${baseId}-startAt`}
            label='Start at'
          />
          <BadValidatedDateInput binds={bindInput('endAt')} id={`${baseId}-endAt`} label='End at' />

          <TextField
            {...bindInput('rulesAndInfo')}
            label='Rules and info (markdown)'
            floatingLabel={true}
            multiline={true}
            rows={6}
            maxRows={16}
            inputProps={{ tabIndex: 0 }}
          />
          <TextField
            {...bindInput('link')}
            label='Link'
            floatingLabel={true}
            dense={true}
            inputProps={{ tabIndex: 0 }}
          />

          <RaisedButton label='Create league' color='primary' onClick={onSubmit} />
        </CreateLeagueForm>
        <CreateLeaguePreview>TODO!</CreateLeaguePreview>
      </CreateLeagueFormAndPreview>
    </CreateLeagueRoot>
  )
}

function EditLeague() {
  return <div>edit</div>
}
