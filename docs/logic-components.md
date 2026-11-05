# Oddsparks logic and automation components

Research notes for the VoidSpark **logic sandbox** (`/logic`). The source is the
[Oddsparks Wiki](https://oddsparks.wiki.gg) (CC BY-SA), read through its MediaWiki API on
2026-11-05: the pages in `Category:Logic Enabled Buildings`, `Category:Path Add-on`,
`Category:Storage` and the logic section of the *Buildings* page, plus the quests that unlock them.

Each component below has two parts: **Wiki** is what the wiki states, and **Sandbox** is how the
simulator models it. Anything the wiki doesn't say is marked *assumption*. All the assumptions
are also listed together at the end. Where an assumption could change how a circuit behaves, the
sandbox makes it a setting.

## How the game's logic works (wiki)

- Logic is unlocked in four quests: **Basic Logic** (Merchant, tier 4: Logic Wire, Wire Bridge,
  Lever), **Sensors Logic** (Scientist, tier 5: Spark Gate, Pressure Sensor, Signal Timer,
  Capacity Sensor, Motion Sensor, Pixel Display), **Logic Gates 1** (tier 5: NOT, AND, OR, XOR)
  and **Logic Gates 2** (tier 5: Filter Gate, Buffer Gate, Data Flip-Flop, Wireless Signal
  Sender/Receiver, Counter Gate, Set-Reset Latch). **Ribbon Logic** (tier 6) adds Logic Ribbon,
  Ribbon Reader/Writer and the Four Pixel Display.
- Signals are on/off. A **Logic Wire** is a buried, one-tile wire that carries a signal, and a
  **Wire Bridge** lets two wires cross without connecting.
- **Logic-enabled buildings** (the path add-ons, the Cannon, the Train Stop and the Signpost) are
  unaffected while nothing is wired to them. Once a wire is connected, they work only while the
  signal is on. When the signal is off they turn grey and sparks ignore them. The Blocker and
  Spark Gate are the exceptions, described below.
- Items don't ride conveyors. **Sparks** carry them along **paths**, one item or one stack per
  spark depending on the spark (a Hauling Spark carries a whole stack). Path add-ons placed on
  path tiles decide where sparks may go.

## Signal sources

### Lever
- **Wiki:** "Sends a signal when manually activated." 1 tile. No settings listed.
- **Sandbox:** a toggle. Tap it while the simulation runs, or use the panel's switch. Its position is
  saved with the circuit.

### Push button (sandbox only)
- **Not in the game.** It's added because a momentary pulse is handy for testing counters,
  flip-flops and latches. When tapped, it sends a pulse of a configurable length (0.1 to 10 s).

### Signal Timer
- **Wiki:** "Repeatedly sends a signal for some time, and then stops sending a signal for some
  time." Settings in 0.1 s steps: **send for 0.0 to 10 s**, **wait for 0.0 to 10 s**.
- **Sandbox:** the same two settings. *Assumption:* it starts in the "send" phase and has no
  input. The wiki shows no input port. A setting picks whether it starts on or off.

### Capacity Sensor
- **Wiki:** placed facing a storage building ("eye facing it"). It sends a signal when the
  observed inventory meets the condition:
  - **Percent mode:** `<=` or `>=`, 0 to 100 % in 1 % steps.
  - **Absolute mode:** `<=` or `>=`, 0 to 9999 in steps of 1.
- **Sandbox:** the sensor's *eye* port is linked to a storage's *sensor* port, drawn as a dotted
  line, in place of facing it. Same modes, comparisons and ranges. *Assumption:* it counts every
  item in the storage. There's an optional sandbox-only setting to count one item type, which is
  handy for mixed storage. The wiki has no hysteresis setting, so a refill band is built from
  two sensors and a Set-Reset Latch, as the distribution example does.

### Pressure Sensor
- **Wiki:** "Sends a signal when it's stepped on", by the player or a spark. It's placed on a path.
- **Sandbox:** an inline path piece. Items pass through it, and it outputs a signal while one is on
  it. *Assumption:* "on it" lasts a configurable 0.5 s per item, since the game's timing depends on
  walking speed.

### Motion Sensor
- **Wiki:** detects motion in a cone in front of it. Length and angle can each be adjusted by -2
  to +2.
- **Sandbox:** not modelled spatially, because the sandbox has no free-roaming sparks or player.
  Use a Lever or a Pressure Sensor as a stand-in.

## Gates

The wiki gives each gate's footprint, with inputs on one side and the output opposite. The
sandbox keeps those footprints, so parts take the same number of tiles as in the game:
- 2 tiles: NOT, Buffer and Filter Gate (input tile, output tile), Ribbon Writer and Reader.
- 3 tiles in a row: Counter Gate (output, middle, input) and Wire Bridge (end, gap, end).
- 2×2: AND, OR, XOR, Set-Reset Latch and Data Flip-Flop.
- 1 tile: Lever, Signal Timer, sensors, Wireless Sender and Receiver, and both displays.

| Gate | Wiki | Inputs → outputs | Settings |
| --- | --- | --- | --- |
| **NOT** | "Sends a signal if it has not received a signal" | 1 → 1 | — |
| **AND** | signal if both inputs are on | 2 → 1 | — |
| **OR** | signal if at least one input is on | 2 → 1 | — |
| **XOR** | "signal if it has received exactly one signal" | 2 → 1 | — |
| **Buffer Gate** | on while the input is on, and **keeps sending for some time after it stops** | 1 → 1 | hold time 0 to 10 s, 0.1 s steps |
| **Filter Gate** | on **only if the input has been on for some time** | 1 → 1 | 0 to 10 s, 0.1 s steps |
| **Counter Gate** | after **2 to 10** signals, outputs a continuous signal. Output stops at the next signal. It has a "reverse display" checkbox | 1 → 1 | count 2 to 10 |
| **Set-Reset Latch** | Set (C) turns output A on and it stays on. Reset (D) turns A off and B on. B is on when first placed. "Not meant" to get both at once | 2 → 2 | — |
| **Data Flip-Flop** | when Clock (D) goes from off to on, output A takes the value of Data (C). B is always the opposite of A. B is on when first placed. A clock held on only latches once | 2 → 2 | — |

**Sandbox details and assumptions**

- **Buffer Gate:** while the input is on, the output is on. When the input turns off, the output stays
  on for the hold time. A new signal during the hold restarts it. A hold of 0 makes it a plain
  repeater.
- **Filter Gate:** the output turns on once the input has been continuously on for the set time,
  and turns off as soon as the input does. Short pulses are swallowed. A time of 0 makes it a plain
  repeater.
- **Counter Gate:** counts rising edges (off → on). When the count reaches N, the output turns on
  and the count resets. The next rising edge turns the output off. *Assumption:* the wiki doesn't
  say whether that edge also counts as the first of the next N. A setting picks either behaviour.
  The default is that it doesn't count. The "reverse display" checkbox only changes the in-game
  display, so it isn't modelled.
- **Set-Reset Latch:** *assumption:* when Set and Reset are both on, Reset wins. A setting can
  make Set win instead.
- **Data Flip-Flop:** as the wiki describes. It samples on the rising edge of the clock only.

## Connectors

### Logic Wire and Wire Bridge
- **Wiki:** a Logic Wire is "a buried wire that can transmit signals", one tile per wire. The Wire
  Bridge "allows for two logic wires to cross each other without being connected". Its footprint
  is a tile, a gap and a tile, hopping over the middle.
- **Sandbox:** logic runs on **wire tiles on the grid**, as in the game. Tiles are buried, so they
  can run under parts.
  - Each tile records which neighbours it was drawn to, and two tiles join only if both point at
    each other. *Assumption:* wires laid side by side stay separate. This has to be so, or two
    different signals could never reach the two adjacent input tiles of a 2×2 gate.
  - A part's logic port plugs into the tile just outside it, in the direction the port faces.
    *Assumption:* the wiki doesn't say exactly how a wire attaches to a building's port tile.
  - Everything joined forms one network. The network is on if **any** output plugged into it is
    on. *Assumption:* outputs wired together combine as an OR.
  - A **Wire Bridge** is a building three tiles long, as on the wiki: an end tile, a gap and an
    end tile. Its two ends are one wire: each end's port plugs into the wire tile beyond it. A
    different wire can run through the gap tile underneath without touching it. You can place one
    from the palette (Wiring). Or tap a tile where two wires meet and choose **Split with a
    bridge**: the left–right wire is lifted onto a bridge, so the two wires just cross.
  - You can draw tiles with the Wire tool. You can also tap one port and then another, and the
    sandbox lays the wire for you. It takes a short route around parts and other ports. Where it
    has to cross a wire, it builds a Wire Bridge with the other wire in the gap.

### Wireless Signal Sender / Receiver
- **Wiki:** the channel is an **item** placed in the building's one filter slot. "Requires an
  item for any signal to be sent, i.e. empty item filter is not a valid channel." The receiver
  outputs what is sent on its channel. "Not known if there is a range limitation."
- **Sandbox:** the channel is an item picked from the game's item list, and an empty channel never
  carries a signal. A channel is on if **any** sender on it is on. *Assumptions:* there's no range
  limit, and senders on the same channel combine as an OR.

### Logic Ribbon, Ribbon Writer, Ribbon Reader, Four Pixel Display
- **Wiki:** a Logic Ribbon is "a buried ribbon of wires that can store up to four separate
  signals", on bits 0 to 3. "If a Ribbon is receiving a signal (without the use of a Ribbon
  Writer), it will be held on Bit 0." A Ribbon Writer puts a wire's signal on bit 1 to 3, and a
  Ribbon Reader reads bit 1 to 3 back onto a wire. Each is two tiles, input and output. The Four
  Pixel Display is one tile with one logic input, and lights four elements individually.
- **Sandbox:**
  - **Ribbon tiles** carry four networks, one per bit. Joined ribbon tiles join bit for bit.
  - A plain wire tile joined to a ribbon, or a plain port plugged into one, uses **bit 0**.
  - **Ribbon Writer:** a wire in, a ribbon out on its chosen bit (1–3).
  - **Ribbon Reader:** a ribbon in on its chosen bit (1–3), a wire out.
  - **Four Pixel Display:** one input that shows all four bits of the ribbon it plugs into. On a
    plain wire, only the first lamp (bit 0) can light.
  - The writer and reader are two tiles long (input tile, output tile), as on the wiki.

## Outputs

- **Pixel Display (wiki):** "Lights up if it receives a signal." **Sandbox:** a lamp.
- **Four Pixel Display:** shows a ribbon's four bits; see above.

## Path add-ons (logic-enabled)

All of these sit on a path. Unless stated otherwise, the wiki's rule is: **when connected to
logic, it must be powered to work. Unpowered, it turns grey and sparks ignore it.**

| Add-on | Wiki behaviour | Settings (wiki) |
| --- | --- | --- |
| **Item Filter** | sparks may pass only while carrying the item in its slot, otherwise they keep walking another way. Empty means only empty-handed sparks pass. Can be reversed to block that item | 1 item; reverse |
| **Amount Filter** | passes only sparks carrying a matching amount, exactly, `>=` or `<=` | amount; comparison |
| **Spark Filter** | passes only the spark type in its slot. Empty has no effect. Can be reversed | spark; reverse |
| **Blocker** | **while activated** (by a signal or by hand), blocks sparks and the player. Deactivated, no effect | manual toggle |
| **Spark Gate** | sparks wait until it receives a signal. Unpowered, the gate drops and **sparks cannot pass** | — |
| **Splitter** | sparks entering from the back leave by the lit arrow, which cycles right to left across the available exits. Unpowered, sparks ignore it, but it still cycles | — |
| **Wait Gate** | sparks wait a set time before passing | 0.5 to 5 s, 0.1 s steps |
| **Counter** | counts items carried through it from the gate side within the last minute | — |
| **One Way** | sparks may pass only in the arrow direction | — |
| **Crossing** | sparks go straight across a junction | — |
| **Signpost** | map marker. Unpowered, it's hidden | 1 item |

**Sandbox model.** A sandbox path is a directed link from one part's item output to another
part's item input. Items move along it as tokens at a set walking speed (default 2 tiles/s,
*assumption*). Tokens queue when the end is blocked, and a full path stops whatever feeds it.

