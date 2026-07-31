const AUTH_REDIRECT_KEY = 'americandrm.auth-redirect'

export function rememberAuthRedirect(hash) {
  try {
    window.sessionStorage.setItem(AUTH_REDIRECT_KEY, hash)
  } catch {
    // Session storage can be unavailable in privacy-restricted browsers.
  }
}

export function consumeAuthRedirect(fallback = '#profile') {
  try {
    const redirect = window.sessionStorage.getItem(AUTH_REDIRECT_KEY) || fallback
    window.sessionStorage.removeItem(AUTH_REDIRECT_KEY)
    return redirect
  } catch {
    return fallback
  }
}
