# Game data extraction

`npm run extract` builds `public/data/catalog.json` and `public/data/icons/` from your
Stationeers install. Run it again after every game update and commit the result.

## Data sources

| Source | Gives us | Needs the mod? |
|---|---|---|
| `<game>/Stationpedia/Stationpedia.json` | Every prefab: ports (network type + role), logic types (read/write), slot logic, slots, modes, IC pins | yes |
| `<game>/Stationpedia/Enums.json` | Logic type names and descriptions (inspector tooltips) | yes |
| `<game>/Stationpedia/Textures/*.png` | Thumbnails (converted to 64 px WebP) | yes |
| `StreamingAssets/Language/english.xml` | Current display names and descriptions | no |
| `StreamingAssets/Data/{furnace,advancedfurnace,arcfurnace}.xml` | Smelting recipes with temperature/pressure windows | no |
| `StreamingAssets/version.ini` | Game version stamped into the catalog | no |
| `tools/extract/overrides.json` | Palette categories, hidden prefabs | — |

The mod export is required: without `Stationpedia.json` and `Enums.json` the extractor
stops and points you at the setup below. Everything in `public/data/` is committed, so
you only need this if you are refreshing the catalog after a game update.

## One-time setup: the Stationpedia export mod

The logic and port data only exists inside the running game, so a small BepInEx plugin dumps it.

1. Download **BepInEx 5** (`BepInEx_win_x64_5.4.x.zip`) from
   <https://github.com/BepInEx/BepInEx/releases> and unzip it into the game folder
   (`~/.local/share/Steam/steamapps/common/Stationeers/`, next to `rocketstation.exe`).
2. The game runs through Proton, so tell Wine to load BepInEx's `winhttp.dll`: in Steam →
   Stationeers → Properties → Launch options, set
   `WINEDLLOVERRIDES="winhttp=n,b" %command%`
3. Start the game once and quit, so BepInEx creates `BepInEx/plugins/`.
4. Put `StationpediaExtractor.dll` from
   <https://github.com/Ryex/StationeersStationpediaExtractor/releases> into `BepInEx/plugins/`.
   If the release doesn't load on the current game version, build it from source: copy
   `Stationeers.props.example` to `Stationeers.props`, point it at your game folder and run
   `dotnet build -c Release`.

## After each game update

1. Start the game and load any world (or stay on the main menu if the command works there).
2. Press **F3** to open the console and run `stationpedia_export`.
   This writes `<game>/Stationpedia/{Stationpedia.json,Enums.json,Textures/}`.
3. `npm run extract` and check the summary (device count per category, game version).
4. `npm test`. The example test tells you if a bundled example uses a port, logic type or
   mode that no longer exists.
5. Commit `public/data/`.

Options: `--game <dir>` (or `STATIONEERS_DIR`), `--export <dir>` (for a Stationpedia folder
somewhere else).
