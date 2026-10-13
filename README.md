# cclichess

Un mod Claude Code qui affiche des **puzzles d'échecs Lichess** dans un petit panneau pendant que Claude travaille sur ton prompt.

- **Anonyme** par défaut : puzzles aléatoires de Lichess, stats gardées en local.
- **Connecté** (optionnel) : puzzles que tu n'as jamais vus, résultats envoyés à Lichess, ton classement puzzle s'affiche et évolue.
- Hors-ligne : si lichess.org est injoignable, un petit jeu de puzzles intégré prend le relais.

## Installation

Dans une session Claude Code (terminal) :

```
/plugin install lichess-puzzles --marketplace mrtnsk/cclichess
```

Réponds `y` pour ajouter la marketplace, puis choisis la portée (utilisateur).

## Utilisation

Le panneau s'ouvre tout seul quand Claude commence un tour. Pour jouer :

- **clique** la pièce puis la case d'arrivée, ou
- **tape** le coup dans le champ : `e2e4`, `Nf3`, `Cf3`, `Dxh7#`… (notation anglaise ou française)
- `h` indice · `s` solution · `n` puzzle suivant (quand le panneau a le focus)

Commandes :

| Commande | Effet |
| --- | --- |
| `/chess` | ouvre le panneau |
| `/chess next` | puzzle suivant |
| `/chess login` | connecter ton compte Lichess |
| `/chess logout` | déconnecter (le token est aussi révoqué sur Lichess) |
| `/chess size small` / `medium` / `large` | taille du plateau (aussi les boutons `−` `+` du panneau) |
| `/chess theme auto` / `dark` / `light` | couleurs du plateau (`auto` suit le thème de Claude Code) |
| `/chess auto on` / `off` | ouverture automatique pendant que Claude travaille |

### Connexion Lichess

`/chess login` (ou « se connecter » dans le panneau) affiche un lien qui crée un **token personnel** Lichess avec les seuls droits `puzzle:read` et `puzzle:write`. Colle-le dans le champ du panneau : il est vérifié puis gardé dans le stockage local du plugin. Il ne passe jamais dans la conversation avec Claude (ne le mets pas en argument de `/chess login`).

### Réglages (`/config`)

- **Ouvrir à chaque prompt** (oui par défaut)
- **Fermer quand Claude a fini** (non par défaut ; jamais au milieu d'un puzzle commencé)
- **Difficulté** : easiest → hardest
- **Pièces** : symboles unicode ou lettres (si ton terminal affiche mal ♞)
- **Taille du plateau** : small (2 colonnes par case), medium (3), large (5×3)
- **Couleurs du plateau** : auto (suit le thème sombre/clair de Claude Code), dark, light

## Développement

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

- `hooks/chess.ts` : règles des échecs (FEN, coups légaux, SAN/UCI), vérifié par perft
- `hooks/puzzle.ts` : logique des puzzles Lichess
- `hooks/register.tsx` : panneau, commandes, connexion, API Lichess
