/**
 * Verse of the Day — 226-verse rotation bank (Tears & Oil ministry-sourced)
 * -------------------------------------------------------------------------
 * Curated 2026-10-20 from the ministry's own material: the Tears & Oil
 * master doc + content bank, the full transcript corpus (166 transcripts,
 * ~260k words), and the verses the app already ships (Foundations +
 * Freedom day verses, declaration anchors, scripture bank). Every entry
 * carries its corpus `source`. There are NO filler verses in this bank.
 *
 * Text: World English Bible (WEB, public domain), verbatim from
 * eBible.org's official WEB files, spot-checked against published WEB
 * sources. Display normalizations only: psalm titles omitted, orphan
 * quotation marks dropped where a quoted speech runs past the cited
 * verses, and a trailing "," or ";" closed with "." where the sentence
 * continues into the next verse. No wording was changed.
 *
 * LIVE BANK: the home screen renders `todayVerse.text` /
 * `todayVerse.reference` from this bank (a superset entry shape:
 * { text, reference } + theme/source metadata). The daily selector lives
 * in app/(tabs)/(home)/index.tsx and is keyed to the prayer day
 * (lib/prayerDay.ts, 4 AM local boundary): index = prayer days since
 * VERSE_ROTATION_EPOCH mod 226 — the full bank cycles before repeating.
 */

export type VerseTheme =
  | "Identity"
  | "Calling & Purpose"
  | "Liberty & Freedom"
  | "The Father's Love"
  | "Healing & Wholeness"
  | "Authority & Inheritance"
  | "Peace & Rest"
  | "Hearing God's Voice"
  | "Forgiveness";

export interface VerseOfTheDayEntry {
  text: string;
  reference: string;
  theme: VerseTheme;
  /** Where the ministry references this verse (corpus file / doc / app bank). */
  source: string;
}

/** Fixed epoch prayer-day key the daily rotation counts from (index 0). */
export const VERSE_ROTATION_EPOCH = '2025-01-01';

