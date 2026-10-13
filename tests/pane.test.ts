import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'lichess-puzzles',
  component: 'Pane',
  requestId: 'lichess-puzzle',
  props: {
    title: '♞ Puzzle',
    isFocused: true,
    bodyColumns: 40,
    placement: 'inline' as 'dock' | 'inline',
    scroll: { offset: 0, bodyRows: 17 },
    view: {},
  },
} as const

const PUZZLE = JSON.stringify({
  game: { pgn: 'e4 e5 Bc4 Nc6 Qf3 d6' },
  puzzle: { id: 'abc12', rating: 900, themes: ['mateIn1'], solution: ['f3f7'], initialPly: 5 },
})

test('solve a Lichess puzzle by clicking, then sign in', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const calls: string[] = []
  on('http.fetch', async (_$, e) => {
    calls.push(`${e.init?.method ?? 'GET'} ${e.url} ${e.init?.headers?.Authorization ?? 'anon'}`)
    const ok = (text: string) => ({ value: { status: 200, ok: true, headers: {}, text } })
    if (e.url.includes('/api/puzzle/next')) return ok(PUZZLE)
    if (e.url.endsWith('/api/account')) return ok(JSON.stringify({ username: 'magnus', perfs: { puzzle: { rating: 2100 } } }))
    if (e.url.includes('/api/puzzle/batch')) return ok(JSON.stringify({ glicko: { rating: 2108.4 }, rounds: [{ id: 'abc12', win: true, ratingDiff: 8 }] }))
    return { value: { status: 404, ok: false, headers: {}, text: '' } }
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'load' })
  expect(await ui.find({ text: /#abc12/ })).toBeDefined()
  expect(calls[0]).toContain('anon')

  await ui.press({ key: 'sq-f3' })
  await ui.press({ key: 'sq-f7' })
  expect(await ui.find({ text: /Résolu/ })).toBeDefined()
  expect(await ui.find({ text: /1✓ 0✗ · série 1/ })).toBeDefined()
  // Anonymous: nothing is sent to Lichess.
  expect(calls.some(c => c.includes('batch'))).toBe(false)

  await ui.press({ key: 'login' })
  await ui.input({ key: 'token', text: 'lip_secret' })
  expect(await ui.find({ text: /magnus \(2100\)/ })).toBeDefined()

  await ui.press({ key: 'next' })
  await ui.input({ key: 'move-abc12', text: 'Dxf7' })
  expect(await ui.find({ text: /Résolu/ })).toBeDefined()
  expect(calls.some(c => c.startsWith('POST') && c.includes('batch') && c.includes('Bearer lip_secret'))).toBe(true)
  expect(await ui.find({ text: /magnus \(2108\)/ })).toBeDefined()
  await ui.unmount()
})

test('falls back to an offline puzzle, on every surface', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  on('http.fetch', async () => ({ value: { status: 503, ok: false, headers: {}, text: '' } }))
  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    if (await ui.find({ key: 'load' })) await ui.press({ key: 'load' })
    expect(await ui.find({ text: /hors-ligne/ })).toBeDefined()
    expect(await ui.find({ key: 'sq-e1' })).toBeDefined()
    await ui.unmount()
  }
})

test('board colors follow the theme and the size changes', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  on('http.fetch', async () => ({ value: { status: 503, ok: false, headers: {}, text: '' } }))
  let theme = 'dark'
  on('config.list', async () => ({ value: [{ key: 'theme', value: theme }] as never }))
  on('ui.panes', async () => ({ value: [] }))

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'load' })
  let drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('#55606d')
  expect(drawn).not.toContain('#b08660')

  await ui.press({ key: 'size-up' })
  drawn = JSON.stringify(await ui.drawn())
  // Large squares: three rows of five cells each.
  expect(drawn).toContain('     \\n')
  await ui.press({ key: 'size-down' })
  await ui.press({ key: 'size-down' })
  drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toMatch(/  ([a-h] ){8}/)
  expect(drawn).not.toContain('     \\n')
  await ui.unmount()

  theme = 'light'
  const light = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(JSON.stringify(await light.drawn())).toContain('#b08660')
  await light.unmount()
})
