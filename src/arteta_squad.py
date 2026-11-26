"""Arteta calls each of his pieces by an Arsenal player (squad checked against the 14 November 2026 FPL snapshot).
Rewrites his older lines that named his pieces, and adds lines per player. Run, then python3 src/bot_lines_js.py.
Kinds are "lost:<player>", "take:<player>", "move:<player>" and "check:Raya"; site/chess_talk.js knows which piece is who."""
import json

SWAP = {   # old line -> new line
    "Another quiet move. You do not see it, but the pawns are in love with it.": "Another quiet move. You do not see it, but the whole squad is in love with it.",
    "I take responsibility. Mostly. The bishop will also take some.": "I take responsibility. Mostly. Rice will also take some.",
    "You want to run. I want you to run. Run until your knights are tired.": "You want to run. I want you to run. Run until your legs are gone.",
    "I drew your bishop on my tactics board last night. Then I drew six players around it.": "I drew your best piece on my tactics board last night. Then I drew six of mine around it.",
    "My king steps aside, calmly, as drilled on Tuesday.": "Raya steps aside, calmly, as drilled on Tuesday.",
    "My king is a captain. He moves with leadership.": "Raya has big shoulders. He moves with leadership.",
    "Everybody back! Everybody! You, the horse, you as well!": "Everybody back! Everybody! Eze, you as well! Saka, you too!",
    "My king is under pressure. He has been briefed.": "Raya is under pressure. He has been briefed.",
    "In the opening I want calm feet and cold heads. And one warm bishop.": "In the opening I want calm feet and cold heads. And Rice warm by the second move.",
    "Every piece must know its role. The knight knows. The knight was told twice.": "Everyone must know their role. Saka knows. Saka was told twice.",
    "[sigh] I take responsibility. For thirty seconds. Then we review the bishop.": "[sigh] I take responsibility. For thirty seconds. Then we review the video.",
    "A red card to the queen. We go to a low block.": "A red card for my captain. We go to a low block.",
    "Good. The king moved like a professional.": "Good. Raya moved like a professional.",
}

