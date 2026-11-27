# Fixes by feature

Keyed by the `slug` email-lint reports. "Outlook" without a platform means Outlook for Windows (Word rendering engine), the client behind most layout breakage.

## Must fix

### Layout

| Slug | Fix |
| --- | --- |
| `css-display-flex`, `css-display-grid`, `css-flex-direction`, `css-flex-wrap`, `css-gap`, `css-grid-template` | Build the layout with `<table role="presentation">` and `<td>` columns. Replace `gap` with padding on the cells or an empty spacer `<td>`. For columns that stack on mobile, use inline-block `<div>`s wrapped in an MSO conditional table (the "hybrid" or "fluid" pattern). |
| `css-max-width` | Outlook ignores it on `<div>`. Keep the `max-width` and add a fixed-width ghost table around the content: `<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->` ... `<!--[if mso]></td></tr></table><![endif]-->`. |
| `css-margin`, `css-padding` | Outlook applies them unreliably on `<div>` and `<p>`. Put spacing as `padding` on a `<td>`. |
| `css-width`, `css-height` | Partial in Outlook on `<div>`, `<p>` and `<img>`. Set sizes with the `width`/`height` HTML attributes on `<img>` and `<td>`, keep CSS for other clients. |
| `css-float` | Use table cells, or the `align` attribute on `<table>`/`<img>`. |
| `css-position`, `css-left-right-top-bottom`, `css-inset` | No reliable support. Rebuild the overlap with tables, or bake it into an image. |
| `css-unit-calc` | Replace with a fixed `px` or `%` value. |
| `css-unit-rem`, `css-unit-vw`, `css-unit-vh` | Convert to `px`. With Tailwind, use a theme whose spacing and font sizes are in `px`. |
| `css-variables` | Inline the resolved values. Most email builders and Tailwind configs can do this at build time. |

### Images and media

| Slug | Fix |
| --- | --- |
| `image-webp`, `image-avif`, `image-heif` | Serve PNG or JPG. |
| `image-svg`, `html-svg` | Export to PNG at 2x resolution and set the display size with the `width` attribute. |
| `image-base64` | Host the image and link it by URL. Several clients block or strip data URIs. |
| `css-background-image` | Always set a `background-color` fallback. For Outlook, add a VML `<v:rect>` with `<v:fill type="frame">` in an MSO conditional (generator: backgrounds.cm). |
| `css-linear-gradient`, `css-radial-gradient` | Put a solid `background-color` before the gradient so clients without support still get a readable background. |
| `css-object-fit`, `css-object-position` | Crop the image to the exact size before sending. |
| `html-picture`, `html-srcset` | Keep a plain `<img src>` (inside `<picture>` it is the fallback) pointing at a PNG or JPG. |
| `html-video`, `html-audio` | Use a static image or an animated GIF linked to the hosted video. |

### Forms and fonts

| Slug | Fix |
| --- | --- |
| `html-form`, `html-input-*`, `html-select`, `html-textarea`, `html-button-*` | Link to a hosted form instead. Interactive form controls fail or are disabled in most clients. |
| `css-at-font-face`, `css-at-import` | Always end `font-family` with a safe stack (`Arial, Helvetica, sans-serif`). Outlook falls back to Times New Roman otherwise; force the fallback with `<!--[if mso]><style>body, table, td { font-family: Arial, sans-serif !important; }</style><![endif]-->`. |

## Acceptable degradation

These drop a visual extra. The email keeps working, so report them as information, and check only that the design still reads well without them.

| Slug | Without support |
| --- | --- |
| `css-border-radius` | Square corners. For a rounded button in Outlook, use a VML `<v:roundrect>` (generator: buttons.cm). |
| `css-box-shadow`, `css-text-shadow`, `css-opacity`, `css-filter`, `css-transform`, `css-mix-blend-mode`, `css-backdrop-filter` | The effect is not shown. Make sure no text relies on it for contrast. |
| `css-pseudo-class-hover`, `css-transition`, `css-animation`, `css-at-keyframes` | No hover state or motion. The static state must be complete on its own. |
| `css-at-media-prefers-color-scheme` | No custom dark mode. Gmail and Outlook may still invert colors themselves, so check that logos and text stay readable on both light and dark backgrounds (transparent PNG logos with a light outline help). |
| `css-at-media-hover`, `css-at-media-orientation`, `css-at-media-prefers-reduced-motion` | The media query is ignored and base styles apply. |
| `html-meta-color-scheme` | The client decides the color scheme. |
| `css-text-decoration`, `css-text-decoration-*`, `css-text-underline-offset` | Plain underline or none. Do not rely on custom underline styles to mark links. |
| `html-mailto-links` | Some query parameters (often `bcc`) are dropped. Keep the address itself complete. |

## Anything not listed

Read the issue `notes` and the caniemail page at `url`. Ask: does the email lose content or become unusable in that client? If yes, it is a must fix; propose the closest table-based or attribute-based alternative. If only decoration is lost, it is acceptable degradation.
