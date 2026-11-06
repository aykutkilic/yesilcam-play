# The Yeşilçam MCP server

A small local MCP server (stdio, no dependencies) that lets an agent work in the studio the user has open in their browser: import screenplays, read and change scenes, dress characters, and look at the result as pictures. It runs on the user's computer; the studio tab connects to it over localhost after the user opens a pairing link.

## Install

- Claude Code: `claude mcp add yesilcam -- npx -y github:aykutkilic/yesilcam-play mcp`
- Codex: `codex mcp add yesilcam -- npx -y github:aykutkilic/yesilcam-play mcp`
- Cursor, VS Code, Windsurf, Claude Desktop and others (mcp.json):

```json
{
  "mcpServers": {
    "yesilcam": {
      "command": "npx",
      "args": [
        "-y",
        "github:aykutkilic/yesilcam-play",
        "mcp"
      ]
    }
  }
}
```

- Claude Code plugin (the server and the skill): `/plugin marketplace add aykutkilic/yesilcam-play`, then `/plugin install yesilcam@yesilcam`.
- Without npx: download https://aykutkilic.github.io/yesilcam-play/yesilcam.mjs and use `node /path/to/yesilcam.mjs mcp` as the command.

## Pairing

The studio lives in a browser tab, so the server needs the tab to connect to it:

1. Call `connect_studio`. It returns a link like `https://aykutkilic.github.io/yesilcam-play/#agent=5198:K7Q2XM`.
2. Give the link to the user. They open it in the browser where they use the studio and click **Connect**; the browser may ask once whether the site may access apps on this device (local network access): they choose Allow. The studio then shows "🤖 agent connected".
3. `studio_status` tells you when the tab is connected. The tab stays connected while it is open.

The server listens only on 127.0.0.1 and only accepts the studio's pages with the pairing code.

## Tools

### `guide` (works without the studio)

How to make a film in Yeşilçam Studio, or one reference page: get-started, screenplay, sets, objects, characters, acting, camera, sound, mcp. Read get-started and screenplay first.

Arguments: `topic` get-started | screenplay | sets | objects | characters | acting | camera | sound | mcp.

### `check_screenplay` (works without the studio)

Import a screenplay the way the studio does, without changing anything, and report what it found (acts, scenes, lines, characters, shots) and every warning (unknown names, unreadable cues, empty scenes). Fix all warnings before importing.

Arguments: `text` the screenplay.

### `screenplay_link` (works without the studio)

A link that opens Yeşilçam Studio with this screenplay ready to import (for users without the MCP connection, or to share).

Arguments: `text` the screenplay.

### `connect_studio` (works without the studio)

The link the user opens to connect their studio tab to this server (pairing). Give it to the user, then wait for studio_status to say connected.

Arguments: none.

### `studio_status` (works without the studio)

Whether a studio tab is connected, and which film it has open.

Arguments: none.

### `get_film`

The film open in the studio: title, characters (ids, names, looks), acts and their scenes (ids, titles, sets, times, beat and shot counts, length in seconds).

Arguments: none.

### `get_scene`

One scene as the studio's JSON: set, tod, music, fx, cast, objects, beats, shots (see the mcp guide for the beat and shot shapes).

Arguments: `scene` scene id, or its title, or its number in the film (1-based).

### `import_screenplay`

Import a screenplay into the studio. mode "new" starts a new film, "append" adds its acts to the open film, "replace" replaces the open film's script (characters are kept and matched by name). Returns the import report.

Arguments: `text` the screenplay; `mode`? default "new"; `direct`? lay out shots for scenes without [SHOT:] notes (default true).

### `update_scene`

Change a scene: the fields given replace the scene's own (title, logline, set, tod, music, ambience, fx, cast, objects, beats, shots, crowd). Beats and shots without ids get new ones. Returns the scene and any warnings. One undo step in the studio.

Arguments: `scene` scene id, title or number; `patch` scene fields to replace.

### `add_scene`

Add an empty scene to an act (then fill it with update_scene), or write it as a screenplay and use import_screenplay with mode "append".

Arguments: `title` the scene title; `set` a set id; `act`? act title or number (default: the last act).

### `set_character`

Create or change a character by name or id: look fields (characters guide), voice {pitch, rate}, bio, traits. Unknown look values are reported, not applied.

Arguments: `character` name or id (a new name creates the character); `look`? ; `preset`? a stock character name for the whole look; `voice`? ; `bio`? ; `traits`? .

### `direct_scene`

Have the studio director lay out the shots of a scene (coverage from the blocking), or apply a cinema-school technique (ids in the camera guide).

Arguments: `scene` scene id, title or number; `technique`? a technique id (optional).

### `render_frame`

A picture of the film at a moment: a time in the film (seconds), or a scene and a time in it. Returns a JPEG.

Arguments: `t`? film time in seconds; `scene`? scene id, title or number; `at`? seconds into the scene (default: its middle); `width`? pixels (default 640).

### `contact_sheet`

One picture with a frame from every shot of a scene (or of the whole film when no scene is given), labelled, to review the camera work and staging.

Arguments: `scene`? scene id, title or number (optional).

### `play`

Play the film in the user's studio from a time or the start of a scene, or stop it.

Arguments: `scene`? scene id, title or number; `t`? film time in seconds; `stop`? .

### `undo`

Undo the last change in the studio (each tool call that changes the film is one step).

Arguments: none.

## Scene JSON

`get_scene` and `update_scene` use the studio's own JSON. A scene has `set`, `tod`, `music`, `fx` (ids), `cast` (`{who, x, z, facing, visible}`), `objects` (`{id, obj, x, z, y?, scale, flip?}`), `beats` and `shots`. Beats run top to bottom (`with: true` starts a beat together with the one before):

- `{"kind":"say","who":id,"text":"…","mood"?,"gesture"?,"expr"?,"pose"?,"to"?:id}`
- `{"kind":"move","who":id,"x":1200,"run"?,"style"?,"y"?,"hop"?}`
- `{"kind":"act","who":id,"mood"?,"gesture"?,"expr"?,"pose"?,"face"?:"left|right|front|<id>","sit"?,"visible"?,"dur"?}`
- `{"kind":"wait","dur":1}`, `{"kind":"sfx","name":id}`, `{"kind":"vfx","name":id,"x"?,"dur"?}`, `{"kind":"title","text":"…","style":"lower|card|big","dur":3}`
- `{"kind":"interact","who":id,"other":id,"type":<interaction>}`, `{"kind":"handle","who":id,"obj":<placement id>,"act":"pick|put|give","to"?:id}`
- `{"kind":"tween","obj":<placement id>,"x"?,"y"?,"z"?,"scale"?,"rot"?,"opacity"?,"dur":1.5,"ease":"inout"}`, `{"kind":"drive","obj":<placement id>,"x":…}`

Shots: `{"at": <beat id, null for the first>, "cam": {"size","angle","on":[character ids],"comp","move","lens","dof"?}, "trans": {"kind":"cut","dur":0}}` (values in camera.md). Leave ids out of new beats and shots; the studio adds them.
