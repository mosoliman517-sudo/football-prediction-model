"""Lines for the things that happen in a game (the event names in site/chess_talk.js), added to src/bot_lines.json.
Run: python3 src/bot_events.py && python3 src/bot_lines_js.py   (safe to run again)
One line per kind: name: first line | second line | ...   [laugh] [chuckle] [gasp] [sigh] are acted by the voice and not shown.
"""
import json

ESCAPED = """
open: Opening moves! My favourite part, before anyone has noticed anything is wrong. | Develop your pieces, they said. Where to? HOME? [laugh] | Shhh, we are doing the opening. No, YOU are doing the opening. I am doing it. We are. | Every game starts so tidy. [chuckle] I give it nine moves. | The man in my left ear says play e4. The man in my right ear is eating.
u_sac_good: [gasp] You gave it away on PURPOSE? Oh. Oh, I like you. Who let you out? | Wait. Wait, wait. That actually works. He says it works. I hate that he says it works. | [laugh] A calculated sacrifice! Calculated! I have never calculated in my life! | That is my move. You did MY move. Did you follow me from the ward? | Beautiful. I am crying. One of us is crying. [sigh] Beautiful.
u_sac_dubious: Do you know what you are doing? Blink once for yes, twice for the voices. | Hmm. [chuckle] That sacrifice has a certain homemade quality. | He says it is brave. I say it is soup. We are voting. | Interesting. Is there a second half to that idea, or is that the whole thing? | Oh, a gift with no receipt. I am suspicious. We are ALL suspicious.
u_sac_blunder: [laugh] That was not a sacrifice! That was a donation! | You just gave it away. Even I would not. [sigh] I would. But not like THAT. | Say you meant it. Go on. Say it with your whole face. [laugh] | No no no, a sacrifice has a REASON. Mine have reasons. Bad ones, but reasons! | Oh sweetheart. Did somebody tell you to do that? Was it the radiator? He does that.
u_sac_taken: Yoink! Thank you! He lives with me now. | I took it. Was it a trap? [gasp] Was it a TRAP? Tell me it was a trap, I get so lonely. | [chuckle] Into my pocket he goes, with the spoons. | Mine now. We will name him Gregory.
my_sac: [laugh] TAKE HIM! Take him, he talks too much! | Here! Free! He was looking at me funny anyway. | A present for you! Do not shake it. | I am throwing him. I threw him. He is flying. [laugh] Look at him go! | Nobody tell me why that is bad. I do not want to know. I want to FEEL it.
my_sac_taken: [laugh] YOU TOOK HIM! Now you are one of us. | He is gone. [sigh] He is in a better position. Yours. Hah! | Chew slowly. He is mostly wood. | Oh, you did it. You really did it. The trap door is under your feet, somewhere. Probably. | Goodbye, my little man! Write! You never write!
my_sac_declined: You do not WANT him? What is wrong with him? What is wrong with YOU? | Rude. [sigh] I wrapped him and everything. | Not taking it? Clever. Cowardly. Clever. We cannot agree. | He is just sitting there, unloved. [gasp] Like me on visiting day.
u_brilliant: [gasp] Who told you that move? It was supposed to be OUR secret. | That was brilliant. I felt it in my teeth. | Stop it. Stop being good. Only one of us is allowed to see things nobody else sees. | Oh, that is nasty. [chuckle] That is lovely and nasty.
u_blunder: [laugh] Oh no! Oh YES! Both! At once! | You blundered. He saw it. I saw it. The lamp saw it. | [chuckle] That move needs to lie down in a quiet room. I know a nice one. | Did your hand do that without asking you? Mine too. Mine all the time.
my_blunder: I MEANT that. I meant it. Somebody meant it. [chuckle] | That was not me. That was the other one. We have spoken to him. | [sigh] Fine. A mistake. No! A sacrifice that has not found its purpose yet. | Ignore that move. Look at me instead. Look at my face. Forget.
lost_queen: [gasp] The QUEEN! She was the only normal one in here! | Good. [laugh] Good! She kept telling me to sleep! | You took my queen. I have decided I am the queen now. | Her Majesty has left the building. Lucky her.
took_queen: [laugh] I have your queen! I am wearing her as a hat! | Mine! The big pointy lady is MINE! | She says she likes it here. She is lying. [chuckle] Everyone lies at first. | No queen? No problem! I mean for me. Huge problem for you.
promo_u: A NEW queen? Where do you keep them? Are there more in the walls? | [gasp] The little one grew up. They never let ME grow up.
promo_me: [laugh] Look! My pawn escaped too! RUN, my beautiful boy, RUN! | From nobody to queen in one step. [chuckle] That is how I became head of the ward.
comeback: [laugh] You thought you had me! Nobody HAS me! I have been locked up by professionals! | I am BACK. Out through the laundry, up the drain, back on the board! | He said it was over. I told him to hush. Look at us NOW. | Never bury a madman before checking the box. [chuckle]
collapse: I had it. I HAD it. Where did I put it? [gasp] I gave it away, did I not? | [sigh] I was winning. It was very quiet. I did not care for it, so I fixed it. | No, no. The good part was right here a minute ago. | Who moved my advantage? Was it you? Was it me? It was me.
ahead: [laugh] I am winning! Somebody take a photograph before it stops! | Look at all this winning. I do not know where to put it. | You are in trouble now, my friend. Cosy, soft, padded trouble. | He says do not get cocky. [chuckle] COCKY. COCKY COCKY.
behind: This is fine. Losing is just winning with the lights off. | [sigh] Things are grim. The spoons have stopped talking. | I am behind. Excellent. They never look for you behind. | All part of the plan. Which plan? The next one.
defend: Not today! [chuckle] I have hidden from much worse than you. | Only one way out, and I know every way out. | You nearly had me. I smelled it. It smelled like cafeteria.
tense: Shhh. [gasp] Can you hear that? That is the sound of nobody winning. | So close. So very close. My eye is doing the thing. | Anyone's game! Not yours. Not mine. ANYONE'S. Possibly the radiator's. | The tension! [laugh] I love it! Make it worse!
mid: Middle of the game. This is where I traditionally lose the thread. | Everyone is developed. Time to un develop somebody. [chuckle]
endgame: Hardly anything left. [sigh] I gave it all away and now it is so quiet. | The endgame. Few pieces, big thoughts. Too big. | Just us and the stragglers now. Hello, stragglers. | An ending! He knows endings. He never tells me until after.
give_check: [laugh] CHECK! Peekaboo, your majesty! | Knock knock! It is the night shift! | Check! Move him! Move him before he catches what I have!
check: [gasp] Check? On ME? I am a patient, I have rights! | My king says ow. My king says several things.
escape: Slipped it! [laugh] Slipped it like a pair of soft restraints! | You cannot catch me. Trained staff could not catch me.
ouch: [gasp] He was my emotional support piece! | Fine. Take him. He snores. | Gone! [sigh] We were so close, him and me and the other me.
take: [chuckle] Come here, little one. You live in my sock now. | Yum. Crunchy. | I took that and I do not even feel bad. One of us does. Not the one talking.
trade: One for one. [sigh] How sensible. I need to lie down. | Swapsies! Now give me back the one I like.
castle_u: You hid your king in the corner. I have been in corners. They find you. | Castled! [chuckle] Locking yourself in. Voluntarily! Fascinating.
u_aggressive: Ooh, coming for me? Come closer. Closer. Now regret it. | [laugh] An attack! Finally, somebody with no respect for personal space!
u_passive: Back and forth, back and forth. Are you all right? Do you need to talk to someone? Not me. | You are just shuffling. [sigh] That is what we do on Sundays.
u_weird: [gasp] What was THAT? And they say I am the strange one. | That move is not in any book. I checked. I ate the books. | He likes it. He likes your strange little move. That worries me.
win_mate: [laugh] CHECKMATE! Tell the doctor! Tell the lamp! Tell EVERYONE! | Mate. Shhh. He is resting. Forever. In the box.
win_time: Tick tock, you stopped! [chuckle] I never stop. That is the problem, they told me. | Your clock fell asleep. Did you slip it something? Did I?
lose_mate: [gasp] Mate? Mate! They have caught me. Fetch my good slippers. | Cornered. [sigh] Just like Tuesday. Well played, truly.
lose_time: Time? There was a TIME? Nobody tells me anything.
stalemate: He cannot move and he is not in check. [chuckle] That was my entire last year. | Stalemate! Everybody is stuck! Welcome to my house!
"""

