## What and why

<!-- What changes in the catalog or in a plugin, and why. -->

## Checklist

- [ ] `node scripts/validate-marketplace.mjs --strict` passes locally
- [ ] `claude plugin validate . --strict` passes locally
- [ ] Plugin name in `marketplace.json` equals `name` in its `plugin.json`
- [ ] `version` is set in one place only (or nowhere), and bumped if pinned
- [ ] All paths start with `./`, contain no `..`, and stay inside the plugin directory
- [ ] Hook commands quote `"${CLAUDE_PLUGIN_ROOT}"`; persistent state goes to `${CLAUDE_PLUGIN_DATA}`
- [ ] No secrets, tokens or credentials in the diff (see `docs/SECURITY.md`)
- [ ] New or changed scripts were reviewed line by line
- [ ] Removed or renamed plugins are recorded in `renames`
- [ ] `README.md` / plugin README updated if behavior changed
