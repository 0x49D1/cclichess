# cclichess

**English** · [Français](README.fr.md)

A Claude Code mod that shows **Lichess chess puzzles** in a small pane while Claude works on your prompt.

- **Anonymous** by default: random Lichess puzzles, stats kept locally.
- **Signed in** (optional): puzzles you have never seen, results sent to Lichess, your puzzle rating shows and moves.
- Offline: if lichess.org can't be reached, a small built-in set of puzzles takes over.

## Install

In a Claude Code session (terminal):

```
/plugin install lichess-puzzles --marketplace mrtnsk/cclichess
```

Answer `y` to add the marketplace, then pick the scope (user).

## Usage

The pane opens by itself when Claude starts a turn. When Claude is done:

- puzzle not started → the pane closes;
- puzzle started → it stays open, and closes a few seconds after the puzzle ends.

To play:

- **click** the piece, then the target square, or
- **type** the move in the field: `e2e4`, `Nf3`, `Cf3`, `Qxh7#`… (English or French notation)
- `h` hint · `s` solution · `n` next puzzle (when the pane has focus)

Commands:

| Command | Effect |
| --- | --- |
| `/chess` | opens the pane |
| `/chess next` | next puzzle |
| `/chess login` | sign in to your Lichess account |
| `/chess logout` | sign out (the token is revoked on Lichess too) |
| `/chess size small` / `medium` / `large` | board size (also the pane's `−` `+` buttons) |
| `/chess theme auto` / `dark` / `light` | board colors (`auto` follows Claude Code's theme) |
| `/chess auto on` / `off` | open automatically while Claude works |
| `/chess lang auto` / `en` / `fr` | pane language (`auto` follows Claude Code's language setting, then the system locale) |

### Lichess sign-in

`/chess login` (or "sign in" in the pane) shows a link that creates a Lichess **personal token** with only the `puzzle:read` and `puzzle:write` scopes. Paste it in the pane's field: it is checked, then kept in the plugin's local storage. It never goes through the conversation with Claude (don't pass it as an argument to `/chess login`).

### Settings (`/config`)

- **Open on every prompt** (on by default)
- **Close when all is done** (on by default): once Claude is done and the started puzzle is over
- **Difficulty**: easiest → hardest
- **Pieces**: unicode symbols or letters (if your terminal draws ♞ badly)
- **Board size**: small (2 columns per square), medium (3), large (5×3)
- **Board colors**: auto (follows Claude Code's dark/light theme), dark, light
- **Language**: auto (Claude Code's language setting, then the system locale; English otherwise), en, fr

## Development

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

- `hooks/chess.ts`: chess rules (FEN, legal moves, SAN/UCI), checked by perft
- `hooks/puzzle.ts`: Lichess puzzle logic
- `hooks/i18n.ts`: the texts of each language; to add one: its texts in `STRINGS`, its code in `Locale` and `LOCALES`, its detection in `pickLocale`
- `hooks/register.tsx`: pane, commands, sign-in, Lichess API
