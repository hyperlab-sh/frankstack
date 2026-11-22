# Target: `claude-code-plugin`

The assembly is one Claude Code plugin folder. `<plugin>` is the bundle's `name`. `<name>` is a
block's key under `blocks` in `bundle.yaml`: the name it is installed under.

## Where a block's files go

| Kind | Its files | Its name in a text |
|---|---|---|
| `skill` | `skills/<name>/SKILL.md` for the main file; its other files beside it, under their own names | `<plugin>:<name>` |
| `agent` | `agents/<name>.md` | `<plugin>:<name>` |
| `prompt` | `prompts/<name>/<file>` | `${CLAUDE_PLUGIN_ROOT}/prompts/<name>/<file>` |
| `playbook` | `playbooks/<name>/<file>` | `${CLAUDE_PLUGIN_ROOT}/playbooks/<name>/<file>` |
| `script` | `scripts/<name>/<file>`, executable bit kept | `${CLAUDE_PLUGIN_ROOT}/scripts/<name>/<file>` |
| `resource` | `resources/<name>/<file>` | `${CLAUDE_PLUGIN_ROOT}/resources/<name>/<file>` |
| `hook` | `hooks/<name>/<file>`, executable bit kept | `${CLAUDE_PLUGIN_ROOT}/hooks/<name>/<file>` |

`<file>` is the file's own name in `blocks/<name>/`. A created block of a kind with `<file>` has
one file: `SKILL.md` for a skill, `<name>.md` for an agent, `PLAYBOOK.md` for a playbook,
`PROMPT.md` for a prompt, and a name of your choice for a script, a resource or a hook.

## Names

The name in the table is what replaces `{name}` in a provider's sentence and each `fs:name`.

- Where the original name is the path of one file of the block, write the path of that file.
  Otherwise write the path of the block's main file.
- Inside a script or a hook, a file of another block is reached from the script's own folder, the
  way the script already finds its folder: `../<name>/<file>` for another script,
  `../../<kind>s/<name>/<file>` for a block of another kind. `${CLAUDE_PLUGIN_ROOT}` is not set
  for a script a skill runs.
- The harness fills in `${CLAUDE_PLUGIN_ROOT}` when it loads a skill or runs a hook command. It
  does not load a prompt, a playbook or a resource: there the variable stays as written. A lead
  says once, in its own text, that `${CLAUDE_PLUGIN_ROOT}` in a file it reads or sends stands for
  the plugin's folder, and puts the folder in place of the variable in every prompt it sends.
- No absolute path to a home directory or to a plugin cache is written anywhere.

## Frontmatter

- A skill's `SKILL.md` and an agent's file start with YAML frontmatter that has `name` and
  `description`. `name` is `<name>`. `description` says when to use the block: the original's
  where it has one, with its marks handled like any other text; the block's `does` otherwise.
- Other keys of the original frontmatter stay.
- A file of another kind keeps its frontmatter as it is, marks handled.

## Files that come from no block

- `.claude-plugin/plugin.json`: `{ "name": "<plugin>", "description": "<the bundle's description>", "version": "0.1.0" }`.
- `hooks/hooks.json`, only when the bundle has a block of kind `hook`: each hook registered under
  its `event`, with the command `${CLAUDE_PLUGIN_ROOT}/hooks/<name>/<file>`.

## Harness traits

This target has `skills`, `subagents` and `hooks`.

- A skill is invoked with the Skill tool, by its name.
- A subagent is started with the Agent tool. An agent block is started by its name; any other
  text is sent as the subagent's prompt.
