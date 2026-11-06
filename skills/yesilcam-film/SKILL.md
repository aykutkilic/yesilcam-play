---
name: yesilcam-film
description: Make or change an animated film in Yeşilçam Studio (a paper cut-out movie studio in the browser) by writing its screenplay format, checking it, and opening it in the user's studio by link, file or MCP. Use when the user wants a cartoon, short film, sketch, scene or episode made in Yeşilçam Studio, or mentions yesilcam.
---

# Yeşilçam Studio films

Yeşilçam Studio (https://aykutkilic.github.io/yesilcam-play/) turns a screenplay into an animated film: characters with looks and voices, sets, acting, camera shots, sound and music. You write the screenplay; the user watches, tweaks and exports it in their browser.

Follow the steps in https://aykutkilic.github.io/yesilcam-play/get-started.md (fetch it: it is kept up to date). In short:

1. Get the idea (who, where, what happens) and whether to add to the user's open film or start a new one.
2. Read https://aykutkilic.github.io/yesilcam-play/agent/screenplay.md and look up the names you use in the catalog pages listed in https://aykutkilic.github.io/yesilcam-play/llms.txt (or `npx -y github:aykutkilic/yesilcam-play catalog <sets|objects|characters|acting|camera|sound>`).
3. Write the screenplay: `TITLE:`, a `[LOOK:]` per character, `# ACT ONE`, scenes with `[SET:]` and `[TIME:]`, lines as `NAME (direction): text`, blocking with `[MOVE:]` / `[ACT:]`, camera notes `[SHOT:]`, `[SFX:]`, `[MUSIC:]`.
4. Check it: `npx -y github:aykutkilic/yesilcam-play check film.txt`; fix every warning.
5. Open it: with the yesilcam MCP tools, `import_screenplay` (pair first with `connect_studio`); otherwise `npx -y github:aykutkilic/yesilcam-play link film.txt` and give the user the link; otherwise ask them to drop the file on the studio.
6. With MCP, look at `contact_sheet` pictures and improve the scenes; then report.

Rules: original dialogue and characters only (no copyrighted scripts or a real artist's characters), family-friendly unless asked, only names from the catalogs.
