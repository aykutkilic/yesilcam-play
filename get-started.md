# Make a film with Yeşilçam Studio

You are helping a user make a short animated film in Yeşilçam Studio, a movie studio that runs in their browser (https://aykutkilic.github.io/yesilcam-play/). You write the film as a **screenplay** in the studio's text format; the studio turns it into acts, scenes, characters, acting, camera shots, sound and music, and the user watches, tweaks and exports it there.

Work through these steps in order. Report what you did at the end.

## 1. Find out what to make

- Use the idea in the user's prompt. If there is none, ask for one in a sentence (who, where, what happens) and a rough length (default: 1 to 3 scenes, under two minutes).
- If the prompt describes the film open in their studio (its title, cast, sets), ask whether to **add to it** or **start a new film**, unless they said.
- Ask nothing else up front: pick the sets, looks, shots and music yourself.

## 2. Read the format and the catalogs

- Read https://aykutkilic.github.io/yesilcam-play/agent/screenplay.md (required).
- Look up what you use, from the pages listed in https://aykutkilic.github.io/yesilcam-play/llms.txt: sets (ids and marks), characters (look values, stock characters), acting (expressions, poses, walks), camera, sound, objects.
- If you can run commands, `npx -y github:aykutkilic/yesilcam-play catalog <sets|objects|characters|acting|camera|sound>` prints the same pages.
- Use only ids and names that are in those pages. Do not invent sets, objects, poses, expressions or sounds.

## 3. Write the screenplay

- Start with `TITLE:` and one `[LOOK: NAME …]` per character (a stock character with `preset=`, or look fields as JSON), then `# ACT ONE` and the scenes.
- Give every scene a heading and an exact `[SET: id]` and `[TIME: dawn|day|dusk|night]`. Dress it with a few `[OBJECT: id x=… z=…]` from the set's suggested objects. Place people with `[PLACE: NAME x=…]` when it matters.
- Write lines as `NAME (direction): Line.` Use the parenthetical for acting: a mood word, `expr=` (an expression with a level, e.g. `very surprised`, `smug + guilty`), `pose=` (a pose name).
- Block the action with `[MOVE: NAME to=<mark> run]`, `[ACT: NAME pose=… expr=… face=front sit]`, `[PICK: NAME <object>]` / `[GIVE: NAME <object> to=OTHER]` (objects placed with [OBJECT:]) and `[INTERACT: NAME hug with=OTHER]`, or plain stage directions ("SEDAT enters.", "Nermin sits.").
- Add camera notes `[SHOT: CU Sedat, low angle, push in]` where they tell the story; scenes without them are shot by the studio's director. Add `[SFX: …]`, `[MUSIC: …]`, `[FX: rain]`, `[PAUSE 1.5]`, `[TRANSITION: dissolve]`.
- Keep lines short: one or two sentences each, as in a cartoon.
- Save it as a file (for example `film.txt`) if you can write files.

## 4. Check it

- If you can run node 18+: `npx -y github:aykutkilic/yesilcam-play check film.txt`. It imports the screenplay the way the studio does and lists every warning (unknown names, cues it could not read, scenes with nobody in them). Fix them all and check again.
- Without a shell: check every id you used against the catalog pages yourself.

## 5. Open it in the user's studio

Use the first of these that you can:

1. **MCP tools** (tools named like `import_screenplay`, `render_frame` from the "yesilcam" server): if `studio_status` says the studio is not connected, give the user the link from `connect_studio` and wait until they have opened it. Then call `import_screenplay` with the text (`mode`: "new", "append" or "replace").
2. **A link**: `npx -y github:aykutkilic/yesilcam-play link film.txt` prints a link that opens the studio with the screenplay ready to import. Give the user that link. Without a shell, build it yourself: `https://aykutkilic.github.io/yesilcam-play/#script=` followed by the screenplay URL-encoded (encodeURIComponent); keep it under about 30 000 characters.
3. **A file**: tell the user to drop `film.txt` onto the studio window (or paste it in Script → 📥 Import screenplay).

## 6. Review and improve (when you have the MCP tools)

- `get_film` lists the acts and scenes; `contact_sheet` shows a picture of every shot of a scene; `render_frame` shows one moment.
- Look at the pictures. Fix what reads badly: people hidden behind objects, a shot on the wrong person, a scene that is too long or too static. Change scenes with `update_scene` (beats, shots, objects, cast), looks with `set_character`, or re-import.
- `play` starts the film in the user's studio.

## 7. Report

Tell the user, in a few lines: what the film is (title, scenes, characters), how to open it (the link, or that it is in their studio now), anything the checker still warned about, and what they might want to do next in the studio (record voices in the Voices tab, tweak looks in Cast, export the MP4).

## Rules

- Write **original** dialogue and stories. Do not reproduce copyrighted scripts, lyrics or dialogue, and do not recreate a real artist's or a show's characters; an homage in spirit is fine.
- Keep it family-friendly unless the user asks otherwise; the studio also cleans profanity on import.
- Do not invent catalog names, and do not ask the user to edit files by hand to fix your mistakes: run the checker.
- Do not install anything globally. `npx -y` runs the CLI once; the MCP server is optional and only for when the user wants you to see and refine the film.
- The studio keeps everything in the user's browser. There is no account, API key or server to set up.