- **Item Filter:** an *in*, a *pass* exit and a *reject* exit ("keep walking"). Tokens that match
  go to *pass*, and the others go to *reject*. If *reject* isn't connected, they wait. Settings:
  item, reverse. Wired and unpowered, everything goes to *pass*.
- **Amount Filter:** the same, comparing the token's stack size against the amount.
- **Blocker:** wired, it blocks while the signal is on. Unwired, a manual *closed* setting decides,
  and you can tap it.
- **Spark Gate:** wired, it passes only while the signal is on. *Assumption:* unwired, it lets
  everything through. The wiki only describes the wired case.
- **Splitter:** one input and up to three exits. Tokens go round-robin to the exits that have room.
  Wired and unpowered, everything takes the first exit (sparks ignore it).
- **Wait Gate:** holds each token for its time (0.5 to 5 s).
- **Counter:** shows items per last 60 s. *Assumption:* the wiki doesn't say it outputs a signal,
  so it only displays the count.
- **Spark Filter, One Way, Crossing, Signpost:** not modelled. Sandbox paths are already one-way
  links that never cross or join by accident, and tokens don't carry a spark type.

## Storage

| Building | Wiki slots |
| --- | --- |
| Crate | 4 |
| Barrel | 8 |
| Shed | 24 |
| Big Crate | 2 × 10 stacks |
| Big Barrel | 4 × 10 stacks |
| Supply Chest | 4 |

