# Channel Bookmarks

A standalone Buzz plugin. Adds a bookmark icon to the channel header; clicking
it opens a shared bookmarks panel. No changes to Buzz or Channels are required.

## Install

In Settings → Plugins → Manage plugins, add the `dist` folder, then enable
**Channel Bookmarks**. The icon has the tooltip **Bookmarks**.

The built plugin is `dist/manifest.json` plus `dist/plugin.js`. It uses the
existing `react`, `panels`, and `relay` capabilities, with no computer or network
grants of its own. React is supplied by Buzz, not bundled with the plugin.

## Use

Open the panel and enter a name and HTTP(S) URL. Edit, remove, and move links up
or down using the controls beside each entry. Choose **Refresh bookmarks** to
load other members’ changes. Each URL appears once per channel.

Links are stored under `## Channel bookmarks` in the shared Canvas. Other Canvas
sections are preserved. Canvas permissions, its size limit, and its restriction
to one save per second apply. Conflicts require a refresh and preserve typed
input. Disabling the plugin hides the button/panel and keeps saved links.

## Build and test

From the repository root, install the pinned tools and dependencies as described
in [the contribution workflow](../../../docs/contributing.md), then run:

```sh
bin/pnpm exec vite build --config examples/plugins/channel-bookmarks/vite.config.mjs
bin/pnpm exec vitest run examples/plugins/channel-bookmarks
```

The checked-in `dist` folder is ready to install without build tools.
Rebuild it after changing the source.
The Vite configuration verifies that the artifact is one self-contained module.
The icon uses the Tabler bookmark outline.
