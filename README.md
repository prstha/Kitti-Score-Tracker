# Kitti Scorekeeper: Project Summary

Use this file to continue the project in a new Claude conversation. It covers the game, the money logic, the web app as built, and decisions already made. The latest app file is `kitti.html` (attach it alongside this summary if you want changes made to it).

## 1. The game

Kitti (also called "9 card") is a Nepali card game, popular during Dashain and Tihar.

- 2 to 5 players, one 52-card deck, 9 cards each.
- Each player arranges their 9 cards into three hands of 3 cards.
- Hands are compared one by one. A player who wins 2 of the 3 hands wins the game.
- Hand ranking, high to low: Trial (three of a kind), Color run (straight flush), Run (straight), Color (flush), Jute (pair), High card.

The group plays with no cash on the table, so the app keeps a ledger of who owes whom.

## 2. Money rules (confirmed by the user)

Terms:
- **Pot**: the total put in per game, for example Rs 80 with 4 players.
- **Share (S)**: pot divided by seated players, for example Rs 20 each.
- **Streak (k)**: number of games since the last win, including the current one.

Outcomes:

| Outcome | Condition | Each loser pays | Winner gets |
|---|---|---|---|
| Win | Wins 2 of 3 hands | k × S | (N − 1) × k × S |
| Salami | Wins all 3 hands | (k + 1) × S | (N − 1) × (k + 1) × S |
| Kitti | Nobody wins 2 hands | Nothing yet, money stays on the table | Pot carries to next game |

House rules (confirmed by the user):

| Rule | When | Money |
|---|---|---|
| Four of a kind | Optional, switched on at setup ("House rules"). Holding four of a kind is an instant win. | Paid the same as a normal Win |
| Save the game | A player dealt four pairs can save the game. The deal is skipped and cards are dealt again. | Nothing changes: no extra stake, game number stays the same. Not a Kitti. |

Notes:
- A Kitti can repeat, and the table keeps growing until someone wins.
- Salami means each loser adds one extra share of the current game, not double the whole pot. This was confirmed from the user's notes: Kitti then Salami at Rs 20 each meant 40 + 20 = 60 from each of 3 players, so the winner got Rs 180.

General form used in the app (handles players joining, leaving and pot changes): each seated player adds the current share to the table every game. On a Win, the winner takes everything on the table. On a Salami, the winner takes the table plus one extra current share from each seated loser.

## 3. Joining, leaving, and changing the pot

- **Joining**: a new player puts in the same share from the game they join. Share per person stays fixed, so the pot grows (Rs 20 each: Rs 80 becomes Rs 100 with a 5th player). Max 5 seated players.
- **Changing the pot**: applies from the current game. Past games keep their amounts. New share = new pot / seated players.
- **Leaving** (min 2 players must stay):
  1. The leaver settles their score with the other players now, in cash. If they are down, they pay the players who are up (largest first). If they are up, the players who are down pay them.
  2. If the leaver has money on the table from Kitti games, they pay it in equal parts to the players who stay. Those players keep it on the table, so it goes to the next winner.
  3. The app shows exactly who pays whom, and the user taps "Payment done". The leaver's score becomes Rs 0 (settled) and play continues.
- An open choice: share stays fixed when players join or leave. The alternative is to keep the pot fixed and change the share. The user has not asked to change this.

## 4. Worked example (user's real game)

Players: Ankit, Prab, Sadikshya, Ronish. Pot Rs 80, Rs 20 each.

| Games | Result | Each loser paid |
|---|---|---|
| 1–2 | Kitti, then Ankit Salami | 60 |
| 3 | Ankit won | 20 |
| 4 | Ankit won | 20 |
| 5 | Ronish won | 20 |
| 6 | Prab won | 20 |
| 7–8 | Kitti, then Sadikshya won | 40 |
| 9–10 | Kitti, then Prab won | 40 |