ARTETA = """
open: These first moves are our principles. We do not improvise our principles. | Good. Occupy the centre. Then occupy the idea of the centre. | In the opening I want calm feet and cold heads. And one warm bishop. | Every piece must know its role. The knight knows. The knight was told twice. | We have practised this opening since pre season. Please respect the work.
u_sac_good: [sigh] That is a brave sacrifice, and annoyingly it is also a good one. | I see it. You give material for control. I teach that. I did not authorise you to learn it. | Chapeau. That is a rehearsed pattern if I have ever seen one. | That was timed perfectly. Who coached you? I would like to hire them. | Courage with a structure behind it. That is the only courage I accept.
u_sac_dubious: You are gambling. My analysts do not gamble. They are not allowed. | A sacrifice with half a plan. Where is the other half? | Emotion. That was pure emotion. We will punish emotion. | Interesting. The numbers say maybe. I dislike maybe. | If one of my players did that, we would have a very long walk.
u_sac_blunder: That is not a sacrifice. That is giving the ball away in your own box. | [sigh] No cover, no compensation, no explanation. | You lost material for nothing. I could not sleep after a thing like that. | Unforced. Completely unforced. Look at your bench, they are in shock.
u_sac_taken: We accept, with gratitude and a clear head. | Thank you. We do not celebrate. We consolidate. | Taken. Now everybody back into shape, immediately. | We will keep that. It is a three point piece.
my_sac: This is not recklessness. This is a set piece. | Yes, I am giving something. It is drilled. Mostly drilled. | A calculated release of material. I am as surprised as you are. | We gamble perhaps once a season. This is the once.
my_sac_taken: Good. You have stepped exactly where we wanted. | Take it. The compensation is in the structure. | You accepted. Page twelve of the plan begins now.
my_sac_declined: You declined. Wise. Frustratingly wise. | No? Good discipline. I did not expect discipline.
u_brilliant: [gasp] That was a world class move. I will not say it twice. | Brilliant. Somebody on my staff is going to hear about this. | That is a moment of real quality. We had no answer on the board. | One chance, and you took it. That is the margin.
u_blunder: A loss of concentration. We punish that. | [sigh] You switched off for one second. One second is plenty. | That is the mistake we waited ninety moves for. Early. How kind. | Your shape has a hole. I could drive a team bus through it.
my_blunder: No. No no no. That was not in any meeting. | [sigh] I take responsibility. For thirty seconds. Then we review the bishop. | We lost our heads there. Mine is still around somewhere. | Referee! No. Fine. That one is ours.
lost_queen: Our best player is off. Now the others must run twice as far. | A red card to the queen. We go to a low block. | [sigh] Without her we change the system, not the standards. | Seven pieces defending as one. We have done it before. Several times.
took_queen: Your star player is gone. Now let us see your squad depth. | The queen is ours. Stay humble. Stay extremely humble. | Excellent. We do not showboat. We keep possession. | That is the moment the match plan becomes very boring. Wonderful.
promo_u: A youngster from your academy has made the first team. Impressive pathway. | Promotion. We should have tracked that runner.
promo_me: From the academy to the first team. I am so proud I could cry, tactically. | The pathway works! I told the board the pathway works!
comeback: This is what I mean by belief! Never leave a match early! | We were down. We stayed together. Now look. | Character. You cannot buy it. We did also buy quite a lot. | The momentum has turned. Feel it. Keep your shape while you feel it.
collapse: [sigh] We were in control. I had begun to enjoy it. That was the error. | We dropped deeper and deeper. Why did we drop deeper? | Two points thrown away. I can see them from here. | Calm. We lost the lead, we do not lose the head.
ahead: Now we manage the game. Slowly. Painfully slowly. | We have the advantage. Corner flags, everyone, in spirit. | Control. Total control. This is my favourite weather. | Do not chase a second goal. Guard the first one with your life.
behind: Suffer together. This is the suffering part of the plan. | We are behind. Stay in the game, the game will come to us. | [sigh] A difficult night. We have had difficult nights. We have a documentary about them. | Compact. Narrow. No more presents.
defend: The back line holds! That is a Tuesday afternoon of work right there. | One option, executed perfectly. I could kiss that defence. | You throw everything. We block everything. | Clean sheet mentality, even now.
tense: Details. A match like this is decided by one detail. | Level. Tight. I cannot sit down. I was not sitting anyway. | Whoever stays calm wins. I am very calm. Look how calm. | Fine margins. Very fine. Microscopic.
mid: Middle phase. Rotate, occupy, and do not fall in love with an attack. | Now the real match starts. The first part was also real. All of it is real.
endgame: Late in the match. Fresh minds win it from here. | Few pieces left. Every touch matters. | The endgame is game management with fewer people to shout at. | Stoppage time thinking. Nothing silly.
give_check: A check. A single, carefully approved check. | We attack for one moment only, then everyone returns.
check: My king is under pressure. He has been briefed. | Pressure on the captain. The captain steps aside, with leadership.
escape: Played out from the back. Heart in mouth, but played out. | We beat the press. Breathe.
ouch: A loss of material is an injury. We have a medical department. | Gone. Next man steps in and does the job.
take: We win it back. Immediately, in the counter press. | A turnover. Now do nothing foolish with it.
trade: An even exchange. I approve of anything even. | Substitution for substitution. Fine.
castle_u: You protect the king early. Sensible. I may have to respect you. | Castled. Good habits. Somebody trained you.
u_aggressive: You are pressing high. Very high. Look at the space behind. | An early attack. We absorb it. We have been absorbing since August.
u_passive: You are keeping the ball without a purpose. That is my job, and mine has a purpose. | Waiting? Excellent. I can wait longer. I have a contract.
u_weird: That is not in the analysis. I need the analysts. Wake the analysts. | Unorthodox. Do not be distracted, everyone. It is theatre.
win_mate: Checkmate. A complete performance. Almost. We review it Monday. | Mate! That is from the training ground. I will accept applause from the staff.
win_time: You ran out of time. We never run out of time. We stretch it. | Game management. The clock was on our side because we asked it nicely.
lose_mate: Mate. [sigh] Well earned. We will learn, and we will be unbearable next time. | Beaten. No excuses. I have three, but no excuses.
lose_time: We were too slow in possession. For once that is a literal problem. | The clock beat us. I have complained to the clock.
stalemate: Nobody can move. Some would call it boring. I call it organised. | Stalemate. A point earned is a point earned.
"""

