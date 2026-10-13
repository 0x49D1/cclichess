// Minimal chess rules: FEN, legal moves, SAN / UCI, check and mate.
// Squares are 0..63, a1 = 0, h8 = 63.

export type Side = 'w' | 'b'
export type Position = {
  board: string[]
  turn: Side
  castling: string
  ep: number
  half: number
  full: number
}
export type Move = { from: number; to: number; promo?: string }

const FILES = 'abcdefgh'
const KNIGHT: [number, number][] = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
const KING: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
const ROOK: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const BISHOP: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]]

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export const fileOf = (s: number) => s % 8
export const rankOf = (s: number) => Math.floor(s / 8)
export const sqName = (s: number) => FILES.charAt(fileOf(s)) + (rankOf(s) + 1)
export const sqIndex = (name: string) => FILES.indexOf(name.charAt(0)) + (Number(name.charAt(1)) - 1) * 8
const at = (f: number, r: number) => (f < 0 || f > 7 || r < 0 || r > 7 ? -1 : r * 8 + f)
export const sideOf = (p: string): Side | undefined =>
  p === '' ? undefined : p === p.toUpperCase() ? 'w' : 'b'
const other = (s: Side): Side => (s === 'w' ? 'b' : 'w')

export function parseFen(fen: string): Position {
  const [placement = '', turn = 'w', castling = '-', ep = '-', half = '0', full = '1'] = fen.trim().split(/\s+/)
  const board: string[] = new Array(64).fill('')
  const rows = placement.split('/')
  if (rows.length !== 8) throw new Error(`FEN invalide: ${fen}`)
  rows.forEach((row, i) => {
    let f = 0
    for (const c of row) {
      if (/\d/.test(c)) f += Number(c)
      else board[at(f++, 7 - i)] = c
    }
  })
  return {
    board,
    turn: turn === 'b' ? 'b' : 'w',
    castling: castling === '-' ? '' : castling,
    ep: ep === '-' ? -1 : sqIndex(ep),
    half: Number(half) || 0,
    full: Number(full) || 1,
  }
}

export function toFen(p: Position): string {
  const rows: string[] = []
  for (let r = 7; r >= 0; r--) {
    let row = ''
    let empty = 0
    for (let f = 0; f < 8; f++) {
      const c = (p.board[at(f, r)] ?? '')
      if (c === '') empty++
      else {
        if (empty) row += empty
        empty = 0
        row += c
      }
    }
    rows.push(row + (empty ? empty : ''))
  }
  return `${rows.join('/')} ${p.turn} ${p.castling || '-'} ${p.ep < 0 ? '-' : sqName(p.ep)} ${p.half} ${p.full}`
}

export function isAttacked(p: Position, s: number, by: Side): boolean {
  const f = fileOf(s)
  const r = rankOf(s)
  const piece = (c: string) => (by === 'w' ? c.toUpperCase() : c)
  const dir = by === 'w' ? 1 : -1
  for (const df of [-1, 1]) {
    const t = at(f + df, r - dir)
    if (t >= 0 && (p.board[t] ?? '') === piece('p')) return true
  }
  for (const [df, dr] of KNIGHT) {
    const t = at(f + df, r + dr)
    if (t >= 0 && (p.board[t] ?? '') === piece('n')) return true
  }
  for (const [df, dr] of KING) {
    const t = at(f + df, r + dr)
    if (t >= 0 && (p.board[t] ?? '') === piece('k')) return true
  }
  const slide = (dirs: [number, number][], kinds: string[]) => {
    for (const [df, dr] of dirs) {
      for (let k = 1; ; k++) {
        const t = at(f + df * k, r + dr * k)
        if (t < 0) break
        const c = (p.board[t] ?? '')
        if (c === '') continue
        if (kinds.some(x => c === piece(x))) return true
        break
      }
    }
    return false
  }
  return slide(ROOK, ['r', 'q']) || slide(BISHOP, ['b', 'q'])
}

const kingSquare = (p: Position, side: Side) => p.board.indexOf(side === 'w' ? 'K' : 'k')
export const inCheck = (p: Position, side: Side = p.turn) => {
  const k = kingSquare(p, side)
  return k >= 0 && isAttacked(p, k, other(side))
}

