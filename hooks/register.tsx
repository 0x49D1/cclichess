import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Account, BoardSize, BoardTheme, Game, Locale, PuzzleData, Stats, View } from '../types'
import { parseFen, sideOf, sqIndex, sqName } from './chess'
import { LOCALES, asLocale, pickLocale, stringsFor } from './i18n'
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

// Filled glyphs for both sides, told apart by their color: readable on mid-tone squares.
const GLYPHS: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }

type Palette = {
  light: string
  dark: string
  lastLight: string
  lastDark: string
  selected: string
  hint: string
  white: string
  black: string
}
const PALETTES: Record<'dark' | 'light', Palette> = {
  // Muted slate squares that sit quietly on a dark terminal.
  dark: {
    light: '#7b8794',
    dark: '#55606d',
    lastLight: '#8f915a',
    lastDark: '#6f7243',
    selected: '#5e8a62',
    hint: '#4d7d8c',
    white: '#ffffff',
    black: '#101010',
  },
  // Lichess's brown board, a shade softer.
  light: {
    light: '#e3cfa8',
    dark: '#b08660',
    lastLight: '#cdcf78',
    lastDark: '#a9a44a',
    selected: '#88a36f',
    hint: '#6ea3b0',
    white: '#ffffff',
    black: '#000000',
  },
}

const SIZES: BoardSize[] = ['small', 'medium', 'large']
/** Cells across, rows down, per square. */
const SQUARE: Record<BoardSize, { width: number; height: number }> = {
  small: { width: 2, height: 1 },
  medium: { width: 3, height: 1 },
  large: { width: 5, height: 3 },
}
const paneRows = (size: BoardSize) => SQUARE[size].height * 8 + 9

const USAGE = `next|login|logout|size small|medium|large|theme auto|dark|light|auto on|off|lang auto|${LOCALES.join('|')}`

type $ = EngineInterface

const settings = {
  difficulty: 'normal',
  letters: false,
  autoOpen: true,
  autoClose: true,
  size: 'medium' as BoardSize,
  boardTheme: 'auto' as BoardTheme,
  language: 'auto',
}

const asSize = (x: unknown): BoardSize | undefined => (SIZES.includes(x as BoardSize) ? (x as BoardSize) : undefined)
const asTheme = (x: unknown): BoardTheme | undefined =>
  x === 'auto' || x === 'dark' || x === 'light' ? x : undefined

/** The palette for the board: the chosen one, or the one matching Claude Code's theme. */
async function paletteFor($: $, chosen: BoardTheme): Promise<Palette> {
  if (chosen !== 'auto') return PALETTES[chosen]
  try {
    const theme = (await $.config.list()).find(row => row.key === 'theme')?.value
    return typeof theme === 'string' && theme.startsWith('light') ? PALETTES.light : PALETTES.dark
  } catch {
    return PALETTES.dark
  }
}

/** /chess lang, the setting, Claude Code's language setting, then the locale variables. */
async function resolveLocale($: $): Promise<Locale> {
  const language = await $.settings.read({ key: 'language' }).catch(() => undefined)
  return pickLocale([
    asLocale(await $.store.get('lang')),
    settings.language,
    typeof language === 'string' ? language : undefined,
    await $.env.get('LC_ALL'),
    await $.env.get('LC_MESSAGES'),
    await $.env.get('LANG'),
  ])
}

/** The strings in the person's language. */
const tr = async ($: $) => stringsFor((await read($, view)).locale)

async function setSize($: $, size: BoardSize) {
  await $.store.set('size', size)
  await update($, view, v => ({ ...v, size }))
  const panes = await $.ui.panes()
  if (panes.some(p => p.id === PANE)) await $.ui.open({ id: PANE, title: TITLE, rows: paneRows(size) })
}

async function stepSize($: $, by: number) {
  const { size = settings.size } = await read($, view)
  const next = SIZES[Math.min(SIZES.length - 1, Math.max(0, SIZES.indexOf(size) + by))] ?? size
  if (next !== size) await setSize($, next)
}

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
  const t = stringsFor(before.locale)
  let puzzle: PuzzleData
  let notice: string | undefined
  try {
    const res = await lichess($, `/api/puzzle/next?angle=mix&difficulty=${settings.difficulty}`, { token })
    if (res.status === 401 && token) throw new Error(t.tokenRefused)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    puzzle = fromLichess(JSON.parse(res.text), t)
  } catch (err) {
    puzzle = pickOffline(before.game?.puzzle.id)
    notice = t.offline(err instanceof Error ? err.message : String(err))
  }
  await update($, view, v => ({ ...v, isLoading: false, notice, game: newGame(puzzle, t) }))
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
  const t = stringsFor(after.locale)
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
      notice: typeof diff === 'number' ? t.ratingDiff(`${diff >= 0 ? '+' : ''}${diff}`) : v.notice,
    }))
    if (account.account) await $.store.set('account', account.account)
  } catch (err) {
    await update($, view, v => ({
      ...v,
      notice: t.notSent(err instanceof Error ? err.message : String(err)),
    }))
  }
}