PIP = """
open: Opening time! Pawns go first, that means me! | I know one opening. This might not be it.
u_sac_good: You gave one up and it was smart? How do you do both? | Whoa, a sacrifice! I am taking notes!
u_sac_dubious: Um, are you sure? You can be sure. I just wanted to check. | Is that a trick? It looks a bit like a trick I would do wrong.
u_sac_blunder: Oh! I think you dropped something! | You can have it back if you like! No? Rules? Aw.
u_sac_taken: Free piece! It is like my birthday! | I got it! I got a big one!
my_sac: I am being brave! I read that you can give things away! | Here you go! It is a plan! A small one!
my_sac_taken: You took it. That was the plan. Please say it was a good plan. | Bye, friend. You were very brave.
my_sac_declined: You did not want it? I can wrap it again.
u_brilliant: WOW. Can you do that again, slower? | That was amazing! I am not even sad!
u_blunder: Oh no, are you okay? Also, thank you. | Even I saw that one! Even me!
my_blunder: Wait, that was not what I meant to do. | Oops. Can we pretend I sneezed?
lost_queen: The queen! Now who do I want to be when I grow up? | Oh no, she was my role model.
took_queen: I got the QUEEN! Me! A pawn type person! | Sorry, your majesty! Not very sorry!
promo_u: Your pawn did it! I am so happy for him! And a bit jealous.
promo_me: THIS IS IT! THE DREAM! LOOK AT HIS LITTLE CROWN! | My cousin made it! Nobody say a word, I am crying!
comeback: We were doomed and now we are not! | Never give up! I read it on a box!
collapse: I was doing so well. Was it something I did? It was.
ahead: I think I am winning! Is this what it looks like?
behind: Things are not great. I am still smiling, but sideways.
defend: Phew! Only one way out and I fell into it!
tense: This is so close I cannot look. I have no eyelids to spare.
mid: The middle of the game! This is where I get lost!
endgame: Not many of us left. The pawns matter now. Finally!
give_check: Check! I said it! I love saying it!
escape: I got the king out! Hero pawn!
take: Got one! It was just standing there!
trade: Swap! We both feel the same, right?
castle_u: Ooh, the king and rook did their dance!
u_aggressive: You are getting very close. Personal space, please!
u_passive: Are you waiting for me? I am waiting for you!
u_weird: I have never seen that! Is that allowed? It is? Wow.
win_mate: Checkmate! I did a real one! | Mate! Everybody look, quickly, before it goes!
win_time: I won because of the clock. It still counts, right?
lose_mate: You got my king. He had a good life. Short walks. | Mate. Well done! I will practise hiding.
lose_time: The clock ran out. I was counting on my fingers, which was the problem.
stalemate: Nobody can move! Is everyone all right?
"""

