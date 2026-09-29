# Stationeersprints

Live version: [https://stationeersprints.com/](https://stationeersprints.com/)

A web-based schematic editor for [Stationeers](https://store.steampowered.com/app/544550/Stationeers/) systems.
Draw the devices of a system, how they're cabled, piped and chuted together, and how each
one is configured (Logic Reader → Daylight Sensor → Horizontal, vent modes, IC10 code…).
Add numbered notes and share the result as a link or JSON file.

- **Device catalog from the game.** Ports, logic variables, modes and icons are extracted from the
  Stationeers game (see [tools/extract/README.md](tools/extract/README.md)).
- **Logic links follow the configuration.** Set a Logic Reader's device and variable in the inspector
  and the dashed logic arrow appears.
- **Sharing.** The whole blueprint is compressed into the URL (`#bp=…`).
  Opening a link shows a read-only view with an "Edit a copy" button.
  Blueprints can also be shared via a tiny link, allowing for more complex prints to be shared.
- **Gallery.** Basic functionality for "publishing" blueprints, allowing other to see them. This feature
  is at the moment pretty basic and depends on the site administrator reviewing.
- **Shopping list.** Every device on the canvas, plus the kits and materials the game says they're
  built from, can be listed and exported to text.

## Development

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests + checks every example against the catalog
npm run build      # static site in dist/
npm run extract    # rebuild public/data/ from the game
```

## Blueprint format

```jsonc
{
  "format": "stationeersprints", "version": 1,
  "title": "…", "author": "…", "description": "…", "gameVersion": "0.2.6428.27798",
  "nodes": [
    { "id": "n1", "type": "device", "x": 0, "y": 0, "prefab": "StructureLogicReader",
      "settings": { "device": { "ref": "n2" }, "variable": "Horizontal" },
      "values": { "On": "1" }, "note": "…" },
    { "id": "n3", "type": "note", "x": 0, "y": 200, "text": "…", "step": 1 },
    { "id": "n4", "type": "zone", "x": -40, "y": -40, "width": 600, "height": 400, "title": "Outside" }
  ],
  "edges": [{ "id": "e1", "source": "n1", "sourceHandle": "Power-None-0", "target": "n5", "targetHandle": "PowerAndData-None-0" }]
}
```

Port ids are `<NetworkType>-<Role>-<n>` as exported by the game, so they stay stable across re-extractions.
Prefabs starting with `@` are schematic helpers (cable/pipe/liquid network nodes).

## License

Copyright © 2026 Brainstorm. Licensed under the
[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only).

You may use, modify and redistribute this project freely. If you run a modified copy as a
network service, AGPL section 13 requires you to offer its users the corresponding source —
so a public fork of the editor has to publish its changes.

**This license covers the source code only.** It does not apply to `public/data/`, whose
`catalog.json` and all icons are extracted from a Stationeers install and remain the property
of RocketWerkz. They are committed so the app works without the game installed; they are not
mine to license.

Fan-made. Not affiliated with RocketWerkz. Device names, descriptions and icons belong to their owners.
