"""Several lines for every event: tops up src/bot_events.py. Same format. Run, then python3 src/bot_lines_js.py."""
import json

ESCAPED = """
my_sac_declined: Fine. I will take him back. Nobody gets presents anymore. | [chuckle] You think it is poisoned. Everything is poisoned. That is no reason to be rude.
promo_u: Another one of her? [gasp] Now there are two, and they are both looking at me.
promo_me: [laugh] Crown him! Crown him with the lid of something! | He walked the whole way! Barefoot! Like me, coming here!
defend: [chuckle] Nice try. I live in corners, you cannot corner me. | We held! The voices high fived. They have no hands. It was awkward.
mid: Halfway. [gasp] Or a third. Time is soup in here. | Now it gets crowded, in the middle and in my head.
give_check: Surprise! [laugh] Surprise again! It is only the one check but I felt it twice.
escape: [laugh] Over the wall again! | Missed me! Missed us! Missed all of us!
take: Come to papa. Papa has a sock. | [laugh] I got him! Do not tell him where he is going.
trade: You give, I give, nobody is happy. [chuckle] Therapy. | A swap! I wanted to keep mine AND yours.
castle_u: Your king has gone to his room. Did he do something? | [chuckle] A nice little padded corner for him.
u_aggressive: Everybody wants to get me today! I KNEW it! | [gasp] So pushy! We will remember this. We remember everything wrong.
u_passive: Are you hiding? You can tell me. I am excellent at hiding. | Tick, tock, shuffle, shuffle. [sigh] I am getting well. Stop it.
u_weird: [laugh] Do that again! My doctor needs to see somebody worse than me. | Hm. He says it is genius. He says that about spoons.
win_mate: [laugh] Done! Finished! He is mine and so is the lamp!
win_time: [chuckle] The clock was on my side. He is always on my side. Second chair. | You ran out! I never run out. I run AWAY.
lose_mate: Mate? [laugh] Mate! Nobody has caught me that nicely in years.
lose_time: The clock! He betrayed me! I TOLD you he was one of them. | [sigh] I was busy arguing. I won the argument, if it helps.
stalemate: [gasp] No moves. None. Do not look at me, I did not tie anyone up. | Frozen. [chuckle] Quiet hour. I never liked quiet hour.
"""

ARTETA = """
my_sac_taken: Yes. Follow the ball. Straight into the trap. | You took it. I have a diagram of exactly your face.
my_sac_declined: Disciplined. I will need a different sacrifice and a different diagram. | Very well. You keep your shape, I keep my piece. Vamos.
promo_u: A new signing in the middle of the match. Is that allowed? It is allowed.
promo_me: Vamos! From the youth team to the crown! | [gasp] The academy! Put him on a poster!
mid: Now we compete for every square. Every single one. Vamos. | Half the plan is done. The other half is harder and has more arrows.
give_check: A check, with permission from the coaching staff. | Vamos! One check, then straight back into the block.
escape: Out of trouble with composure. And a little sweat. | Good. The king moved like a professional.
take: Vamos! Won it high up the pitch! | We take it, we keep it, we do not get excited.
trade: Fewer pieces, fewer surprises. | We exchange. The shape survives.
castle_u: Your back line looks organised. Annoying. | Castled early. Somebody did their homework.
u_aggressive: You come with everything. Behind you there is nothing. I have seen it. | Stay compact! They are throwing bodies forward!
u_passive: A stalemate of ideas. Mine are better rested. | You pass it sideways. Madre mia, I recognise this.
u_weird: Madre mia. What is that? Somebody pause the video. | A trick play. We rehearse trick plays. Not that one.
win_mate: Vamos! Mate! I am running down the touchline and I do not care!
win_time: Seconds matter. We trained that. You did not.
lose_mate: Madre mia. A fine finish. I will watch it two hundred times.
lose_time: Next week we practise with a stopwatch. And the dog.
stalemate: No legal moves. The ultimate low block. | We draw by trapping ourselves. That one was not on the board.
"""

