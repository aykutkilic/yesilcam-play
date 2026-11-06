# Camera & editing

A `[SHOT: …]` note is read for words: a size (EWS, WS, FS, MLS, MS, MCU, CU, ECU, "establishing", "close-up"), names of who it is on, "two-shot" / "over the shoulder" / "everyone", an angle ("low angle", "high angle", "bird's eye", "dutch"), a move ("push in", "pull out", "crash zoom", "dolly zoom", "pan", "tilt", "follow", "handheld", "crane up", "rack focus"), a lens ("wide lens", "telephoto") and "shallow focus". Over MCP a shot is JSON: `{"at": <beat id or null>, "cam": {"size","angle","on":[ids],"comp","move","lens","dof"}, "trans": {"kind","dur"}}`.

## Sizes

- `ews` Extreme wide shot: The place dominates; people are small in it. Use: Open a scene or a film, show isolation, scale, a journey.
- `ws` Wide (long) shot: Everyone head to toe with plenty of room around them. Use: Establish where everyone stands; physical comedy; group action.
- `fs` Full shot: One or two people head to toe, filling the frame height. Use: Show a whole body acting: a walk, a dance, a fall.
- `mls` Medium long (American) shot: From the knees up — the cowboy shot. Use: Confrontations and stand-offs; conversation with body language.
- `ms` Medium shot: From the waist up. Use: The workhorse of dialogue: face and hands both read.
- `mcu` Medium close-up: From the chest up. Use: Conversation that matters; the listener's reaction.
- `cu` Close-up: The face fills the frame. Use: Emotion, a decision, a secret. Use sparingly so it counts.
- `ecu` Extreme close-up: Only the eyes and mouth. Use: Shock, suspicion, the big comic take, a ticking moment.

## Angles

- `eye` Eye level: The camera at the subject's eye height: neutral, honest. Use: Most dialogue.
- `low` Low angle: From below, looking up: the subject looms. Use: Power, threat, heroism — the villain's entrance.
- `worm` Worm's eye: From the floor, steeply up. Use: Giants, towers, a comic exaggeration of power.
- `high` High angle: From above, looking down: the subject shrinks. Use: Vulnerability, defeat, being watched.
- `bird` Bird's eye: From high above, almost straight down. Use: Show a pattern, a chase, or fate looking on.
- `dutch` Dutch angle: The horizon tilted. Use: Unease, madness, a world off balance.
- `shoulder` Shoulder level: Slightly below eye level, at the shoulder. Use: Heroic but grounded; action cinema.

## Lenses

- `wide` Wide lens: Close camera, wide view: depth is exaggerated, backgrounds rush past when the camera moves. Use: Energy, comedy, claustrophobia, big spaces.
- `normal` Normal lens: Close to how the eye sees. Use: Everyday scenes.
- `tele` Long lens: Far camera, narrow view: layers flatten together, the background looks close. Use: Romance, surveillance, heat-haze drama, a crowd pressing in.

## Moves

- `static` Static: A locked-off camera. Use: Let the acting do the work; deadpan comedy.
- `push` Push in (dolly in): The camera moves toward the subject. Use: Growing importance, a realisation, rising tension.
- `pull` Pull out (dolly out): The camera moves away. Use: Reveal the surroundings, loneliness, an ending.
- `zoomin` Zoom in: The lens narrows without moving: the space flattens as it tightens. Use: 70s style emphasis; a slow ominous zoom.
- `zoomout` Zoom out: The lens widens from a detail to the scene. Use: Reveal context from a detail.
- `crash` Crash zoom: A violent, fast zoom into a face. Use: The Yeşilçam shock zoom; comedy beats; "what did you say?!"
- `dollyzoom` Dolly zoom (vertigo): The camera pulls back while the lens zooms in: the subject stays the same size, the world stretches behind. Use: The floor falling away — terror, epiphany.
- `pan` Pan: The camera turns sideways on its spot. Use: Follow action across the set; scan a crowd; a reveal.
- `tilt` Tilt: The camera tilts up or down. Use: Reveal a tall thing or person from shoes to face.
- `truck` Truck (tracking): The camera travels sideways alongside the action. Use: Walk-and-talk; parallax that shows the depth of the set.
- `follow` Follow: The camera keeps the subject framed as they move. Use: Chases, entrances, walking with a character.
- `arc` Arc / parallax slide: A slow lateral move with a slight push: the layers slide past each other. Use: Make a still moment feel alive and deep.
- `crane-up` Crane up: The camera rises and looks down. Use: Endings, leaving the characters to their fate.
- `crane-down` Crane down: The camera descends into the scene. Use: Openings: arrive from the sky into the street.
- `handheld` Handheld: A loose, breathing camera. Use: Documentary realism, panic, intimacy.
- `shake` Impact shake: A sharp shake that settles. Use: Explosions, a slammed door, a punch, an earthquake.
- `whip` Whip pan out: A blur-fast pan at the end of the shot. Use: Energy between scenes; comic "meanwhile…".
- `rack` Rack focus: Focus shifts from the background to the subject. Use: Redirect attention; reveal who is listening.
- `reveal` Rise and reveal: Starts low, rises to the subject. Use: Grand entrances.

