import { useState } from 'react'
import { Button, PageHero, ProtectedRoute } from '../components/index.js'
import { useAuth } from '../hooks/useAuth.js'
import { useUserProfile } from '../hooks/useUserProfile.js'
import { formatPrice } from '../services/productTransforms.js'
import { updateProfileName, uploadProfilePicture } from '../services/profileService.js'
import { consumeAuthRedirect } from '../utils/authRedirect.js'

function formatError(error) {
  return error?.message || 'Something went wrong. Please try again.'
}

function AccountHero({ signedIn = false, view = 'account' }) {
  const title = view === 'profile' ? 'Your profile' : view === 'orders' ? 'Your orders' : 'Your account'
  const description = view === 'profile'
    ? 'Keep your customer details and profile picture current in one place.'
    : view === 'orders'
      ? 'Review the order requests and purchases connected to your account.'
      : 'Your account is ready for saved details, orders, and future drop access.'

  return (
    <PageHero
      eyebrow={signedIn ? view : 'Account'}
      title={signedIn ? title : 'Create your account'}
      description={
        signedIn
          ? description
          : 'Join to save your details, track orders, and keep your drop history in one place.'
      }
      ctaLabel="Back to home"
      ctaHref="#"
      ctaSecondaryLabel="Shop the drop"
      ctaSecondaryHref="#shop"
    />
  )
}

function AccountLoading() {
  return (
    <>
      <PageHero
        eyebrow="Account"
        title="Loading your account..."
        description="Restoring your session and preparing your account details."
        ctaLabel="Back to home"
        ctaHref="#"
        ctaSecondaryLabel="Shop the drop"
        ctaSecondaryHref="#shop"
      />
      <section className="section account" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your account</span>
        <div className="account__panel">
          <div className="account__copy account-skeleton" aria-hidden="true">
            <span className="card__skeleton account-skeleton__eyebrow" />
            <span className="card__skeleton account-skeleton__title" />
            <span className="card__skeleton account-skeleton__copy" />
            <span className="card__skeleton account-skeleton__copy" />
          </div>
          <div className="account-form account-skeleton" aria-hidden="true">
            <span className="card__skeleton account-skeleton__avatar" />
            <span className="card__skeleton account-skeleton__field" />
            <span className="card__skeleton account-skeleton__field" />
            <span className="card__skeleton account-skeleton__button" />
          </div>
        </div>
      </section>
    </>
  )
}