function pseudoMoves(p: Position): Move[] {
  const moves: Move[] = []
  const us = p.turn
  const them = other(us)
  for (let s = 0; s < 64; s++) {
    const c = (p.board[s] ?? '')
    if (sideOf(c) !== us) continue
    const kind = c.toLowerCase()
    const f = fileOf(s)
    const r = rankOf(s)
    const add = (to: number) => {
      if (kind === 'p' && (rankOf(to) === 7 || rankOf(to) === 0)) {
        for (const promo of ['q', 'r', 'b', 'n']) moves.push({ from: s, to, promo })
      } else moves.push({ from: s, to })
    }
    if (kind === 'p') {
      const dir = us === 'w' ? 1 : -1
      const one = at(f, r + dir)
      if (one >= 0 && (p.board[one] ?? '') === '') {
        add(one)
        const two = at(f, r + 2 * dir)
        if ((us === 'w' ? r === 1 : r === 6) && (p.board[two] ?? '') === '') add(two)
      }
      for (const df of [-1, 1]) {
        const t = at(f + df, r + dir)
        if (t < 0) continue
        if (sideOf((p.board[t] ?? '')) === them || t === p.ep) add(t)
      }
    } else if (kind === 'n' || kind === 'k') {
      for (const [df, dr] of kind === 'n' ? KNIGHT : KING) {
        const t = at(f + df, r + dr)
        if (t >= 0 && sideOf((p.board[t] ?? '')) !== us) add(t)
      }
    } else {
      const dirs: [number, number][] = kind === 'r' ? ROOK : kind === 'b' ? BISHOP : [...ROOK, ...BISHOP]
      for (const [df, dr] of dirs) {
        for (let k = 1; ; k++) {
          const t = at(f + df * k, r + dr * k)
          if (t < 0) break
          const side = sideOf((p.board[t] ?? ''))
          if (side === us) break
          add(t)
          if (side) break
        }
      }
    }
  }
  // Castling
  const home = us === 'w' ? 0 : 56
  const [K, Q] = us === 'w' ? ['K', 'Q'] : ['k', 'q']
  const king = us === 'w' ? 'K' : 'k'
  const rook = us === 'w' ? 'R' : 'r'
  if ((p.board[home + 4] ?? '') === king && !inCheck(p, us)) {
    if (
      p.castling.includes(K) && (p.board[home + 7] ?? '') === rook &&
      (p.board[home + 5] ?? '') === '' && (p.board[home + 6] ?? '') === '' &&
      !isAttacked(p, home + 5, them) && !isAttacked(p, home + 6, them)
    ) moves.push({ from: home + 4, to: home + 6 })
    if (
      p.castling.includes(Q) && (p.board[home] ?? '') === rook &&
      (p.board[home + 1] ?? '') === '' && (p.board[home + 2] ?? '') === '' && (p.board[home + 3] ?? '') === '' &&
      !isAttacked(p, home + 3, them) && !isAttacked(p, home + 2, them)
    ) moves.push({ from: home + 4, to: home + 2 })
  }
  return moves
}

export function makeMove(p: Position, m: Move): Position {
  const board = p.board.slice()
  const piece = (board[m.from] ?? '')
  const kind = piece.toLowerCase()
  const captured = (board[m.to] ?? '')
  board[m.to] = m.promo ? (p.turn === 'w' ? m.promo.toUpperCase() : m.promo.toLowerCase()) : piece
  board[m.from] = ''
  if (kind === 'p' && m.to === p.ep) board[at(fileOf(m.to), rankOf(m.from))] = ''
  if (kind === 'k' && Math.abs(m.to - m.from) === 2) {
    const kingSide = m.to > m.from
    const rookFrom = kingSide ? m.from + 3 : m.from - 4
    const rookTo = kingSide ? m.from + 1 : m.from - 1
    board[rookTo] = board[rookFrom] ?? ''
    board[rookFrom] = ''
  }
  let castling = p.castling
  const strip = (chars: string) => {
    for (const c of chars) castling = castling.replace(c, '')
  }
  if (piece === 'K') strip('KQ')
  if (piece === 'k') strip('kq')
  for (const s of [m.from, m.to]) {
    if (s === 0) strip('Q')
    if (s === 7) strip('K')
    if (s === 56) strip('q')
    if (s === 63) strip('k')
  }
  return {
    board,
    turn: other(p.turn),
    castling,
    ep: kind === 'p' && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : -1,
    half: kind === 'p' || captured ? 0 : p.half + 1,
    full: p.turn === 'b' ? p.full + 1 : p.full,
  }
}

