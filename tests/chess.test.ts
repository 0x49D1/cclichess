import { describe, expect, test } from 'claude-code/testing'

import { START_FEN, isCheckmate, legalMoves, makeMove, parseFen, parseMove, toFen, toSan } from '../hooks/chess'
import { pickLocale, say, stringsFor } from '../hooks/i18n'
import { OFFLINE, fromLichess, hint, newGame, play, reply, reveal } from '../hooks/puzzle'

const perft = (fen: string, depth: number): number => {
  const walk = (p: ReturnType<typeof parseFen>, d: number): number =>
    d === 0 ? 1 : legalMoves(p).reduce((n, m) => n + walk(makeMove(p, m), d - 1), 0)
  return walk(parseFen(fen), depth)
}

describe('chess rules', () => {
  test('perft from the start', () => {
    expect(perft(START_FEN, 1)).toBe(20)
    expect(perft(START_FEN, 2)).toBe(400)
    expect(perft(START_FEN, 3)).toBe(8902)
  })

  test('perft on kiwipete (castling, en passant, promotions)', () => {
    const kiwipete = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'
    expect(perft(kiwipete, 1)).toBe(48)
    expect(perft(kiwipete, 2)).toBe(2039)
  })

  test('SAN and UCI, English and French', () => {
    const p = parseFen(START_FEN)
    expect(toSan(p, parseMove(p, 'g1f3')!)).toBe('Nf3')
    expect(toSan(p, parseMove(p, 'Cf3')!)).toBe('Nf3')
    expect(toSan(p, parseMove(p, 'e4')!)).toBe('e4')
    expect(parseMove(p, 'e5')).toBeUndefined()
  })

  test('FEN round trip', () => {
    const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'
    expect(toFen(parseFen(fen))).toBe(fen)
  })
})

describe('puzzles', () => {
  test('every offline puzzle plays through its solution', () => {
    for (const puzzle of OFFLINE) {
      let g = newGame(puzzle)
      while (g.status === 'playing') {
        g = play(g, puzzle.solution[g.ply]!)
        g = reply(g)
      }
      expect(g.status).toBe('solved')
      expect(isCheckmate(parseFen(g.fen))).toBe(true)
    }
  })

  test('a Lichess answer is replayed to the puzzle position', () => {
    const p = fromLichess({
      game: { pgn: 'e4 e5 Bc4 Nc6 Qf3 d6' },
      puzzle: { id: 'abc12', rating: 900, themes: ['mateIn1'], solution: ['f3f7'], initialPly: 5 },
    })
    expect(p.lastMove).toBe('d7d6')
    expect(parseFen(p.fen).turn).toBe('w')
    const g = play(newGame(p), 'Qxf7#')
    expect(g.status).toBe('solved')
  })

  test('a wrong move is refused and remembered, the reply comes after a right one', () => {
    const deflect = OFFLINE.find(p => p.id === 'off-deflect')!
    let g = play(newGame(deflect), 'Qe7')
    expect(g.hadMistake).toBe(true)
    expect(g.ply).toBe(0)
    g = play(g, 'Qe8+')
    expect(g.ply).toBe(1)
    g = reply(g)
    expect(g.played).toEqual(['Qe8+', 'Rxe8'])
    g = play(g, 'Rxe8#')
    expect(g.status).toBe('solved')
  })

  test('hint and reveal', () => {
    const g = hint(newGame(OFFLINE[0]!))
    expect(g.hint).toBe('d1')
    expect(g.usedHelp).toBe(true)
    const r = reveal(newGame(OFFLINE.find(p => p.id === 'off-deflect')!))
    expect(r.status).toBe('revealed')
    expect(say(stringsFor('en'), r.message!)).toBe('Solution: Qe8+ Rxe8 Rxe8#')
  })

  test('messages are put into words in either language', () => {
    const g = hint(newGame(OFFLINE[0]!))
    expect(say(stringsFor('en'), g.message!)).toBe('Hint: move a rook on d1.')
    expect(say(stringsFor('fr'), g.message!)).toBe('Indice : joue une tour en d1.')
    expect(say(stringsFor('fr'), play(g, 'Td8#').message!)).toBe("Résolu avec de l'aide (Rd8#).")
  })
})

test('the language: /chess lang, the option, Claude Code’s setting, then the locale; English otherwise', () => {
  expect(pickLocale([undefined, 'auto', undefined, undefined, undefined, 'fr_FR.UTF-8'])).toBe('fr')
  expect(pickLocale([undefined, 'auto', 'Français', 'en_US.UTF-8'])).toBe('fr')
  expect(pickLocale([undefined, 'en', 'french', 'fr_FR.UTF-8'])).toBe('en')
  expect(pickLocale(['fr', 'en'])).toBe('fr')
  expect(pickLocale([undefined, undefined, 'C', 'de_DE.UTF-8'])).toBe('en')
  expect(pickLocale([])).toBe('en')
})
