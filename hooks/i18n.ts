import type { Locale, Phrase } from '../types'

export const LOCALES: Locale[] = ['en', 'fr']

const en = {
  side: (color: string): string => (color === 'w' ? 'White' : 'Black'),
  // Puzzle play.
  yourMove: (side: string) => `Your move, playing ${side}.`,
  illegal: (text: string) => `Illegal move: ${text}`,
  wrong: (san: string) => `✗ ${san} is not the right move. Try again!`,
  good: (san: string) => `✓ ${san} — well played!`,
  solvedWithHelp: (san: string) => `Solved with help (${san}).`,
  solved: (san: string) => `🎉 Solved! ${san}`,
  unreadable: 'Unreadable Lichess solution, puzzle abandoned.',
  replies: (san: string) => `Opponent plays ${san}. Your turn!`,
  piece: (p: string): string => ({ p: 'a pawn', n: 'a knight', b: 'a bishop', r: 'a rook', q: 'the queen', k: 'the king' })[p] ?? 'the piece',
  hint: (piece: string, square: string) => `Hint: move ${piece} on ${square}.`,
  solution: (line: string) => `Solution: ${line}`,
  // Lichess.
  tokenRefused: 'token refused, sign in again',
  unexpectedPuzzle: 'unexpected Lichess answer',
  cannotReplay: (id: string) => `cannot replay the game of puzzle ${id}`,
  offline: (why: string) => `Lichess unreachable (${why}): offline puzzle.`,
  ratingDiff: (diff: string) => `Puzzle rating ${diff}`,
  notSent: (why: string) => `Result not sent to Lichess (${why}).`,
  checkingToken: 'Checking the token…',
  invalidToken: 'invalid token',
  unexpectedAnswer: 'unexpected answer',
  signedIn: (name: string) => `Signed in as ${name}.`,
  signInFailed: (why: string) => `Cannot sign in: ${why}`,
  signedOut: 'Signed out: anonymous mode.',
  // /chess.
  commandDescription: 'Lichess chess puzzles: open the pane, next, login, logout, size, theme, auto, lang',
  paneOpened: 'Puzzle pane opened.',
  newPuzzle: 'New puzzle.',
  noTokenInCommand: "Don't paste your token in a command (it would end up in the conversation): use the field in the pane.",
  pasteToken: 'Paste your Lichess token in the puzzle pane.',
  loggedOut: 'Lichess account signed out, puzzles in anonymous mode.',
  autoOn: 'The pane will open while Claude works.',
  autoOff: 'Automatic opening turned off.',
  sizeSet: (size: string) => `Board size: ${size}.`,
  themeSet: (theme: string) => `Board colors: ${theme}.`,
  langSet: (lang: string) => `Language: ${lang}.`,
  usage: (args: string) => `Usage: /chess ${args}`,
  claudeDone: 'Claude is done ✓',
  claudeDoneFinish: 'Claude is done ✓ Finish your puzzle, the pane will close afterwards.',
  // The pane.
  anonymous: 'Anonymous',
  streak: (n: number) => `streak ${n}`,
  logout: 'sign out',
  login: 'sign in',
  connectTitle: 'Connect your Lichess account',
  connectStep1: '1. Create a personal token (puzzle scopes):',
  createToken: 'lichess.org → create a token',
  connectStep2: '2. Paste it here, then Enter:',
  noInput: 'This client has no text field: sign in from the terminal or the desktop app.',
  tokenStays: 'The token stays on your machine, never in the conversation.',
  cancel: 'Cancel',
  loadingPuzzle: 'Loading puzzle…',
  noPuzzle: 'No puzzle loaded.',
  loadPuzzle: 'Load a puzzle',
  offlineTag: 'offline',
  loading: 'Loading…',
  movePlaceholder: 'Move: e2e4 or Nf3',
  hintButton: 'Hint',
  solutionButton: 'Solution',
  next: 'Next',
}

export type Strings = typeof en