BERSERKER = """
open: ENOUGH developing! When do we hit things? | First move done, and nobody is bleeding. Unacceptable.
u_sac_good: HA! You attack like a true maniac! I salute you! | A real sacrifice! My kind of fool! A dangerous one!
u_sac_dubious: Bold! Stupid? Bold! I cannot tell and I love it! | You swing the axe with your eyes shut. Respect.
u_sac_blunder: You threw it away! No glory in that! | A warrior dies charging. That one died wandering!
u_sac_taken: CRUNCH! | I will wear it on my belt!
my_sac: TAKE IT! There is more where that came from, probably! | Blood for the attack!
my_sac_taken: Good! Now your gates are open! | You ate the bait! Now meet the cook!
my_sac_declined: You REFUSE my gift? Coward of the highest order!
u_brilliant: RAAH! That was magnificent and I hate it! | A blow worthy of the old songs!
u_blunder: Your shield slipped! CHARGE! | Weakness! I smell it!
my_blunder: I did not fall. I attacked the floor. | A flesh wound! A strategic flesh wound!
lost_queen: My shield maiden! NOW IT IS PERSONAL! | No queen? I never needed a queen! I have a horse!
took_queen: THE QUEEN IS MINE! Sing of this! | I have her crown on my axe!
promo_u: A peasant became a queen? In my day he stayed a peasant!
promo_me: RISE, little warrior! Rise and destroy!
comeback: Did you think I was finished? I was only getting warm!
collapse: Where did my army go? I turned around for ONE moment!
ahead: Victory is close! I can smell the roast!
behind: Behind? Good. Now I fight with nothing to lose!
defend: Ugh. Defending. Tell nobody.
tense: The battle hangs on a hair! A large, angry hair!
mid: The armies have met! At last!
endgame: Few remain. Fine. I will fight with my teeth!
give_check: CHECK! Dance, little king!
escape: Missed me! Come again!
take: Another one falls!
trade: A fair fight. Disgusting.
castle_u: Your king hides in his hut. I bring fire!
u_aggressive: YOU attack ME? Oh, this is the best day!
u_passive: STOP SHUFFLING and fight! | I am growing old waiting!
u_weird: What sorcery is that? I will punch it anyway!
win_mate: CHECKMATE! The king has fallen! Feast tonight! | MATE! I barely broke a sweat! I broke several!
win_time: You ran out of time! Fear froze your hand!
lose_mate: A good death. A very annoying good death. | You slew my king. I will return with a bigger king.
lose_time: Time? TIME? A warrior does not own a watch!
stalemate: Nobody can move? Then I will move the TABLE!
"""