- **Wiki:** sparks drop items into storage and pick items up from it. The wiki has no stack sizes
  and no "extract on signal" building. Extraction in the game means sparks walking a route out of
  the storage, controlled with a Spark Gate or Blocker on that route.
- **Sandbox:** a **Storage** part holds counts per item up to a capacity in items. Presets size it
  as a crate, shed and so on, *assuming* 50 items per stack. It has an item input, an item output
  (with an optional "take only this item" setting) and a *sensor* port for Capacity Sensors. Items
  leave at a haul rate (items/s) whenever the output path has room.
- **Extractor (sandbox stand-in):** the hauling route out of a storage, reduced to one part. It has
  an item in, an item out, a rate and an enable input. Wired, it runs only while powered, like a
  Spark Gate on the route. It's what the distribution example uses.

## Machines

- **Wiki:** workstations aren't in `Category:Logic Enabled Buildings`, but the Basic Logic quest
  says logic can "control many of your existing buildings, turning them on and off at the switch of
  a lever". The Cannon ("requires a logic signal to fire") and the Train Stop ("when it receives a
  signal, trains are allowed to leave") are the other logic-controlled buildings listed.
- **Sandbox:** a generic **Machine**. It has an item in, an item out and an enable input. It's on
  while the enable network is on, or always if nothing is wired. Choose a product from the game
  data and it takes that recipe's inputs, outputs and duration. Or leave it as a pure consumer, for
  example "uses 1 item every 2 s", to stand in for a station using up a resource. *Assumption:* the
  recipe time is per craft at 1× crew speed. A speed multiplier setting is available.
