export interface DailyEncouragement {
  text: string;
  author: string;
}

export interface JourneyEncouragementNotification {
  day: number;
  message: string;
}

export const dailyEncouragements: DailyEncouragement[] = [
  { text: "The prayer of the heart is the source of all good.", author: "Gregory of Nyssa" },
  { text: "God is always doing 10,000 things in your life, and you may be aware of three of them.", author: "John Piper" },
  { text: "Pray as though everything depended on God. Work as though everything depended on you.", author: "attributed to Saint Augustine" },
  { text: "More things are wrought by prayer than this world dreams of.", author: "Alfred Lord Tennyson" },
  { text: "To be a Christian without prayer is no more possible than to be alive without breathing.", author: "Martin Luther" },
  { text: "Prayer does not change God, but it changes him who prays.", author: "Soren Kierkegaard" },
  { text: "The greatest thing anyone can do for God and man is pray.", author: "S.D. Gordon" },
  { text: "When you can't put your prayer into words, God hears your heart.", author: "Unknown" },
  { text: "God shapes the world by prayer. The more praying there is, the better the world will be.", author: "E.M. Bounds" },
  { text: "A day without prayer is a day without blessing, and a life without prayer is a life without power.", author: "Edwin Harvey" },
  { text: "He who has learned to pray has learned the greatest secret of a holy and a happy life.", author: "William Law" },
  { text: "The value of consistent prayer is not that He will hear us, but that we will hear Him.", author: "William McGill" },
  { text: "Is prayer your steering wheel or your spare tire?", author: "Corrie ten Boom" },
  { text: "Prayer is not asking. It is a longing of the soul.", author: "Mahatma Gandhi" },
  { text: "Rejoice always, pray without ceasing, give thanks in all circumstances.", author: "1 Thessalonians 5:16-18" },
  { text: "Come to me, all who labor and are heavy laden, and I will give you rest.", author: "Matthew 11:28" },
  { text: "Draw near to God, and he will draw near to you.", author: "James 4:8" },
  { text: "The Lord is near to all who call on him, to all who call on him in truth.", author: "Psalm 145:18" },
  { text: "Cast all your anxiety on him because he cares for you.", author: "1 Peter 5:7" },
  { text: "Trust in the Lord with all your heart and lean not on your own understanding.", author: "Proverbs 3:5" },
  { text: "For I know the thoughts that I think toward you, says Yahweh, thoughts of peace, and not of evil, to give you hope and a future.", author: "Jeremiah 29:11" },
  { text: "Be still before the Lord and wait patiently for him.", author: "Psalm 37:7" },
  { text: "The Lord your God is with you wherever you go.", author: "Joshua 1:9" },
  { text: "His mercies are new every morning; great is his faithfulness.", author: "Lamentations 3:23" },
  { text: "Peace I leave with you. My peace I give to you; not as the world gives, I give to you. Don't let your heart be troubled, neither let it be fearful.", author: "John 14:27" },
  { text: "You will seek me and find me when you seek me with all your heart.", author: "Jeremiah 29:13" },
  { text: "The LORD is my light and my salvation — whom shall I fear? The LORD is the stronghold of my life — of whom shall I be afraid?", author: "Psalm 27:1" },
  { text: "In all your ways acknowledge him, and he will make straight your paths.", author: "Proverbs 3:6" },
  { text: "I can do all things through him who strengthens me.", author: "Philippians 4:13" },
  { text: "God is our refuge and strength, a very present help in trouble.", author: "Psalm 46:1" },
];