export function legalMoves(p: Position): Move[] {
  return pseudoMoves(p).filter(m => !inCheck(makeMove(p, m), p.turn))
}

export const isCheckmate = (p: Position) => inCheck(p) && legalMoves(p).length === 0

export const toUci = (m: Move) => sqName(m.from) + sqName(m.to) + (m.promo ?? '')

export function toSan(p: Position, m: Move): string {
  const piece = (p.board[m.from] ?? '')
  const kind = piece.toLowerCase()
  let san: string
  if (kind === 'k' && Math.abs(m.to - m.from) === 2) {
    san = m.to > m.from ? 'O-O' : 'O-O-O'
  } else {
    const capture = (p.board[m.to] ?? '') !== '' || (kind === 'p' && m.to === p.ep)
    if (kind === 'p') {
      san = (capture ? FILES.charAt(fileOf(m.from)) + 'x' : '') + sqName(m.to)
      if (m.promo) san += '=' + m.promo.toUpperCase()
    } else {
      const rivals = legalMoves(p).filter(
        o => o.to === m.to && o.from !== m.from && (p.board[o.from] ?? '') === piece,
      )
      let dis = ''
      if (rivals.length) {
        if (!rivals.some(o => fileOf(o.from) === fileOf(m.from))) dis = FILES.charAt(fileOf(m.from))
        else if (!rivals.some(o => rankOf(o.from) === rankOf(m.from))) dis = String(rankOf(m.from) + 1)
        else dis = sqName(m.from)
      }
      san = kind.toUpperCase() + dis + (capture ? 'x' : '') + sqName(m.to)
    }
  }
  const after = makeMove(p, m)
  if (isCheckmate(after)) san += '#'
  else if (inCheck(after)) san += '+'
  return san
}

const looseSan = (s: string) =>
  s.replace(/[+#!?x=\s]/g, '').replace(/0/g, 'O').replace(/^([a-h]\d)([QRBN])$/, '$1$2')

const FRENCH: Record<string, string> = { C: 'N', F: 'B', T: 'R', D: 'Q', R: 'K' }

/**
 * Reads a move typed as UCI (`e2e4`, `e7e8q`) or SAN (`Nf3`, `exd5`, `O-O`),
 * French piece letters too (`Cf3`, `Dxh7`) when the English reading fails.
 */
export function parseMove(p: Position, text: string): Move | undefined {
  const found = parseEnglish(p, text)
  if (found) return found
  const french = text.trim().replace(/^[CFTDR]/, c => FRENCH[c] ?? c).replace(/=([CFTD])$/, (_, c: string) => '=' + (FRENCH[c] ?? c))
  return french === text.trim() ? undefined : parseEnglish(p, french)
}

function parseEnglish(p: Position, text: string): Move | undefined {
  const t = text.trim()
  const legal = legalMoves(p)
  const uci = /^([a-h][1-8])([a-h][1-8])([qrbnQRBN]?)$/.exec(t)
  if (uci) {
    const from = sqIndex(uci[1] ?? '')
    const to = sqIndex(uci[2] ?? '')
    const promo = uci[3]?.toLowerCase() || undefined
    const found = legal.find(m => m.from === from && m.to === to && (m.promo ?? undefined) === (promo ?? (m.promo ? 'q' : undefined)))
    if (found) return found
  }
  const want = looseSan(t)
  if (!want) return undefined
  return legal.find(m => looseSan(toSan(p, m)) === want)
    // Accept a lowercase piece letter (`nf3`) when it cannot be a pawn move.
    ?? legal.find(m => looseSan(toSan(p, m)) === want.charAt(0).toUpperCase() + want.slice(1) && /^[nrqk]/.test(want))
}

export const sameMove = (a: Move, b: Move) =>
  a.from === b.from && a.to === b.to && (a.promo ?? '') === (b.promo ?? '')