export const VERSES_OF_THE_DAY_ROTATION: VerseOfTheDayEntry[] = [

  // ── Identity (22) ────────────────────────────────────────────────
  {
    text: "God created man in his own image. In God’s image he created him; male and female he created them.",
    reference: "Genesis 1:27",
    theme: "Identity",
    source: "app: scriptureText.ts",
  },
  {
    text: "I will give thanks to you, for I am fearfully and wonderfully made. Your works are wonderful. My soul knows that very well.",
    reference: "Psalm 139:14",
    theme: "Identity",
    source: "content-bank-v2 #7 (Total Reset Video 12)",
  },
  {
    text: "Yahweh, you have searched me, and you know me.",
    reference: "Psalm 139:1",
    theme: "Identity",
    source: "app: content.ts (Foundations Day 1)",
  },
  {
    text: "But now Yahweh who created you, Jacob, and he who formed you, Israel, says: Don’t be afraid, for I have redeemed you. I have called you by your name. You are mine.",
    reference: "Isaiah 43:1",
    theme: "Identity",
    source: "app: content.ts (Foundations Day 3)",
  },
  {
    text: "“Before I formed you in the womb, I knew you. Before you were born, I sanctified you. I have appointed you a prophet to the nations.”",
    reference: "Jeremiah 1:5",
    theme: "Identity",
    source: "app: declarations.ts; master-v2 §1.4",
  },
  {
    text: "See how great a love the Father has given to us, that we should be called children of God! For this cause the world doesn’t know us, because it didn’t know him.",
    reference: "1 John 3:1",
    theme: "Identity",
    source: "app: declarations.ts (identity-13)",
  },
  {
    text: "Therefore if anyone is in Christ, he is a new creation. The old things have passed away. Behold, all things have become new.",
    reference: "2 Corinthians 5:17",
    theme: "Identity",
    source: "app: scriptureText.ts",
  },
  {
    text: "There is therefore now no condemnation to those who are in Christ Jesus, who don’t walk according to the flesh, but according to the Spirit.",
    reference: "Romans 8:1",
    theme: "Identity",
    source: "app: content.ts (Foundations Day 2)",
  },
  {
    text: "For you didn’t receive the spirit of bondage again to fear, but you received the Spirit of adoption, by whom we cry, “Abba! Father!”",
    reference: "Romans 8:15",
    theme: "Identity",
    source: "app: scriptureText.ts",
  },
  {
    text: "The Spirit himself testifies with our spirit that we are children of God.",
    reference: "Romans 8:16",
    theme: "Identity",
    source: "app: scriptureText.ts",
  },
  {
    text: "For him who knew no sin he made to be sin on our behalf, so that in him we might become the righteousness of God.",
    reference: "2 Corinthians 5:21",
    theme: "Identity",
    source: "app: scriptureText.ts",
  },
  {
    text: "and in him you are made full, who is the head of all principality and power.",
    reference: "Colossians 2:10",
    theme: "Identity",
    source: "app: scriptureText.ts",
  },
  {
    text: "Put on therefore, as God’s chosen ones, holy and beloved, a heart of compassion, kindness, lowliness, humility, and perseverance.",
    reference: "Colossians 3:12",
    theme: "Identity",
    source: "app: scriptureText.ts",
  },
  {
    text: "I have been crucified with Christ, and it is no longer I who live, but Christ lives in me. That life which I now live in the flesh, I live by faith in the Son of God, who loved me and gave himself up for me.",
    reference: "Galatians 2:20",
    theme: "Identity",
    source: "content-bank-v2 #6 (Total Reset Video 9)",
  },
  {
    text: "Keep your heart with all diligence, for out of it is the wellspring of life.",
    reference: "Proverbs 4:23",
    theme: "Identity",
    source: "content-bank-v2 statements #6/#20 (TR13)",
  },
  {
    text: "for as he thinks about the cost, so he is. “Eat and drink!” he says to you, but his heart is not with you.",
    reference: "Proverbs 23:7",
    theme: "Identity",
    source: "transcripts: hearing-god/real-talk-ep02",
  },
  {
    text: "For am I now seeking the favor of men, or of God? Or am I striving to please men? For if I were still pleasing men, I wouldn’t be a servant of Christ.",
    reference: "Galatians 1:10",
    theme: "Identity",
    source: "transcripts: get-free-stay-free/26.txt",
  },
  {
    text: "Don’t you know that you are God’s temple and that God’s Spirit lives in you?",
    reference: "1 Corinthians 3:16",
    theme: "Identity",
    source: "app: content.ts (Foundations Day 6)",
  },
  {
    text: "Or don’t you know that your body is a temple of the Holy Spirit who is in you, whom you have from God? You are not your own.",
    reference: "1 Corinthians 6:19",
    theme: "Identity",
    source: "app: content.ts (Foundations Day 9)",
  },
  {
    text: "But we all, with unveiled face seeing the glory of the Lord as in a mirror, are transformed into the same image from glory to glory, even as from the Lord, the Spirit.",
    reference: "2 Corinthians 3:18",
    theme: "Identity",
    source: "app: content.ts (Foundations Day 29)",
  },
  {
    text: "Jesus answered, Most certainly I tell you, unless one is born of water and Spirit, he can’t enter into God’s Kingdom.",
    reference: "John 3:5",
    theme: "Identity",
    source: "master-v2 §3 (Total Reset: Rebirth, John 3); transcripts: GFSF04",
  },
  {
    text: "You shall have no other gods before me.",
    reference: "Exodus 20:3",
    theme: "Identity",
    source: "master-v2 §6.6 (TR13 lie→truth catalog)",
  },

  // ── Calling & Purpose (30) ───────────────────────────────────────
  {
    text: "For I know the thoughts that I think toward you, says Yahweh, thoughts of peace, and not of evil, to give you hope and a future.",
    reference: "Jeremiah 29:11",
    theme: "Calling & Purpose",
    source: "app: scriptureText.ts (corpus ×18)",
  },
  {
    text: "For we are his workmanship, created in Christ Jesus for good works, which God prepared before that we would walk in them.",
    reference: "Ephesians 2:10",
    theme: "Calling & Purpose",
    source: "app: scriptureText.ts",
  },
  {
    text: "You didn’t choose me, but I chose you and appointed you, that you should go and bear fruit, and that your fruit should remain; that whatever you will ask of the Father in my name, he may give it to you.",
    reference: "John 15:16",
    theme: "Calling & Purpose",
    source: "app: scriptureText.ts",
  },
  {
    text: "Remain in me, and I in you. As the branch can’t bear fruit by itself unless it remains in the vine, so neither can you, unless you remain in me.",
    reference: "John 15:4",
    theme: "Calling & Purpose",
    source: "app: freedom.ts (Freedom Day 15)",
  },
  {
    text: "I am the vine. You are the branches. He who remains in me and I in him bears much fruit, for apart from me you can do nothing.",
    reference: "John 15:5",
    theme: "Calling & Purpose",
    source: "transcripts: hearing-god/getting-closer; PMS02 (John 15:5-7)",
  },
  {
    text: "If you remain in me, and my words remain in you, you will ask whatever you desire, and it will be done for you.",
    reference: "John 15:7",
    theme: "Calling & Purpose",
    source: "transcripts: unlocking-gods-promises/05 (UGP05); master-v2 §1.11",
  },
  {
    text: "You are the light of the world. A city located on a hill can’t be hidden.",
    reference: "Matthew 5:14",
    theme: "Calling & Purpose",
    source: "app: scriptureText.ts",
  },
  {
    text: "We know that all things work together for good for those who love God, for those who are called according to his purpose.",
    reference: "Romans 8:28",
    theme: "Calling & Purpose",
    source: "app: scriptureText.ts",
  },
  {
    text: "He has made everything beautiful in its time. He has also set eternity in their hearts, yet so that man can’t find out the work that God has done from the beginning even to the end.",
    reference: "Ecclesiastes 3:11",
    theme: "Calling & Purpose",
    source: "app: scriptureText.ts",
  },
  {
    text: "He who calls you is faithful, who will also do it.",
    reference: "1 Thessalonians 5:24",
    theme: "Calling & Purpose",
    source: "app: scriptureText.ts",
  },
  {
    text: "Without faith it is impossible to be well pleasing to him, for he who comes to God must believe that he exists, and that he is a rewarder of those who seek him.",
    reference: "Hebrews 11:6",
    theme: "Calling & Purpose",
    source: "app: scriptureText.ts",
  },
  {
    text: "But we have this treasure in clay vessels, that the exceeding greatness of the power may be of God and not from ourselves.",
    reference: "2 Corinthians 4:7",
    theme: "Calling & Purpose",
    source: "app: scriptureText.ts",
  },
  {
    text: "Now to him who is able to do exceedingly abundantly above all that we ask or think, according to the power that works in us.",
    reference: "Ephesians 3:20",
    theme: "Calling & Purpose",
    source: "app: scriptureText.ts; app: freedom.ts (Day 21)",
  },
  {
    text: "A man’s heart plans his course, but Yahweh directs his steps.",
    reference: "Proverbs 16:9",
    theme: "Calling & Purpose",
    source: "transcripts: hearing-god/deliver-me-of-distractions",
  },
  {
    text: "What man is he who fears Yahweh? He shall instruct him in the way that he shall choose. His soul will dwell at ease. His offspring will inherit the land.",
    reference: "Psalm 25:12-13",
    theme: "Calling & Purpose",
    source: "transcripts: unlocking-gods-promises/03 (UGP03); master-v2 §1.11",
  },
  {
    text: "This book of the law shall not depart from your mouth, but you shall meditate on it day and night, that you may observe to do according to all that is written in it; for then you shall make your way prosperous, and then you shall have good success.",
    reference: "Joshua 1:8",
    theme: "Calling & Purpose",
    source: "transcripts: unlocking-gods-promises/02 (UGP02); app: freedom.ts (Day 19)",
  },
  {
    text: "Haven’t I commanded you? Be strong and courageous. Don’t be afraid. Don’t be dismayed, for Yahweh your God is with you wherever you go.",
    reference: "Joshua 1:9",
    theme: "Calling & Purpose",
    source: "app: encouragements.ts; app: constants/verses.ts",
  },
  {
    text: "Blessed are those who hunger and thirst for righteousness, for they shall be filled.",
    reference: "Matthew 5:6",
    theme: "Calling & Purpose",
    source: "transcripts: christian-foundations/08 (hunger); master-v2 §1.13",
  },
  {
    text: "We will not hide them from their children, telling to the generation to come the praises of Yahweh, his strength, and his wondrous deeds that he has done.",
    reference: "Psalm 78:4",
    theme: "Calling & Purpose",
    source: "app: content.ts (Foundations Day 28)",
  },
  {
    text: "For he will be as a tree planted by the waters, who spreads out its roots by the river, and will not fear when heat comes, but its leaf will be green, and will not be concerned in the year of drought. It won’t cease from yielding fruit.",
    reference: "Jeremiah 17:8",
    theme: "Calling & Purpose",
    source: "app: content.ts (Foundations Day 21)",
  },
  {
    text: "Seek the peace of the city where I have caused you to be carried away captive, and pray to Yahweh for it; for in its peace you will have peace.",
    reference: "Jeremiah 29:7",
    theme: "Calling & Purpose",
    source: "app: content.ts (Foundations Day 23)",
  },
  {
    text: "Whatever you do, in word or in deed, do all in the name of the Lord Jesus, giving thanks to God the Father through him.",
    reference: "Colossians 3:17",
    theme: "Calling & Purpose",
    source: "app: content.ts (Foundations Day 16)",
  },
  {
    text: "looking to Jesus, the author and perfecter of faith, who for the joy that was set before him endured the cross, despising its shame, and has sat down at the right hand of the throne of God.",
    reference: "Hebrews 12:2",
    theme: "Calling & Purpose",
    source: "app: freedom.ts (Freedom Day 18)",
  },
  {
    text: "I will make justice the measuring line, and righteousness the plumb line. The hail will sweep away the refuge of lies, and the waters will overflow the hiding place.",
    reference: "Isaiah 28:17",
    theme: "Calling & Purpose",
    source: "transcripts: total-reset/11.txt (Recalibration); master-v2 §3",
  },
  {
    text: "Those which were sown on the good ground are those who hear the word, accept it, and bear fruit, some thirty times, some sixty times, and some one hundred times.",
    reference: "Mark 4:20",
    theme: "Calling & Purpose",
    source: "content-bank-v2 prayer #11 (Total Reset Video 30)",
  },
  {
    text: "teaching them to observe all things that I commanded you. Behold, I am with you always, even to the end of the age. Amen.",
    reference: "Matthew 28:20",
    theme: "Calling & Purpose",
    source: "transcripts: get-free-stay-free/12.txt (Great Commission)",
  },
  {
    text: "They will fight against you, but they will not prevail against you; for I am with you, says Yahweh, “to rescue you.”",
    reference: "Jeremiah 1:19",
    theme: "Calling & Purpose",
    source: "transcripts: hearing-god/prophecy-prayer-maryland",
  },
  {
    text: "Therefore I urge you, brothers, by the mercies of God, to present your bodies a living sacrifice, holy, acceptable to God, which is your spiritual service.",
    reference: "Romans 12:1",
    theme: "Calling & Purpose",
    source: "transcripts: get-free-stay-free/06.txt",
  },
  {
    text: "that the proof of your faith, which is more precious than gold that perishes, even though it is tested by fire, may be found to result in praise, glory, and honor at the revelation of Jesus Christ—",
    reference: "1 Peter 1:7",
    theme: "Calling & Purpose",
    source: "transcripts: hearing-god/real-talk-17 (tests refine faith)",
  },
  {
    text: "that they may all be one; even as you, Father, are in me, and I in you, that they also may be one in us; that the world may believe that you sent me.",
    reference: "John 17:21",
    theme: "Calling & Purpose",
    source: "transcripts: prayer-made-simple/20.txt (PMS20, unity)",
  },

  // ── Liberty & Freedom (27) ───────────────────────────────────────
  {
    text: "If therefore the Son makes you free, you will be free indeed.",
    reference: "John 8:36",
    theme: "Liberty & Freedom",
    source: "content-bank-v2 #30 (Total Reset Video 1); master-v2 §1.2",
  },
  {
    text: "Jesus therefore said to those Jews who had believed him, “If you remain in my word, then you are truly my disciples. You will know the truth, and the truth will make you free.”",
    reference: "John 8:31-32",
    theme: "Liberty & Freedom",
    source: "content-bank-v2 statement #5; podcast Ep.13",
  },
  {
    text: "Now the Lord is the Spirit; and where the Spirit of the Lord is, there is liberty.",
    reference: "2 Corinthians 3:17",
    theme: "Liberty & Freedom",
    source: "transcripts: get-free-stay-free/09.txt (spoken citation)",
  },
  {
    text: "Stand firm therefore in the liberty by which Christ has made us free, and don’t be entangled again with a yoke of bondage.",
    reference: "Galatians 5:1",
    theme: "Liberty & Freedom",
    source: "master-v2 §1.16",
  },
  {
    text: "Christ redeemed us from the curse of the law, having become a curse for us. For it is written, “Cursed is everyone who hangs on a tree,”",
    reference: "Galatians 3:13",
    theme: "Liberty & Freedom",
    source: "app: freedom.ts (Freedom Day 10)",
  },
  {
    text: "Don’t be deceived. God is not mocked, for whatever a man sows, that he will also reap.",
    reference: "Galatians 6:7",
    theme: "Liberty & Freedom",
    source: "master-v2 §1.5 (sowing & reaping)",
  },
  {
    text: "The Spirit of the Lord is on me, because he has anointed me to preach good news to the poor. He has sent me to heal the broken hearted, to proclaim release to the captives, recovering of sight to the blind, to deliver those who are crushed.",
    reference: "Luke 4:18",
    theme: "Liberty & Freedom",
    source: "app: scriptureText.ts",
  },
  {
    text: "The thief only comes to steal, kill, and destroy. I came that they may have life, and may have it abundantly.",
    reference: "John 10:10",
    theme: "Liberty & Freedom",
    source: "transcripts: hearing-god/prophecy-prayer-maryland",
  },
  {
    text: "who delivered us out of the power of darkness, and translated us into the Kingdom of the Son of his love.",
    reference: "Colossians 1:13",
    theme: "Liberty & Freedom",
    source: "transcripts: deliver-me/03-perversion.txt",
  },
  {
    text: "I sought Yahweh, and he answered me, and delivered me from all my fears.",
    reference: "Psalm 34:4",
    theme: "Liberty & Freedom",
    source: "master-v2 §1.5 (TR04, deliverance = rescue)",
  },
  {
    text: "He sends his word, and heals them, and delivers them from their graves.",
    reference: "Psalm 107:20",
    theme: "Liberty & Freedom",
    source: "master-v2 §1.5 (TR04)",
  },
  {
    text: "Then they cried to Yahweh in their trouble, and he delivered them out of their distresses.",
    reference: "Psalm 107:6",
    theme: "Liberty & Freedom",
    source: "master-v2 §1.5 (TR04)",
  },
  {
    text: "He rescues me from my enemies. Yes, you lift me up above those who rise up against me. You deliver me from the violent man.",
    reference: "Psalm 18:48",
    theme: "Liberty & Freedom",
    source: "transcripts: total-reset/04.txt; master-v2 §1.5",
  },
  {
    text: "He who conceals his sins doesn’t prosper, but whoever confesses and renounces them finds mercy.",
    reference: "Proverbs 28:13",
    theme: "Liberty & Freedom",
    source: "content-bank-v2 statement #18 (TR19)",
  },
  {
    text: "For God didn’t give us a spirit of fear, but of power, love, and self-control.",
    reference: "2 Timothy 1:7",
    theme: "Liberty & Freedom",
    source: "app: scriptureText.ts; transcripts: key-renunciations/10 (fear exchange)",
  },
  {
    text: "Peter said to them, Repent and be baptized, every one of you, in the name of Jesus Christ for the forgiveness of sins, and you will receive the gift of the Holy Spirit.",
    reference: "Acts 2:38",
    theme: "Liberty & Freedom",
    source: "content-bank-v2 #39 (Total Reset Video 8)",
  },
  {
    text: "Don’t be drunken with wine, in which is dissipation, but be filled with the Spirit.",
    reference: "Ephesians 5:18",
    theme: "Liberty & Freedom",
    source: "master-v2 §1.14 (CF14, be filled with the Spirit)",
  },
  {
    text: "Have no fellowship with the unfruitful deeds of darkness, but rather even reprove them.",
    reference: "Ephesians 5:11",
    theme: "Liberty & Freedom",
    source: "transcripts: lie-vs-truth/04.txt",
  },
  {
    text: "and don’t give place to the devil.",
    reference: "Ephesians 4:27",
    theme: "Liberty & Freedom",
    source: "transcripts: prayer-made-simple/06.txt",
  },
  {
    text: "I will set no vile thing before my eyes. I hate the deeds of faithless men. They will not cling to me.",
    reference: "Psalm 101:3",
    theme: "Liberty & Freedom",
    source: "transcripts: get-free-stay-free/29.txt (eye gates)",
  },
  {
    text: "The fear of man proves to be a snare, but whoever puts his trust in Yahweh is kept safe.",
    reference: "Proverbs 29:25",
    theme: "Liberty & Freedom",
    source: "transcripts: deliver-me/02-fear.txt",
  },
  {
    text: "Yahweh is my light and my salvation. Whom shall I fear? Yahweh is the strength of my life. Of whom shall I be afraid?",
    reference: "Psalm 27:1",
    theme: "Liberty & Freedom",
    source: "app: encouragements.ts",
  },
  {
    text: "If you love me, keep my commandments.",
    reference: "John 14:15",
    theme: "Liberty & Freedom",
    source: "app: freedom.ts (Freedom Day 14)",
  },
  {
    text: "Jesus said to him, I am the way, the truth, and the life. No one comes to the Father, except through me.",
    reference: "John 14:6",
    theme: "Liberty & Freedom",
    source: "app: freedom.ts (Freedom Day 12); master-v2 §1.2",
  },
  {
    text: "that if you will confess with your mouth that Jesus is Lord and believe in your heart that God raised him from the dead, you will be saved.",
    reference: "Romans 10:9",
    theme: "Liberty & Freedom",
    source: "transcripts: unlocking-gods-promises/01 (UGP01); corpus ×34",
  },
  {
    text: "The light shines in the darkness, and the darkness hasn’t overcome it.",
    reference: "John 1:5",
    theme: "Liberty & Freedom",
    source: "app: constants/verses.ts (current rotation)",
  },
  {
    text: "Jesus said to her, I am the resurrection and the life. He who believes in me will still live, even if he dies.",
    reference: "John 11:25",
    theme: "Liberty & Freedom",
    source: "transcripts: lie-vs-truth/06.txt (fear of death)",
  },

  // ── The Father's Love (23) ───────────────────────────────────────
  {
    text: "Yahweh, your God, is among you, a mighty one who will save. He will rejoice over you with joy. He will calm you in his love. He will rejoice over you with singing.",
    reference: "Zephaniah 3:17",
    theme: "The Father's Love",
    source: "content-bank-v2 #20 (TR18, Truth About My Heavenly Father)",
  },
  {
    text: "We know and have believed the love which God has for us. God is love, and he who remains in love remains in God, and God remains in him.",
    reference: "1 John 4:16",
    theme: "The Father's Love",
    source: "content-bank-v2 #44 (Total Reset Video 31)",
  },
  {
    text: "We love him, because he first loved us.",
    reference: "1 John 4:19",
    theme: "The Father's Love",
    source: "app: constants/verses.ts (current rotation)",
  },
  {
    text: "Yahweh is merciful and gracious, slow to anger, and abundant in loving kindness.",
    reference: "Psalm 103:8",
    theme: "The Father's Love",
    source: "content-bank-v2 #18 (TR18)",
  },
  {
    text: "But God commends his own love toward us, in that while we were yet sinners, Christ died for us.",
    reference: "Romans 5:8",
    theme: "The Father's Love",
    source: "master-v2 §6.6 (TR13 lie→truth catalog)",
  },
  {
    text: "For I am persuaded that neither death, nor life, nor angels, nor principalities, nor things present, nor things to come, nor powers, nor height, nor depth, nor any other created thing will be able to separate us from God’s love which is in Christ Jesus our Lord.",
    reference: "Romans 8:38-39",
    theme: "The Father's Love",
    source: "app: scriptureText.ts",
  },
  {
    text: "What then shall we say about these things? If God is for us, who can be against us?",
    reference: "Romans 8:31",
    theme: "The Father's Love",
    source: "master-v2 §1.1; app: freedom.ts (Day 4)",
  },
  {
    text: "For God so loved the world, that he gave his only born Son, that whoever believes in him should not perish, but have eternal life.",
    reference: "John 3:16",
    theme: "The Father's Love",
    source: "transcripts: hearing-god/getting-closer; GFSF24",
  },
  {
    text: "If you then, being evil, know how to give good gifts to your children, how much more will your Father who is in heaven give good things to those who ask him!",
    reference: "Matthew 7:11",
    theme: "The Father's Love",
    source: "transcripts: key-renunciations/04.txt (Father gives good gifts)",
  },
  {
    text: "Oh taste and see that Yahweh is good. Blessed is the man who takes refuge in him.",
    reference: "Psalm 34:8",
    theme: "The Father's Love",
    source: "transcripts: christian-foundations/08 (taste and see)",
  },
  {
    text: "It is because of Yahweh’s loving kindnesses that we are not consumed, because his mercies don’t fail. They are new every morning. Great is your faithfulness.",
    reference: "Lamentations 3:22-23",
    theme: "The Father's Love",
    source: "app: content.ts (Foundations Day 14)",
  },
  {
    text: "Surely goodness and loving kindness shall follow me all the days of my life, and I will dwell in Yahweh’s house forever.",
    reference: "Psalm 23:6",
    theme: "The Father's Love",
    source: "content-bank-v2 #32 (TR13)",
  },
  {
    text: "Know therefore that Yahweh your God himself is God, the faithful God, who keeps covenant and loving kindness to a thousand generations with those who love him and keep his commandments.",
    reference: "Deuteronomy 7:9",
    theme: "The Father's Love",
    source: "content-bank-v2 #33 (TR23)",
  },
  {
    text: "may be strengthened to comprehend with all the saints what is the width and length and height and depth, and to know Christ’s love which surpasses knowledge, that you may be filled with all the fullness of God.",
    reference: "Ephesians 3:18-19",
    theme: "The Father's Love",
    source: "app: content.ts (Eph 3:16-19 prayed passage)",
  },
  {
    text: "But now in Christ Jesus you who once were far off are made near in the blood of Christ.",
    reference: "Ephesians 2:13",
    theme: "The Father's Love",
    source: "transcripts: hearing-god/getting-closer (brought near by the blood)",
  },
  {
    text: "But now faith, hope, and love remain—these three. The greatest of these is love.",
    reference: "1 Corinthians 13:13",
    theme: "The Father's Love",
    source: "master-v2 §1.17 (1 Cor 13, the love test)",
  },
  {
    text: "Let all that you do be done in love.",
    reference: "1 Corinthians 16:14",
    theme: "The Father's Love",
    source: "app: constants/verses.ts (current rotation)",
  },
  {
    text: "Every good gift and every perfect gift is from above, coming down from the Father of lights, with whom can be no variation nor turning shadow.",
    reference: "James 1:17",
    theme: "The Father's Love",
    source: "app: freedom.ts (Freedom Day 17)",
  },
  {
    text: "Let no man say when he is tempted, “I am tempted by God,” for God can’t be tempted by evil, and he himself tempts no one.",
    reference: "James 1:13",
    theme: "The Father's Love",
    source: "transcripts: hearing-god/real-talk-17 (God does not tempt)",
  },
  {
    text: "But he gives more grace. Therefore it says, “God resists the proud, but gives grace to the humble.”",
    reference: "James 4:6",
    theme: "The Father's Love",
    source: "transcripts: hearing-god/real-talk-ep03 (grace to the humble)",
  },
  {
    text: "Jesus Christ is the same yesterday, today, and forever.",
    reference: "Hebrews 13:8",
    theme: "The Father's Love",
    source: "app: scriptureText.ts",
  },
  {
    text: "and being fully assured that what he had promised, he was also able to perform.",
    reference: "Romans 4:21",
    theme: "The Father's Love",
    source: "app: scriptureText.ts (fully persuaded He is able)",
  },
  {
    text: "He has said to me, “My grace is sufficient for you, for my power is made perfect in weakness.” Most gladly therefore I will rather glory in my weaknesses, that the power of Christ may rest on me.",
    reference: "2 Corinthians 12:9",
    theme: "The Father's Love",
    source: "app: scriptureText.ts (My grace is sufficient)",
  },

  // ── Healing & Wholeness (19) ─────────────────────────────────────
  {
    text: "But he was pierced for our transgressions. He was crushed for our iniquities. The punishment that brought our peace was on him; and by his wounds we are healed.",
    reference: "Isaiah 53:5",
    theme: "Healing & Wholeness",
    source: "app: scriptureText.ts",
  },
  {
    text: "Surely he has borne our sickness and carried our suffering; yet we considered him plagued, struck by God, and afflicted.",
    reference: "Isaiah 53:4",
    theme: "Healing & Wholeness",
    source: "master-v2 §1.17 (Isaiah 53:4-6)",
  },
  {
    text: "He himself bore our sins in his body on the tree, that we, having died to sins, might live to righteousness. You were healed by his wounds.",
    reference: "1 Peter 2:24",
    theme: "Healing & Wholeness",
    source: "master-v2 §1.2",
  },
  {
    text: "He heals the broken in heart, and binds up their wounds.",
    reference: "Psalm 147:3",
    theme: "Healing & Wholeness",
    source: "app: scriptureText.ts",
  },
  {
    text: "who forgives all your sins, who heals all your diseases, who redeems your life from destruction, who crowns you with loving kindness and tender mercies.",
    reference: "Psalm 103:3-4",
    theme: "Healing & Wholeness",
    source: "app: scriptureText.ts",
  },
  {
    text: "I will also give you a new heart, and I will put a new spirit within you. I will take away the stony heart out of your flesh, and I will give you a heart of flesh.",
    reference: "Ezekiel 36:26",
    theme: "Healing & Wholeness",
    source: "app: declarations.ts (healing-11); content-bank-v2 #25",
  },
  {
    text: "being confident of this very thing, that he who began a good work in you will complete it until the day of Jesus Christ.",
    reference: "Philippians 1:6",
    theme: "Healing & Wholeness",
    source: "app: scriptureText.ts; master-v2 §1.6",
  },
  {
    text: "Behold, I will do a new thing. It springs out now. Don’t you know it? I will even make a way in the wilderness, and rivers in the desert.",
    reference: "Isaiah 43:19",
    theme: "Healing & Wholeness",
    source: "app: scriptureText.ts",
  },
  {
    text: "I will restore to you the years that the swarming locust has eaten, the great locust, the grasshopper, and the caterpillar, my great army, which I sent among you.",
    reference: "Joel 2:25",
    theme: "Healing & Wholeness",
    source: "app: freedom.ts (Freedom Day 1); content-bank-v2 #2",
  },
  {
    text: "He restores my soul. He guides me in the paths of righteousness for his name’s sake.",
    reference: "Psalm 23:3",
    theme: "Healing & Wholeness",
    source: "app: scriptureText.ts",
  },
  {
    text: "For his anger is but for a moment. His favor is for a lifetime. Weeping may stay for the night, but joy comes in the morning.",
    reference: "Psalm 30:5",
    theme: "Healing & Wholeness",
    source: "app: scriptureText.ts",
  },
  {
    text: "You have turned my mourning into dancing for me. You have removed my sackcloth, and clothed me with gladness.",
    reference: "Psalm 30:11",
    theme: "Healing & Wholeness",
    source: "app: scriptureText.ts",
  },
  {
    text: "May the God of peace himself sanctify you completely. May your whole spirit, soul, and body be preserved blameless at the coming of our Lord Jesus Christ. He who calls you is faithful, who will also do it.",
    reference: "1 Thessalonians 5:23-24",
    theme: "Healing & Wholeness",
    source: "master-v2 §1.6 (TR01/TR30, the closing blessing)",
  },
  {
    text: "Don’t be conformed to this world, but be transformed by the renewing of your mind, so that you may prove what is the good, well-pleasing, and perfect will of God.",
    reference: "Romans 12:2",
    theme: "Healing & Wholeness",
    source: "content-bank-v2 #23/#24 (corpus ×18)",
  },
  {
    text: "Confess your sins to one another and pray for one another, that you may be healed. The insistent prayer of a righteous person is powerfully effective.",
    reference: "James 5:16",
    theme: "Healing & Wholeness",
    source: "app: content.ts (Foundations Day 12); PMS01",
  },
  {
    text: "and the prayer of faith will heal him who is sick, and the Lord will raise him up. If he has committed sins, he will be forgiven.",
    reference: "James 5:15",
    theme: "Healing & Wholeness",
    source: "transcripts: prayer-made-simple/09.txt (PMS09, James 5:13-15)",
  },
  {
    text: "Is any among you suffering? Let him pray. Is any cheerful? Let him sing praises.",
    reference: "James 5:13",
    theme: "Healing & Wholeness",
    source: "transcripts: prayer-made-simple/09.txt (PMS09, James 5:13-15)",
  },
  {
    text: "He said to her, “Daughter, your faith has made you well. Go in peace, and be cured of your disease.”",
    reference: "Mark 5:34",
    theme: "Healing & Wholeness",
    source: "master-v2 §1.2 (Jesus' 'your faith has healed you' — sozo)",
  },
  {
    text: "A cheerful heart makes good medicine, but a crushed spirit dries up the bones.",
    reference: "Proverbs 17:22",
    theme: "Healing & Wholeness",
    source: "transcripts: get-free-stay-free/34.txt (a joyful heart brings healing)",
  },

  // ── Authority & Inheritance (28) ─────────────────────────────────
  {
    text: "Behold, I give you authority to tread on serpents and scorpions, and over all the power of the enemy. Nothing will in any way hurt you.",
    reference: "Luke 10:19",
    theme: "Authority & Inheritance",
    source: "app: declarations.ts (strength-11); master-v2 §1.5",
  },
  {
    text: "Be subject therefore to God. Resist the devil, and he will flee from you.",
    reference: "James 4:7",
    theme: "Authority & Inheritance",
    source: "content-bank-v2 #10 (TR16)",
  },
  {
    text: "Finally, be strong in the Lord and in the strength of his might.",
    reference: "Ephesians 6:10",
    theme: "Authority & Inheritance",
    source: "app: scriptureText.ts",
  },
  {
    text: "Put on the whole armor of God, that you may be able to stand against the wiles of the devil.",
    reference: "Ephesians 6:11",
    theme: "Authority & Inheritance",
    source: "master-v2 §1.5 (Eph 6:10-18, the armor)",
  },
  {
    text: "For our wrestling is not against flesh and blood, but against the principalities, against the powers, against the world’s rulers of the darkness of this age, and against the spiritual forces of wickedness in the heavenly places.",
    reference: "Ephesians 6:12",
    theme: "Authority & Inheritance",
    source: "master-v2 §1.10",
  },
  {
    text: "with all prayer and requests, praying at all times in the Spirit, and being watchful to this end in all perseverance and requests for all the saints.",
    reference: "Ephesians 6:18",
    theme: "Authority & Inheritance",
    source: "transcripts: prayer-made-simple/05.txt (praying in the Spirit)",
  },
  {
    text: "Blessed be the God and Father of our Lord Jesus Christ, who has blessed us with every spiritual blessing in the heavenly places in Christ.",
    reference: "Ephesians 1:3",
    theme: "Authority & Inheritance",
    source: "master-v2 §1.16 (GFSF31, every spiritual blessing)",
  },
  {
    text: "and if children, then heirs—heirs of God and joint heirs with Christ, if indeed we suffer with him, that we may also be glorified with him.",
    reference: "Romans 8:17",
    theme: "Authority & Inheritance",
    source: "transcripts: get-free-stay-free/26.txt (co-heirs with Christ)",
  },
  {
    text: "No, in all these things we are more than conquerors through him who loved us.",
    reference: "Romans 8:37",
    theme: "Authority & Inheritance",
    source: "app: scriptureText.ts",
  },
  {
    text: "No weapon that is formed against you will prevail; and you will condemn every tongue that rises against you in judgment. This is the heritage of Yahweh’s servants, and their righteousness is of me, says Yahweh.",
    reference: "Isaiah 54:17",
    theme: "Authority & Inheritance",
    source: "app: scriptureText.ts",
  },
  {
    text: "It shall happen, if you shall listen diligently to Yahweh your God’s voice, to observe to do all his commandments which I command you today, that Yahweh your God will set you high above all the nations of the earth.",
    reference: "Deuteronomy 28:1",
    theme: "Authority & Inheritance",
    source: "app: declarations.ts (strength-12); content-bank-v2 #13",
  },
  {
    text: "throwing down imaginations and every high thing that is exalted against the knowledge of God and bringing every thought into captivity to the obedience of Christ.",
    reference: "2 Corinthians 10:5",
    theme: "Authority & Inheritance",
    source: "master-v2 §1.8; podcast Ep.13",
  },
  {
    text: "I will give to you the keys of the Kingdom of Heaven, and whatever you bind on earth will have been bound in heaven; and whatever you release on earth will have been released in heaven.",
    reference: "Matthew 16:19",
    theme: "Authority & Inheritance",
    source: "master-v2 §1.10 (binding & loosing, CF28)",
  },
  {
    text: "Then Jesus said to him, “Get behind me, Satan! For it is written, ‘You shall worship the Lord your God, and you shall serve him only.’”",
    reference: "Matthew 4:10",
    theme: "Authority & Inheritance",
    source: "master-v2 §1.15 (Jesus' resistance, Matthew 4)",
  },
  {
    text: "But you will receive power when the Holy Spirit has come upon you. You will be witnesses to me in Jerusalem, in all Judea and Samaria, and to the uttermost parts of the earth.",
    reference: "Acts 1:8",
    theme: "Authority & Inheritance",
    source: "transcripts: get-free-stay-free/09.txt (Holy Spirit is power)",
  },
  {
    text: "Most certainly I tell you, he who believes in me, the works that I do, he will do also; and he will do greater works than these, because I am going to my Father.",
    reference: "John 14:12",
    theme: "Authority & Inheritance",
    source: "master-v2 §1.2 (greater works)",
  },
  {
    text: "He said to them, “This kind can come out by nothing but by prayer and fasting.”",
    reference: "Mark 9:29",
    theme: "Authority & Inheritance",
    source: "master-v2 §1.9 (prayer and fasting)",
  },
  {
    text: "He called to himself his twelve disciples, and gave them authority over unclean spirits, to cast them out, and to heal every disease and every sickness.",
    reference: "Matthew 10:1",
    theme: "Authority & Inheritance",
    source: "transcripts: deliver-me/02-fear.txt (authority through Christ)",
  },
  {
    text: "He said to them, Because of your unbelief. For most certainly I tell you, if you have faith as a grain of mustard seed, you will tell this mountain, ‘Move from here to there,’ and it will move; and nothing will be impossible for you.",
    reference: "Matthew 17:20",
    theme: "Authority & Inheritance",
    source: "app: scriptureText.ts",
  },
  {
    text: "Again, assuredly I tell you, that if two of you will agree on earth concerning anything that they will ask, it will be done for them by my Father who is in heaven.",
    reference: "Matthew 18:19",
    theme: "Authority & Inheritance",
    source: "transcripts: prayer-made-simple/17.txt (PMS17, agreement prayer)",
  },
  {
    text: "I exhort therefore, first of all, that petitions, prayers, intercessions, and givings of thanks be made for all men.",
    reference: "1 Timothy 2:1",
    theme: "Authority & Inheritance",
    source: "transcripts: prayer-made-simple/21.txt (PMS21, pray for leaders)",
  },
  {
    text: "They overcame him because of the Lamb’s blood, and because of the word of their testimony. They didn’t love their life, even to death.",
    reference: "Revelation 12:11",
    theme: "Authority & Inheritance",
    source: "app: freedom.ts (Freedom Day 20)",
  },
  {
    text: "Death and life are in the power of the tongue; those who love it will eat its fruit.",
    reference: "Proverbs 18:21",
    theme: "Authority & Inheritance",
    source: "content-bank-v2 #34/#40 (corpus ×16)",
  },
  {
    text: "Set a watch, Yahweh, before my mouth. Keep the door of my lips.",
    reference: "Psalm 141:3",
    theme: "Authority & Inheritance",
    source: "transcripts: get-free-stay-free/21.txt (guard my lips)",
  },
  {
    text: "Let the words of my mouth and the meditation of my heart be acceptable in your sight, Yahweh, my rock, and my redeemer.",
    reference: "Psalm 19:14",
    theme: "Authority & Inheritance",
    source: "transcripts: get-free-stay-free/11.txt",
  },
  {
    text: "make you complete in every good work to do his will, working in you that which is well pleasing in his sight, through Jesus Christ, to whom be the glory forever and ever. Amen.",
    reference: "Hebrews 13:21",
    theme: "Authority & Inheritance",
    source: "app: scriptureText.ts",
  },
  {
    text: "I can do all things through Christ who strengthens me.",
    reference: "Philippians 4:13",
    theme: "Authority & Inheritance",
    source: "app: scriptureText.ts",
  },
  {
    text: "not rendering evil for evil or insult for insult; but instead blessing, knowing that you were called to this, that you may inherit a blessing.",
    reference: "1 Peter 3:9",
    theme: "Authority & Inheritance",
    source: "master-v2 §1.5 (called to inherit a blessing)",
  },

  // ── Peace & Rest (24) ────────────────────────────────────────────
  {
    text: "In nothing be anxious, but in everything, by prayer and petition with thanksgiving, let your requests be made known to God.",
    reference: "Philippians 4:6",
    theme: "Peace & Rest",
    source: "app: scriptureText.ts",
  },
  {
    text: "And the peace of God, which surpasses all understanding, will guard your hearts and your thoughts in Christ Jesus.",
    reference: "Philippians 4:7",
    theme: "Peace & Rest",
    source: "app: scriptureText.ts",
  },
  {
    text: "Peace I leave with you. My peace I give to you; not as the world gives, I give to you. Don’t let your heart be troubled, neither let it be fearful.",
    reference: "John 14:27",
    theme: "Peace & Rest",
    source: "app: scriptureText.ts",
  },
  {
    text: "You will keep whoever’s mind is steadfast in perfect peace, because he trusts in you.",
    reference: "Isaiah 26:3",
    theme: "Peace & Rest",
    source: "app: scriptureText.ts",
  },
  {
    text: "In peace I will both lay myself down and sleep, for you alone, Yahweh, make me live in safety.",
    reference: "Psalm 4:8",
    theme: "Peace & Rest",
    source: "app: scriptureText.ts; content-bank-v2 #21",
  },
  {
    text: "Yahweh is my shepherd; I shall lack nothing. He makes me lie down in green pastures. He leads me beside still waters.",
    reference: "Psalm 23:1-2",
    theme: "Peace & Rest",
    source: "app: scriptureText.ts",
  },
  {
    text: "God is our refuge and strength, a very present help in trouble.",
    reference: "Psalm 46:1",
    theme: "Peace & Rest",
    source: "app: scriptureText.ts",
  },
  {
    text: "For he is our peace, who made both one, and broke down the middle wall of separation.",
    reference: "Ephesians 2:14",
    theme: "Peace & Rest",
    source: "app: scriptureText.ts",
  },
  {
    text: "Come to me, all you who labor and are heavily burdened, and I will give you rest. Take my yoke upon you and learn from me, for I am gentle and humble in heart; and you will find rest for your souls.",
    reference: "Matthew 11:28-29",
    theme: "Peace & Rest",
    source: "transcripts: unlocking-gods-promises/04 (UGP04); master-v2 §1.12",
  },
  {
    text: "It is vain for you to rise up early, to stay up late, eating the bread of toil, for he gives sleep to his loved ones.",
    reference: "Psalm 127:2",
    theme: "Peace & Rest",
    source: "transcripts: lie-vs-truth/05.txt (rest & striving)",
  },
  {
    text: "For thus said the Lord Yahweh, the Holy One of Israel, “You will be saved in returning and rest. Your strength will be in quietness and in confidence.” You refused.",
    reference: "Isaiah 30:15",
    theme: "Peace & Rest",
    source: "app: freedom.ts (Freedom Day 16)",
  },
  {
    text: "Don’t you be afraid, for I am with you. Don’t be dismayed, for I am your God. I will strengthen you. Yes, I will help you. Yes, I will uphold you with the right hand of my righteousness.",
    reference: "Isaiah 41:10",
    theme: "Peace & Rest",
    source: "app: content.ts (Foundations Day 24); LVT09",
  },
  {
    text: "casting all your worries on him, because he cares for you.",
    reference: "1 Peter 5:7",
    theme: "Peace & Rest",
    source: "app: scriptureText.ts; app: constants/verses.ts",
  },
  {
    text: "This hope we have as an anchor of the soul, a hope both sure and steadfast and entering into that which is within the veil.",
    reference: "Hebrews 6:19",
    theme: "Peace & Rest",
    source: "app: scriptureText.ts",
  },
  {
    text: "My God will supply every need of yours according to his riches in glory in Christ Jesus.",
    reference: "Philippians 4:19",
    theme: "Peace & Rest",
    source: "app: content.ts (Foundations Day 19)",
  },
  {
    text: "But seek first God’s Kingdom and his righteousness; and all these things will be given to you as well.",
    reference: "Matthew 6:33",
    theme: "Peace & Rest",
    source: "transcripts: lie-vs-truth/07.txt (provision anxiety)",
  },
  {
    text: "Rest in Yahweh, and wait patiently for him. Don’t fret because of him who prospers in his way, because of the man who makes wicked plots happen.",
    reference: "Psalm 37:7",
    theme: "Peace & Rest",
    source: "app: encouragements.ts",
  },
  {
    text: "For the mind of the flesh is death, but the mind of the Spirit is life and peace.",
    reference: "Romans 8:6",
    theme: "Peace & Rest",
    source: "transcripts: get-free-stay-free/11.txt (Romans 8:5-6)",
  },
  {
    text: "but those who wait for Yahweh will renew their strength. They will mount up with wings like eagles. They will run, and not be weary. They will walk, and not faint.",
    reference: "Isaiah 40:31",
    theme: "Peace & Rest",
    source: "app: scriptureText.ts",
  },
  {
    text: "But the fruit of the Spirit is love, joy, peace, patience, kindness, goodness, faith.",
    reference: "Galatians 5:22",
    theme: "Peace & Rest",
    source: "app: scriptureText.ts",
  },
  {
    text: "Rejoice in the Lord always! Again I will say, “Rejoice!”",
    reference: "Philippians 4:4",
    theme: "Peace & Rest",
    source: "transcripts: get-free-stay-free/23.txt",
  },
  {
    text: "Enter into his gates with thanksgiving, and into his courts with praise. Give thanks to him, and bless his name.",
    reference: "Psalm 100:4",
    theme: "Peace & Rest",
    source: "app: content.ts (Foundations Day 25)",
  },
  {
    text: "He who dwells in the secret place of the Most High will rest in the shadow of the Almighty. I will say of Yahweh, “He is my refuge and my fortress; my God, in whom I trust.”",
    reference: "Psalm 91:1-2",
    theme: "Peace & Rest",
    source: "app: content.ts (pray Psalm 91 over yourself)",
  },
  {
    text: "Always rejoice. Pray without ceasing. In everything give thanks, for this is the will of God in Christ Jesus toward you.",
    reference: "1 Thessalonians 5:16-18",
    theme: "Peace & Rest",
    source: "transcripts: prayer-made-simple/14.txt (PMS14); app: content.ts (Day 4)",
  },

  // ── Hearing God's Voice (42) ─────────────────────────────────────
  {
    text: "Then he answered and spoke to me, saying, This is Yahweh’s word to Zerubbabel, saying, ‘Not by might, nor by power, but by my Spirit,’ says Yahweh of Armies.",
    reference: "Zechariah 4:6",
    theme: "Hearing God's Voice",
    source: "master-v2 §1.3/§1.8; transcripts: HG we-need-the-holy-spirit, TR03 (corpus ×17)",
  },
  {
    text: "that the God of our Lord Jesus Christ, the Father of glory, may give to you a spirit of wisdom and revelation in the knowledge of him.",
    reference: "Ephesians 1:17",
    theme: "Hearing God's Voice",
    source: "master-v2 §1.8; transcripts: TR17, HG prayer-rising-generation (corpus ×17)",
  },
  {
    text: "My sheep hear my voice, and I know them, and they follow me.",
    reference: "John 10:27",
    theme: "Hearing God's Voice",
    source: "app: content.ts (Foundations Day 8); master-v2 §1.8",
  },
  {
    text: "Whenever he brings out his own sheep, he goes before them; and the sheep follow him, for they know his voice.",
    reference: "John 10:4",
    theme: "Hearing God's Voice",
    source: "app: scriptureText.ts (sheep know His voice)",
  },
  {
    text: "After the earthquake a fire passed; but Yahweh was not in the fire. After the fire, there was a still small voice.",
    reference: "1 Kings 19:12",
    theme: "Hearing God's Voice",
    source: "master-v2 §1.8 (the still small voice)",
  },
  {
    text: "But the Counselor, the Holy Spirit, whom the Father will send in my name, will teach you all things, and will remind you of all that I said to you.",
    reference: "John 14:26",
    theme: "Hearing God's Voice",
    source: "master-v2 §1.3 (HG we-need-the-holy-spirit)",
  },
  {
    text: "However, when he, the Spirit of truth, has come, he will guide you into all truth, for he will not speak from himself; but whatever he hears, he will speak. He will declare to you things that are coming.",
    reference: "John 16:13",
    theme: "Hearing God's Voice",
    source: "master-v2 §1.3",
  },
  {
    text: "Yahweh came, and stood, and called as at other times, “Samuel! Samuel!” Then Samuel said, “Speak; for your servant hears.”",
    reference: "1 Samuel 3:10",
    theme: "Hearing God's Voice",
    source: "app: content.ts (Foundations Day 18)",
  },
  {
    text: "But if any of you lacks wisdom, let him ask of God, who gives to all liberally and without reproach, and it will be given to him.",
    reference: "James 1:5",
    theme: "Hearing God's Voice",
    source: "transcripts: prayer-made-simple/23.txt (PMS23, James 1:5-8)",
  },
  {
    text: "But let him ask in faith, without any doubting, for he who doubts is like a wave of the sea, driven by the wind and tossed.",
    reference: "James 1:6",
    theme: "Hearing God's Voice",
    source: "app: scriptureText.ts",
  },
  {
    text: "But the wisdom that is from above is first pure, then peaceful, gentle, reasonable, full of mercy and good fruits, without partiality, and without hypocrisy.",
    reference: "James 3:17",
    theme: "Hearing God's Voice",
    source: "master-v2 §1.8 (wisdom from above)",
  },
  {
    text: "But he who prophesies speaks to men for their edification, exhortation, and consolation.",
    reference: "1 Corinthians 14:3",
    theme: "Hearing God's Voice",
    source: "master-v2 §1.8 (the prophetic test)",
  },
  {
    text: "for God is not a God of confusion but of peace, as in all the assemblies of the saints.",
    reference: "1 Corinthians 14:33",
    theme: "Hearing God's Voice",
    source: "master-v2 §1.8 (not a God of confusion)",
  },
  {
    text: "Beloved, don’t believe every spirit, but test the spirits, whether they are of God, because many false prophets have gone out into the world.",
    reference: "1 John 4:1",
    theme: "Hearing God's Voice",
    source: "podcast Ep.5 'Is That You God?'; master-v2 §1.17",
  },
  {
    text: "But solid food is for those who are full grown, who by reason of use have their senses exercised to discern good and evil.",
    reference: "Hebrews 5:14",
    theme: "Hearing God's Voice",
    source: "master-v2 §1.8/§1.16 (senses exercised to discern)",
  },
  {
    text: "Search me, God, and know my heart. Try me, and know my thoughts. See if there is any wicked way in me, and lead me in the everlasting way.",
    reference: "Psalm 139:23-24",
    theme: "Hearing God's Voice",
    source: "content-bank-v2 #41 (TR13, the dangerous prayer; corpus ×13)",
  },
  {
    text: "“Be still, and know that I am God. I will be exalted among the nations. I will be exalted on the earth.”",
    reference: "Psalm 46:10",
    theme: "Hearing God's Voice",
    source: "transcripts: hearing-god (stillness teaching); master-v2 §1.8",
  },
  {
    text: "Yahweh is near to all those who call on him, to all who call on him in truth.",
    reference: "Psalm 145:18",
    theme: "Hearing God's Voice",
    source: "transcripts: prayer-made-simple/11.txt (PMS11); app: encouragements.ts",
  },
  {
    text: "In the same way, the Spirit also helps our weaknesses, for we don’t know how to pray as we ought. But the Spirit himself makes intercession for us with groanings which can’t be uttered.",
    reference: "Romans 8:26",
    theme: "Hearing God's Voice",
    source: "app: content.ts (Foundations Day 15)",
  },
  {
    text: "For the word of God is living and active, and sharper than any two-edged sword, piercing even to the dividing of soul and spirit, of both joints and marrow, and is able to discern the thoughts and intentions of the heart.",
    reference: "Hebrews 4:12",
    theme: "Hearing God's Voice",
    source: "app: content.ts (Foundations Day 27)",
  },
  {
    text: "so is my word that goes out of my mouth: it will not return to me void, but it will accomplish that which I please, and it will prosper in the thing I sent it to do.",
    reference: "Isaiah 55:11",
    theme: "Hearing God's Voice",
    source: "master-v2 §1.7 (His word will not return void)",
  },
  {
    text: "Teach me good judgment and knowledge, for I believe in your commandments.",
    reference: "Psalm 119:66",
    theme: "Hearing God's Voice",
    source: "transcripts: hearing-god/prayer-wisdom-discernment",
  },
  {
    text: "Trust in Yahweh with all your heart, and don’t lean on your own understanding. In all your ways acknowledge him, and he will make your paths straight.",
    reference: "Proverbs 3:5-6",
    theme: "Hearing God's Voice",
    source: "app: freedom.ts (Freedom Day 2)",
  },
  {
    text: "You shall seek me and find me, when you search for me with all your heart.",
    reference: "Jeremiah 29:13",
    theme: "Hearing God's Voice",
    source: "app: encouragements.ts",
  },
  {
    text: "Ask, and it will be given you. Seek, and you will find. Knock, and it will be opened for you.",
    reference: "Matthew 7:7",
    theme: "Hearing God's Voice",
    source: "app: content.ts (Foundations Day 10)",
  },
  {
    text: "But be doers of the word, and not only hearers, deluding your own selves.",
    reference: "James 1:22",
    theme: "Hearing God's Voice",
    source: "transcripts: prayer-made-simple/08.txt (doers, not hearers only)",
  },
  {
    text: "But he said, “On the contrary, blessed are those who hear the word of God, and keep it.”",
    reference: "Luke 11:28",
    theme: "Hearing God's Voice",
    source: "transcripts: get-free-stay-free/20.txt (hear the word and keep it)",
  },
  {
    text: "God, you are my God. I will earnestly seek you. My soul thirsts for you. My flesh longs for you, in a dry and weary land, where there is no water.",
    reference: "Psalm 63:1",
    theme: "Hearing God's Voice",
    source: "app: content.ts (Foundations Day 22)",
  },
  {
    text: "Continue steadfastly in prayer, watching in it with thanksgiving.",
    reference: "Colossians 4:2",
    theme: "Hearing God's Voice",
    source: "app: content.ts (Foundations Day 30)",
  },
  {
    text: "But you, when you pray, enter into your inner room, and having shut your door, pray to your Father who is in secret; and your Father who sees in secret will reward you openly.",
    reference: "Matthew 6:6",
    theme: "Hearing God's Voice",
    source: "app: content.ts (Foundations Day 11, the secret place)",
  },
  {
    text: "Let your Kingdom come. Let your will be done on earth as it is in heaven.",
    reference: "Matthew 6:10",
    theme: "Hearing God's Voice",
    source: "master-v2 §1.7 (the Lord's Prayer, Matt 6:9-13); PMS12",
  },
  {
    text: "But you, beloved, keep building up yourselves on your most holy faith, praying in the Holy Spirit.",
    reference: "Jude 1:20",
    theme: "Hearing God's Voice",
    source: "transcripts: prayer-made-simple/05.txt; HG real-talk-ep12",
  },
  {
    text: "God is spirit, and those who worship him must worship in spirit and truth.",
    reference: "John 4:24",
    theme: "Hearing God's Voice",
    source: "transcripts: get-free-stay-free/32.txt (worship in spirit and truth)",
  },
  {
    text: "Don’t quench the Spirit. Don’t despise prophecies. Test all things, and hold firmly that which is good.",
    reference: "1 Thessalonians 5:19-21",
    theme: "Hearing God's Voice",
    source: "transcripts: prayer-made-simple/05.txt (test everything)",
  },
  {
    text: "So we fasted and begged our God for this, and he granted our request.",
    reference: "Ezra 8:23",
    theme: "Hearing God's Voice",
    source: "transcripts: prayer-made-simple/16.txt (PMS16, Ezra 8:22-23)",
  },
  {
    text: "In my distress I called on Yahweh, and cried to my God. He heard my voice out of his temple. My cry before him came into his ears.",
    reference: "Psalm 18:6",
    theme: "Hearing God's Voice",
    source: "transcripts: prayer-made-simple/13.txt (PMS13)",
  },
  {
    text: "This is the boldness which we have toward him, that if we ask anything according to his will, he listens to us.",
    reference: "1 John 5:14",
    theme: "Hearing God's Voice",
    source: "transcripts: prayer-made-simple/03.txt (PMS03, 1 John 5:13-14)",
  },
  {
    text: "Therefore I tell you, all things whatever you pray and ask for, believe that you have received them, and you shall have them.",
    reference: "Mark 11:24",
    theme: "Hearing God's Voice",
    source: "transcripts: get-free-stay-free/08.txt (believe you have received)",
  },
  {
    text: "Immediately the father of the child cried out with tears, “I believe. Help my unbelief!”",
    reference: "Mark 9:24",
    theme: "Hearing God's Voice",
    source: "content-bank-v2 #38 (TR13: 'Lord, I believe. Help my unbelief.')",
  },
  {
    text: "Draw near to God, and he will draw near to you. Cleanse your hands, you sinners. Purify your hearts, you double-minded.",
    reference: "James 4:8",
    theme: "Hearing God's Voice",
    source: "app: encouragements.ts (draw near to God)",
  },
  {
    text: "The lamp of the body is the eye. If therefore your eye is sound, your whole body will be full of light.",
    reference: "Matthew 6:22",
    theme: "Hearing God's Voice",
    source: "transcripts: total-reset/10.txt; master-v2 §6.7",
  },
  {
    text: "Sanctify them in your truth. Your word is truth.",
    reference: "John 17:17",
    theme: "Hearing God's Voice",
    source: "transcripts: prayer-made-simple/19.txt (PMS19, John 17:14-17)",
  },

  // ── Forgiveness (11) ─────────────────────────────────────────────
  {
    text: "For if you forgive men their trespasses, your heavenly Father will also forgive you. But if you don’t forgive men their trespasses, neither will your Father forgive your trespasses.",
    reference: "Matthew 6:14-15",
    theme: "Forgiveness",
    source: "transcripts: lie-vs-truth/10.txt; master-v2 §1.5",
  },
  {
    text: "bearing with one another, and forgiving each other, if any man has a complaint against any; even as Christ forgave you, so you also do.",
    reference: "Colossians 3:13",
    theme: "Forgiveness",
    source: "app: content.ts (Foundations Day 5)",
  },
  {
    text: "And be kind to one another, tender hearted, forgiving each other, just as God also in Christ forgave you.",
    reference: "Ephesians 4:32",
    theme: "Forgiveness",
    source: "content-bank-v2 #43 (TR29)",
  },
  {
    text: "If we confess our sins, he is faithful and righteous to forgive us the sins and to cleanse us from all unrighteousness.",
    reference: "1 John 1:9",
    theme: "Forgiveness",
    source: "app: freedom.ts (Freedom Day 11); content-bank-v2 #19",
  },
  {
    text: "Whenever you stand praying, forgive, if you have anything against anyone; so that your Father, who is in heaven, may also forgive you your transgressions.",
    reference: "Mark 11:25",
    theme: "Forgiveness",
    source: "transcripts: prayer-made-simple/04.txt (PMS04)",
  },
  {
    text: "Jesus said, “Father, forgive them, for they don’t know what they are doing.” Dividing his garments among them, they cast lots.",
    reference: "Luke 23:34",
    theme: "Forgiveness",
    source: "transcripts: get-free-stay-free/25.txt ('Father, forgive them')",
  },
  {
    text: "But I tell you, love your enemies, bless those who curse you, do good to those who hate you, and pray for those who mistreat you and persecute you.",
    reference: "Matthew 5:44",
    theme: "Forgiveness",
    source: "app: content.ts (Foundations Day 17)",
  },
  {
    text: "And above all things be earnest in your love among yourselves, for love covers a multitude of sins.",
    reference: "1 Peter 4:8",
    theme: "Forgiveness",
    source: "transcripts: prayer-made-simple/25.txt (PMS25, 1 Peter 4:7-8)",
  },
  {
    text: "But the tax collector, standing far away, wouldn’t even lift up his eyes to heaven, but beat his chest, saying, ‘God, be merciful to me, a sinner!’ I tell you, this man went down to his house justified rather than the other; for everyone who exalts himself will be humbled, but he who humbles himself will be exalted.",
    reference: "Luke 18:13-14",
    theme: "Forgiveness",
    source: "transcripts: prayer-made-simple/22.txt (PMS22, Luke 18:9-14)",
  },
  {
    text: "Brothers, even if a man is caught in some fault, you who are spiritual must restore such a one in a spirit of gentleness, looking to yourself so that you also aren’t tempted.",
    reference: "Galatians 6:1",
    theme: "Forgiveness",
    source: "transcripts: key-renunciations/16.txt (restore gently)",
  },
  {
    text: "The discretion of a man makes him slow to anger. It is his glory to overlook an offense.",
    reference: "Proverbs 19:11",
    theme: "Forgiveness",
    source: "master-v2 §3 (offense-vs-sin framework, GFSF25)",
  },

];