- **Output slot (sandbox):** each product has an output slot that holds one stack. The stack
  size comes from the item's wiki infobox (`stacksize`). The importer's `STACK_SIZE_OVERRIDES`
  can correct any item where the game differs (none so far). Items with no wiki stack size use 20. A craft starts only if its products will fit. With no exit path
  and nothing taking the products, the machine stops when the slot is full, and **Take output** in
  the inspector empties it, as a player would. With a path, sparks carry products away one at a
  time. Each machine can override the slot size ("Output slot holds").

## Sandbox-only helpers

- **Source:** items arriving (a train being unloaded, a harvester and so on). It cycles through a
  list of items at a set rate and stack size. It has an optional enable input.
- **Label:** a text note on the grid.

## Timing model (assumptions)

- The simulator runs in fixed ticks of **0.05 s** (20 per second at 1× speed). Times set in 0.1 s
  steps, as in the game, are exact.
- Every component reads its inputs from the previous tick and writes its outputs for the next one,
  so **each gate adds one tick (0.05 s) of delay**. The real in-game delay isn't documented. This
  rule makes feedback loops safe: a NOT gate wired to itself oscillates at the tick rate instead of
  recursing forever, and cross-coupled gates settle into a latch.
- Wireless adds one more tick (sender → channel → receiver).

