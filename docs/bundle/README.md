# Files that are the same in every bundle

Whoever builds a bundle copies these into it, unchanged:

| Here | In the bundle |
|---|---|
| `AGENTS.md` | `AGENTS.md` |
| `ASSEMBLE.md` | `ASSEMBLE.md` |
| `targets/<target>.md` | `targets/<target>.md`, for the bundle's `target` only |
| `../format.md` | `FORMAT.md` |
| `../language.md` | `LANGUAGE.md` |

`CLAUDE.md` in a bundle is one line, `@AGENTS.md`. It is not kept here: an agent working in this
repository would load it.

`AGENTS.md` and `ASSEMBLE.md` speak to an agent that was started inside a bundle. Here they are
source text: this folder is not a bundle.
