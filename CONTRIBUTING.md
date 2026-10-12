# Contributing to Roadclaim

Thanks for helping. Bug reports, ideas and pull requests are welcome.

## Before you start

- For bigger changes, open an issue first so we can agree on the approach.
- Read [docs/SPEC.md](docs/SPEC.md) for the product and [docs/API.md](docs/API.md) for the server contract.
- Privacy is a feature: GPS coordinates never leave the phone unless the user switches on cloud backup. Changes that send more data need a very good reason.
- Safety first: no feature may need interaction while driving, and there is no speed leaderboard.

## Workflow

1. Fork the repo and create a branch from `main`.
2. Make your change with tests where it makes sense:
   - server: `cd server && bun test` (needs Postgres, see [server/README.md](server/README.md))
   - app: `cd app && bun run check` (type check and unit tests)
3. Keep pull requests focused and describe what changed and how you tested it.
4. UI changes: add a screenshot for iOS and Android, dark and light.

## Style

- TypeScript everywhere, strict mode.
- Short, plain copy in English and German. No emoji in the UI.
- Match the patterns of the code around your change.

## Car catalogue

`app/assets/data/cars.json` is generated. Edit `app/scripts/cars/curated.mjs` or `build.mjs` and run `node app/scripts/cars/build.mjs` instead of editing the JSON by hand.

## License

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
