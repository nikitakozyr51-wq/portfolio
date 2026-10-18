# Portfolio handoff

Read LOCAL-START.ru.md, README.md, docs/ACCEPTANCE.ru.md and
design/README.ru.md before changing the project. Communicate with the user in
Russian. Confirm the actual execution path: opening the desktop application
does not move an existing cloud task onto the user's computer.

## Goal and preserved work

The user wants the entire portfolio at https://desiredesign.framer.website
migrated faithfully, with all 28 inventoried routes and a separate editable
Pencil file. The original Framer project must remain unchanged.

This repository preserves the public generated HTML/runtime with reproducible
adapters; it is not an export of the editable Framer project. Keep source/
immutable: scripts/build.mjs validates its SHA-256 checksums. Preserve the
layout, content, routes, image variants, typography and interactions. Read the
acceptance report before claiming visual equivalence. Keep a backup before
native Pencil import or conversion.

## Local workflow

Node.js >=22. A ready dist/ is included. To view it without installing packages,
run node scripts/open-local.mjs. This opens the user's default browser after the
server is ready and chooses an available port. --no-open starts without opening
a browser, for agent checks. Keep the managed server process running while the
user reviews the site. Use this checkout; no additional worktree is needed.

For changes: npm ci, npm run build, npm test. For schema/resource checks of the
Pencil draft: npm run design:validate. Run checks appropriate to the change;
the large visual comparison scripts need Python/Playwright and reference files.
Detailed instructions are in docs/. Historical before-* artifacts are not the
current acceptance result.

Image originals belong in dist/_original_images. Public /_framer/images URLs
must pass through variant-first rewrites before falling back to originals.
Vercel serves physical files before array rewrites, so restoring physical
originals under dist/_framer/images breaks exact image variant selection.
Do not change binary CMS offsets. Kinescope remains an external dependency.

## Pencil and hosting

The draft is design/portfolio-draft.pen with relative assets/ and fonts/.
It passed schema/resource checks; native rendering still needs verification.
First inspect installed local Pencil capabilities and auth. The cloud's
PEN_CLI_KEY binding was saved but never became available to its process.
No credentials have been transferred to this repository. Never print secrets,
request them in chat, or commit them. Do not assume a local app or CLI is
authenticated just because the cloud had a configured binding.

There is no confirmed permanent Vercel deployment in the owner's account.
Old anonymous previews expire after one hour; never present them as permanent.
The user authorized setup, migration, GitHub uploads and publishing the
portfolio. Check existing auth before requesting a browser confirmation.
Do not purchase plans or upgrade billing as part of setup.
