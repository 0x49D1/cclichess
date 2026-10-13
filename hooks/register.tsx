import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Account, Game, PuzzleData, Stats, View } from '../types'
import { parseFen, sideOf, sqIndex, sqName } from './chess'
import {
  awaitsReply, clickToUci, fromLichess, hint, isWin, newGame, pickOffline, play, reply, reveal,
} from './puzzle'

const PANE = 'lichess-puzzle'
const TITLE = '♞ Puzzle'
const LICHESS = 'https://lichess.org'
const TOKEN_URL =
  `${LICHESS}/account/oauth/token/create?scopes[]=puzzle:read&scopes[]=puzzle:write&description=Claude%20Code%20puzzles`

const NO_STATS: Stats = { solved: 0, failed: 0, streak: 0 }
const view = atom({ plugin: 'lichess-puzzles', key: 'view' } as const, {
  isLoading: false,
  isLoginOpen: false,
  stats: NO_STATS,
} as View)

const GLYPHS: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
}
const COLORS = {
  light: '#f0d9b5',
  dark: '#b58863',
  lastLight: '#cdd26a',
  lastDark: '#aaa23a',
  selected: '#829769',
  hint: '#5f9ea0',
  piece: '#000000',
}

type $ = EngineInterface

const settings = { difficulty: 'normal', letters: false, autoOpen: true, autoClose: false }

async function getToken($: $) {
  const token = await $.store.get('token')
  return typeof token === 'string' && token ? token : undefined
}

async function lichess($: $, path: string, init: { method?: string; body?: string; token?: string } = {}) {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (init.token) headers.Authorization = `Bearer ${init.token}`
  if (init.body) headers['Content-Type'] = 'application/json'
  return $.http.fetch(`${LICHESS}${path}`, { method: init.method ?? 'GET', headers, body: init.body })
}

async function loadPuzzle($: $) {
  const before = await read($, view)
  if (before.isLoading) return
  await update($, view, v => ({ ...v, isLoading: true, notice: undefined }))
  const token = await getToken($)
  let puzzle: PuzzleData
  let notice: string | undefined
  try {
    const res = await lichess($, `/api/puzzle/next?angle=mix&difficulty=${settings.difficulty}`, { token })
    if (res.status === 401 && token) throw new Error('token refusé, reconnecte-toi')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    puzzle = fromLichess(JSON.parse(res.text))
  } catch (err) {
    puzzle = pickOffline(before.game?.puzzle.id)
    notice = `Lichess injoignable (${err instanceof Error ? err.message : String(err)}) : puzzle hors-ligne.`
  }
  await update($, view, v => ({ ...v, isLoading: false, notice, game: newGame(puzzle) }))
}

function saveStats($: $, stats: Stats) {
  return $.store.set('stats', stats)
}