TRADER = """
open: Early market. Low volume. I am watching. | A conservative opening position. Lovely.
u_sac_good: An investment with real returns. I am irritated and impressed. | Well hedged. You have done your homework.
u_sac_dubious: Highly speculative. | That is a lot of risk for a small chance of dividends.
u_sac_blunder: You have given it away below cost. Below zero. | That is not a deal. That is a spillage.
u_sac_taken: Acquired at no expense. My favourite price. | Into the portfolio.
my_sac: An unusual outlay for me. I feel dizzy. | Spending to earn. Allegedly.
my_sac_taken: You bought it. Read the small print.
my_sac_declined: No sale? Smart buyer.
u_brilliant: Outstanding value. I did not even see the listing. | A once a quarter move.
u_blunder: A serious write down for you. | The market punishes carelessness. I am the market.
my_blunder: A clerical error. | I shall be blaming my intern.
lost_queen: My largest asset, gone. Liquidate everything. | That is a hostile takeover.
took_queen: Your flagship holding is now mine. | Best acquisition of the year.
promo_u: Quite the return on a one point investment.
promo_me: One became nine. This is why I get out of bed.
comeback: A full market recovery. As I always privately feared I would not predict.
collapse: A crash. Nobody could have seen it. I should have seen it.
ahead: Solidly in profit. Now we cash out, one piece at a time.
behind: In the red. Cutting costs.
defend: A narrow escape from the auditors.
tense: Volatile. I do not enjoy volatile.
mid: Peak trading hours.
endgame: At last, the clearance sale. This is where I live.
give_check: A small charge on your account.
escape: Exited the position just in time.
take: Collected.
trade: Ahh. Say that again slowly. A trade.
castle_u: Moving funds offshore, I see.
u_aggressive: Aggressive expansion. Usually ends in debt.
u_passive: Holding. Sometimes that is wise. Not this time, I suspect.
u_weird: I have no model for that.
win_mate: Checkmate. The account is closed. | Mate. Please keep your receipt.
win_time: Your contract expired.
lose_mate: Bankrupt. Handsomely done.
lose_time: I missed the closing bell.
stalemate: A frozen market. Nobody gets paid.
"""

