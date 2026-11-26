"""A bigger helping for the six sidekicks. Added by src/add_lines.py."""


def kinds(**k):
    return {a: [x.strip() for x in b.split("|")] for a, b in k.items()}


NEW = {
    "boot": kinds(
        welcome="Sit yourself down. I've been telling the shin pads about you. | I had a dream I was a slipper. Horrible. Let's play.",
        hit="Correct. I'd tap your shoulder, but I've only got a tongue. | That's the one. My old wearer got that wrong for twenty years. | Right! Somebody's been reading the programme. | Good lad. Or lass. I only ever see ankles.",
        bighit="Straight in! Didn't even take a touch. | Cor. My studs just stood to attention.",
        miss="Wide. Row Z. Somebody's pie is ruined. | No. I've been wrong less often, and I thought a puddle was a bath. | Not that one. Have a sit on an upturned crate and think. | Wrong, but you struck it confidently, and confidence is half of nothing.",
        streak="You're hot as a kit room radiator! | Nobody wash anything until this run is over.",
        best="That's a record. Scratch it into the dugout. | New best! I'd cry, but I've only just dried out. | Your finest yet. Put it next to the replay mug.",
        over="All done. Somebody pick the grass out of me. | That's your lot. Off you go, mind the wet floor.",
        model_wrong="The computer's never stood in the rain at Stoke. Nor was it right. | Wrong. Football laughs at all of us. I've heard it. | Not your day. Nor the model's cousin's."),
    "rita": kinds(
        welcome="Coin toss. Heads, you answer. Tails, you answer. | I've inflated the ball to regulation. I've inflated nothing else.",
        hit="Correct. I've written it in pen, which is as sure as I get. | Yes. Textbook. Specifically my textbook. | Good. Nobody's complaining. I'm unsettled. | Right answer. Restart with a drop ball, emotionally.",
        bighit="You answered before my whistle reached my mouth. | Instant. I'll need to see that from behind the goal.",
        miss="Offside. Conceptually. | No. Take your shirt off in protest and I'll book you for that too. | Incorrect. The assistant has had the flag up since you started. | Wrong. I can explain, but you will argue, so no.",
        streak="This is now a disciplined performance. How dare you. | No cards, no mistakes. I have nothing to do.",
        best="New best. I've informed the governing body, which is also me. | A record. Initial here, here and on the ball. | Your best. Ratified after only one appeal.",
        over="Players, leave the field. Yes, all one of you. | That's full time. I'm off to be booed in the car park.",
        model_wrong="Overturned. Both of you. | The decision stands, and it was not yours. | Wrong. Even my eyesight did better, and I'm told it's famous."),
    "bench": kinds(
        welcome="I've been doing high knees since breakfast. Ask me why. Nobody does. | You came! I told the water bottles you'd come.",
        hit="Yes! I'm adding this to our friendship highlights. | Correct! You're so good. Do you want my bib? | Boom! I clapped so hard coach looked. He looked! | Right! I'd carry you off the pitch if I were allowed on it.",
        bighit="Faster than I've ever been substituted. Which is easy. | HOW. I was still tying my other lace.",
        miss="Aw. Come sit with me. There's room. There's always room. | Wrong! Don't worry, I've got a spare confidence in my bag. | Not that one. I once ran the wrong way in training and kept going to be polite. | Nope! Still my favourite player though.",
        streak="If you get one more I'm taking my tracksuit off! | The lads on the bench are watching. It's me. I'm the lads.",
        best="YOUR BEST EVER! I was HERE for it! | New record! Can I be in the photo? At the edge? | That's the best you've done! I'm telling my mum, she asks about you.",
        over="Done! Same seat tomorrow? I'll warm it. | Good game! I didn't get on, but spiritually I got on.",
        model_wrong="The model sits on the bench with us now. | Wrong! That's okay, nobody picks everything. Coach never picks me. | Missed it! Computers have bad days too, I've seen it cry."),
    "rim": kinds(
        welcome="Ten feet up and nothing to do till you showed. | I've been practising my vibrating. Give me a reason.",
        hit="In! Soft as a baby net. | Count it. I did. I always do. | You went right through my feelings, and my hoop. | Yes! That one kissed the glass. I'm jealous of the glass.",
        bighit="From the car park! Nothing but me! | I didn't see it leave your hand. Is it legal to be that quick?",
        miss="Front of me. Again. My face is there. | Clank. That's going to leave a mark on both of us. | Not even close. The backboard is pretending it didn't see. | Wrong. The ball and I have discussed it and we're disappointed.",
        streak="I'm getting dizzy up here! | Keep feeding me! I'm starving for swishes!",
        best="New high! Higher than me, and I'm very high. | Personal best! Cut me down and take me home. | That's the best you've shot all season. I've been counting from above.",
        over="Lights off, gym's closed, I hang here in the dark. Bye. | Good session. My bolts need a lie down.",
        model_wrong="The model bricked it too. | Rimmed out. I should know. | Wrong pick. Upsets happen. I've watched a mascot dunk on me."),
    "clock": kinds(
        welcome="You're here! I only counted to twelve thousand! | Quick! Slow! Hi! Sorry, I can't pick a speed!",
        hit="Correct! With a whole three seconds spare, I am LIVING! | Yes! Reset me! Reset me with joy! | Right! No buzzer! I love the quiet! | Got it! I didn't even sweat my numbers!",
        bighit="Twenty four to twenty four! You used NOTHING! | I blinked! I don't blink! You made me blink!",
        miss="Wrong! Three two one, forget it happened! | Aah! That second is gone forever! Anyway! Next! | No! Okay! Fine! Breathing! Counting breaths! One! | Missed! I felt that in my battery!",
        streak="Stop! No, don't stop! I can't take it! Don't stop! | Every one on time! I could weep digits!",
        best="A NEW BEST! Time of death of the old one: now! | Record! I'm freezing the clock to look at it! | Your best ever, to the tenth of a second!",
        over="Expired! The run, not me! Probably not me! | And that's the period! I'm going to go count something small!",
        model_wrong="Wrong, and the model ran out of time too! | Buzzer! Upset! My least favourite noise and my only noise! | Nope! Nobody could have timed that!"),
    "sneak": kinds(
        welcome="Fresh out the box and feeling dangerous! | You see these laces? Don't answer, just admire.",
        hit="Squeaky clean! | Yes! That answer was deadstock, never worn! | Bang! Put it on the shelf with the grails! | Right! You're dripping knowledge, wipe your feet!",
        bighit="Quicker than a sold out drop! | You answered so fast I got heel burn!",
        miss="Oof, that's a scuff on your reputation. | Wrong. That one's a bootleg answer. | Nah. You tripped on your own lace there. | Missed! Toothbrush, soap, clean it off, go again.",
        streak="I'm smoking! Literally, check my rubber! | Hype, hype, hype! Somebody camp outside for this person!",
        best="Grail performance! Never selling that one! | New best! Limited edition of one! | Cleanest run of your life! Frame the box!",
        over="Unlace me gently, that was a workout. | We're done! Don't kick me off by the heel. I've told you.",
        model_wrong="The model's wearing knockoffs. So were you, respectfully. | Brick of a pick! | Wrong! Hype doesn't win games, sadly. I've tried."),
}