Final standings: Ankit +180, Prab +20, Sadikshya −60, Ronish −140. The total is zero. Use this as a test case for any change to the logic.

## 5. The web app (kitti.html)

Single self-contained HTML file with inline CSS and JavaScript. It runs in any browser, works offline, and saves the game in the browser's localStorage. Google Fonts (Baloo 2, Mukta) load when online, with system font fallbacks.

**Setup screen**: number of players (2–5), names, pot per game with quick picks (Rs 40, 80, 100, 200), a House rules switch for "Four of a kind wins instantly" (off by default), and a "Deal the cards" button.

**Game screen, top to bottom**:
- Language toggle: English and Nepali. In Nepali, numbers show in Devanagari digits.
- Four tool buttons: Add player, Change pot, Player leaves, Reset game.
- Card-table hero (green felt, wooden edge) showing the game number, share per person, total money on the table, the amount carried from Kitti games, and how much each player has on the table.
- "Four pairs? Redeal" button next to "Who won game N?": logs the redeal in history, nothing else changes.
- When the Four of a kind rule is on, a purple "4 of a kind" button sits next to Salami and Win on the bottom bar.
- Small player cards styled as playing cards, all in one row so 5 players fit without scrolling. Tap one to select the winner, then tap Win or Salami on the wooden bottom bar.
- Kitti zone below the cards: a prominent cream Kitti button, plus optional name chips for "Who broke the run?". A player wins with 2 hands in a row (1st+2nd or 2nd+3rd); a Kitti happens when someone breaks that run, and that player deals the next game. If chosen, the table shows "X deals this game" and the history records it. It has no effect on money.
- After a Win or Salami, an overlay pops up with the result (winner, total won, amount from each loser), Add player and Player leaves buttons (the natural moment for people to join or leave), a big "Start next game" button, and "Undo this result". The ✕ hides it; "Start next game" stays on the bottom bar. After a Kitti, play continues straight away.
- Collapsible sections: Scores and settle up (with fewest payments needed), Game history (including joins, leaves and pot changes), How the money works.
- A message after each action with an Undo button. Undo reverses the most recent action: a game, starting the next game, a join, a leave, or a pot change.
- Reset asks for confirmation on the page itself (browser pop-ups are blocked in the hosted version), then returns to setup with names and pot filled in.

**UX decisions the user asked for**:
- Money on the table is the main focus. No money is shown next to player names on the cards.
- Select the winner first, then choose Win (main button) or Salami.
- Add player and Change pot are separate buttons at the top. Reset is always visible.
- Bilingual English and Nepali.
- Looks like a card game.
- Kitti button in the middle of the screen with focus, not on the bottom bar.
- Player cards small enough that 4 or 5 are visible without scrolling.
- Start next game as an obvious overlay, with join and leave options in it.

## 6. Data model (for developers)

```
state = {
  players: [names],            // everyone who has ever sat down, in order
  seated:  [true/false],       // currently at the table
  share:   number,             // current share per seated player
  rules:   {four: bool},        // house rules chosen at setup
  rounds:  [{type: "win"|"salami"|"kitti"|"four", winner, share, seated:[player indexes], breaker?}],  // breaker: optional, Kitti only
  events:  [{type: "join"|"leave"|"pot"|"redeal", p, isNew, pot, share, prevShare, before}],
  waiting: bool,               // true after a win, until "Start next game"
  actions: ["round"|"next"|"event"]   // undo stack
}
```

Balances are always recomputed by replaying rounds and events from the start, never edited directly. `before` on an event is the number of games played when it happened. Settle-up uses a greedy match of largest debtor to largest creditor. When a leaver's table money does not split evenly, whole rupees are split with the remainder going to the first players.

## 7. Possible next steps

- Choose whether share or pot stays fixed when players join or leave.
- Let several phones share one live game (needs a shared backend).
- Export or share the final settle-up as text.
- Optional house rules, such as tie-breaks or bonuses.