/** Counts a finished puzzle once, and sends it to Lichess when signed in. */
async function settle($: $, game: Game, win: boolean) {
  if (game.isReported) return
  const after = await update($, view, v =>
    v.game?.puzzle.id === game.puzzle.id && !v.game.isReported
      ? {
          ...v,
          game: { ...v.game, isReported: true },
          stats: win
            ? { ...v.stats, solved: v.stats.solved + 1, streak: v.stats.streak + 1 }
            : { ...v.stats, failed: v.stats.failed + 1, streak: 0 },
        }
      : v,
  )
  await saveStats($, after.stats)
  const token = await getToken($)
  if (!token || game.puzzle.source !== 'lichess') return
  try {
    const res = await lichess($, `/api/puzzle/batch/mix?difficulty=${settings.difficulty}`, {
      method: 'POST',
      token,
      body: JSON.stringify({ solutions: [{ id: game.puzzle.id, win, rated: true }] }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = JSON.parse(res.text) as { glicko?: { rating?: number }; rounds?: { ratingDiff?: number }[] }
    const rating = body.glicko?.rating
    const diff = body.rounds?.[0]?.ratingDiff
    const account = await update($, view, v => ({
      ...v,
      account: v.account && rating ? { ...v.account, rating: Math.round(rating) } : v.account,
      notice: typeof diff === 'number' ? `Classement puzzle ${diff >= 0 ? '+' : ''}${diff}` : v.notice,
    }))
    if (account.account) await $.store.set('account', account.account)
  } catch (err) {
    await update($, view, v => ({
      ...v,
      notice: `Résultat non envoyé à Lichess (${err instanceof Error ? err.message : String(err)}).`,
    }))
  }
}

/** After the solver's move: the opponent's answer, or the puzzle's end. */
async function afterMove($: $) {
  const { game } = await read($, view)
  if (!game) return
  if (awaitsReply(game)) {
    $.clock.after(450, () => {
      void update($, view, v => (v.game?.puzzle.id === game.puzzle.id ? { ...v, game: reply(v.game) } : v))
    })
    return
  }
  if (game.status !== 'playing') await settle($, game, isWin(game))
}

async function changeGame($: $, change: (g: Game) => Game) {
  await update($, view, v => (v.game ? { ...v, game: change(v.game) } : v))
  await afterMove($)
}

function clickSquare($: $, index: number) {
  return changeGame($, g => {
    if (g.status !== 'playing' || awaitsReply(g)) return g
    const pos = parseFen(g.fen)
    const isOwn = sideOf(pos.board[index] ?? '') === pos.turn
    if (!g.selected) return isOwn ? { ...g, selected: sqName(index) } : g
    const from = sqIndex(g.selected)
    if (from === index) return { ...g, selected: undefined }
    if (isOwn) return { ...g, selected: sqName(index) }
    return play(g, clickToUci(g, from, index))
  })
}

async function nextPuzzle($: $) {
  const { game } = await read($, view)
  // Leaving a puzzle after a mistake or some help counts as a loss, as on Lichess.
  if (game && game.status === 'playing' && (game.hadMistake || game.usedHelp)) await settle($, game, false)
  await loadPuzzle($)
}

async function login($: $, raw: string) {
  const token = raw.trim()
  if (!token) return
  await update($, view, v => ({ ...v, loginError: undefined, notice: 'Vérification du token…' }))
  try {
    const res = await lichess($, '/api/account', { token })
    if (res.status === 401) throw new Error('token invalide')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = JSON.parse(res.text) as { username?: string; perfs?: { puzzle?: { rating?: number } } }
    if (!body.username) throw new Error('réponse inattendue')
    const account: Account = { username: body.username, rating: body.perfs?.puzzle?.rating }
    await $.store.set('token', token)
    await $.store.set('account', account)
    await update($, view, v => ({ ...v, account, isLoginOpen: false, notice: `Connecté en tant que ${account.username}.` }))
  } catch (err) {
    await update($, view, v => ({
      ...v,
      notice: undefined,
      loginError: `Connexion impossible : ${err instanceof Error ? err.message : String(err)}`,
    }))
  }
}

async function logout($: $) {
  const token = await getToken($)
  if (token) {
    // Revoke the token on Lichess too; best effort.
    await lichess($, '/api/token', { method: 'DELETE', token }).catch(() => undefined)
  }
  await $.store.delete('token')
  await $.store.delete('account')
  await update($, view, v => ({ ...v, account: undefined, notice: 'Déconnecté : mode anonyme.' }))
}

async function isAutoOpen($: $) {
  const stored = await $.store.get('autoOpen')
  return typeof stored === 'boolean' ? stored : settings.autoOpen
}

async function openPane($: $, focus = false) {
  await $.ui.open({ id: PANE, title: TITLE, rows: 17, ...(focus ? { focus: true as const } : {}) })
  const v = await read($, view)
  if (!v.game && !v.isLoading) await loadPuzzle($)
}

export const register: Register = (on, options) => {
  settings.difficulty = String(options.difficulty ?? 'normal')
  settings.letters = options.pieces === 'letters'
  settings.autoOpen = options.autoOpen !== false
  settings.autoClose = options.autoClose === true

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'chess',
      description: "Puzzles d'échecs Lichess : ouvrir le panneau, next, login, logout, auto on|off",
      argumentHint: '[next|login|logout|auto on|auto off]',
    })
    const account = (await $.store.get('account')) as Account | undefined
    const stats = (await $.store.get('stats')) as Stats | undefined
    await update($, view, v => ({ ...v, account: account ?? undefined, stats: stats ?? v.stats }))
    return next(e)
  })

  on('command.run', { command: 'chess' }, async ($, e) => {
    const args = e.args.trim().split(/\s+/).filter(Boolean)
    switch (args[0]?.toLowerCase()) {
      case undefined:
        await openPane($, true)
        return { text: 'Panneau puzzle ouvert.' }
      case 'next':
        await openPane($)
        await nextPuzzle($)
        return { text: 'Nouveau puzzle.' }
      case 'login':
        if (args[1]) {
          return { text: "Ne colle pas ton token dans une commande (il finirait dans la conversation) : utilise le champ du panneau." }
        }
        await update($, view, v => ({ ...v, isLoginOpen: true, loginError: undefined }))
        await openPane($, true)
        return { text: 'Colle ton token Lichess dans le panneau puzzle.' }
      case 'logout':
        await logout($)
        return { text: 'Compte Lichess déconnecté, puzzles en mode anonyme.' }
      case 'auto': {
        const isOn = args[1] !== 'off'
        await $.store.set('autoOpen', isOn)
        return { text: isOn ? 'Le panneau s’ouvrira quand Claude travaille.' : 'Ouverture automatique désactivée.' }
      }
      default:
        return { text: 'Usage : /chess [next|login|logout|auto on|auto off]' }
    }
  })

  on('turn.start', async ($, e, next) => {
    if (await isAutoOpen($)) void openPane($).catch(() => undefined)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const panes = await $.ui.panes()
    if (!panes.some(p => p.id === PANE)) return result
    const { game } = await read($, view)
    const isMidPuzzle = game?.status === 'playing' && game.played.length > 0
    if (settings.autoClose && !isMidPuzzle) await $.ui.close({ id: PANE })
    else if (game?.status === 'playing') $.ui.toast('Claude a terminé ✓ (le puzzle t’attend)')
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button, Link } = els
    const Input = 'Input' in els ? els.Input : undefined
    const v = await read($, view)
    const g = v.game

    const accountLine = (
      <Box flexDirection="row" gap={1}>
        <Text dimColor>
          {v.account ? `👤 ${v.account.username}${v.account.rating ? ` (${v.account.rating})` : ''}` : 'Anonyme'}
          {` · ${v.stats.solved}✓ ${v.stats.failed}✗ · série ${v.stats.streak}`}
        </Text>
        {v.account ? (
          <Button key="logout" plain dimColor onPress={() => void logout($)}>déconnexion</Button>
        ) : (
          <Button key="login" plain dimColor onPress={() => void update($, view, x => ({ ...x, isLoginOpen: true, loginError: undefined }))}>
            se connecter
          </Button>
        )}
      </Box>
    )

    if (v.isLoginOpen) {
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>Connecter ton compte Lichess</Text>
          <Text>1. Crée un token personnel (droits puzzle) :</Text>
          <Link href={TOKEN_URL} label="lichess.org → créer un token" />
          {Input ? (
            <Box flexDirection="column">
              <Text>2. Colle-le ici puis Entrée :</Text>
              <Input key="token" placeholder="lip_…" autoFocus onSubmit={value => void login($, value)} />
            </Box>
          ) : (
            <Text dimColor>Ce client n’a pas de champ texte : connecte-toi depuis le terminal ou l’app desktop.</Text>
          )}
          {v.loginError && <Text color="error">{v.loginError}</Text>}
          {v.notice && <Text dimColor>{v.notice}</Text>}
          <Text dimColor>Le token reste sur ta machine, jamais dans la conversation.</Text>
          <Button key="cancel-login" onPress={() => void update($, view, x => ({ ...x, isLoginOpen: false }))}>Annuler</Button>
        </Box>
      )
    }

    if (!g) {
      return (
        <Box flexDirection="column">
          <Text dimColor>{v.isLoading ? 'Chargement du puzzle…' : 'Aucun puzzle chargé.'}</Text>
          {!v.isLoading && <Button key="load" onPress={() => void loadPuzzle($)}>Charger un puzzle</Button>}
          {accountLine}
        </Box>
      )
    }

    const pos = parseFen(g.fen)
    const ranks = g.player === 'w' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
    const files = g.player === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]
    const last = g.lastMove ? [g.lastMove.slice(0, 2), g.lastMove.slice(2, 4)] : []
    const square = (index: number) => {
      const name = sqName(index)
      const isLight = (index % 8 + Math.floor(index / 8)) % 2 === 1
      const bg =
        g.selected === name ? COLORS.selected
          : g.hint === name ? COLORS.hint
          : last.includes(name) ? (isLight ? COLORS.lastLight : COLORS.lastDark)
          : isLight ? COLORS.light : COLORS.dark
      const piece = pos.board[index] ?? ''
      const glyph = piece === '' ? ' ' : settings.letters ? piece : GLYPHS[piece] ?? piece
      return (
        <Button key={`sq-${name}`} plain onPress={() => void clickSquare($, index)}>
          <Text backgroundColor={bg} color={COLORS.piece} bold>{` ${glyph} `}</Text>
        </Button>
      )
    }
    const puzzleUrl = g.puzzle.source === 'lichess' ? `${LICHESS}/training/${g.puzzle.id}` : undefined
    const side = g.player === 'w' ? 'Blancs' : 'Noirs'

    return (
      <Box flexDirection="column">
        <Text dimColor>
          {g.puzzle.source === 'lichess' ? `#${g.puzzle.id}` : 'hors-ligne'}
          {g.puzzle.rating ? ` · ★${g.puzzle.rating}` : ''}
          {` · ${side}`}
          {g.puzzle.themes.length ? ` · ${g.puzzle.themes.slice(0, 2).join(', ')}` : ''}
        </Text>
        {ranks.map(r => (
          <Box key={`rank-${r}`} flexDirection="row">
            <Text dimColor>{`${r + 1} `}</Text>
            {files.map(f => square(r * 8 + f))}
          </Box>
        ))}
        <Text dimColor>{'  ' + files.map(f => ` ${'abcdefgh'[f]} `).join('')}</Text>
        {g.message && (
          <Text color={g.status === 'solved' ? 'success' : g.message.startsWith('✗') ? 'error' : undefined}>{g.message}</Text>
        )}
        {v.isLoading ? <Text dimColor>Chargement…</Text> : v.notice ? <Text dimColor>{v.notice}</Text> : null}
        {Input && g.status === 'playing' && (
          <Input key={`move-${g.puzzle.id}`} placeholder="Coup : e2e4 ou Cf3/Nf3" onSubmit={value => void changeGame($, x => play(x, value))} />
        )}
        <Box flexDirection="row" gap={1}>
          {g.status === 'playing' && (
            <Button key="hint" hotkey="h" onPress={() => void changeGame($, hint)}>Indice</Button>
          )}
          {g.status === 'playing' && (
            <Button key="reveal" hotkey="s" onPress={() => void changeGame($, reveal)}>Solution</Button>
          )}
          <Button key="next" hotkey="n" variant={g.status === 'playing' ? undefined : 'primary'} onPress={() => void nextPuzzle($)}>
            Suivant
          </Button>
          {puzzleUrl && <Link href={puzzleUrl} label="Lichess ↗" />}
        </Box>
        {accountLine}
      </Box>
    )
  })
}
