# Screenplay format

The studio imports a forgiving screenplay format (also: Script → 📥 Import screenplay). One cue or line per line. Turkish headings and directions work too.

## Structure

```
TITLE: The Lost Cezve                    the film's title
[LOOK: SEDAT preset=Saf Bekir]           a character's look (see Characters below)
# ACT ONE                                an act (also: ACT ONE, BÖLÜM 1)
INT. KAHVEHANE - MORNING                 a scene: INT./EXT./SCENE:/İÇ./DIŞ. + words (the set is guessed from them)
[SET: kahvehane]                         …or set exactly (an id from sets.md)
[TIME: dawn]                             dawn | day | dusk | night (also guessed from MORNING/NIGHT/…)
Sedat polishes cups behind the counter.  action: becomes the scene's description (and simple blocking)
SEDAT (worried): Where is my cezve?      a line: NAME (parenthetical): text
NERMIN                                   classic layout also works: NAME on its own line,
(innocently)                             an optional (parenthetical),
I have not seen any cezve.               then the text up to a blank line
```

## Characters

Characters are created from the names that speak or appear (a name is 1–3 capitalised words). Give each one a look before the first scene:

```
[LOOK: SEDAT preset=Saf Bekir]                                   a stock character's look (names in characters.md)
[LOOK: NERMIN {"hair":"bun","hairColor":"#3b2a1e","top":"dress","topColor":"#06d6a0","acc":["necklace"],"rest":"cocky"}]
[LOOK: AHMET YSC1:eyJuYW1l…]                                     a character code copied from the studio (🔗 code)
[VOICE: NERMIN pitch=210 rate=1.1]                               the studio voice: pitch 90–320, rate 0.7–1.4
[BIO: NERMIN Runs the bakery across the street; never admits a mistake.]
```

Look JSON may set any of the fields in characters.md; fields you leave out keep the defaults. A name that is already in the user's film keeps its look unless you give one.

## Acting in a line

The parenthetical takes a mood word, and exact names as key=value, separated by ; or ,:

```
SEDAT (angry): …                                   a mood: `neutral`, `happy`, `angry`, `surprised`, `sad`, `smug`, `scared` (or words like furious, crying, laughing)
SEDAT (very surprised): …                          an expression on its own (level + name, see acting.md)
SEDAT (worried; expr=very worried; pose=wipe-brow): …
SEDAT (expr=smug + guilty, gesture=shrug): …       expressions mix with +; gestures: `rest`, `point`, `up`, `shrug`, `wave`, `think`, `hold`, `cheer`, `facepalm`, `type`, `scared`, `fist`, `bow`, `hug`, `clap`, `salute`
```

## Stage directions and blocking

Plain sentences that start with a name are blocked: "SEDAT enters." (from the set's door), "Sedat leaves.", "Nermin walks to the counter." (a mark), "Sedat sits.", "Nermin stands up.", "Sedat sighs." (a mood beat). Anything else is description. For exact control:

```
[PLACE: SEDAT x=900 z=0 facing=right]        where they stand when the scene starts (x on the set, z depth: 0 front … 300 back)
[MOVE: SEDAT to=counter]                      walk to a mark of the set (marks are in sets.md) or to=<another name>
[MOVE: SEDAT x=1500 run]                      …or to an x; flags: run, with (at the same time as the previous beat); style=<walk>
[MOVE: NERMIN to=door style=sneak]            walks: `walk`, `run`, `jog`, `sneak`, `tiptoe`, `march`, `skip`, `limp`, `strut`, `stagger`, `waddle`, `shuffle`, `hop`
[ACT: SEDAT pose=facepalm expr=extreme sad]   strike a pose / pull a face (names in acting.md); dur=<seconds>
[ACT: NERMIN face=front]                      face=left | right | front | <name>; flags: sit, stand, appear, disappear, with
[PICK: SEDAT cezve]                           walk to an object placed with [OBJECT:] and pick it up (it stays in the hand)
[GIVE: SEDAT cezve to=NERMIN]                 hand it over; [PUT: NERMIN cezve x=1400] puts it down (x, y optional)
[INTERACT: SEDAT handshake with=NERMIN]       a two-person interaction (acting.md): handshake, hug, high-five, slap, punch, push…
```

## Cues

```
[OBJECT: cezve x=1300 z=60 scale=1.2 flip]   an object from objects.md on the set (x, z depth, y lift, scale, flip)
[SFX: door-knock]                            a sound (ids in sound.md; words are matched too)
[MUSIC: comedy]                              the scene's music: `nostalgia`, `comedy`, `romance`, `tension`, `action`, `sad`, `mystery`, `epic`, `space`, `spooky`, `jazz`, `bazaar`, `ragtime`, `silent-drama`, `country`, none
[FX: rain]                                   a look or weather over the scene (sound.md)
[VFX: explosion]                             an event at that moment (sound.md)
[PAUSE 1.5]                                  a pause in seconds
[TITLE: Later that night…]                   a caption
[SHOT: CU Sedat, low angle, push in]         the next beat starts with this shot (camera.md)
[TRANSITION: dissolve]                       the transition into the next shot; also CUT TO: / DISSOLVE TO: / FADE OUT.
```

Scenes with no [SHOT:] notes are covered by the studio director (establishing shot, singles, reactions). With notes, the scene uses exactly your shots, starting each where you put it.

## A complete example

```
TITLE: The Lost Cezve
[LOOK: SEDAT preset=Saf Bekir]
[LOOK: NERMIN {"hair":"bun","top":"dress","topColor":"#06d6a0","bottom":"skirt","bottomColor":"#06d6a0","rest":"cocky"}]
[VOICE: NERMIN pitch=220]

# ACT ONE
INT. KAHVEHANE - MORNING
[SET: kahvehane]
[TIME: dawn]
[MUSIC: comedy]
[OBJECT: cezve x=1500 z=40]
[PLACE: SEDAT x=1100]
Sedat searches every shelf of the coffeehouse.
[SHOT: WS everyone]
SEDAT (worried; pose=scratch-head): Where is my cezve? It was right here!
NERMIN enters.
[SHOT: MS Nermin]
NERMIN (expr=innocent): Good morning, neighbour. Lost something?
[SHOT: CU Sedat, push in]
SEDAT (expr=suspicious): Why are you smiling?
[ACT: NERMIN pose=hands-behind]
[SFX: crash]
[SHOT: CU Nermin, crash zoom]
NERMIN (expr=very embarrassed): That was not me.
[TRANSITION: iris]
```
