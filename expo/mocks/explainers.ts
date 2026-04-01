export interface ExplainerItem {
  term: string;
  context: string;
  explanation: string;
}

export const EXPLAINERS = {
  holy_spirit: {
    term: 'The Holy Spirit',
    context: "Day 6: 'The Holy Spirit filled a house in Acts 2'",
    explanation: "The Holy Spirit is the third person of the Trinity — fully God, just like the Father and Jesus. He's not a force or an energy. He's a person who lives inside every believer. In Acts 2, on the day of Pentecost, He came visibly and powerfully on the early church. Today He does the same work quietly but just as powerfully — guiding, comforting, convicting, and empowering you from the inside.",
  },
  repentance: {
    term: 'Repentance',
    context: 'Day 2 & throughout',
    explanation: "Repentance doesn't mean feeling bad about yourself — it means turning. Like changing the direction you're walking. It's agreeing with God that something in your life isn't working or isn't right, and choosing to walk a different way. It's not about earning forgiveness — that's already yours. It's about getting honest with God and letting Him redirect you.",
  },
  trinity: {
    term: 'The Trinity',
    context: 'References to Father, Son, and Holy Spirit',
    explanation: "Christians believe God is one God who exists as three persons — Father, Son (Jesus), and Holy Spirit. They are not three separate gods, but one God in three persons. It's one of the deepest mysteries of faith, not fully explainable, but experienced. When you pray to the Father, invite the Spirit, and follow Jesus — you're relating to all three at once.",
  },
  grace: {
    term: 'Grace',
    context: 'Throughout the devotional',
    explanation: "Grace means getting something good that you didn't earn and don't deserve. God's grace is the reason you can come to Him honestly, even after failure. It's not a license to do whatever you want — it's the power to become who you were made to be. You can't earn God's love. Grace means He gives it freely.",
  },
  intercession: {
    term: 'Intercession',
    context: "Day 12: 'Your prayer is a bridge for someone else'",
    explanation: "Intercession simply means praying on behalf of someone else. You're standing in the gap for them — bringing their name, their situation, their need before God when they may not be praying themselves. The Bible is full of people who changed outcomes for others through prayer. You don't need special words or status. You just need to show up for someone.",
  },
  declaration: {
    term: 'Declare / Declaration',
    context: "The TRIAD's Declare section",
    explanation: "To declare in prayer is to speak truth out loud — not because God needs to hear it, but because you do. There's something powerful about saying with your own mouth what God says is true about you. It's not magic or positive thinking. It's alignment — bringing your words into agreement with what God has already established about your identity and your life.",
  },
  triad: {
    term: 'The TRIAD',
    context: 'Throughout the 30-day journey',
    explanation: "The TRIAD is the prayer framework used in this app: Thank, Repent, Invite, Ask, Declare. It's not a formula — it's a flow. Starting with gratitude orients you toward God's goodness. Repentance clears the air. Inviting the Holy Spirit opens you up. Asking brings your needs honestly. Declaring closes with truth about who you are. Together, they make prayer a full conversation.",
  },
  selah: {
    term: 'Selah',
    context: 'The Selah timer at the end of each session',
    explanation: "Selah is a Hebrew word found throughout the Psalms. Scholars believe it means 'pause and reflect' or 'listen.' It was likely a musical instruction to stop and let what was just said settle in. In the Amen app, the Selah moment invites you to stop talking and just be present with God. Prayer isn't just speaking — it's also listening.",
  },
  kingdom_of_god: {
    term: 'Kingdom of God',
    context: "Day 23: 'Pray for the City'",
    explanation: "The Kingdom of God means the rule and reign of God — wherever He is in charge, that's His Kingdom. Jesus came to bring that Kingdom to earth. When you pray, serve others, forgive, live with integrity — you're extending the Kingdom. It's not a place you go to after you die. It's a reality you carry with you and bring into every room you walk into.",
  },
  covenant: {
    term: 'Covenant',
    context: "References to God's promises",
    explanation: "A covenant is a binding agreement — deeper than a contract. God has made covenants with His people throughout the Bible. His covenant with you through Jesus means He has permanently committed Himself to you. His promises are not suggestions. When the Bible says 'He will never leave you or forsake you,' that's covenant language. It cannot be broken.",
  },
  sanctification: {
    term: 'Sanctification',
    context: 'The journey of becoming',
    explanation: "Sanctification is the process of becoming more like Jesus over time. You're not saved by becoming good — you're saved by grace. But once you're saved, the Holy Spirit begins a lifelong work of shaping your character, your desires, and your responses. The 30-day journey you're on is part of that process. Growth is slow, real, and worth it.",
  },
  worship: {
    term: 'Worship',
    context: 'Throughout prayer and the Honor God section',
    explanation: "Worship is not just singing at church. It's any posture of your heart that says 'God is greater than I am and worthy of my attention.' You worship when you pray with gratitude. You worship when you obey even when it's hard. You worship when you pause, breathe, and acknowledge that He is God and you are not. Worship is a way of living, not just a song.",
  },
} as const satisfies Record<string, ExplainerItem>;

export type ExplainerKey = keyof typeof EXPLAINERS;