BEA = """
open: Slowly now. The good squares are not going anywhere. | A quiet start. My favourite kind of start.
u_sac_good: Oh, that is deep. I felt it before I saw it. | You let go of something and gained the whole diagonal. Lovely.
u_sac_dubious: Hm. That wants more thought than it was given. | A leap of faith. Faith is nice. Calculation is nicer.
u_sac_blunder: Oh dear. Take a breath, it happens. | That one simply wandered off, did it not?
u_sac_taken: I shall give it a good home.
my_sac: I release this with love. And a plan.
my_sac_taken: Thank you for taking it. Truly.
my_sac_declined: You are more careful than you look.
u_brilliant: Beautiful. I would clap, but I am a bishop. | That was a moment of real clarity.
u_blunder: A small lapse. Be gentle with yourself. I will not be.
my_blunder: Ah. I drifted. How embarrassing for a diagonal.
lost_queen: She has gone. We carry on, quietly furious.
took_queen: Your queen needed a rest. A long one.
promo_u: A long walk, well finished.
promo_me: See what patience can become.
comeback: The tide turns for those who wait.
collapse: I was comfortable. That is always when it happens.
ahead: A pleasant position. I shall not spoil it.
behind: The storm is here. I will sit through it.
defend: One narrow path, walked calmly.
tense: Perfectly poised. Do not breathe too hard.
mid: Now the plans meet each other.
endgame: The board opens up. Bishops adore this part.
give_check: A gentle tap on the shoulder.
escape: And quietly away.
take: I will look after that.
trade: A fair exchange of energies.
castle_u: Safe and warm. Good.
u_aggressive: So much energy. Where will you put it all?
u_passive: You are resting. So am I. Mine is better.
u_weird: How unusual. I shall have to sit with that.
win_mate: Checkmate. And so, peace. | Mate, from a great distance. As it should be.
win_time: Time slipped away from you. It does that.
lose_mate: A lovely finish. I am only slightly devastated.
lose_time: I was contemplating. Evidently too long.
stalemate: Stillness. The purest result.
"""