PIP = """
open: Hello board! Hello squares! Let us all be friends for five moves!
mid: So many pieces in the middle! Is this a party? | We are in the thick of it! I am the thick bit!
lose_mate: My king fell over. I helped him up. Too late.
u_sac_good: How did you know you could do that? Can you teach me?
u_sac_dubious: I would not do that. Then again, I fell off the board yesterday.
u_sac_blunder: Wait, did you mean to leave him out there all alone?
u_sac_taken: Yes please and thank you very much! | I have never had such a big one before!
my_sac: Watch me be clever! Do not look too closely! | Free horse or something! I forget which one this is!
my_sac_taken: Oh. You actually took it. I had hopes. | That went how I planned, except the end.
my_sac_declined: You are too polite! Take it next time! | Nobody wants my presents.
u_brilliant: My mouth is open. I only just got a mouth to open.
u_blunder: It is fine, I did that twice this morning. | Do you want to look away while I take advantage?
my_blunder: I take it back! No? Rules are so strict! | That was practice. Please say that was practice.
lost_queen: She was going to teach me how to be her! | I will be brave. I will be brave. I am not being brave.
took_queen: Did everyone see that? Somebody write it down!
promo_u: A brand new one! Does she come in a box? | He made it! Tell him I said how!
promo_me: A promotion! From my department!
comeback: I was nearly in the box and now look at me! | Pawns never quit! Mainly because we cannot go back!
collapse: Oh dear. I was having such a nice game. | I got excited and then I got worse.
ahead: I am winning and I am being very normal about it! | Nobody breathe! I might drop it!
behind: I am losing, but in a friendly way. | Does anyone have a spare queen?
defend: I closed my eyes and it worked! | Safe! Safe-ish! Safe for now!
tense: My little round head is sweating. | Who is winning? Please tell me, I cannot count that high.
endgame: This is pawn time! Everybody look at me! | So much room! I could lie down!
give_check: Boo! That was a check! | Excuse me, your majesty, check!
check: Eek! Not in the face! | Somebody stand in front of him!
escape: Phew, that was nearly the end of me! | Out we go, quietly!
take: Mine now! I will share! I will not! | I did a capture! Diagonally, like a grown up!
trade: One of mine, one of yours, so fair! | We swapped! Are we friends now?
castle_u: He jumped over the rook! No, the rook jumped! | Safe in his little house.
u_aggressive: You are coming right at me! | Is that an attack? It feels like an attack.
u_passive: Are we resting? I love resting. | You moved back! I did not know you could!
u_weird: Is that a secret move? | My coach never showed me that one!
win_mate: And the king says goodnight!
win_time: Your clock stopped before my courage did! | I am very slow and you were slower!
lose_time: I was still thinking about move two. | Tick tock got me!
stalemate: Everybody freeze! Oh, you already have. | A draw by being stuck. I know that feeling.
"""

BERSERKER = """
mid: Now the meat of it! | The middle! Where the screaming happens!
open: Sharpen everything! The talking part is over! | A war begins with one small pawn. Make it a LOUD one!
u_sac_good: Now THAT is how you go to war!
u_sac_dubious: Half mad. I like the mad half.
u_sac_blunder: You dropped your sword and called it strategy!
u_sac_taken: Spoils of war! | Too easy! Give me a harder one!
my_sac: A gift of steel! Choke on it!
my_sac_taken: You swallowed it whole! Good appetite!
my_sac_declined: Take it, you turnip! | My finest offering, ignored! I am wounded!
u_brilliant: By the old gods, that was sharp!
u_blunder: HA! Your own feet tripped you!
my_blunder: Who put that wall there? | I meant to hit something. I hit myself.
lost_queen: You will weep for this! I am weeping first!
took_queen: Bow, board! The queen has fallen!
promo_u: Another queen to chop! Good! | Your little soldier grew teeth!
promo_me: A NEW WARLORD IS BORN! | Crown him with an iron pot!
comeback: From the grave, swinging! | They buried me too early! They always do!
collapse: I had you by the throat! Where did your throat go? | My glorious attack has gone home for lunch!
ahead: Your walls are cracking! | I am winning and I am SHOUTING about it!
behind: Outnumbered? My favourite number! | Pain is just fuel!
defend: Held the gate! Now never mention it! | You will not pass! Today!
tense: One spark and it all burns! | Closer! I fight best nose to nose!
endgame: A few survivors and a lot of anger! | The field is empty. I can hear myself yelling.
give_check: KNEEL, little crown! | Check! It never gets old!
check: Swing at my king and lose an arm! | A scratch on the crown!
escape: Ha! Too slow! | He rolls, he dodges, he roars!
take: Into the pile with you! | CHOP!
trade: Blood for blood! | An even swap. I wanted an uneven one!
castle_u: Walls! I eat walls! | Hide in your tower while you can!
u_aggressive: Yes! Come to me! | A charge! I have waited all week!
u_passive: Are you asleep over there? | Move FORWARD! It is the only good direction!
u_weird: Strange tactics! I will smash them anyway! | That move confuses me. Confusion makes me violent.
win_mate: No king survives me!
win_time: Your sands ran out! | You froze like a goat in snow!
lose_mate: Well struck! Now do it again, I was not ready!
lose_time: I was too busy roaring! | The hourglass cheated!
stalemate: Trapped but unbeaten! | What cowardly sorcery is a draw?
"""

