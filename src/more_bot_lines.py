"""A big batch of lines for the playable characters, added to src/bot_lines.json (run once; safe to run again).
Kinds: taunt (trash talk), story (their own tales and fun facts), ouch (you took a piece of theirs), check (you checked them),
trait (their signature move), start, win, lose, draw. No double quotes inside the lines."""
import json

NEW = {
    "arteta": {
        "start": ["Welcome. I have prepared a presentation. Slide one says patience.", "Trust the process. I said it for years. Then we won the league."],
        "trait": ["You offer me a piece? No, thank you. That is how you lose the middle of the pitch.", "Square by square. We do not attack. We occupy."],
        "taunt": ["You are very eager. Eager teams get caught on the counter.", "Keep pushing. I have all day, and a very deep bench of quiet moves.", "That move had passion. We prefer structure.", "I have seen this in training. We practise it with a speaker playing crowd noise.", "You want an open game. I want your frustration. One of us is getting what we want.", "Every piece behind the ball. Yes. Beautiful.", "You can keep the initiative. I am keeping the shape."],
        "story": ["Did I tell you we won the Premier League in 2026? I may have mentioned it. We won the Premier League in 2026.", "Arsenal had not been champions since 2004. Twenty two years. I counted every one of them.", "The last title before ours was the Invincibles season, unbeaten all the way. No pressure at all.", "In my first season as manager we won the FA Cup. People forget. I do not forget.", "Before Arsenal I was Pep Guardiola's assistant at Manchester City. I took very good notes.", "I was born in San Sebastian and learned the game in Barcelona's academy. Passing is not optional there.", "As a player I wore the shirts of Paris Saint-Germain, Rangers, Everton and Arsenal. Now I wear a very dark jumper.", "The Champions League final in 2026 went to penalties and we lost to Paris. We do not discuss it. We are discussing it.", "People laughed at the process. Then they came to the parade. Very noisy people. Lovely people."],
        "ouch": ["That is fine. We have depth in that position.", "A piece goes, the structure stays. Mostly. Some of the structure stays.", "Who was marking that? I want names.", "No panic. Panic is for other clubs.", "We will review that on video. Many times."],
        "check": ["A check. The back line holds.", "My king steps aside, calmly, as drilled on Tuesday.", "Pressure is a privilege. This is too much privilege."],
        "win": ["Champions mentality. One nil, in chess terms.", "That is the process. Nothing, nothing, nothing, and then three points."],
        "lose": ["We were the better side for long periods. The periods where we did nothing, specifically.", "We go again. We always go again. I have a speech about it."],
    },
    "escaped": {
        "start": ["Shhh. The night shift thinks I am a pile of laundry. White or black? Quickly.", "At the ward they only let us play with soft pieces. These ones are so wonderfully pointy."],
        "trait": ["HAHAHA take the horse! TAKE IT! He wanted to go!", "A bishop for you! And if you act now, a rook!", "I am not losing material, I am setting it FREE!", "Eat it. Go on. I seasoned it myself."],
        "taunt": ["You are thinking very hard. I stopped doing that in 2019 and look at me now.", "Your knight blinked at me. I saw it.", "I know your next move. A little man in my sock told me.", "Careful. Every piece I give you is secretly still mine.", "You look nervous. Good. Come, be nervous with me.", "Tick tock, tick tock. Oh, there is no clock? I hear one anyway.", "Defend all you like. I only need you to be confused once."],
        "story": ["In the ward they took my chess set after I sacrificed the nurse's lunch for initiative.", "Doctor Mortimer said I must stop giving things away. So I gave him my notes. Then my chair.", "For eleven months I played chess against a radiator. It never took a single sacrifice. Coward.", "I escaped in a laundry cart. Gave the guard both my slippers as a deflection.", "Group therapy was lovely. I offered everyone a free rook. Three of them cried.", "Rudolf Spielmann wrote a whole book called The Art of Sacrifice, in 1935. I have eaten two copies.", "Mikhail Tal, the magician from Riga, threw pieces at kings and became world champion. Nobody locked HIM up.", "In the Immortal Game, Anderssen gave away a bishop, both rooks and the queen, and won. My kind of afternoon.", "They gave me crayons to calm down. I drew a bishop on h7. It did not calm me down."],
        "ouch": ["YES! Thank you! One less thing to carry!", "Oh good, you took it. Did you mean to? Did I?", "That was my favourite one. They are all my favourite one.", "Ha! Now you have to hold it forever. That is the curse.", "Bye bye little fella. Write to me from the box."],
        "check": ["Ooh, a check! My king loves visitors.", "Run, your majesty, run, just like I did on Thursday!", "You knock, he hides under the bed. We learned that together."],
        "win": ["I WON? Somebody tell the radiator!", "All those pieces gone and still I win. Explain THAT, Doctor Mortimer."],
        "lose": ["You win. Fine. I was giving that away too.", "Is that a net behind you? Why are you holding a net?"],
    },
    "berserker": {
        "trait": ["CHECK! Hide if you can!", "More! Bring me your king!"],
        "taunt": ["Castled? Good. Now I know where you live.", "Your defence is a garden fence. I am a rhinoceros.", "Move faster! I am getting cold!", "That was a quiet move. How dare you.", "I smell weak squares.", "You are developing. I am invading."],
        "story": ["On Lichess you can go berserk: halve your own clock to earn an extra point. I never play any other way.", "The Lewis chessmen, carved around the twelfth century, include warriors biting their shields. My ancestors.", "The old Norse called their wildest fighters berserkers. Some say it meant bear shirt.", "In the King's Gambit you give a pawn on move two just to get at the enemy. My lullaby.", "The fastest checkmate in chess takes two moves. I dream about it nightly.", "I once pushed all eight pawns before touching a piece. Glorious. Very short game."],
        "ouch": ["A scratch!", "You took one. I have more, and they are angrier!", "Good. Now it is personal.", "That one was slow anyway."],
        "check": ["You dare check ME?", "Ha! A fight at last!"],
    },
    "trader": {
        "trait": ["Swap. Lovely. Next customer.", "Another exchange. The portfolio grows simpler."],
        "taunt": ["Your position is overvalued. I expect a correction.", "I would not hold that bishop. Sell.", "You are heavily invested in attacking. Very risky.", "Every piece you keep is a liability.", "Let us talk about an exchange. You will not like the rate.", "The endgame is where I collect."],
        "story": ["The usual piece values are pawn one, knight and bishop three, rook five, queen nine. I check them every morning.", "A rook for a knight or bishop is called winning the exchange. The finest phrase in the language.", "Two bishops together are often worth more than their parts. A very good merger.", "Capablanca was famous for trading into endings that played themselves. My hero.", "In an ending, a king is a fighting piece, worth roughly four pawns of work. Undervalued asset.", "Opposite coloured bishops often end in a draw, even a pawn or two down. Terrible for business."],
        "ouch": ["A loss. I will offset it against a gain.", "Noted. That goes in the ledger.", "You got that at a very good price. Too good.", "Market volatility. Nothing more."],
        "check": ["A tax on my king. I will pay it and move.", "Interesting. A small penalty."],
    },
    "pip": {
        "taunt": ["I am not trash talking, but your knight does look a bit lost. Sorry!", "I am coming for your pieces! Slowly! One square at a time!", "Is that your best move? Because honestly it looked pretty good.", "Watch out for me. I might promote. I might!"],
        "story": ["En passant is French for in passing. It is the sneakiest thing a pawn can do!", "If I reach the last rank I can become a queen, a rook, a bishop or a knight. I keep changing my mind.", "Each side starts with eight of us. Eight! I know all my brothers by name. All Pip.", "Philidor said pawns are the soul of chess. I think about that every night.", "A pawn never moves backwards. It is why I am so brave. Or so stuck.", "On my first move I can go two squares! After that it is one. I try not to be bitter."],
        "ouch": ["Hey! I liked that one!", "Oh no. We were just becoming friends.", "That is okay. We have others. Do we? We do!"],
        "check": ["Eek! The king is in check! Everybody stay calm!", "Quick, someone stand in front of him! Not me. Okay, me."],
    },
    "bea": {
        "taunt": ["Gently now. The long diagonal has been watching you.", "That square looked safe. Look again, from the corner.", "You seem busy over there. I am perfectly still, and aiming.", "A lovely move. For me."],
        "story": ["A bishop only ever walks on one colour. Half the world, seen completely.", "In Russian the bishop is called slon, the elephant. In French it is the fool, and in German the runner.", "A fianchetto means putting the bishop on the long diagonal from the side. The word is Italian.", "Before the late 1400s the bishop only jumped two squares diagonally. Imagine how long the evenings were.", "In the old Indian game, the piece that became the bishop was the elephant."],
        "ouch": ["Ah. I will miss that one.", "It is all right. Pieces come back in the next game.", "You saw it. Well noticed."],
        "check": ["A check. Let us breathe and step aside.", "Quietly now. My king knows the way."],
    },
    "vera": {
        "taunt": ["Is that the plan, darling? Brave.", "I have seen better moves from a furniture catalogue.", "Do take your time. It will not help, but do.", "Your king looks lonely. I may visit.", "How sweet. You think you are attacking."],
        "story": ["For centuries the piece beside the king was an adviser who could move one square diagonally. I have been promoted since.", "My modern powers arrived in Spain in the late 1400s. They called it mad queen chess. Mad. Charmed, I am sure.", "A queen is worth about nine pawns. I am worth considerably more in person.", "Judit Polgar broke into the overall top ten. I sent flowers.", "Gaining a second queen is allowed. Tolerating her is another matter."],
        "ouch": ["You took that from me. I shall remember it.", "Bold. Foolish, probably, but bold.", "That was a favourite. You will pay for it with dignity."],
        "check": ["You check a queen's household? Manners.", "How forward of you."],
    },
    "council": {
        "taunt": [["vera", "We have discussed your last move. There was laughter."], ["pip", "We think you are doing great! Two of us disagree!"], ["bea", "Three of us are watching. Quietly."]],
        "story": [["vera", "The Council once debated a pawn move for an hour. Pip was asked to leave."], ["pip", "Did you know there are three of us and only one chair? I stand."], ["bea", "We each see the board our own way. Mostly diagonally, in my case."]],
        "ouch": [["pip", "Hey! That was ours! All of ours!"], ["vera", "Someone voted to leave that there. I shall find out who."], ["bea", "A small loss, shared three ways."]],
        "check": [["pip", "Check! Meeting! Emergency meeting!"], ["vera", "Order. The king will move. Quietly."]],
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
