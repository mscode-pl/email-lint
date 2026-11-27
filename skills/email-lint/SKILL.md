---
name: email-lint
description: Review HTML email templates for email client compatibility with email-lint and the caniemail.com dataset, then propose concrete fixes. Use when the user asks whether an email will render in Outlook, Gmail, Apple Mail or Yahoo, wants an email template reviewed or audited, or is building emails with React Email, MJML, Maizzle, Laravel Blade or plain HTML.
---

# email-lint review

email-lint reports which CSS and HTML features in an email are unsupported or only partly supported in each email client, with line numbers. Your job is to run it, decide which findings matter, and propose fixes in the template source.

## 1. Get HTML to lint

email-lint reads rendered HTML. Find the templates and render them if needed:

| Stack | How to get HTML |
| --- | --- |
| Plain HTML | Lint the files directly |
| React Email | `npx email export --outDir .email-lint-out`, then lint `.email-lint-out` |
| MJML | `npx mjml "emails/**/*.mjml" -o .email-lint-out/`, then lint `.email-lint-out` |
| Maizzle | `npx maizzle build production`, then lint the output folder from `config.production.js` |
| laravel-react-email | `php artisan react-email:build`, then lint `"resources/views/react-email/**/*.blade.php"` |
| Other Laravel mailables | Render with `(new App\Mail\Welcome(...))->render()` in `php artisan tinker`, save to a `.html` file |

Blade syntax (`{{ }}`, `@if`) is read as text and does not cause false reports. Delete any output folder you created once the review is done.

## 2. Run the linter

If the `lint_email` and `explain_feature` tools from the email-lint MCP server are available, use them instead of the command below: `lint_email` takes the same `clients`, `ignore` and `strict` options plus `html` or `path`, and `explain_feature` returns the fix for one slug.

```bash
npx -y @mscode-pl/email-lint <files, folders or globs> --format json
```

- If the user named their audience ("our customers use Outlook at work"), pass `--clients`, e.g. `--clients outlook,gmail`. Valid values: a family (`gmail`, `outlook`, `apple-mail`, `yahoo`, `samsung-email`, `thunderbird`, `protonmail`, `wp-pl`, ...), a family and platform (`outlook.windows`), or `all`.
- Without `--strict`, features every email needs (doctype, `<body>`, `<style>`, tables, class selectors, generic `@media`, `role`/`aria-*`) and Gmail in a mobile browser are skipped. Leave it that way unless the user asks for a full audit.
- Exit code 1 means errors were found, which is expected during a review. Exit code 2 means bad arguments or no files matched.

The JSON is an array with one entry per file:

```
{ file, errors, warnings, parseErrors: [{ line, message }],
  issues: [{ slug, title, url, level, lines,
             clients: [{ family, platform, familyName, platformName, status, notes }] }] }
```

`level` is `error` when at least one selected client does not support the feature, `warning` when support is partial. Always read `notes`: they often say the real limitation (for example "not supported with non Google accounts" or "only on `<td>`").

## 3. Triage

Open [references/fixes.md](references/fixes.md) and sort every issue into one of two groups:

- **Must fix**: the email breaks or loses content in a client the user cares about (layout collapses, images do not show, text is unreadable).
- **Acceptable degradation**: the client drops a visual extra and the email still works (rounded corners, shadows, hover effects, animation, dark mode tweaks). Name it, but do not push the user to remove it.

An issue is only worth raising if it affects a client the user's audience uses. Outlook for Windows matters for B2B senders, much less for a consumer newsletter.

## 4. Report

Per template, list must-fix issues first, then acceptable degradation, then parse errors. For each issue give:

- the feature and where it is used (source file and line, not only the built file)
- which clients are affected, grouped by family
- the fix from `references/fixes.md`, adapted to the user's stack (a React Email component, an MJML tag, a Tailwind class)

Keep it short. Do not repeat the caniemail notes word for word when one sentence covers them; link the `url` for details.

## 5. Fixing

Edit only when the user asks. Fix the source template (`.tsx`, `.mjml`, `.blade.php`), never the generated HTML, then rebuild and run email-lint again to confirm the issue is gone. If a fix needs VML or MSO conditional comments, say that it can only be verified by rendering in Outlook for Windows (Litmus, Email on Acid, or a real client).