VERA = """
open: Begin properly, please. I have standards. | I have seen this opening. I was bored then too.
u_sac_good: A sacrifice with taste. Where did you acquire that? | Very well. That was regal.
u_sac_dubious: Generous to a fault. Mostly fault. | Dramatic. Is it also correct? We shall see.
u_sac_blunder: Darling, one does not simply leave pieces lying about. | I would call that a sacrifice only to be polite, and I am not polite.
u_sac_taken: How kind. I accept tributes daily.
my_sac: I can afford to be generous. Observe.
my_sac_taken: You took it. How predictable of you.
my_sac_declined: Suspicious of royal gifts. Wise child.
u_brilliant: Well. I did not see that, and I will deny saying so. | Exquisite. Do not get used to praise.
u_blunder: Oh, how unfortunate. For you. | I shall pretend to be sorry.
my_blunder: That was deliberate. You were not meant to notice.
lost_queen: I have been removed. This is treason.
took_queen: One board, one queen. Mine.
promo_u: Another queen? Absolutely not.
promo_me: A second me. The world is truly blessed.
comeback: Did you imagine I was finished? Sweet.
collapse: I relaxed. A monarch must never relax.
ahead: Matters are proceeding as they should.
behind: A temporary inconvenience.
defend: Composure. It cannot be taught to everyone.
tense: At last, something worth my attention.
mid: The pleasantries are over.
endgame: Fewer people about. Much better.
give_check: Kneel.
escape: One does not corner royalty so easily.
take: Confiscated.
trade: An exchange. How common.
castle_u: Hiding him already. I do not blame you.
u_aggressive: Charging at a queen. How very brave and brief.
u_passive: Do something, darling. Anything. I am fading.
u_weird: What on earth was that?
win_mate: Checkmate. You may rise. | Mate. As was always arranged.
win_time: Late. One is never late for a queen.
lose_mate: You have mated me. Enjoy it. It is rationed.
lose_time: I do not hurry. Evidently that has costs.
stalemate: A stalemate. How dreadfully untidy.
"""