const fr: Strings = {
  side: color => (color === 'w' ? 'Blancs' : 'Noirs'),
  yourMove: side => `À toi de jouer avec les ${side}.`,
  illegal: text => `Coup illégal : ${text}`,
  wrong: san => `✗ ${san} n'est pas le bon coup. Réessaie !`,
  good: san => `✓ ${san} — bien joué !`,
  solvedWithHelp: san => `Résolu avec de l'aide (${san}).`,
  solved: san => `🎉 Résolu ! ${san}`,
  unreadable: 'Solution Lichess illisible, puzzle abandonné.',
  replies: san => `L'adversaire répond ${san}. À toi !`,
  piece: p => ({ p: 'un pion', n: 'un cavalier', b: 'un fou', r: 'une tour', q: 'la dame', k: 'le roi' })[p] ?? 'la pièce',
  hint: (piece, square) => `Indice : joue ${piece} en ${square}.`,
  solution: line => `Solution : ${line}`,
  tokenRefused: 'token refusé, reconnecte-toi',
  unexpectedPuzzle: 'réponse Lichess inattendue',
  cannotReplay: id => `impossible de rejouer la partie du puzzle ${id}`,
  offline: why => `Lichess injoignable (${why}) : puzzle hors-ligne.`,
  ratingDiff: diff => `Classement puzzle ${diff}`,
  notSent: why => `Résultat non envoyé à Lichess (${why}).`,
  checkingToken: 'Vérification du token…',
  invalidToken: 'token invalide',
  unexpectedAnswer: 'réponse inattendue',
  signedIn: name => `Connecté en tant que ${name}.`,
  signInFailed: why => `Connexion impossible : ${why}`,
  signedOut: 'Déconnecté : mode anonyme.',
  commandDescription: "Puzzles d'échecs Lichess : ouvrir le panneau, next, login, logout, size, theme, auto, lang",
  paneOpened: 'Panneau puzzle ouvert.',
  newPuzzle: 'Nouveau puzzle.',
  noTokenInCommand: 'Ne colle pas ton token dans une commande (il finirait dans la conversation) : utilise le champ du panneau.',
  pasteToken: 'Colle ton token Lichess dans le panneau puzzle.',
  loggedOut: 'Compte Lichess déconnecté, puzzles en mode anonyme.',
  autoOn: 'Le panneau s’ouvrira quand Claude travaille.',
  autoOff: 'Ouverture automatique désactivée.',
  sizeSet: size => `Plateau en taille ${size}.`,
  themeSet: theme => `Couleurs du plateau : ${theme}.`,
  langSet: lang => `Langue : ${lang}.`,
  usage: args => `Usage : /chess ${args}`,
  claudeDone: 'Claude a terminé ✓',
  claudeDoneFinish: 'Claude a terminé ✓ Finis ton puzzle, le panneau se fermera ensuite.',
  anonymous: 'Anonyme',
  streak: n => `série ${n}`,
  logout: 'déconnexion',
  login: 'se connecter',
  connectTitle: 'Connecter ton compte Lichess',
  connectStep1: '1. Crée un token personnel (droits puzzle) :',
  createToken: 'lichess.org → créer un token',
  connectStep2: '2. Colle-le ici puis Entrée :',
  noInput: 'Ce client n’a pas de champ texte : connecte-toi depuis le terminal ou l’app desktop.',
  tokenStays: 'Le token reste sur ta machine, jamais dans la conversation.',
  cancel: 'Annuler',
  loadingPuzzle: 'Chargement du puzzle…',
  noPuzzle: 'Aucun puzzle chargé.',
  loadPuzzle: 'Charger un puzzle',
  offlineTag: 'hors-ligne',
  loading: 'Chargement…',
  movePlaceholder: 'Coup : e2e4 ou Cf3/Nf3',
  hintButton: 'Indice',
  solutionButton: 'Solution',
  next: 'Suivant',
}

const STRINGS: Record<Locale, Strings> = { en, fr }

export const stringsFor = (locale: Locale | undefined): Strings => STRINGS[locale ?? 'en']

type Arg = string | number | Phrase

/** A text kept as its key and values, so it is put into words in the language of the moment it is shown. */
export const phrase = (id: keyof Strings, ...args: Arg[]): Phrase => (args.length ? { id, args } : { id })

export function say(t: Strings, p: Phrase): string {
  // Text kept by 0.3, when the session's state outlives an update.
  if (typeof p === 'string') return p
  const entry = t[p.id as keyof Strings]
  const args = (p.args ?? []).map(a => (typeof a === 'object' ? say(t, a) : String(a)))
  return typeof entry === 'function' ? (entry as (...a: string[]) => string)(...args) : typeof entry === 'string' ? entry : p.id
}

/** An error whose message is a phrase. */
export class PhraseError extends Error {
  constructor(readonly phrase: Phrase) {
    super(say(en, phrase))
  }
}

/** Why something failed, as a phrase when we wrote the reason. */
export const reason = (err: unknown): Arg =>
  err instanceof PhraseError ? err.phrase : err instanceof Error ? err.message : String(err)

export const asLocale = (x: unknown): Locale | undefined => (LOCALES.includes(x as Locale) ? (x as Locale) : undefined)

/**
 * The first hint that names a language: the mod's choice, Claude Code's `language` setting, then the
 * locale variables. English when none names one we have.
 */
export function pickLocale(hints: readonly (string | undefined)[]): Locale {
  for (const hint of hints) {
    const value = hint?.trim().toLowerCase()
    if (!value || value === 'auto' || value === 'c' || value === 'posix') continue
    return /^(fr|fran[cç])/.test(value) ? 'fr' : 'en'
  }
  return 'en'
}
