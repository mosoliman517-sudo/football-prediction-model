"""A second big batch of in-character lines for the playable characters, added to src/bot_lines.json (safe to run again).
Run: python3 src/more_bot_lines2.py && python3 src/bot_lines_js.py. No double quotes inside the lines."""
import json

NEW = {
    "pip": {
        "start": ["Okay! I stretched, I had a snack, I learned how the horse moves. I am ready!", "Hello! My strategy today is to be brave and then see what happens.", "Before we start, can we agree you will go a little bit easy? No? Okay! Still fun!"],
        "taunt": ["I have a secret plan. It is so secret that I do not know it yet.", "Grr! That was my scary face. Did it work?", "Your queen is very pretty. It would be a shame if somebody bumped into her.", "I looked at your position and I have one question. Can I have it?", "You are doing really well! Please stop!", "I am going to take something. I do not care what. Something!", "My coach said look before you move. I am looking now. At you. Menacingly."],
        "story": ["Once I took a free piece and it was not free. I think about it every day.", "My cousin made it to the other side and became a knight. He chose knight! We do not talk about it.", "I tried to move backwards once. The whole board stared at me.", "At night the box is very crowded. The rooks take up all the room.", "I asked the king what he does all day. He moves one square and looks worried.", "I used to be afraid of bishops. They come from so far away. Why are they so far away?", "One time I gave check by accident and had to pretend it was on purpose."],
        "ouch": ["That was Gerald! You took Gerald!", "I was going to use that! Probably!", "No no no, put it back, I was not looking!", "Oh. Oh, that is a big one. I am going to need a minute.", "It is fine. I am fine. My lip is doing that on its own."],
        "check": ["Not the king! He just sat down!", "Check?! But I am not ready to be in check!", "Your majesty, move your royal feet!"],
        "win": ["Mum! Mum, are you watching? I did it!", "I won and I only half know why!"],
        "lose": ["That is okay! I learned something! I am not sure what, but something!", "You won! Well done! I am going to go sit in the box for a bit."],
        "draw": ["A tie! We are both winners! A little bit!", "Draw! Hug? No? A wave, then!"],
    },
    "arteta": {
        "start": ["Before we begin, I have brought a lightbulb. It is part of the team talk. Do not ask.", "Today I want one thing. Control. Also two other things, but mainly control.", "Sit. Listen. Look at the board. The board is a family, and nobody in this family moves forward alone."],
        "taunt": ["You want to run. I want you to run. Run until your knights are tired.", "Interesting choice. My analysts, all nine of them, are smiling.", "You are playing the game. I am playing the phases of the game.", "Attack my block. Go on. It is a mid block with very good manners.", "Your tempo is high. Your control is zero. I have the numbers.", "I would like to thank you for that space. We were looking for it.", "Do you hear that noise? It is nothing happening. Beautiful nothing."],
        "story": ["I once played the Liverpool anthem over speakers at training, to prepare the boys. My ears have forgiven me. Theirs have not.", "I hired professional pickpockets for a team dinner, to teach the squad to stay alert. Check your pockets now.", "We have a dog at the training ground. His name is Win. It saves time in team talks.", "I held up a lightbulb to the players and talked about electricity. They were very quiet. I choose to call it awe.", "We planted an old olive tree at the training ground. You must water it every day. Like a clean sheet.", "I drew your bishop on my tactics board last night. Then I drew six players around it.", "Set pieces. People laughed. Then we scored from a corner, and another corner, and they stopped laughing.", "I cannot sit down during a match. The technical area is a suggestion to my feet."],
        "trait": ["No capture. We keep our shape and we keep our dignity.", "I decline. In football this is called game management.", "We could go forward. We could also not. I have chosen not, with passion."],
        "ouch": ["Referee! No? There is no referee? Outrageous.", "That was a foul. In my heart that was a foul.", "Next man up. This is why we have a squad of twenty five.", "I am calm. This is my calm face. The vein is part of it."],
        "check": ["My king is a captain. He moves with leadership.", "Everybody back! Everybody! You, the horse, you as well!", "A check. I expected it on page forty of the plan."],
        "win": ["I want you to remember this feeling. Mine, not yours.", "One goal from a set piece, metaphorically. I will take it."],
        "lose": ["The margins. It is always the margins. Someone find me the margins.", "I take responsibility. Mostly. The bishop will also take some."],
        "draw": ["A point away from home. We celebrate quietly, then we review it for six hours.", "We did not lose. I need you to write that down."],
    },
    "berserker": {
        "start": ["ARE YOU READY? Wrong answer! There is no ready! There is only forward!", "I had raw garlic for breakfast and I am coming for your king!", "Say goodbye to your quiet afternoon!"],
        "taunt": ["Your king has a nice little house there. I brought an axe.", "You moved a pawn near your king. Thank you for the door.", "Stop thinking! Fight me!", "I can hear your king breathing!", "My horse has not eaten in days. Your f7 looks delicious.", "You call that a defence? I have sneezed harder than that!", "The more you defend, the louder I get!", "Backwards? I do not know this word. Is it food?"],
        "story": ["I tried a quiet opening once. I lasted four moves, then I bit the rook.", "My anger counsellor suggested I count to ten. I got to three and sacrificed a knight.", "I do not castle. Castling is hiding with extra steps.", "In my village, if your bishop goes backwards, we do not speak to you until spring.", "I joined a meditation class. It was very peaceful. Then I attacked the teacher on the h file.", "My mother says I should think before I move. My mother has never mated anyone in nine moves.", "I own one book on endgames. I use it to keep the door open.", "Somebody once offered me a draw. They are fine now. Mostly."],
        "trait": ["CHECK! CHECK! I love that word!", "Knock knock! It is me again!", "Again! I will check you until the sun goes down!"],
        "ouch": ["RAAAH! That one was my favourite axe!", "Take it! I fight better hungry!", "You will pay for that with your whole kingside!", "Did that hurt me? No! Yes! No!", "He died as he lived, charging at something."],
        "check": ["My king WANTS to fight! Look at his little face!", "You hit my king? Now he is angry too!", "Come closer and say that!"],
        "win": ["VICTORY! Bring the feast! Bring the second feast!", "Your king fell over! I barely finished shouting!"],
        "lose": ["I do not lose! I attack in a direction you did not expect, which was nowhere.", "Fine! You win! I am going to go and yell at a lake."],
        "draw": ["A draw is a battle that fell asleep!", "Nobody died? Then why did I wear all this?"],
    },
    "trader": {
        "start": ["Good morning. Markets are open. I am buying calm and selling excitement.", "Before we begin, please sign here, here, and initial your queen.", "I have reviewed your position. There is nothing there yet, and already I have an offer."],
        "taunt": ["Your knight is a depreciating asset. I can take it off your hands.", "You have too much on the board. Think of the storage costs.", "I admire your ambition. I would like to trade it for something smaller.", "That attack has no collateral behind it.", "Your pawn structure is, how do I put this politely, subprime.", "I see you are holding. Everybody holds until I show them the numbers.", "No pressure. This offer expires next move.", "You seem emotionally attached to that queen. That is how people go broke."],
        "story": ["I once traded my queen, both rooks and my coat, and drove home in an endgame.", "My wedding was a simple exchange. Rings. Then I suggested we trade queens.", "I do not watch films with big casts. Too much material.", "As a child I swapped my sandwich for another identical sandwich. The thrill has never left me.", "Someone once offered me a gambit. I had to lie down.", "I keep a ledger of every pawn I have ever lost. There are four entries. Each one still stings.", "My therapist asked what I am afraid of. I said the middlegame.", "I tried to trade my own king once. The arbiter was very firm about it."],
        "trait": ["Done deal. No returns, no refunds.", "One for one. You see? Nobody got hurt. Except your plans.", "That is two fewer things to worry about. You are welcome."],
        "ouch": ["That was not a trade. A trade goes both ways. Read the contract.", "I shall be writing this off.", "My shareholders are going to hear about this.", "Theft. Pure theft, with no receipt."],
        "check": ["My king is relocating for tax reasons.", "A surprise fee. How very unprofessional.", "Noted. I will move him to a safer jurisdiction."],
        "win": ["And that concludes our transaction. You keep the experience.", "Profit. Small, steady, deeply satisfying."],
        "lose": ["I would like to renegotiate that result.", "A loss. I am calling it a long term investment in humility."],
        "draw": ["Break even. I have celebrated less for more.", "We split it down the middle. My favourite way to split anything."],
    },
    "escaped": {
        "start": ["I brought my own chess set. It is soup spoons and one real horse. No, we use yours. Fine.", "If a man in a white coat asks, you have been playing alone all evening.", "Quick, before they count the beds! You move, then I give you things!"],
        "taunt": ["Why are you defending? Nothing is being attacked yet. Except your peace of mind.", "I have a plan with seventeen steps. Step one is a surprise to both of us.", "Your pieces are whispering about you. I only report what I hear.", "Make a normal move. Go on. Be normal. See where it gets you.", "I am three moves ahead! Sideways!", "That bishop looks hungry. I might feed it a rook.", "You keep your pieces for so long. Do you never get bored of them?", "Blink twice if your knight is bothering you."],
        "story": ["I sold my slippers to a man who was also me.", "My rook and I are not speaking. He knows what he did. He stayed alive.", "I once sacrificed a piece so hard that it came back from the other side.", "They let me have a pet in the ward. It was a pawn. I called him Admiral. I gave him away.", "I tried to hand the doctor my queen. He wrote something down and underlined it twice.", "The night nurse beat me with the Sicilian. I have not slept since. Mostly because of other things.", "I keep a spare bishop under my hat for emergencies. This is the emergency. I have no hat.", "On Sundays we had cake. I sacrificed mine for a better position near the window."],
        "trait": ["Have it! No need to thank me! Thank the radiator!", "Everything must GO! Closing down sale on my own army!", "One horse, slightly used, completely free!", "I threw him! Did you see him fly?"],
        "ouch": ["Aww, you actually took it. Nobody ever takes the second one.", "Look after him. He likes warm milk and diagonals.", "Marvellous. My hands were getting full.", "That is exactly what I wanted, and if it was not, it is now."],
        "check": ["Check? CHECK! My favourite surprise after cake!", "The king and I were having a private moment.", "Hide, your highness! In the laundry! It works!"],
        "win": ["The sacrifices have spoken and they said YOU LOSE!", "I gave away everything and received everything. This is economics."],
        "lose": ["Please do not tell the radiator.", "You beat me. They are coming now anyway. Same time next jailbreak?"],
        "draw": ["Half a win each. I will keep mine in a sock.", "A draw. How sensible. I feel itchy."],
    },
    "bea": {
        "start": ["Sit comfortably. Breathe out. Now let me quietly ruin your queenside.", "I have lit a small candle. It lasts about forty moves.", "Good day to you. I will be on the long diagonal if you need me."],
        "taunt": ["There is no rush. The trap is very patient.", "You are very tense. Your pawns can feel it.", "I wish you well. I also wish you had not played that.", "Take a breath. Take two. It will still be there.", "Somewhere far away, a bishop is smiling.", "You attack so loudly. I find it restful to watch.", "I forgive you in advance for what you are about to hang."],
        "story": ["I spent a whole winter on one diagonal. I have never been happier.", "A young knight once asked me the secret of life. I said fianchetto. He is still thinking about it.", "I keep a small herb garden on g2. The king waters it.", "I tried shouting once, in a tournament. It came out as a hum.", "My sister bishop walks on the other colour. We have never met. We send letters.", "Once I was pinned for twenty moves. I used the time to reflect, and to resent."],
        "trait": ["Home to the long diagonal. There, that is better.", "Castled and settled. Now the kettle goes on.", "A small bishop move. A very large consequence, later."],
        "ouch": ["Oh. That was unkind, and quite correct.", "I release that piece with love, and a little irritation.", "Hm. I shall be calm about that in a moment."],
        "check": ["My king enjoys a short walk.", "So direct. Have you considered a hobby?", "Serenely, we step aside."],
        "win": ["It ended gently. Well, gently for one of us.", "Thank you. Do drink some water, you looked stressed."],
        "lose": ["You played beautifully. I am only slightly cross.", "A lesson for me today. I shall meditate on it, at length, with feeling."],
        "draw": ["Perfect balance. I could not have breathed it better.", "Neither of us suffered much. A good afternoon."],
    },
    "vera": {
        "start": ["You may sit. You may not slouch.", "I cancelled a coronation for this. Make it worth my evening.", "Ah, a challenger. How refreshing. The last one is still recovering."],
        "taunt": ["I would explain what is wrong with that, but we have only one evening.", "Are you always this generous, or is it a special occasion?", "I have been developing my pieces. You have been, what is the word, wandering.", "Chin up, darling. It is about to get worse.", "That knight is very far from home. Does anybody know it is out?", "I have had gentler opponents. They were furniture.", "You are blushing. Good. It shows you understood that.", "Interesting. By which I mean no."],
        "story": ["The king asked me to let him win once. We have not shared a square since.", "I have attended seven hundred checkmates. I cried at one. It was a very good dress.", "My former lady in waiting was a pawn. She promoted. Now we do not speak.", "I was captured on move nine once. Once. The knight responsible has been moved to a drawer.", "People ask why I move in every direction. Because somebody on this board has to do the work.", "The bishops write me poetry. All of it diagonal, none of it good.", "A young man once offered me a queen trade. I laughed until he resigned."],
        "trait": ["Precise, as usual. You may take notes.", "No tricks. I have never needed them.", "The correct move. How tedious for you."],
        "ouch": ["That was on loan from the royal collection.", "You may keep it for now. Dust it daily.", "How dare you. And how did you.", "I permitted that. Do not ask why. I certainly have not decided."],
        "check": ["Husband, move. Honestly, must I tell you everything?", "You threaten the king. The king threatens to faint. I deal with you.", "A check. How very eager."],
        "win": ["Curtsy on your way out, darling.", "You lasted longer than the last one. I shall note it somewhere small."],
        "lose": ["I was distracted. By your absurd good fortune.", "Well. One of us has been practising, and it is irritating."],
        "draw": ["A draw. We shall tell people I was merciful.", "Equal. Do not let it go to your head, there is very little room."],
    },
    "council": {
        "start": [["pip", "I brought snacks to the meeting! Vera says this is not that kind of meeting!"], ["vera", "The Council is in session. Pip, put the biscuit down."], ["bea", "We have agreed to be calm. The vote was two to one."]],
        "taunt": [["vera", "The Council has reviewed your plan. We were unable to find it."], ["pip", "I voted to be nice to you! I lost the vote!"], ["bea", "Take your time. There are three of us, we can wait in shifts."], ["vera", "Motion to be unimpressed. Carried."]],
        "story": [["bea", "Pip once voted for his own move for forty meetings. It was a good move on the forty first."], ["vera", "We keep minutes. Most of them say Pip, please sit down."], ["pip", "Vera gets two votes if she says it in a scary voice! She always says it in a scary voice!"], ["bea", "We tried to choose a leader. We are still choosing. Quietly."]],
        "trait": [["vera", "Carried by majority."], ["pip", "All in favour! Me! Me too! That is also me!"], ["bea", "We have reached agreement. A rare and beautiful thing."]],
        "ouch": [["vera", "Who proposed leaving that there. Pip."], ["pip", "It was not me! It was a little bit me!"], ["bea", "Let us not blame anyone. Out loud."]],
        "check": [["vera", "The Council does not panic. Pip, stop running."], ["bea", "One king, three opinions on where he should go."]],
        "win": [["pip", "We won! Three way high five! I cannot reach!"], ["bea", "A shared victory. Mostly mine, but shared."]],
        "lose": [["vera", "This loss will not appear in the minutes."], ["pip", "We lost together! That is the nice way to lose!"]],
        "draw": [["bea", "The vote is tied, and so is the game."], ["vera", "A draw. We shall be discussing responsibility for some weeks."]],
    },
}

p = "src/bot_lines.json"
d = json.load(open(p, encoding="utf-8"))
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
