# email-lint

Checks email HTML against [caniemail.com](https://www.caniemail.com) support data and tells you which CSS and HTML features will break in which email clients, with line numbers.

It reads plain HTML, so it works with anything that produces it: React Email, MJML, Maizzle, Laravel Blade, or hand-written templates.

```
emails/welcome.html
  line 18  error    display:flex (css-display-flex)
    unsupported: Outlook (Windows, Windows Mail)
    partial: Gmail (iOS, Android)
    note: Not supported with non Google accounts.
    https://www.caniemail.com/features/css-display-flex/
```

## Install

```bash
npm install --save-dev @mscode-pl/email-lint
```

Requires Node 22 or newer.

## CLI

```bash
email-lint dist/emails
email-lint "resources/views/emails/**/*.html" --clients gmail,outlook.windows
cat email.html | email-lint --stdin --format json
```

| Option | Default | Description |
| --- | --- | --- |
| `-c, --clients` | `gmail,outlook,apple-mail,yahoo,samsung-email,thunderbird` | Clients to check. Use a family (`outlook`), a family and platform (`outlook.windows`), or `all`. |
| `-i, --ignore` | | Feature slugs to skip, e.g. `css-display-flex,html-svg`. |
| `--strict` | | Also report baseline features and Gmail in a mobile browser (see below). |
| `-f, --format` | `text` | `text` or `json`. |
| `--fail-on` | `error` | Exit with code 1 on `error`, `warning`, or `never`. |
| `--stdin` | | Read HTML from stdin. |

A feature is an **error** when at least one selected client does not support it, and a **warning** when support is only partial. Support is judged by the newest tested version of each client.

Exit codes: `0` no failures, `1` failures found, `2` bad arguments or no files.

### What is skipped by default

Some features are in every email and the only fix would be removing them: the doctype, `<body>`, `<style>`, tables, class and type selectors, generic `@media`, and accessibility attributes like `role` and `aria-*`. These are skipped. The full list is `BASELINE_FEATURES` in `src/baseline.ts`.

Gmail opened in a mobile browser is skipped too. It drops `<style>` entirely, so it would flag nearly every email. Name it explicitly (`--clients gmail.mobile-webmail`) or use `--strict` to include it.

## API

```ts
import { lint } from '@mscode-pl/email-lint';

const result = lint(html, { clients: ['gmail', 'outlook'], ignore: ['html-doctype'] });

for (const issue of result.issues) {
  console.log(issue.level, issue.slug, issue.lines, issue.clients);
}
```

## Updating the data

The caniemail dataset ships with the package. To refresh it:

```bash
pnpm update-data
```

## License

MIT. Support data from [caniemail](https://github.com/hteumeuleu/caniemail), MIT License.