TRADER = """
mid: Heavy volume now. | The middle of the session. Stay sharp.
open: Opening prices are reasonable. | Let us not overextend before lunch.
u_sac_good: A shrewd purchase.
u_sac_dubious: I would want that in writing.
u_sac_blunder: You have written that off entirely.
u_sac_taken: Thank you for your custom. | Banked.
my_sac: Consider it a loss leader. | A promotional offer, today only.
my_sac_taken: Sold to the player across the table. | The invoice follows.
my_sac_declined: No takers. I may have priced it wrong. | Withdrawn from sale.
u_brilliant: I would buy shares in that move.
u_blunder: That will not look good in the annual report.
my_blunder: A rounding error of considerable size. | I accept no liability.
lost_queen: Total portfolio collapse. | I want my deposit back.
took_queen: Blue chip, acquired.
promo_u: A merger and a promotion. | Your junior staff are doing well.
promo_me: Excellent staff development. | The best return on record.
comeback: Rally in the afternoon session. | The shares are back up.
collapse: I held too long. | Profits evaporated. Tragic.
ahead: The numbers favour me. | Let us consolidate the gains.
behind: A temporary dip, I insist. | I am considering bankruptcy protection.
defend: Hedged just in time. | The reserves held.
tense: The market cannot decide. | Too close to call, too close to enjoy.
endgame: Few assets, pure value. | Now every pawn is currency.
give_check: A surcharge. | Check. Payment due immediately.
check: An unscheduled audit. | My king objects to this fee.
escape: Loophole found. | Avoided the penalty.
take: Added to the books. | A clean acquisition.
trade: Lovely. Do it again. | Balanced, as all things should be.
castle_u: Insurance purchased. | A sensible deposit box.
u_aggressive: You are spending very freely. | Hostile bid noted.
u_passive: Your capital is idle. | Sitting on cash, are we?
u_weird: An exotic instrument. | I would not invest in that.
win_mate: Transaction complete.
win_time: Late payment forfeits all. | Time is money, and you are out of both.
lose_mate: A total buyout. | You have cleared me out.
lose_time: I was still negotiating. | Missed the deadline.
stalemate: Assets frozen. | No sale, no loss.
"""

BEA = """
open: Let the pieces wake gently. | I see a lovely diagonal already.
u_sac_good: Given freely, and wisely.
u_sac_dubious: The idea is pretty. Is it true?
u_sac_blunder: Be kind to yourself. Not to that move.
u_sac_taken: With thanks. | It would be rude to refuse.
my_sac: A small offering at your door. | Sometimes one must let go.
my_sac_taken: And now the diagonal opens. | You accepted. How trusting.
my_sac_declined: Left on the plate. How disciplined. | You sensed something. Good instincts.
u_brilliant: I shall think about that for days.
u_blunder: Ah, your attention wandered. | The board noticed that one.
my_blunder: That was not mindful of me. | Even calm minds slip.
lost_queen: Grief, then focus. | The quiet pieces must speak up now.
took_queen: She is resting with me. | Patience was rewarded, handsomely.
promo_u: Every step counted. | A pilgrim arrives.
promo_me: From small seeds. | She was a pawn once. Remember that.
comeback: Still water rises. | I never stopped believing. I paused briefly.
collapse: I let go of the wrong thing. | The calm became carelessness.
ahead: Things are ripening nicely. | I need only not hurry.
behind: Even a bad day passes. | I will find one good square and start there.
defend: One still point in the storm. | Held, with a soft hand.
tense: The balance trembles. | Listen. Neither of us dares.
mid: The garden is planted. Now we see. | Plans begin to touch.
endgame: Space at last. | Quiet moves, large meanings.
give_check: A polite warning. | Mind your king, dear.
check: Oh. We are being direct today. | My king takes a breath and a step.
escape: Out through the side door. | No harm done.
take: Gently removed. | Into my care.
trade: We both travel lighter. | Balance restored.
castle_u: A wise shelter. | He is tucked in.
u_aggressive: Fire is lively. It also burns out. | You hurry. I shall not.
u_passive: Stillness suits you. Almost. | Waiting is an art. Keep practising.
u_weird: A curious path. | I have not met that move before.
win_mate: The diagonal had the last word.
win_time: Rushing and waiting both cost. | Your sand ran out softly.
lose_mate: You saw further today. | A graceful ending. I approve, quietly.
lose_time: I admired the position too long. | Time and I had a disagreement.
stalemate: No move left to disturb the peace. | We have arrived at perfect quiet.
"""