## Summary of assumptions

1. Outputs wired together, and wireless senders on one channel, combine as OR. Wire tiles join
   only where drawn, so wires side by side stay separate. Ports plug into the tile they face.
2. Each gate adds 0.05 s of delay. The simulator runs fixed 0.05 s ticks.
3. Signal Timer has no input and starts sending, unless set to start off.
4. Counter Gate: the edge that ends the output doesn't count toward the next N (configurable).
5. Set-Reset Latch: Reset wins when both inputs are on (configurable).
6. Wireless has no range limit.
7. Unwired Spark Gate lets everything through.
8. Path Counter only displays a count. It has no signal output.
9. Pressure Sensor stays on for 0.5 s per item (configurable).
10. Storage capacity is set in items, with presets at 50 items per stack. Capacity Sensor may count
    a single item type (sandbox extra).
11. Items walk at 2 tiles/s by default, and a path holds about 2 items per tile.
12. Machines run while their enable input is on, or always if unwired. Recipe time is at 1× crew
    speed. A machine's output slot holds one stack (the wiki's stack size; 20 when unknown).
13. A Wire Bridge's ends plug into the tiles beyond them, and its gap can hold exactly one other
    wire.
14. Not modelled: Motion Sensor, Spark Filter, One Way, Crossing, Signpost, Cannon, Train Stop.
    Item paths are still drawn as links between ports, not as path tiles.

## Icons

The palette uses the wiki's building renders (`src/lib/assets/logic/`, fetched by
`scripts/import-logic-icons.mjs`). The renders are isometric, so they can't show rotation or port
positions, and they turn into small blobs on two- and three-tile parts. On the grid, each part is
drawn as a flat SVG symbol (`src/lib/logic/ui/Glyph.svelte`) that turns with the part and spans
its whole footprint:
- **Gates:** standard symbols. The AND, OR and XOR output leaves from the lower-right tile, in line
  with input B, matching the wiki's 2×2 footprint (two input tiles, output on one corner tile).
- **Latch and flip-flop:** S/R/Q and D/clock/Q letters at the ports.
- **Ribbon parts:** the Writer and Reader show a wire, an arrow and the ribbon, with their bit
  highlighted.
- **Other parts:** the Counter Gate shows tally marks, filters a funnel, the Wait Gate an
  hourglass, the timer a clock, the Capacity Sensor an eye, the Blocker a barrier, the Spark Gate
  a gate arm, storage a crate, and machines a gear.
- **Items:** a filter's item, a wireless channel or a machine's product is shown as a small game
  icon in a corner.