/** After the solver's move: the opponent's answer, or the puzzle's end. */
async function afterMove($: $) {
  const { game } = await read($, view)
  if (!game) return
  if (awaitsReply(game)) {
    $.clock.after(450, () => {
      void update($, view, v => (v.game?.puzzle.id === game.puzzle.id ? { ...v, game: reply(v.game, stringsFor(v.locale)) } : v))
    })
    return
  }
  if (game.status !== 'playing') {
    await settle($, game, isWin(game))
    await closeLater($, game.puzzle.id)
  }
}

/** A puzzle the person has started: a move, a mistake or some help. */
const isStarted = (g: Game | undefined) =>
  g?.status === 'playing' && (g.played.length > 0 || g.hadMistake || g.usedHelp)

/** Once Claude is done too, close the pane a moment after the puzzle ends. */
async function closeLater($: $, puzzleId: string) {
  const v = await read($, view)
  if (!settings.autoClose || v.isClaudeWorking) return
  $.clock.after(3000, () => void closeIfIdle($, puzzleId))
}

async function closeIfIdle($: $, puzzleId: string) {
  const v = await read($, view)
  const isSamePuzzleDone = v.game?.puzzle.id === puzzleId && v.game.status !== 'playing'
  if (settings.autoClose && !v.isClaudeWorking && isSamePuzzleDone) await $.ui.close({ id: PANE })
}

async function changeGame($: $, change: (g: Game) => Game) {
  await update($, view, v => (v.game ? { ...v, game: change(v.game) } : v))
  await afterMove($)
}

