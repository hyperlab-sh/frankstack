# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Nothing is
released yet, so there are no version numbers.

## [Unreleased]

### Added

- Repository scaffolding.
- The website in `apps/site`: the comparison of six agent stacks at `/learn/` and the pstack
  playbooks at `/learn/pstack/playbooks/`, moved here from the hyper-coding repository.
- The bundle format (`docs/format.md`), Frankstack's language (`docs/language.md`) and the catalog
  with the steps of an import (`docs/catalog.md`).
- `frankstack-check` in `packages/check`: checks a bundle (`bundle`, `expand`), the assembly an
  agent wrote from it (`assembled`), and a stack of the catalog against its source (`catalog`).
