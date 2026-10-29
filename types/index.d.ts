export type PuzzleSource = 'lichess' | 'offline'

export type PuzzleData = {
  id: string
  rating?: number
  themes: string[]
  /** The position the solver plays from. */
  fen: string
  /** The opponent's move that led to it, as UCI. */
  lastMove?: string
  /** The line, as UCI: the solver's move, the reply, the solver's move... */
  solution: string[]
  source: PuzzleSource
}

export type PuzzleStatus = 'playing' | 'solved' | 'revealed'

export type Game = {
  puzzle: PuzzleData
  fen: string
  /** How many moves of the solution have been played. */
  ply: number
  player: 'w' | 'b'
  lastMove?: string
  selected?: string
  hint?: string
  status: PuzzleStatus
  hadMistake: boolean
  usedHelp: boolean
  message?: string
  /** SAN of the moves played since the puzzle started. */
  played: string[]
  isReported: boolean
}

export type Account = { username: string; rating?: number }

export type Stats = { solved: number; failed: number; streak: number }

export type BoardSize = 'small' | 'medium' | 'large'
export type BoardTheme = 'auto' | 'dark' | 'light'
export type Locale = 'en' | 'fr'

export type View = {
  game?: Game
  isLoading: boolean
  notice?: string
  account?: Account
  isLoginOpen: boolean
  loginError?: string
  stats: Stats
  /** Chosen with /chess size or the − / + buttons; the setting otherwise. */
  size?: BoardSize
  /** Chosen with /chess theme; the setting otherwise. */
  boardTheme?: BoardTheme
  /** /chess lang, the setting, Claude Code's language, then the system locale; English otherwise. */
  locale?: Locale
  /** Claude is running a turn: the pane waits for it before closing. */
  isClaudeWorking?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'lichess-puzzles': { view: View }
  }
}