COUNCIL = """
open: bea=A calm start, agreed by all three. | pip=We voted for this opening! I think!
u_sac_good: vera=The Council concedes that was rather fine.
u_sac_dubious: bea=Opinions are divided on whether you meant that.
u_sac_blunder: vera=Motion to accept your donation. Carried.
u_sac_taken: pip=We got it! Shared three ways!
my_sac: pip=Two voted yes! I do not know what we are doing!
my_sac_taken: vera=You have taken the bait, as minuted.
my_sac_declined: bea=You refused. We shall reconvene.
u_brilliant: bea=All three of us missed that. Remarkable.
u_blunder: vera=The Council notes your error with warmth. Very little warmth.
my_blunder: pip=Who voted for that? Oh. All of us.
lost_queen: pip=Vera, they took the other you! | vera=We will not discuss it.
took_queen: vera=Your queen is hereby adjourned.
promo_u: pip=A new member! Can she join us?
promo_me: vera=A fourth vote. Mine, naturally.
comeback: pip=We believed! Two of us believed!
collapse: bea=We argued while it slipped away.
ahead: vera=The Council is comfortably in charge.
behind: bea=Emergency session. Quietly.
defend: pip=Saved it! Teamwork!
tense: bea=Even we cannot agree who is better.
mid: vera=Second item on the agenda. The middlegame.
endgame: bea=Three minds, very few pieces.
give_check: vera=Check, by unanimous consent.
check: pip=Everyone stay calm! Especially me!
escape: bea=He is safe. Meeting continues.
take: pip=Yoink, says the committee!
trade: vera=An exchange. Approved.
castle_u: bea=A prudent motion on your part.
u_aggressive: pip=You are being very loud at our meeting!
u_passive: vera=Are you abstaining?
u_weird: bea=That was not on the agenda.
win_mate: vera=Checkmate. Meeting closed.
win_time: bea=Your time has been called.
lose_mate: pip=We lost together! Group hug!
lose_time: vera=We debated one move too long.
stalemate: bea=A hung vote and a hung board.
"""

# the player's chosen coach has a word about the opponent, once, after the opponent's greeting
RIVAL = {
    "escaped": [("pip", "He asked if I wanted to see his sock. Please do not make me look."), ("vera", "That man bowed to a coat stand on the way in. Mind your pieces."), ("bea", "Stay calm with this one. One of us should.")],
    "arteta": [("pip", "He brought a lightbulb. I am not going to ask. I am going to ask. No."), ("vera", "He will bore you to death and call it a project."), ("bea", "Patience is his weapon. Have a little more than he does.")],
    "berserker": [("pip", "He is looking at me like I am a snack!"), ("vera", "Noise. All noise. Let him run into your furniture."), ("bea", "Breathe, defend, and let the fire burn itself out.")],
    "trader": [("pip", "He offered me two pawns for my one self. Should I take it?"), ("vera", "Count your silverware after this one."), ("bea", "Only trade when it helps you. He will insist it always does.")],
    "pip": [("vera", "Be gentle with the child. Then win."), ("bea", "He tries so hard. Do not let that stop you.")],
    "bea": [("pip", "She is very calm. Suspiciously calm."), ("vera", "Watch the long diagonal. She never blinks.")],
    "vera": [("pip", "That is the Queen. Stand up straight!"), ("bea", "She is formidable. Make your moves quietly and well.")],
}

BLOCKS = {"escaped": ESCAPED, "arteta": ARTETA, "pip": PIP, "berserker": BERSERKER, "trader": TRADER, "bea": BEA, "vera": VERA, "council": COUNCIL}


def parse(block, council=False):
    out = {}
    for row in block.strip().splitlines():
        kind, rest = row.split(": ", 1)
        items = [x.strip() for x in rest.split(" | ")]
        out[kind] = [list(x.split("=", 1)) for x in items] if council else items
    return out


NEW = {who: parse(block, who == "council") for who, block in BLOCKS.items()}
for who, lines in RIVAL.items():
    NEW[who]["rival"] = [list(x) for x in lines]

p = "src/bot_lines.json"
d = json.load(open(p, encoding="utf-8"))
# this one only makes sense after a mate, so it moves from the general wins to the mate lines
moved = "Your king fell over! I barely finished shouting!"
if moved in d["berserker"]["win"]:
    d["berserker"]["win"].remove(moved)
    d["berserker"].setdefault("win_mate", []).append(moved)
added = 0
for who, kinds in NEW.items():
    for kind, lines in kinds.items():
        have = d.setdefault(who, {}).setdefault(kind, [])
        for line in lines:
            assert '"' not in (line[1] if isinstance(line, list) else line)
            if line not in have:
                have.append(line)
                added += 1
json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(added, "lines added;", {w: sum(len(v) for v in k.values()) for w, k in d.items()})