export const journeyEncouragementNotifications: JourneyEncouragementNotification[] = [
  { day: 1, message: "Day 1. Hello, beloved. You are here. That means something." },
  { day: 2, message: "You don't have to be impressive today. Just honest. That's enough." },
  { day: 3, message: "God knows your name. Not your title. Not your role. Your name. Come as yourself today." },
  { day: 4, message: "Before the day starts, name three gifts. Let thanks set the morning." },
  { day: 5, message: "Are you holding a grudge against someone? Today could be the day you put it down." },
  { day: 6, message: "The Holy Spirit is not shy. He is waiting. Make room for Him today." },
  { day: 7, message: "Seven days. You showed up. That's worth more than you know." },
  { day: 8, message: "God has something to say about that worry. Make room to hear Him today." },
  { day: 9, message: "Let go of what you've been gripping. Receive what He has for you." },
  { day: 10, message: "Ask Him today: 'Lord, what are Your desires for my heart?' Let Him shape the wanting." },
  { day: 11, message: "A prayer whispered in the car still counts. God hears every word of it." },
  { day: 12, message: "Someone in your life needs you to carry them in prayer today. You know who it is." },
  { day: 13, message: "Dry days? Show up anyway. Deep roots grow here. Stay." },
  { day: 14, message: "Two weeks. Look back at who you were on Day 1. Something has already changed." },
  { day: 15, message: "No script today. Just you. God wants to hear your voice — not a perfect version of it." },
  { day: 16, message: "God is in the kitchen, the commute, the chaos. Find Him in the ordinary today." },
  { day: 17, message: "Blessing one who hurt you sets you free, not them. Try it today." },
  { day: 18, message: "After you pray today, listen. God wants to answer. Give Him room to speak." },
  { day: 19, message: "Fear says not enough. Faith says He owns the cattle on a thousand hills. Choose your lens." },
  { day: 20, message: "Look in the mirror today and say it: 'I am a beloved child of God.' Mean it." },
  { day: 21, message: "Three weeks in. Look how far He's brought you — and He's not finished. Keep walking with Him." },
  { day: 22, message: "No prompts today. You know the way by now. He loves to hear your voice." },
  { day: 23, message: "Walk your neighborhood today. Pray over what you see as you go." },
  { day: 24, message: "Fear lies. What has it told you? Name it. Let it go." },
  { day: 25, message: "Thank God today with names, not general thanks. Be specific. He hears you." },
  { day: 26, message: "Ask God what He's preparing you for. Then listen for His answer." },
  { day: 27, message: "Take Psalm 23 today. Read it just as it's written. Then pray it back to God in your own words, with 'I' and 'me.' Speak it out loud, over your own life." },
  { day: 28, message: "Someone is watching today. Let them see God's peace in you." },
  { day: 29, message: "One day left. Write to your Day 1 self. Tell them all God has done." },
  { day: 30, message: "Day 30. You made it. This rhythm is yours now. And God walks with you." },
];

export function getDailyEncouragement(): DailyEncouragement {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return dailyEncouragements[dayOfYear % dailyEncouragements.length];
}

export function getJourneyEncouragementNotification(day: number): JourneyEncouragementNotification {
  const normalizedDay = Math.max(1, Math.min(30, Math.floor(day)));
  return journeyEncouragementNotifications[normalizedDay - 1];
}

/**
 * Winback messages used when a user has been inactive for 3+ days.
 * Indexed by days since last completion: 4, 5, 6, 7, 14, 21, 30+.
 */
export const winbackNotifications: { daysSinceLast: number; message: string }[] = [
  { daysSinceLast: 4, message: "We saved your spot on Day {day}. No guilt — just an open door whenever you're ready." },
  { daysSinceLast: 5, message: "Day {day} waits for you. Five quiet minutes, when you are ready." },
  { daysSinceLast: 6, message: "Missing a few days doesn't undo what God's been building in you. Pick back up at Day {day}." },
  { daysSinceLast: 7, message: "A week away, and grace hasn't moved an inch. Come back to Day {day} when you can." },
  { daysSinceLast: 10, message: "His mercies are new every morning — including this one. Day {day} is one tap away." },
  { daysSinceLast: 14, message: "Two weeks. We're still here. Day {day} hasn't gone anywhere. Neither has He." },
  { daysSinceLast: 21, message: "Whenever you're ready. No streak required. Day {day} is the same exact doorway it was before." },
  { daysSinceLast: 30, message: "A month of life happened. Welcome back when it's time. Day {day} is yours." },
];

export function getWinbackMessage(daysSinceLast: number, journeyDay: number): string | null {
  if (daysSinceLast < 4) return null;
  // Find the latest applicable winback (highest daysSinceLast that is <= input)
  const eligible = winbackNotifications
    .filter((w) => w.daysSinceLast <= daysSinceLast)
    .sort((a, b) => b.daysSinceLast - a.daysSinceLast);
  const match = eligible[0];
  if (!match) return null;
  return match.message.replace('{day}', String(journeyDay));
}
