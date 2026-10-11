// What he says on walking into the play room: no lessons here, it is the
// place to hang out, use the emotes and spend coins in the shop. The first
// visit gets the welcome; later visits stay quiet.

export const PLAY_WELCOME = {
  first:
    "Welcome to the **play room**! No lessons in here, we just hang out. Hit Emotes to see my moves, and spend your coins in the Shop to make this place your own.",
  delayMs: 900, // after the world cross-fade, and after the lesson's own hush on the switch
} as const