async function clickSquare($: $, index: number) {
  const t = await tr($)
  return changeGame($, g => {
    if (g.status !== 'playing' || awaitsReply(g)) return g
    const pos = parseFen(g.fen)
    const isOwn = sideOf(pos.board[index] ?? '') === pos.turn
    if (!g.selected) return isOwn ? { ...g, selected: sqName(index) } : g
    const from = sqIndex(g.selected)
    if (from === index) return { ...g, selected: undefined }
    if (isOwn) return { ...g, selected: sqName(index) }
    return play(g, clickToUci(g, from, index), t)
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
  const t = await tr($)
  await update($, view, v => ({ ...v, loginError: undefined, notice: t.checkingToken }))
  try {
    const res = await lichess($, '/api/account', { token })
    if (res.status === 401) throw new Error(t.invalidToken)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = JSON.parse(res.text) as { username?: string; perfs?: { puzzle?: { rating?: number } } }
    if (!body.username) throw new Error(t.unexpectedAnswer)
    const account: Account = { username: body.username, rating: body.perfs?.puzzle?.rating }
    await $.store.set('token', token)
    await $.store.set('account', account)
    await update($, view, v => ({ ...v, account, isLoginOpen: false, notice: t.signedIn(account.username) }))
  } catch (err) {
    await update($, view, v => ({
      ...v,
      notice: undefined,
      loginError: t.signInFailed(err instanceof Error ? err.message : String(err)),
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
  await update($, view, v => ({ ...v, account: undefined, notice: stringsFor(v.locale).signedOut }))
}

async function isAutoOpen($: $) {
  const stored = await $.store.get('autoOpen')
  return typeof stored === 'boolean' ? stored : settings.autoOpen
}

async function openPane($: $, focus = false) {
  const v = await read($, view)
  await $.ui.open({ id: PANE, title: TITLE, rows: paneRows(v.size ?? settings.size), ...(focus ? { focus: true as const } : {}) })
  // A finished puzzle makes way for a new one.
  if ((!v.game || v.game.status !== 'playing') && !v.isLoading) await loadPuzzle($)
}

export const register: Register = (on, options) => {
  settings.difficulty = String(options.difficulty ?? 'normal')
  settings.letters = options.pieces === 'letters'
  settings.autoOpen = options.autoOpen !== false
  settings.autoClose = options.autoClose !== false
  settings.size = asSize(options.size) ?? 'medium'
  settings.boardTheme = asTheme(options.boardTheme) ?? 'auto'
  settings.language = String(options.language ?? 'auto')

  on('session.start', async ($, e, next) => {
    const locale = await resolveLocale($)
    await $.command.register({
      name: 'chess',
      description: stringsFor(locale).commandDescription,
      argumentHint: `[${USAGE}]`,
    })
    const account = (await $.store.get('account')) as Account | undefined
    const stats = (await $.store.get('stats')) as Stats | undefined
    const size = asSize(await $.store.get('size'))
    const boardTheme = asTheme(await $.store.get('boardTheme'))
    await update($, view, v => ({ ...v, account: account ?? undefined, stats: stats ?? v.stats, size, boardTheme, locale }))
    return next(e)
  })

  on('command.run', { command: 'chess' }, async ($, e) => {
    const args = e.args.trim().split(/\s+/).filter(Boolean)
    const t = await tr($)
    switch (args[0]?.toLowerCase()) {
      case undefined:
        await openPane($, true)
        return { text: t.paneOpened }
      case 'next':
        await openPane($)
        await nextPuzzle($)
        return { text: t.newPuzzle }
      case 'login':
        if (args[1]) {
          return { text: t.noTokenInCommand }
        }
        await update($, view, v => ({ ...v, isLoginOpen: true, loginError: undefined }))
        await openPane($, true)
        return { text: t.pasteToken }
      case 'logout':
        await logout($)
        return { text: t.loggedOut }
      case 'auto': {
        const isOn = args[1] !== 'off'
        await $.store.set('autoOpen', isOn)
        return { text: isOn ? t.autoOn : t.autoOff }
      }
      case 'size': {
        const size = asSize(args[1])
        if (!size) return { text: t.usage('size small|medium|large') }
        await setSize($, size)
        return { text: t.sizeSet(size) }
      }
      case 'theme': {
        const boardTheme = asTheme(args[1])
        if (!boardTheme) return { text: t.usage('theme auto|dark|light') }
        await $.store.set('boardTheme', boardTheme)
        await update($, view, v => ({ ...v, boardTheme }))
        return { text: t.themeSet(boardTheme) }
      }
      case 'lang': {
        const lang = args[1]?.toLowerCase()
        if (lang !== 'auto' && !asLocale(lang)) return { text: t.usage(`lang auto|${LOCALES.join('|')}`) }
        if (lang === 'auto') await $.store.delete('lang')
        else await $.store.set('lang', lang)
        const locale = await resolveLocale($)
        await update($, view, v => ({ ...v, locale }))
        return { text: stringsFor(locale).langSet(locale) }
      }
      default:
        return { text: t.usage(`[${USAGE}]`) }
    }
  })

  on('turn.start', async ($, e, next) => {
    await update($, view, v => ({ ...v, isClaudeWorking: true }))
    if (await isAutoOpen($)) void openPane($).catch(() => undefined)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    // A subagent's turn ending is not Claude being done.
    if (e.agentId) return result
    const { game } = await update($, view, v => ({ ...v, isClaudeWorking: false }))
    const panes = await $.ui.panes()
    if (!panes.some(p => p.id === PANE)) return result
    if (isStarted(game)) {
      const t = await tr($)
      $.ui.toast(settings.autoClose ? t.claudeDoneFinish : t.claudeDone)
    } else if (settings.autoClose) {
      await $.ui.close({ id: PANE })
    }
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button, Link } = els
    const Input = 'Input' in els ? els.Input : undefined
    const v = await read($, view)
    const g = v.game
    const t = stringsFor(v.locale)

    const accountLine = (
      <Box flexDirection="row" gap={1}>
        <Text dimColor>
          {v.account ? `👤 ${v.account.username}${v.account.rating ? ` (${v.account.rating})` : ''}` : t.anonymous}
          {` · ${v.stats.solved}✓ ${v.stats.failed}✗ · ${t.streak(v.stats.streak)}`}
        </Text>
        {v.account ? (
          <Button key="logout" plain dimColor onPress={() => void logout($)}>{t.logout}</Button>
        ) : (
          <Button key="login" plain dimColor onPress={() => void update($, view, x => ({ ...x, isLoginOpen: true, loginError: undefined }))}>
            {t.login}
          </Button>
        )}
        <Button key="size-down" plain dimColor onPress={() => void stepSize($, -1)}>−</Button>
        <Button key="size-up" plain dimColor onPress={() => void stepSize($, 1)}>+</Button>
      </Box>
    )

    if (v.isLoginOpen) {
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>{t.connectTitle}</Text>
          <Text>{t.connectStep1}</Text>
          <Link href={TOKEN_URL} label={t.createToken} />
          {Input ? (
            <Box flexDirection="column">
              <Text>{t.connectStep2}</Text>
              <Input key="token" placeholder="lip_…" autoFocus onSubmit={value => void login($, value)} />
            </Box>
          ) : (
            <Text dimColor>{t.noInput}</Text>
          )}
          {v.loginError && <Text color="error">{v.loginError}</Text>}
          {v.notice && <Text dimColor>{v.notice}</Text>}
          <Text dimColor>{t.tokenStays}</Text>
          <Button key="cancel-login" onPress={() => void update($, view, x => ({ ...x, isLoginOpen: false }))}>{t.cancel}</Button>
        </Box>
      )
    }

    if (!g) {
      return (
        <Box flexDirection="column">
          <Text dimColor>{v.isLoading ? t.loadingPuzzle : t.noPuzzle}</Text>
          {!v.isLoading && <Button key="load" onPress={() => void loadPuzzle($)}>{t.loadPuzzle}</Button>}
          {accountLine}
        </Box>
      )
    }

    const pos = parseFen(g.fen)
    const colors = await paletteFor($, v.boardTheme ?? settings.boardTheme)
    const { width, height } = SQUARE[v.size ?? settings.size]
    const ranks = g.player === 'w' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
    const files = g.player === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]
    const last = g.lastMove ? [g.lastMove.slice(0, 2), g.lastMove.slice(2, 4)] : []
    const middle = Math.floor(height / 2)
    // The text of one square: the glyph centered on its middle row.
    const cellText = (glyph: string) =>
      Array.from({ length: height }, (_, row) => {
        if (row !== middle) return ' '.repeat(width)
        const left = Math.floor((width - 1) / 2)
        return ' '.repeat(left) + glyph + ' '.repeat(width - 1 - left)
      }).join('\n')
    const square = (index: number) => {
      const name = sqName(index)
      const isLight = (index % 8 + Math.floor(index / 8)) % 2 === 1
      const bg =
        g.selected === name ? colors.selected
          : g.hint === name ? colors.hint
          : last.includes(name) ? (isLight ? colors.lastLight : colors.lastDark)
          : isLight ? colors.light : colors.dark
      const piece = pos.board[index] ?? ''
      const glyph = piece === '' ? ' ' : settings.letters ? piece.toUpperCase() : GLYPHS[piece.toLowerCase()] ?? piece
      return (
        <Button key={`sq-${name}`} plain onPress={() => void clickSquare($, index)}>
          <Text backgroundColor={bg} color={sideOf(piece) === 'w' ? colors.white : colors.black} bold>
            {cellText(glyph)}
          </Text>
        </Button>
      )
    }
    const rankLabel = (r: number) =>
      Array.from({ length: height }, (_, row) => (row === middle ? `${r + 1} ` : '  ')).join('\n')
    const fileLabels = '  ' + files.map(f => cellText('abcdefgh'.charAt(f)).split('\n')[middle]).join('')
    const puzzleUrl = g.puzzle.source === 'lichess' ? `${LICHESS}/training/${g.puzzle.id}` : undefined
    const side = t.side(g.player === 'w')

    return (
      <Box flexDirection="column">
        <Text dimColor>
          {g.puzzle.source === 'lichess' ? `#${g.puzzle.id}` : t.offlineTag}
          {g.puzzle.rating ? ` · ★${g.puzzle.rating}` : ''}
          {` · ${side}`}
          {g.puzzle.themes.length ? ` · ${g.puzzle.themes.slice(0, 2).join(', ')}` : ''}
        </Text>
        {ranks.map(r => (
          <Box key={`rank-${r}`} flexDirection="row">
            <Text dimColor>{rankLabel(r)}</Text>
            {files.map(f => square(r * 8 + f))}
          </Box>
        ))}
        <Text dimColor>{fileLabels}</Text>
        {g.message && (
          <Text color={g.status === 'solved' ? 'success' : g.message.startsWith('✗') ? 'error' : undefined}>{g.message}</Text>
        )}
        {v.isLoading ? <Text dimColor>{t.loading}</Text> : v.notice ? <Text dimColor>{v.notice}</Text> : null}
        {Input && g.status === 'playing' && (
          <Input key={`move-${g.puzzle.id}`} placeholder={t.movePlaceholder} onSubmit={value => void changeGame($, x => play(x, value, t))} />
        )}
        <Box flexDirection="row" gap={1}>
          {g.status === 'playing' && (
            <Button key="hint" hotkey="h" onPress={() => void changeGame($, x => hint(x, t))}>{t.hintButton}</Button>
          )}
          {g.status === 'playing' && (
            <Button key="reveal" hotkey="s" onPress={() => void changeGame($, x => reveal(x, t))}>{t.solutionButton}</Button>
          )}
          <Button key="next" hotkey="n" variant={g.status === 'playing' ? undefined : 'primary'} onPress={() => void nextPuzzle($)}>
            {t.next}
          </Button>
          {puzzleUrl && <Link href={puzzleUrl} label="Lichess ↗" />}
        </Box>
        {accountLine}
      </Box>
    )
  })
}
