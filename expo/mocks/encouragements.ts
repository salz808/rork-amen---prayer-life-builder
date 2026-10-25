export interface JourneyEncouragementNotification {
  day: number;
  message: string;
}

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
