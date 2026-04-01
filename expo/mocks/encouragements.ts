export interface DailyEncouragement {
  text: string;
  author: string;
}

export interface JourneyEncouragementNotification {
  day: number;
  message: string;
}

export const dailyEncouragements: DailyEncouragement[] = [
  { text: "Prayer is not asking. It is a longing of the soul.", author: "Mahatma Gandhi" },
  { text: "The prayer of the heart is the source of all good.", author: "Gregory of Nyssa" },
  { text: "God is always doing 10,000 things in your life, and you may be aware of three of them.", author: "John Piper" },
  { text: "Pray as though everything depended on God. Work as though everything depended on you.", author: "Saint Augustine" },
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
  { text: "Rejoice always, pray without ceasing, give thanks in all circumstances.", author: "1 Thessalonians 5:16-18" },
  { text: "Come to me, all who labor and are heavy laden, and I will give you rest.", author: "Matthew 11:28" },
  { text: "Draw near to God, and he will draw near to you.", author: "James 4:8" },
  { text: "The Lord is near to all who call on him, to all who call on him in truth.", author: "Psalm 145:18" },
  { text: "Cast all your anxiety on him because he cares for you.", author: "1 Peter 5:7" },
  { text: "Trust in the Lord with all your heart and lean not on your own understanding.", author: "Proverbs 3:5" },
  { text: "For I know the plans I have for you. plans to prosper you and not to harm you.", author: "Jeremiah 29:11" },
  { text: "Be still before the Lord and wait patiently for him.", author: "Psalm 37:7" },
  { text: "The Lord your God is with you wherever you go.", author: "Joshua 1:9" },
  { text: "His mercies are new every morning; great is his faithfulness.", author: "Lamentations 3:23" },
  { text: "Peace I leave with you; my peace I give you. Do not let your hearts be troubled.", author: "John 14:27" },
  { text: "You will seek me and find me when you seek me with all your heart.", author: "Jeremiah 29:13" },
  { text: "The Lord is my light and my salvation. whom shall I fear?", author: "Psalm 27:1" },
  { text: "In all your ways acknowledge him, and he will make straight your paths.", author: "Proverbs 3:6" },
  { text: "I can do all things through him who strengthens me.", author: "Philippians 4:13" },
  { text: "God is our refuge and strength, a very present help in trouble.", author: "Psalm 46:1" },
];

export const journeyEncouragementNotifications: JourneyEncouragementNotification[] = [
  { day: 1, message: "Day 1. The fact that you're here means something. God has been waiting for this moment." },
  { day: 2, message: "You don't have to be impressive today. Just honest. That's enough." },
  { day: 3, message: "God knows your name. Not your title, not your role — your name. Show up as yourself today." },
  { day: 4, message: "Find three things to be grateful for before your feet hit the floor. Change the morning." },
  { day: 5, message: "Is there someone you've been holding a grudge against? Today might be the day to put it down." },
  { day: 6, message: "The Holy Spirit is not shy. He's been waiting for you to make room. Give Him some today." },
  { day: 7, message: "Seven days. You showed up. That's worth more than you know." },
  { day: 8, message: "God has something to say about that worry you've been carrying. Make room to hear it today." },
  { day: 9, message: "Open your hands. Let go of what you've been gripping. Receive what He has for you." },
  { day: 10, message: "What do you actually want? Don't water it down today. Bring the real ask." },
  { day: 11, message: "The prayer you whisper alone in the car carries the same weight as any prayer. God hears it all." },
  { day: 12, message: "Someone in your life needs you to carry them in prayer today. You know who it is." },
  { day: 13, message: "Dry season? Show up anyway. This is where formation happens. Don't leave early." },
  { day: 14, message: "Two weeks. Look back at who you were on Day 1. Something has already changed." },
  { day: 15, message: "No script today. Just you. God wants to hear your voice — not a perfect version of it." },
  { day: 16, message: "God is in the kitchen, the commute, the chaos. Find Him in the ordinary today." },
  { day: 17, message: "Blessing someone who hurt you is for your freedom, not their benefit. Try it today." },
  { day: 18, message: "After you speak today — be still. God has a response. Give Him the space to give it." },
  { day: 19, message: "Fear says not enough. Faith says He owns the cattle on a thousand hills. Choose your lens." },
  { day: 20, message: "Look in the mirror today and say it: 'I am a beloved child of God.' Mean it." },
  { day: 21, message: "Three weeks. The root is deep now. You've outlasted most people's good intentions." },
  { day: 22, message: "No prompts today. You know how to do this. Open your mouth and pray." },
  { day: 23, message: "Walk through your neighborhood today with Kingdom eyes. Pray over what you see." },
  { day: 24, message: "Fear has been lying to you. What has it been saying? Name it. Then demote it." },
  { day: 25, message: "Specificity is intimacy. Thank God today with names and details, not general feelings." },
  { day: 26, message: "Ask God what He's preparing you for. Then be still enough to receive the answer." },
  { day: 27, message: "Take Psalm 23 today. Replace every 'he' with 'you.' Speak it directly to God." },
  { day: 28, message: "Someone is watching how you handle today. Model the peace you've been building." },
  { day: 29, message: "One day left. Write a note to your Day 1 self. Tell them what God did." },
  { day: 30, message: "Day 30. You made it. The habit is yours now. The app was just the scaffolding." },
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