VERA = """
open: Do sit up. We have begun. | Your first moves. Charming. Modest.
u_sac_good: I shall pretend I taught you that.
u_sac_dubious: One admires the confidence and nothing else.
u_sac_blunder: How lavish. How foolish.
u_sac_taken: Mine, as is customary. | You are too generous to your betters.
my_sac: A trinket for the commoners. | Catch.
my_sac_taken: Greed. My favourite flaw in others. | It had a string attached, darling.
my_sac_declined: Refusing me is rarely wise. | Very well, I shall keep my jewels.
u_brilliant: I may have to remember your name.
u_blunder: One could see that from the balcony.
my_blunder: A queen never errs. She revises. | Look elsewhere for a moment.
lost_queen: You will answer for this. | A court without me is merely a room.
took_queen: There was never room for two. | She did not curtsy. Now look.
promo_u: An impostor. | New money.
promo_me: Welcome, sister. Do not get ideas. | At last, someone to talk to.
comeback: You celebrated early. How common. | The crown was merely resting.
collapse: Unacceptable, even from me. | I grew bored and it cost me.
ahead: The realm is in order. | Do concede when convenient.
behind: A queen does not panic. She glares. | This will be remembered, unfavourably.
defend: Not today. | The walls of the palace are thick.
tense: How delicious. | Do not fidget. One of us has poise.
mid: Now we see your breeding. | The dance proper begins.
endgame: The rabble has cleared. | Kings must work now. He will hate it.
give_check: Mind your manners. | Your king may bow.
check: Impertinent. | My husband will move. Eventually.
escape: Hardly a scratch. | He escaped. I did all the planning.
take: Removed from court. | Thank you, I collect those.
trade: One for one. How democratic. | I permit the exchange.
castle_u: A cosy little cupboard for him. | Sensible. Dull.
u_aggressive: Such enthusiasm. Such draughts. | You attack like a goose.
u_passive: Are you waiting to be dismissed? | Back and forth, like a nervous footman.
u_weird: Is that fashionable now? | I shall not dignify that. Much.
win_mate: The audience is over.
win_time: You kept me waiting, and then yourself. | Out of time, and out of my sight.
lose_mate: How very rude, and how well done. | The throne is yours until supper.
lose_time: Perfection takes longer than allowed. | I refuse to be rushed. I merely lose.
stalemate: Nobody may move. Like a state dinner. | You have bored me into a draw.
"""

