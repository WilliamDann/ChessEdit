// Lichess OAuth sign-in (PKCE), mirroring en-croissant's src-tauri/src/oauth.rs:
// a temporary HTTP server on 127.0.0.1 catches the redirect, the code is
// exchanged at lichess.org/api/token, and tokens live in userData/lichess.json
// (0600). The renderer never sees the raw token — it only asks for sign-in
// state; databases.js attaches the Authorization header server-side.

const crypto = require('crypto')
const http = require('http')
const path = require('path')
const fs = require('fs/promises')
const { app, shell } = require('electron')

const CLIENT_ID = 'org.chessedit.app'
const AUTH_URL = 'https://lichess.org/oauth'
const TOKEN_URL = 'https://lichess.org/api/token'
const FLOW_TIMEOUT_MS = 5 * 60 * 1000

// No scopes: the opening explorer only needs a valid token.
const SCOPES = ''

// Injected in register(); overridable in tests.
let openExternal = (url) => shell.openExternal(url)

const tokenPath = () => path.join(app.getPath('userData'), 'lichess.json')

let pendingFlow = null // { server, timer, resolve, reject }

// ── Storage ─────────────────────────────────────────────────────────────────

async function readSession() {
  try {
    const raw = await fs.readFile(tokenPath(), 'utf8')
    const data = JSON.parse(raw)
    if (typeof data.accessToken !== 'string' || !data.accessToken) return null
    return {
      accessToken: data.accessToken,
      refreshToken: typeof data.refreshToken === 'string' ? data.refreshToken : null,
      expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : null,
    }
  } catch {
    return null
  }
}

async function writeSession(session) {
  await fs.writeFile(tokenPath(), JSON.stringify(session, null, 2), { mode: 0o600 })
}

async function clearSession() {
  await fs.rm(tokenPath(), { force: true })
}

async function getAccessToken() {
  const session = await readSession()
  if (!session) return null

  // Refresh shortly before expiry; lichess omits expiry for non-expiring tokens.
  const expires = session.expiresAt ? Date.parse(session.expiresAt) : Infinity
  if (Date.now() < expires - 60_000) return session.accessToken

  if (!session.refreshToken) {
    await clearSession()
    return null
  }
  try {
    const refreshed = await exchangeToken({
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
      client_id: CLIENT_ID,
    })
    const next = {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? session.refreshToken,
      expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : null,
    }
    await writeSession(next)
    return next.accessToken
  } catch (err) {
    console.warn('lichess-auth: token refresh failed:', err.message)
    await clearSession()
    return null
  }
}

// ── OAuth primitives ────────────────────────────────────────────────────────

// base64url(SHA256(verifier)) per RFC 7636
function pkceChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

async function exchangeToken(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    throw new Error(`token endpoint returned ${res.status}`)
  }
  return await res.json()
}

// Returns a promise resolving with the stored session once the browser flow
// completes. Exposed for tests; the IPC handler wraps it.
async function beginSignIn() {
  if (pendingFlow) throw new Error('A sign-in is already in progress')

  let resolve
  let reject
  const flow = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })

  let server = null
  let timer = null
  const finish = (err, session) => {
    clearTimeout(timer)
    server?.close()
    pendingFlow = null
    if (err) reject(err)
    else resolve(session)
  }

  try {
    const verifier = crypto.randomBytes(32).toString('base64url')
    const state = crypto.randomBytes(16).toString('base64url')

    server = http.createServer((req, res) => {
      const respond = (message) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(
          '<html><body style="background:#16161e;color:#c0caf5;display:grid;place-items:center;height:100%;font-family:sans-serif">' +
            `<p>${message}</p></body></html>`,
        )
      }
      ;(async () => {
        try {
          const url = new URL(req.url ?? '/', 'http://127.0.0.1')
          const error = url.searchParams.get('error')
          const code = url.searchParams.get('code')
          const returnedState = url.searchParams.get('state')

          if (error) {
            respond(`✗ Authorization was denied in the browser (${error}).`)
            finish(new Error(`Authorization was denied in the browser (${error})`))
            return
          }
          if (!code || returnedState !== state) {
            respond('✗ Sign-in state mismatch — please try again from ChessEdit.')
            finish(new Error('Sign-in state mismatch — please try again'))
            return
          }

          const token = await exchangeToken({
            grant_type: 'authorization_code',
            code,
            code_verifier: verifier,
            client_id: CLIENT_ID,
            redirect_uri,
          })
          const session = {
            accessToken: token.access_token,
            refreshToken: token.refresh_token ?? null,
            expiresAt: token.expires_in
              ? new Date(Date.now() + token.expires_in * 1000).toISOString()
              : null,
          }
          await writeSession(session)
          respond('✓ Signed in — you can close this tab and return to ChessEdit.')
          finish(null, session)
        } catch (err) {
          // Always answer the browser, even when the exchange fails — a
          // hanging tab is indistinguishable from a broken sign-in.
          respond('✗ Sign-in failed — please try again from ChessEdit.')
          finish(err instanceof Error ? err : new Error(String(err)))
        }
      })()
    })

    // Reserve a random free port, like en-croissant's get_available_addr().
    await new Promise((listenResolve, listenReject) => {
      server.once('error', listenReject)
      server.listen(0, '127.0.0.1', () => listenResolve(server.address().port))
    })
    const redirect_uri = `http://127.0.0.1:${server.address().port}/callback`

    const authorizeUrl = new URL(AUTH_URL)
    for (const [key, value] of Object.entries({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri,
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      ...(SCOPES ? { scope: SCOPES } : {}),
    })) {
      authorizeUrl.searchParams.set(key, value)
    }

    timer = setTimeout(() => {
      finish(new Error('Sign-in timed out — no response from the browser'))
    }, FLOW_TIMEOUT_MS)

    pendingFlow = { server, timer }

    // The browser opens after the server is listening, so a fast redirect
    // cannot race the setup above.
    openExternal(authorizeUrl.toString()).catch((err) => {
      finish(new Error(`Could not open the browser: ${err.message}`))
    })
  } catch (err) {
    finish(err instanceof Error ? err : new Error(String(err)))
  }

  return flow
}

// ── IPC ─────────────────────────────────────────────────────────────────────

function register(ipcMain, overrides = {}) {
  if (overrides.openExternal) openExternal = overrides.openExternal

  ipcMain.handle('db-lichess-signin', async () => {
    await beginSignIn({})
    return { signedIn: true }
  })

  ipcMain.handle('db-lichess-session', async () => {
    const session = await readSession()
    return { signedIn: session !== null }
  })

  ipcMain.handle('db-lichess-signout', async () => {
    await clearSession()
    return { signedIn: false }
  })
}

module.exports = { register, getAccessToken, beginSignIn, readSession, clearSession }