function AuthenticationForm({ initialMode = 'signIn' }) {
  const { signInWithGoogle, signInWithPassword, signUp, sendPasswordReset } = useAuth()
  const [mode, setMode] = useState(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isSignUp = mode === 'signUp'
  const isForgotPassword = mode === 'forgotPassword'

  const changeMode = (nextMode) => {
    setMode(nextMode)
    setMessage('')
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    setError('')

    try {
      const response = isForgotPassword
        ? await sendPasswordReset(email)
        : isSignUp
          ? await signUp({ name, email, password })
          : await signInWithPassword({ email, password })

      if (response.error) {
        setError(formatError(response.error))
        return
      }

      if (isForgotPassword) {
        setMessage('Check your email for a password reset link.')
        return
      }

      if (isSignUp && !response.data.session) {
        setMessage('Check your email to confirm your account, then return here to sign in.')
      } else if (response.data?.session) {
        window.location.hash = consumeAuthRedirect()
      }
    } catch (submitError) {
      setError(formatError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setSubmitting(true)
    setError('')
    try {
      const response = await signInWithGoogle()
      if (response.error) {
        setError(formatError(response.error))
      }
    } catch (signInError) {
      setError(formatError(signInError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <AccountHero />
      <section className="section account">
        <div className="account__panel">
          <div className="account__copy">
            <span className="eyebrow">Join americandrm</span>
            <h2>{isForgotPassword ? 'Reset your password.' : isSignUp ? 'One account, for orders and drop access.' : 'Welcome back.'}</h2>
            <p>
              {isForgotPassword
                ? 'Enter your email and we will send a secure link to reset your password.'
                : 'Use the same account to save your details, track orders, and keep your drop history in one place.'}
            </p>
          </div>

          <form className="account-form" onSubmit={handleSubmit}>
            {isSignUp && (
              <label>
                Full name
                <input value={name} onChange={(event) => setName(event.target.value)} type="text" placeholder="Your name" required />
              </label>
            )}
            <label>
              Email address
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@example.com" required />
            </label>
            {!isForgotPassword && (
              <label>
                Password
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  placeholder={isSignUp ? 'Create a password' : 'Your password'}
                  minLength="6"
                  required
                />
              </label>
            )}
            {error && <p className="account-form__message account-form__message--error" role="alert">{error}</p>}
            {message && <p className="account-form__message" role="status">{message}</p>}
            <Button as="button" type="submit" variant="checkout" disabled={submitting}>
              {submitting ? 'Please wait...' : isForgotPassword ? 'Send reset link' : isSignUp ? 'Create account' : 'Sign in'}
            </Button>
            {!isForgotPassword && (
              <Button as="button" type="button" variant="checkout" onClick={handleGoogleSignIn} disabled={submitting}>
                Continue with Google
              </Button>
            )}
            <div className="account-form__links">
              {mode !== 'signIn' && (isForgotPassword
                ? <button type="button" onClick={() => changeMode('signIn')}>Sign in</button>
                : <a href="#login">Sign in</a>)}
              {mode !== 'signUp' && !isForgotPassword && <a href="#signup">Create account</a>}
              {mode !== 'forgotPassword' && <button type="button" onClick={() => changeMode('forgotPassword')}>Forgot password?</button>}
            </div>
          </form>
        </div>
      </section>
    </>
  )
}

function PasswordRecoveryForm() {
  const { updatePassword, clearPasswordRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    if (password !== confirmation) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const response = await updatePassword(password)

      if (response.error) {
        setError(formatError(response.error))
        return
      }

      setMessage('Your password has been updated.')
    } catch (updateError) {
      setError(formatError(updateError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <AccountHero />
      <section className="section account">
        <div className="account__panel">
          <div className="account__copy">
            <span className="eyebrow">Password recovery</span>
            <h2>Set a new password.</h2>
            <p>Choose a new password for your americandrm account.</p>
          </div>
          <form className="account-form" onSubmit={handleSubmit}>
            <label>
              New password
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength="6" required />
            </label>
            <label>
              Confirm password
              <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} type="password" minLength="6" required />
            </label>
            {error && <p className="account-form__message account-form__message--error" role="alert">{error}</p>}
            {message && <p className="account-form__message" role="status">{message}</p>}
            <Button as="button" type="submit" variant="checkout" disabled={submitting}>
              {submitting ? 'Updating...' : 'Update password'}
            </Button>
            {message && (
              <Button as="button" type="button" variant="checkout" onClick={clearPasswordRecovery}>
                Continue to account
              </Button>
            )}
          </form>
        </div>
      </section>
    </>
  )
}

function ProfileAvatar({ profile }) {
  const initials = profile.name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return profile.avatarUrl ? (
    <img className="account-profile__avatar" src={profile.avatarUrl} alt={`${profile.name}'s profile`} loading="lazy" decoding="async" />
  ) : (
    <div className="account-profile__avatar account-profile__avatar--placeholder" aria-label={`${profile.name}'s profile`}>
      {initials}
    </div>
  )
}

function OrderHistory({ orders, error }) {
  if (error) {
    return <p className="account-form__message account-form__message--error">We could not load your previous orders.</p>
  }

  if (!orders.length) {
    return <p className="account-orders__empty">You have not placed any orders yet.</p>
  }

  return (
    <div className="account-orders__list">
      {orders.map((order) => {
        const orderDate = order.created_at
          ? new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : 'Date pending'

        return (
          <article className="account-order" key={order.id}>
            <div>
              <span className="eyebrow">Order {order.id.slice(0, 8)}</span>
              <p>{orderDate}</p>
            </div>
            <div className="account-order__meta">
              <span>{order.status || 'Processing'}</span>
              <strong>{formatPrice(order.total ?? order.subtotal ?? 0, order.currency || 'USD')}</strong>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function ProfileContent({ user, profile, orders, ordersError, refresh, view = 'account' }) {
  const { signOut } = useAuth()
  const [name, setName] = useState(profile.name)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSaveProfile = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const response = await updateProfileName(user, profile, name)

      if (response.error) {
        setError(formatError(response.error))
        return
      }

      setMessage('Your profile has been updated.')
      refresh()
    } catch (saveError) {
      setError(formatError(saveError))
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpload = async (event) => {
    const [file] = event.target.files ?? []
    if (!file) {
      return
    }

    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const response = await uploadProfilePicture(user, profile, file)

      if (response.error) {
        setError(formatError(response.error))
        return
      }

      setMessage('Your profile picture has been updated.')
      refresh()
    } catch (uploadError) {
      setError(formatError(uploadError))
    } finally {
      setSubmitting(false)
      event.target.value = ''
    }
  }

  const handleSignOut = async () => {
    setSubmitting(true)
    setError('')
    try {
      const response = await signOut()
      if (response.error) {
        setError(formatError(response.error))
      }
    } catch (signOutError) {
      setError(formatError(signOutError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <AccountHero signedIn view={view} />
      <section className="section account">
        {view !== 'orders' && <div className="account__panel">
          <div className="account__copy">
            <span className="eyebrow">Signed in</span>
            <h2>Welcome, {profile.name}.</h2>
            <p>Keep your contact details current, manage your profile picture, and review the orders tied to this account.</p>
          </div>
          <form className="account-form" onSubmit={handleSaveProfile}>
            <div className="account-profile__identity">
              <ProfileAvatar profile={profile} />
              <label className="account-profile__upload">
                Profile picture
                <input type="file" accept="image/*" onChange={handleUpload} disabled={submitting} />
              </label>
            </div>
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} type="text" required />
            </label>
            <label>
              Email address
              <input type="email" value={profile.email} readOnly />
            </label>
            {error && <p className="account-form__message account-form__message--error" role="alert">{error}</p>}
            {message && <p className="account-form__message" role="status">{message}</p>}
            <Button as="button" type="submit" variant="checkout" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save profile'}
            </Button>
            <Button as="button" type="button" variant="checkout" onClick={handleSignOut} disabled={submitting}>
              {submitting ? 'Signing out...' : 'Sign out'}
            </Button>
          </form>
        </div>}

        {view !== 'profile' && <div className="account-orders">
          <div>
            <span className="eyebrow">Order history</span>
            <h2>Previous orders</h2>
          </div>
          <OrderHistory orders={orders} error={ordersError} />
        </div>}
      </section>
    </>
  )
}

function AccountDashboard({ view = 'account' }) {
  const { user } = useAuth()
  const { profile, orders, loading, profileError, ordersError, refresh } = useUserProfile(user)

  if (loading) {
    return <AccountLoading />
  }

  if (profileError || !profile) {
    return (
      <>
        <AccountHero signedIn />
        <section className="section account">
          <div className="account__panel">
            <div className="account__copy">
              <span className="eyebrow">Profile</span>
              <h2>Your profile is unavailable.</h2>
              <p>We could not load your profile from Supabase.</p>
              <Button as="button" type="button" variant="checkout" onClick={refresh}>Retry</Button>
            </div>
          </div>
        </section>
      </>
    )
  }

  return (
    <ProfileContent
      key={`${profile.id}:${profile.name}:${profile.avatarUrl}`}
      user={user}
      profile={profile}
      orders={orders}
      ordersError={ordersError}
      refresh={refresh}
      view={view}
    />
  )
}

export function AuthPage({ mode = 'signIn' }) {
  const { passwordRecovery } = useAuth()

  if (passwordRecovery) {
    return <PasswordRecoveryForm />
  }

  return <AuthenticationForm initialMode={mode} />
}

export function ProtectedAccountPage({ view }) {
  return (
    <ProtectedRoute fallback={<AuthenticationForm />} loadingFallback={<AccountLoading />}>
      <AccountDashboard view={view} />
    </ProtectedRoute>
  )
}