SQUAD = {
    "Raya": {"check": ["Raya! Stay big! Stay calm! Stay!", "They go for Raya. Everybody protect your goalkeeper.", "[gasp] Raya, move your feet. Vamos!"],
             "move": ["Raya comes off his line. My heart also comes off its line.", "A small step from Raya. Very brave for a goalkeeper."]},
    "Odegaard": {"lost": ["No! Odegaard! My captain! Madre mia.", "[sigh] Odegaard is gone. Who takes the armband? Who takes the feelings?"],
                 "take": ["Odegaard! Captain's work. Vamos!", "Odegaard picks the pocket. I taught him with real pickpockets."],
                 "move": ["Odegaard finds the pocket of space. There is always a pocket.", "Odegaard is pressing. When he presses, we all press."]},
    "Rice": {"lost": ["Not Rice! He covers everything! Who covers now?", "[sigh] Rice is off. That is half of my midfield and all of my lungs."],
             "take": ["Rice! He wins it back like it owes him money.", "Declan Rice with the tackle. Vamos!"],
             "move": ["Rice slides across. Beautiful. Boring. Beautiful.", "Rice takes up the position. He does not need the board to tell him."]},
    "Bruno": {"lost": ["Bruno! No! We only just got him settled.", "They have taken Bruno. Close the middle, close it now."],
              "take": ["Bruno Guimaraes! That is why we signed him.", "Bruno wins it with elbows and elegance."],
              "move": ["Bruno receives on the half turn. Chef's kiss, tactically.", "Bruno shifts over. Keep it ticking."]},
    "Saka": {"lost": ["SAKA! Medical team! Not again, please, not again.", "[gasp] Not my starboy. I need to sit down. I will not sit down."],
             "take": ["Saka cuts inside and takes it! Vamos, starboy!", "Bukayo! Of course it is Bukayo."],
             "move": ["Give it to Saka. When in doubt, give it to Saka.", "Saka on the right, doubled up as usual."]},
    "Eze": {"lost": ["Eze! The magic has left the pitch.", "[sigh] They stopped Eze. Somebody else must now be fun."],
            "take": ["Eze! With a little shimmy and everything.", "Eberechi glides past and helps himself."],
            "move": ["Eze drifts between the lines. Let him drift.", "A touch from Eze. Smooth. Too smooth. Keep your shape."]},
    "Gabriel": {"lost": ["Gabriel! My wall! Who heads the corners now?", "[sigh] Big Gabi is out. The back line is crying."],
                "take": ["Gabriel! He eats strikers for breakfast.", "Gabriel wins the duel. He wins all the duels. Vamos!"],
                "move": ["Gabriel steps up. The line steps with him.", "Gabriel holds. Solid as a very large door."]},
    "Saliba": {"lost": ["Saliba! No, no. Not the calm one. I need the calm one.", "[gasp] They have beaten Saliba. Check the replay. Check it again."],
               "take": ["Saliba. So calm he barely noticed he took it.", "William Saliba, immaculate."],
               "move": ["Saliba strolls across. No sweat. Never any sweat.", "Saliba covers the channel before anyone saw a channel."]},
    "Calafiori": {"lost": ["Calafiori! His hair is still on the pitch.", "We lose Riccardo. Very dramatic, very Italian."],
                  "take": ["Calafiori! Arrives from nowhere, as drilled!", "Riccardo wins it and looks magnificent doing it."]},
    "Lewis-Skelly": {"lost": ["Lewis-Skelly! Head up, young man.", "We lose Myles. He will learn from this. I will make a video."],
                     "take": ["Myles Lewis-Skelly! No fear at all!", "The academy boy takes it. I could cry."]},
    "Zubimendi": {"lost": ["Zubimendi! My fellow from San Sebastian! Painful.", "Martin is taken. Somebody must now keep the tempo."],
                  "take": ["Zubimendi, reading it early. Muy bien!", "Zubimendi intercepts. He saw it last Thursday."]},
    "Merino": {"lost": ["Merino! No more headers for us today.", "We lose Mikel the second. I am Mikel the first."],
               "take": ["Merino! Defender, midfielder, striker, thief.", "Merino does a job. He does every job."]},
    "Gyokeres": {"lost": ["Gyokeres! Put the mask down, we need another striker.", "[sigh] They have marked Gyokeres out of existence."],
                 "take": ["Gyokeres! Like a train! Vamos!", "Viktor bullies his way through. Lovely bullying."]},
    "Havertz": {"lost": ["Kai! He was doing the running nobody sees!", "Havertz is gone. I will defend him in the press conference anyway."],
                "take": ["Havertz arrives late and takes it. Classic Kai.", "Kai! I told them! I told them all!"]},
    "Timber": {"lost": ["Timber! Down he goes. Literally, timber.", "We lose Jurrien. Reshuffle the back line."],
               "take": ["Timber! Wins it clean, no complaints.", "Jurrien steps in and says thank you."]},
    "White": {"lost": ["Ben White is off. He will not mind. He does not watch football.", "We lose White. Keep calm, tape your socks."],
              "take": ["Ben White, quietly ruining someone's day.", "White takes it and shows no emotion whatsoever."]},
}

p = "src/bot_lines.json"
d = json.load(open(p, encoding="utf-8"))
a = d["arteta"]
for kind, lines in a.items():
    a[kind] = [SWAP.get(x, x) if isinstance(x, str) else x for x in lines]
    if kind != "rival":
        a[kind] = list(dict.fromkeys(a[kind]))
added = 0
for name, groups in SQUAD.items():
    for what, lines in groups.items():
        have = a.setdefault(f"{what}:{name}", [])
        for line in lines:
            assert '"' not in line
            if line not in have:
                have.append(line)
                added += 1
json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(added, "player lines;", sum(len(v) for v in a.values()), "Arteta lines in all")
