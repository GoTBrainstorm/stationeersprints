// End-user documentation. Rendered two ways: as the page at /help, and inside a
// dialog from the editor's toolbar — reading it should never cost you the
// document you have open, and a full-page navigation would unmount the canvas.
import { useEffect, useState } from 'react'
import Link from '../components/Link'
import { getConfig } from '../api/client'
import type { ConfigResponse } from '../api/types'

const mb = (bytes: number) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`

export function HelpContent() {
  const [config, setConfig] = useState<ConfigResponse | null>(null)

  // Limits are quoted from the server rather than written into the prose, so
  // they cannot drift away from what a publish actually enforces. The section
  // simply doesn't render if the API is unreachable.
  useEffect(() => {
    let cancelled = false
    getConfig().then(
      (c) => !cancelled && setConfig(c),
      () => {},
    )
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <article className="doc">
      <p className="lead">
        Stationeersprints is a drawing tool for Stationeers systems: which devices you need, how they are cabled,
        piped and chuted together, and how each one is configured. It is a diagram, not a simulation — nothing here
        is read by the game, and nothing you draw can be wrong in a way the editor will notice.
      </p>

      <h3>Drawing</h3>
      <ul>
        <li>
          <strong>Add a device</strong> from the palette on the left: search for it, then drag it onto the canvas or
          double-click it. Devices are grouped by category; the tooltip shows the game's own description.
        </li>
        <li>
          <strong>Connect two devices</strong> by dragging from one port dot to another. Ports only join when they
          are the same kind — power to power, pipe to pipe — with one exception: a combined{' '}
          <em>power &amp; data</em> port accepts either. The colours in the footer are the legend.
        </li>
        <li>
          <strong>Network helpers</strong> (cable network, pipe network, liquid network) stand in for "everything on
          this network" so you don't have to draw every branch. They are at the top of the palette, and the inspector
          lets you choose which side their connector sits on. A gas or liquid network can also be marked{' '}
          <em>insulated</em>, which draws its runs wrapped in lagging — insulated pipe barely exchanges heat with the
          room it passes through, so it is often the difference between two otherwise identical designs.
        </li>
        <li>
          <strong>Notes and zones</strong> are for explaining the drawing. A note can carry a step number; a zone is a
          labelled, coloured box for a room or an area. Once the zones are where you want them, the{' '}
          <strong>🔒 Zones</strong> button freezes them so they stop getting dragged by accident.
        </li>
        <li>
          <strong>Delete</strong> removes the selection — the <kbd>Delete</kbd> key, or the button at the bottom of
          the inspector. <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> redoes.
          Typing in a field is one undo step, not one per keystroke.
        </li>
      </ul>

      <h3>On a phone</h3>
      <p>
        This is a desktop tool and a small screen shows it. Reading a shared blueprint works: the diagram fills the
        screen, you can pan and pinch-zoom it, and tapping a device opens its configuration. Drawing one is another
        matter — the palette and inspector become panels you open from the toolbar, a single tap adds the device you
        picked, and connecting two ports means hitting targets sized for a mouse. It is possible, not pleasant.
      </p>

      <h3>Configuring a device</h3>
      <p>
        Select a device and the inspector on the right shows what the game exposes for it: a label of your own, its
        settings, the logic variables it reads or writes, its connections, and its recipes where it has them.
      </p>
      <p>
        <strong>Logic links draw themselves.</strong> Point a Logic Reader at a device and a variable, and the dashed
        arrow appears on the canvas. Those arrows are a picture of the settings, so they can't be deleted or redrawn
        directly — change the setting in the inspector and the arrow follows. It is the one thing in the editor that
        cannot end up disagreeing with itself.
      </p>

      <h3>Keeping your work</h3>
      <ul>
        <li>
          <strong>Autosave</strong> keeps the current drawing in this browser and restores it when you come back. It
          is one document, not a library, and clearing site data clears it.
        </li>
        <li>
          <strong>Export JSON</strong> is the real save file — the whole blueprint, importable anywhere, and the only
          format that survives everything else on this page.
        </li>
        <li>
          <strong>Copy share link</strong> packs the entire drawing into the URL itself. Nothing is uploaded, the link
          works forever, and it opens read-only with an <em>Edit a copy</em> button. Large blueprints make long links,
          and some chat apps cut them off — publish those instead.
        </li>
        <li>
          <strong>Export PNG</strong> renders the canvas as an image for a guide or a forum post.
        </li>
      </ul>

      <h3>The shopping list</h3>
      <p>
        <strong>Shopping list</strong> tallies what the blueprint is made of: every device on the canvas, and the
        kits and materials you need to bring to build them. Copy it to the clipboard or download it as a text file
        to keep beside you while you build.
      </p>
      <p>
        Cable, pipe and chute <em>runs</em> are never counted — you draw those as network nodes, not as lengths, so
        the list cannot know how far apart things are. Cable coil and pipe kits do appear when a device itself is
        built from them. Build costs come from the game data, so a device from a newer game version than the
        catalog is still counted but its cost is listed as unknown.
      </p>

      <h3>Publishing</h3>
      <p>
        Publishing uploads a copy of the blueprint and a preview image, and gives you a short link like{' '}
        <code>/b/aB3dEf9h</code> that is small enough to paste anywhere. You can publish without submitting to the
        gallery: an unlisted blueprint is reachable by its link and is not listed anywhere or indexed by search
        engines.
      </p>
      <p>
        <strong>Published blueprints cannot be edited.</strong> A link someone has shared must keep showing what they
        shared, so changing a published blueprint means publishing it again and sharing the new link. What you can
        change is whether it appears in the gallery, and you can delete it outright.
      </p>
      <p>
        Everything in a published blueprint is public: the title, your author name, the description and every note in
        the drawing. There are no accounts, so don't put anything in one you wouldn't put on a public web page.
      </p>

      <h3>Management keys</h3>
      <p>
        There are no accounts, so a published blueprint is owned by whoever holds its <strong>management key</strong>.
        The key is shown once, when you publish, and it is the only way to unlist or delete that blueprint.
      </p>
      <ul>
        <li>It is saved in the browser you published from, which is why <strong>Mine</strong> works without it.</li>
        <li>
          Clearing site data, using a private window, or switching to another device loses that copy. Keep the key
          somewhere and you can get back in from anywhere: <strong>Mine → Have a management key?</strong>, paste the
          link and the key.
        </li>
        <li>
          <strong>It cannot be recovered.</strong> No accounts means no email, no reset and no support channel — a
          lost key means a blueprint that stays up and that nobody can take down.
        </li>
      </ul>

      <h3>The gallery</h3>
      <p>
        Submitting to the gallery puts a blueprint in a review queue; it appears publicly once it has been approved,
        and the link works the whole time. Anything in the gallery can be opened, exported, or turned into your own
        drawing with <em>Edit a copy</em> — which starts an ordinary editable document and leaves the original
        untouched.
      </p>

      {config && (
        <>
          <h3>Limits</h3>
          <ul>
            <li>Blueprint file: up to {mb(config.maxJsonBytes)}.</li>
            <li>Preview image: up to {mb(config.maxImageBytes)}, generated for you at publish time.</li>
            <li>
              Publishing: up to {config.publishesPerHour} per hour from one connection, which is about abuse, not
              about you.
            </li>
          </ul>
        </>
      )}

      <h3>A caveat about device data</h3>
      <p>
        The device catalog is extracted from a specific version of the game, shown in the footer. A blueprint that
        names a device this copy doesn't know still opens — the device is drawn as a placeholder with the connections
        it is actually using, rather than failing to load. Ports, names and icons belong to RocketWerkz; this is a
        fan-made tool and not affiliated with them.
      </p>

      {/* AGPL section 13: anyone using this over a network is entitled to its source, so the
          offer has to live in the app itself rather than only in the repo's README. */}
      <h3>Source and licence</h3>
      <p>
        Stationeersprints is free software under the{' '}
        <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer">
          GNU Affero General Public Licence v3
        </a>
        , and its source is at{' '}
        <a href="https://github.com/GoTBrainstorm/stationeersprints" target="_blank" rel="noopener noreferrer">
          github.com/GoTBrainstorm/stationeersprints
        </a>
        . You are free to read it, change it and run your own copy — and if you host a modified copy
        for other people, you owe those people the same offer of its source. The device data described
        above is the one part that isn't mine to license.
      </p>
    </article>
  )
}

export default function HelpPage() {
  return (
    <div className="page">
      <header className="toolbar">
        <div className="brand">
          Stationeers<span>prints</span>
        </div>
        <div className="toolbar-title">How this works</div>
        <div className="toolbar-group">
          <Link to="/gallery" className="button">
            Gallery
          </Link>
          <Link to="/" className="button primary">
            Open the editor
          </Link>
        </div>
      </header>
      <div className="page-body">
        <HelpContent />
      </div>
    </div>
  )
}
