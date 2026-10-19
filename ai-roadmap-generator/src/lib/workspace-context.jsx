import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { ws } from './api'
import { captureLaunchParams, getToken, LAUNCH_PARAMS, markSignedIn, redirectToLogin } from './workspace'

const WorkspaceContext = createContext(null)

/**
 * Signs the visitor in with the SIET Space token and keeps their profile,
 * point balance and the AI prices available to every page.
 *
 * status: 'loading' -> 'ready' | 'blocked' (came back from sign-in still
 * without a valid session; shown as a message instead of bouncing forever).
 */
export function WorkspaceProvider({ children }) {
  const [status, setStatus] = useState('loading')
  const [me, setMe] = useState(null)

  const refresh = useCallback(async () => {
    const data = await ws('community/me')
    setMe(data)
    return data
  }, [])

  useEffect(() => {
    captureLaunchParams()
    if (!getToken()) {
      if (!redirectToLogin()) setStatus('blocked')
      return
    }
    refresh()
      .then(() => {
        markSignedIn()
        setStatus('ready')
      })
      .catch((error) => {
        // A 401 normally sends the browser off to sign in. If it did not
        // (we just came back from there, or the API is down) say so.
        if (!error?.redirected) setStatus('blocked')
      })
  }, [refresh])

  // Take the token (and the other hand-off parameters) out of the address bar
  // so it is not left in history or copied along with a shared link.
  const router = useRouter()
  useEffect(() => {
    if (!router.isReady) return
    const url = new URL(router.asPath, window.location.origin)
    const present = LAUNCH_PARAMS.filter((name) => url.searchParams.has(name))
    if (!present.length) return
    present.forEach((name) => url.searchParams.delete(name))
    router.replace(url.pathname + url.search, undefined, { shallow: true })
  }, [router, router.isReady, router.asPath])

  const value = {
    status,
    user: me?.user || null,
    balance: me?.balance ?? 0,
    exempt: Boolean(me?.exempt),
    costs: me?.costs || {},
    refresh,
  }
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return value
}
