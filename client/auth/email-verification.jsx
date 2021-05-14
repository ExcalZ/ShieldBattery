import PropTypes from 'prop-types'
import queryString from 'query-string'
import React from 'react'
import { connect } from 'react-redux'
import { push } from '../navigation/routing'
import LoadingIndicator from '../progress/dots'
import { verifyEmail } from './action-creators'
import {
  AuthBody,
  AuthBottomAction,
  AuthContent,
  AuthContentContainer,
  AuthTitle,
  BottomActionButton,
  ErrorsContainer,
  LoadingArea,
  SuccessContainer,
} from './auth-content'
import { createNextPath, isLoggedIn } from './auth-utils'

@connect(state => ({ auth: state.auth }))
export class EmailVerification extends React.Component {
  static propTypes = {
    title: PropTypes.string.isRequired,
    doSubmit: PropTypes.func.isRequired,
    successMessage: PropTypes.string,
  }

  state = {
    reqId: null,
    success: false,
  }

  componentDidMount() {
    if (isLoggedIn(this.props.auth)) {
      const { id, action } = this.props.doSubmit()
      this.setState({
        reqId: id,
        success: false,
      })
      this.props.dispatch(action)
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.auth.authChangeInProgress && !this.props.auth.authChangeInProgress) {
      if (this.state.reqId && !this.props.auth.lastFailure) {
        this.setState({ success: true })
      }
    }
  }

  render() {
    const {
      auth,
      auth: { authChangeInProgress, lastFailure },
      title,
      successMessage,
    } = this.props
    const { reqId, success } = this.state

    let loadingContents
    if (authChangeInProgress) {
      loadingContents = (
        <LoadingArea>
          <LoadingIndicator />
        </LoadingArea>
      )
    }

    let contents
    let bottomActionButton
    if (!isLoggedIn(auth)) {
      contents = (
        <ErrorsContainer>
          Error: You need to be logged-in in order to perform the email verification. Please log in
          by clicking the button below and try again.
        </ErrorsContainer>
      )
      bottomActionButton = <BottomActionButton label='Log in' onClick={this.onLogInClick} />
    } else if (reqId && lastFailure && lastFailure.reqId === reqId) {
      contents = <ErrorsContainer>Error: {lastFailure.err}</ErrorsContainer>

      // Until we add a proper error system, we're stuck with checks like these :/
      if (lastFailure.err.startsWith('The provided email or verification code is not valid.')) {
        bottomActionButton = (
          <BottomActionButton label='Resend verification email' onClick={this.onResendClick} />
        )
      }
    } else if (success && successMessage) {
      contents = <SuccessContainer>{successMessage}</SuccessContainer>

      // eslint-disable-next-line no-use-before-define
      if (successMessage === VERIFY_EMAIL_SUCCESS) {
        bottomActionButton = <BottomActionButton label='Continue' onClick={this.onContinueClick} />
      }
    } else {
      contents = <ErrorsContainer>Something went terribly wrong. Please try again.</ErrorsContainer>
    }

    return (
      <AuthContent>
        <AuthContentContainer isLoading={authChangeInProgress}>
          <AuthTitle as='h3'>{title}</AuthTitle>
          <AuthBody>{contents}</AuthBody>
          <AuthBottomAction>{bottomActionButton}</AuthBottomAction>
        </AuthContentContainer>
        {loadingContents}
      </AuthContent>
    )
  }

  onContinueClick = () => {
    push({ pathname: '/' })
  }

  onResendClick = () => {
    push({ pathname: '/send-verification-email' })
  }

  onLogInClick = () => {
    const search = createNextPath(location)
    push({ pathname: '/login', search })
  }
}

const VERIFY_EMAIL_SUCCESS = 'Your email has been successfully verified.'
export const VerifyEmail = () => {
  const { token } = queryString.parse(location.search)
  return (
    <EmailVerification
      title={'Verify email'}
      doSubmit={() => verifyEmail(token)}
      successMessage={VERIFY_EMAIL_SUCCESS}
      location={location}
    />
  )
}