## Compositions

- `auto` Automatic: Single for one person, two-shot for two, group for more. Use: A safe default.
- `single` Single: One person, on a third of the frame, with look room in front of their face. Use: Dialogue coverage.
- `two` Two-shot: Two people sharing the frame. Use: Relationships, banter, a shared moment.
- `ots` Over the shoulder: We look at one person past the other's shoulder. Use: Conversation that keeps both people present.
- `group` Group: Everyone listed in frame. Use: Ensemble beats, tableaux.
- `set` The set: The whole place, not tied to a person. Use: Establishing shots.

## Transitions ([TRANSITION: …])

- `cut` Cut: An instant change of shot. Use: Almost always. Invisible when it follows the action.
- `dissolve` Dissolve: One shot melts into the next. Use: Time passing, a soft change of place, a memory.
- `fade` Fade through black: Down to black and up again. Use: The end of an act; a long passage of time.
- `flash` White flash: Through a burst of white. Use: Flashbacks, shocks, dreams, a camera flash.
- `iris` Iris: A closing circle, then an opening one. Use: Silent-film charm; comic endings.
- `heart` Heart iris: The iris as a heart. Use: Romance, cheekily.
- `wipe` Wipe: The new shot sweeps across. Use: Adventure serial energy; "meanwhile".
- `wipe-up` Vertical wipe: Sweeps from bottom to top. Use: A lighter variant of the wipe.
- `clock` Clock wipe: Sweeps round like a clock hand. Use: Time passing.
- `whip` Whip pan: A motion-blurred slide. Use: High energy; linking two places.
- `zoom` Zoom through: Punch in through white into the next shot. Use: Music-video energy, sudden travel.
- `glitch` Glitch: Digital tearing. Use: Sci-fi, a hacked screen, a broken memory.
- `blinds` Venetian blinds: Stripes flip to the new shot. Use: Retro TV style.
- `pixel` Pixelate: Blocks grow then resolve. Use: Video-game feel; a teleport.
- `burn` Film burn: The film melts in a hot hole. Use: A projector breaking — nostalgia, a violent cut.
- `ripple` Ripple: The picture ripples like water. Use: Dreams, daydreams, a wish.

## Techniques (the cinema school)

Whole shot plans the studio can apply to a scene (`direct_scene` with `technique` over MCP):

- `master` **Master shot** (Coverage): One wide shot holds the whole scene, like a stage play.
- `srs` **Shot / reverse shot** (Coverage): Cut back and forth between two speakers, each framed facing the other.
- `reaction` **Reaction shots** (Coverage): Show the listener rather than the speaker for the line that lands.
- `yesilcam-zoom` **The Yeşilçam shock zoom** (Emphasis): A crash zoom into a shocked face on the big revelation, often twice in a row.
- `push-realisation` **Slow push to a realisation** (Emphasis): The camera creeps toward a face as an idea dawns.
- `vertigo` **Vertigo moment (dolly zoom)** (Emphasis): The world stretches behind a frozen face.
- `hero-low` **Hero (or villain) from below** (Mood): Low angles make a character loom.
- `tension` **Dutch tension** (Mood): Tilted, tight, handheld framings make a calm scene unsettling.
- `walk-talk` **Walk and talk** (Movement): Track alongside characters as they walk and speak.
- `oner` **The long take (oner)** (Movement): No cuts: one camera move carries the whole scene.
- `cutaway` **Cutaway / insert** (Editing): Cut briefly to a detail or the place, then back.
- `jcut` **J-cut and L-cut** (Editing): Sound leads or trails the picture: we hear the next speaker before we see them (J) or keep hearing them after we cut away (L).
- `jump` **Jump cuts** (Editing): Cuts between nearly identical framings, so time jumps.
- `smash` **Smash cut** (Editing): An abrupt cut from calm to chaos (or the reverse) for contrast or a joke.
- `pov` **Point of view** (Coverage): See what a character sees.
- `kuleshov` **Kuleshov effect** (Editing): The same neutral face reads differently depending on what we cut to around it.
- `montage` **Montage** (Editing): A rhythm of short shots that compresses time.
- `flashback` **Flashback** (Mood): The past: warm sepia, grain, a dream-soft edge, entered through a white flash or ripple.
- `dream` **Dream sequence** (Mood): Soft glow, wobble, slow moves, dissolves.
- `establish-crane` **Crane down into the scene** (Openings & endings): Open from the sky and descend onto the characters.
- `iris-out` **Iris-out ending** (Openings & endings): End on a wide and close an iris on the main character.
- `rack-reveal` **Rack-focus reveal** (Emphasis): Focus pulls from the background to someone who was there all along.
- `action` **Action coverage** (Movement): Wide for geography, tight for impact, shakes on hits.
- `sitcom` **Multi-camera sitcom** (Coverage): The studio-audience look: a wide master from the "fourth wall", two-shots for banter, singles on punchlines, and a reaction right after each joke lands.
- `deadpan` **Deadpan single-camera comedy** (Mood): A locked-off, centred, patient camera: the joke is in the stillness and the awkward pause, then a hard cut to a blank face.