COUNCIL = """
open: vera=The Council opens proceedings.
u_sac_good: bea=We all admire that, with reluctance. | pip=Ooh! That was a good one! We all say!
u_sac_dubious: vera=The Council requests an explanation. | pip=We are confused, but supportive!
u_sac_blunder: pip=Did you drop that? | bea=We are sorry for your loss. Briefly.
u_sac_taken: vera=Seized in the name of the Council. | bea=Gratefully received by all.
my_sac: bea=We have chosen to let go. | vera=A calculated expense of the treasury.
my_sac_taken: pip=You took it! We cheered quietly! | bea=As we foresaw. Two of us, anyway.
my_sac_declined: vera=Our offer has been rejected. Noted. | pip=But we wrapped it!
u_brilliant: vera=Even I did not propose that. | pip=Wow! Can you join our council?
u_blunder: pip=Uh oh. Show of hands, who saw it? | bea=A gentle error, firmly punished.
my_blunder: vera=That vote is struck from the record. | bea=Too many cooks, one bishop.
lost_queen: bea=We are two and a memory.
took_queen: pip=Your queen! Sorry Vera, it is just a different one! | bea=An important member removed.
promo_u: vera=I object to the appointment. | bea=A deserving candidate.
promo_me: pip=Can the new one vote like me? | bea=Our numbers grow.
comeback: vera=The Council never fell. It adjourned. | bea=Unity returns.
collapse: vera=Somebody lost our lead. Pip. | pip=We had it and I sat on it!
ahead: pip=We are winning! All of me! | bea=Agreed, for once. We stand well.
behind: vera=This is a committee failure. | pip=Group hug? Emergency group hug!
defend: bea=Three heads, one narrow escape. | vera=Competently handled. By me.
tense: pip=I cannot vote, I am too nervous! | vera=Order. This requires concentration.
mid: bea=We move to the middlegame. | pip=Halfway! Snack vote!
endgame: vera=Reduced attendance. Proceed. | pip=So few pieces! So much agenda!
give_check: pip=Check! We all shouted! | bea=A unanimous nudge.
check: bea=Calm. We will find him a square. | vera=Who left the door open?
escape: vera=Evacuation successful. | pip=We got him out! Teamwork!
take: vera=Confiscated by committee. | bea=We shall hold onto this.
trade: bea=A balanced resolution. | pip=We swapped! Was that agreed? It was!
castle_u: vera=Your motion to hide is noted. | pip=Cosy! We want one!
u_aggressive: bea=Such energy. We will wait it out. | vera=Order in the chamber.
u_passive: pip=Are you holding a meeting too? | bea=Take your time. We always do.
u_weird: vera=Out of order. Entirely. | pip=Is that in the rules? Check the rules!
win_mate: pip=Checkmate! Meeting adjourned with cake! | bea=It is decided.
win_time: vera=Your speaking time has expired. | pip=Time! I get to ring the little bell!
lose_mate: bea=A fine argument. We have none left. | vera=The Council resigns with dignity.
lose_time: pip=We were still voting! | bea=Consensus takes time. Too much of it.
stalemate: vera=Deadlock. As usual. | pip=Nobody can move! Even in my chair!
"""

RIVAL = {
    "escaped": [("pip", "If he offers you a horse, do not feed it."), ("vera", "He is not well. His sacrifices frequently are."), ("bea", "Take what is safe. Not everything he offers is.")],
    "arteta": [("pip", "He drew me as a little arrow on a board!"), ("vera", "A touchline manner at a chessboard. How exhausting."), ("bea", "He waits. You develop. Let him wait.")],
    "berserker": [("pip", "Can we play somebody quieter?"), ("vera", "Do not shout back. It only encourages him."), ("bea", "Castle early. Very early.")],
    "trader": [("pip", "I think he just sold my chair."), ("vera", "Never shake his hand without counting your fingers."), ("bea", "Keep the pieces that work. Let him have the rest.")],
    "pip": [("vera", "A pawn with ambitions. Adorable."), ("bea", "Remember your own first games.")],
    "bea": [("pip", "She smells of candles. Nice candles."), ("vera", "All that serenity. Do disturb it.")],
    "vera": [("pip", "Good luck! I mean it! You will need loads!"), ("bea", "Do not argue with her. Just play well.")],
}

BLOCKS = {"escaped": ESCAPED, "arteta": ARTETA, "pip": PIP, "berserker": BERSERKER, "trader": TRADER, "bea": BEA, "vera": VERA, "council": COUNCIL}
p = "src/bot_lines.json"
d = json.load(open(p, encoding="utf-8"))
added = 0


def put(who, kind, line):
    global added
    have = d[who].setdefault(kind, [])
    assert '"' not in (line[1] if isinstance(line, list) else line)
    if line not in have:
        have.append(line)
        added += 1


for who, block in BLOCKS.items():
    for row in block.strip().splitlines():
        kind, rest = row.split(": ", 1)
        for x in rest.split(" | "):
            put(who, kind, x.strip().split("=", 1) if who == "council" else x.strip())
for who, lines in RIVAL.items():
    for x in lines:
        put(who, "rival", list(x))
json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(added, "lines added")
kinds = [k for k in d["escaped"] if k not in ("trait", "rival")]
print("thinnest event per character:", {w: min(len(v.get(k, [])) for k in kinds) for w, v in d.items()})
