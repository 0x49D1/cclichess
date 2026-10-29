import type { Game, PuzzleData } from '../types'
import {
  START_FEN, isCheckmate, legalMoves, makeMove, parseFen, parseMove, sqIndex, sqName, toFen, toSan, toUci,
} from './chess'
import { PhraseError, phrase } from './i18n'

/** Used when Lichess cannot be reached. */
export const OFFLINE: PuzzleData[] = [
  { id: 'off-backrank', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', solution: ['d1d8'], themes: ['mateIn1', 'backRankMate'], rating: 600, source: 'offline' },
  { id: 'off-smother', fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', solution: ['g5f7'], themes: ['mateIn1', 'smotheredMate'], rating: 800, source: 'offline' },
  { id: 'off-scholar', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4', solution: ['f3f7'], themes: ['mateIn1', 'opening'], rating: 500, source: 'offline' },
  { id: 'off-blackrank', fen: '3r2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', solution: ['d8d1'], themes: ['mateIn1', 'backRankMate'], rating: 600, source: 'offline' },
  { id: 'off-deflect', fen: 'r5k1/5ppp/8/8/8/8/4QPPP/4R1K1 w - - 0 1', solution: ['e2e8', 'a8e8', 'e1e8'], themes: ['mateIn2', 'sacrifice', 'backRankMate'], rating: 1100, source: 'offline' },
]

const stripPgn = (pgn: string) =>
  pgn
    .replace(/\{[^}]*\}/g, ' ')
    .split(/\s+/)
    .map(t => t.replace(/^\d+\.+/, ''))
    .filter(t => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t))

/** Turns the answer of /api/puzzle/next (or /daily) into a puzzle. */
export function fromLichess(json: unknown): PuzzleData {
  const { game, puzzle } = json as {
    game?: { pgn?: string }
    puzzle?: { id?: string; rating?: number; themes?: string[]; solution?: string[]; initialPly?: number }
  }
  if (!puzzle?.id || !puzzle.solution?.length) throw new PhraseError(phrase('unexpectedPuzzle'))
  const tokens = stripPgn(String(game?.pgn ?? ''))
  const initial = puzzle.initialPly ?? tokens.length - 1
  for (const count of [tokens.length, initial + 1, initial]) {
    let pos = parseFen(START_FEN)
    let last: string | undefined
    let ok = count <= tokens.length
    for (const token of tokens.slice(0, count)) {
      const move = ok ? parseMove(pos, token) : undefined
      if (!move) {
        ok = false
        break
      }
      last = toUci(move)
      pos = makeMove(pos, move)
    }
    if (ok && legalMoves(pos).some(m => toUci(m) === puzzle.solution![0])) {
      return {
        id: puzzle.id,
        rating: puzzle.rating,
        themes: puzzle.themes ?? [],
        fen: toFen(pos),
        lastMove: last,
        solution: puzzle.solution,
        source: 'lichess',
      }
    }
  }
  throw new PhraseError(phrase('cannotReplay', puzzle.id))
}

export function newGame(puzzle: PuzzleData): Game {
  return {
    puzzle,
    fen: puzzle.fen,
    ply: 0,
    player: parseFen(puzzle.fen).turn,
    lastMove: puzzle.lastMove,
    status: 'playing',
    hadMistake: false,
    usedHelp: false,
    played: [],
    isReported: false,
    message: phrase('yourMove', phrase('side', parseFen(puzzle.fen).turn)),
  }
}

/** The opponent still has to answer the solver's last move. */
export const awaitsReply = (g: Game) => g.status === 'playing' && parseFen(g.fen).turn !== g.player

/** Plays the solver's move, typed as UCI or SAN. */
export function play(game: Game, text: string): Game {
  if (game.status !== 'playing') return { ...game, selected: undefined }
  if (awaitsReply(game)) return game
  const pos = parseFen(game.fen)
  const move = parseMove(pos, text)
  if (!move) return { ...game, selected: undefined, message: phrase('illegal', text) }
  const san = toSan(pos, move)
  const after = makeMove(pos, move)
  const mate = isCheckmate(after)
  if (toUci(move) !== game.puzzle.solution[game.ply] && !mate) {
    return { ...game, selected: undefined, hadMistake: true, message: phrase('wrong', san) }
  }
  const next: Game = {
    ...game,
    fen: toFen(after),
    ply: game.ply + 1,
    lastMove: toUci(move),
    selected: undefined,
    hint: undefined,
    played: [...game.played, san],
    message: phrase('good', san),
  }
  if (mate || next.ply >= game.puzzle.solution.length) {
    return { ...next, status: 'solved', message: phrase(game.hadMistake || game.usedHelp ? 'solvedWithHelp' : 'solved', san) }
  }
  return next
}

/** Plays the opponent's answer from the solution. */
export function reply(game: Game): Game {
  if (!awaitsReply(game)) return game
  const pos = parseFen(game.fen)
  const uci = game.puzzle.solution[game.ply]
  const move = legalMoves(pos).find(m => toUci(m) === uci)
  if (!move) return { ...game, status: 'revealed', message: phrase('unreadable') }
  const san = toSan(pos, move)
  return {
    ...game,
    fen: toFen(makeMove(pos, move)),
    ply: game.ply + 1,
    lastMove: uci,
    played: [...game.played, san],
    message: phrase('replies', san),
  }
}

/** The move a click from one square to another stands for, promotion included. */
export function clickToUci(game: Game, from: number, to: number): string {
  const base = sqName(from) + sqName(to)
  const expected = game.puzzle.solution[game.ply] ?? ''
  if (expected.startsWith(base)) return expected
  const pos = parseFen(game.fen)
  const promotes = legalMoves(pos).some(m => m.from === from && m.to === to && m.promo)
  return promotes ? base + 'q' : base
}

export function hint(game: Game): Game {
  if (game.status !== 'playing' || awaitsReply(game)) return game
  const uci = game.puzzle.solution[game.ply]
  if (!uci) return game
  const pos = parseFen(game.fen)
  const piece = pos.board[sqIndex(uci.slice(0, 2))] ?? ''
  return {
    ...game,
    hint: uci.slice(0, 2),
    usedHelp: true,
    message: phrase('hint', phrase('piece', piece.toLowerCase()), uci.slice(0, 2)),
  }
}

/** Plays the rest of the solution and shows it. */
export function reveal(game: Game): Game {
  if (game.status !== 'playing') return game
  let g: Game = { ...game, usedHelp: true }
  const line: string[] = []
  while (g.ply < g.puzzle.solution.length) {
    const pos = parseFen(g.fen)
    const uci = g.puzzle.solution[g.ply]
    const move = legalMoves(pos).find(m => toUci(m) === uci)
    if (!move) break
    const san = toSan(pos, move)
    line.push(san)
    g = { ...g, fen: toFen(makeMove(pos, move)), ply: g.ply + 1, lastMove: uci, played: [...g.played, san] }
  }
  return { ...g, status: 'revealed', hint: undefined, selected: undefined, message: phrase('solution', line.join(' ')) }
}

/** Whether this puzzle counts as a win on Lichess: solved with no mistake and no help. */
export const isWin = (g: Game) => g.status === 'solved' && !g.hadMistake && !g.usedHelp

export function pickOffline(lastId?: string): PuzzleData {
  const pool = OFFLINE.filter(p => p.id !== lastId)
  return pool[Math.floor(Math.random() * pool.length)] ?? OFFLINE[0]!
}
