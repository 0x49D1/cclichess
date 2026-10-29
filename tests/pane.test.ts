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
  expect(await ui.find({ text: /Solved/ })).toBeDefined()
  expect(await ui.find({ text: /1✓ 0✗ · streak 1/ })).toBeDefined()
  // Anonymous: nothing is sent to Lichess.
  expect(calls.some(c => c.includes('batch'))).toBe(false)

  await ui.press({ key: 'login' })
  await ui.input({ key: 'token', text: 'lip_secret' })
  expect(await ui.find({ text: /magnus \(2100\)/ })).toBeDefined()

  await ui.press({ key: 'next' })
  await ui.input({ key: 'move-abc12', text: 'Dxf7' })
  expect(await ui.find({ text: /Solved/ })).toBeDefined()
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
    expect(await ui.find({ text: /offline/ })).toBeDefined()
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

test('the pane stays while a started puzzle runs, and closes once it and Claude are done', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on)
  on('http.fetch', async () => ({ value: { status: 503, ok: false, headers: {}, text: '' } }))
  on('ui.toast', async () => ({ value: undefined }))
  let isOpen = false
  on('ui.open', async () => {
    isOpen = true
    return { value: { isPlaced: true } as never }
  })
  on('ui.close', async () => {
    isOpen = false
    return { value: undefined }
  })
  on('ui.panes', async () => ({ value: (isOpen ? [{ id: 'lichess-puzzle' }] : []) as never }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }))
  const complete = { reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't' } as const

  // An untouched puzzle closes with Claude.
  await $.turn.start({ text: 'go', turnId: 't' })
  await clock.advance(0)
  expect(isOpen).toBe(true)
  await $.turn.complete(complete)
  expect(isOpen).toBe(false)

  // A started one stays, then closes after it ends.
  await $.turn.start({ text: 'go', turnId: 't' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'hint' })
  await $.turn.complete(complete)
  expect(isOpen).toBe(true)
  await ui.press({ key: 'reveal' })
  expect(isOpen).toBe(true)
  await clock.advance(3000)
  expect(isOpen).toBe(false)
  await ui.unmount()
})

test('a French locale speaks French, /chess lang switches to English', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  mock.env(on, { LANG: 'fr_FR.UTF-8' })
  on('http.fetch', async () => ({ value: { status: 503, ok: false, headers: {}, text: '' } }))
  on('ui.panes', async () => ({ value: [] }))
  on('ui.open', async () => ({ value: { isPlaced: true } as never }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('session.start', async (_$, e) => e)
  const run = (args: string) =>
    $.command.run({ command: 'chess', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

  // No choice made: the system locale wins over the English default.
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'load' })
  expect(await ui.find({ text: /hors-ligne/ })).toBeDefined()
  expect(await ui.find({ key: 'next' })).toMatchObject({ text: expect.stringContaining('Suivant') })
  expect(await ui.find({ text: /À toi de jouer/ })).toBeDefined()
  expect(await ui.find({ text: /Lichess injoignable/ })).toBeDefined()

  // A choice redraws the pane, messages already shown included; auto goes back to the locale.
  expect((await run('lang en')).text).toBe('Language: en.')
  expect(await ui.find({ key: 'next' })).toMatchObject({ text: expect.stringContaining('Next') })
  expect(await ui.find({ text: /Your move, playing/ })).toBeDefined()
  expect(await ui.find({ text: /Lichess unreachable \(HTTP 503\)/ })).toBeDefined()
  expect((await run('lang de')).text).toMatch(/^Usage: \/chess lang auto\|en\|fr/)
  expect((await run('lang auto')).text).toBe('Langue : fr.')
  await ui.unmount()
})
