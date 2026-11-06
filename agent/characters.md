# Characters

## Look fields

A look is JSON in `[LOOK: NAME {…}]` (or `set_character` over MCP). Every field is optional; the defaults are:

```json
{"skin":"#efc8a4","hair":"short","hairColor":"#3b2a1e","beard":"none","hat":"none","hatColor":"#c81d25","glasses":"none","top":"shirt","topColor":"#3d5a80","accent":"#f4f1ea","print":"","bottom":"pants","bottomColor":"#2a2d34","shoes":"#1d1d2b","height":1,"build":1,"head":1,"mouth":"smile","holding":""}
```

| field | values |
|---|---|
| skin, hairColor, hatColor, topColor, accent, bottomColor, shoes | a colour, "#rrggbb" |
| hair | `short`, `fringe`, `side`, `slick`, `bob`, `bun`, `curly`, `wild`, `bald` |
| beard | `none`, `stubble`, `mustache`, `goatee`, `full`, `mutton`, `long` |
| hat | `none`, `beanie`, `wreath`, `headband`, `cap`, `fedora`, `headlamp`, `cloth`, `crown`, `tiara`, `tophat`, `party`, `wizard`, `cowboy`, `chef`, `fez`, `turban`, `helmet`, `spacehelmet`, `hood`, `knight`, `bandana`, `strawhat`, `pilot`, `witch`, `bone`, `antenna`, `selenite`, `sailor` |
| glasses | `none`, `round`, `square`, `cat` |
| top | `puffer`, `toga`, `robe`, `coat`, `blouse`, `hoodie`, `tweed`, `shirt`, `tunic`, `labcoat`, `tee`, `vest`, `suit`, `fur`, `spacesuit`, `armor`, `uniform`, `overalls`, `kaftan`, `dress`, `selenite`, `sailor`, `starrobe` |
| print | a short word printed on a tee (≤ 12 letters) |
| bottom | `pants`, `skirt`, `robe`, `shorts` |
| mouth | `smile`, `flat`, `smirk`, `grin` |
| nose | `auto`, `button`, `round`, `big`, `pointy`, `hook`, `potato`, `long`, `beak` |
| noseSize | 0.8 … 2 |
| eyes | `normal`, `heavy`, `dots`, `big`, `touching` |
| rest (the resting face) | `plain` (plain), `sleepy` (sleepy), `deadpan` (deadpan), `worried` (worried), `dreamy` (dreamy), `cocky` (cocky), `sly` (sly), `grumpy` (grumpy), `wide-eyed` (wide-eyed), `beady` (beady), `goggle` (goggle-eyed) |
| acc (a list, several at once) | `tie`, `bowtie`, `scarf`, `necklace`, `medal`, `badge`, `flower`, `pen`, `suspenders`, `strap`, `monocle`, `eyepatch`, `mask`, `mole`, `scar`, `freckles`, `earrings` |
| height | 0.8 … 1.2 |
| build | 0.8 … 1.3 (thin … stocky) |
| head | 0.85 … 1.25 |
| belly | 0 … 1 (a pot belly) |
| shoeSize | 1 … 1.6 |
| holding | an object id carried in the hand (small objects from objects.md), or "" |
| ghost | true for a see-through ghost |

## Stock characters

`[LOOK: NAME preset=<name>]` gives a character one of these looks:

- **Saf Bekir**: the naive hero
- **Zengin Rıfat**: the rich villain
- **Nazlı**: the lovely lead
- **Hayriye Nine**: the wise grandma
- **Kabadayı Hasan**: the tough guy
- **Profesör Cemal**: the absent-minded scientist
- **Sir Gareth**: the knight
- **Grok**: the caveman
- **Captain Nova**: the astronaut
- **Sergeant Kaya**: the soldier
- **Farmer Ayşe**: the farmer
- **Ghost of Selim**: the ghost
- **Sultan Ahmet**: the sultan
- **Pilot Leyla**: the pilot

## Voice

`[VOICE: NAME pitch=150 rate=1]`: the studio's built-in voice reads unrecorded lines (English lines get a neural voice when the user's browser can run it). pitch 90 (deep) … 320 (squeaky), rate 0.7 … 1.4. The user can record real voices in the Voices tab.

## Personality

Traits shape body language (set in the studio, or `set_character` over MCP): `naive`, `lucky`, `kind-hearted`, `confused`, `greedy`, `sly`, `show-off`, `flustered`, `sneaky`, `cool-headed`, `stingy`, `bossy`, `loud`, `secretly-kind`, `clever`, `romantic`, `brave`, `dandy`, `coward`, `conceited`, `pompous`, `sleepy`, `glutton`, `fussy`, `anxious`, `flatterer`, `big`, `loyal`, `tough`, `gossip`, `cheerful`, `protective`, `haggler`, `chatty`, `calm`, `curious`, `shy`, `short-tempered`.
