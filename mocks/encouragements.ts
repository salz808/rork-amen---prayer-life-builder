export const dailyEncouragements = [
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

export function getDailyEncouragement(): { text: string; author: string } {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return dailyEncouragements[dayOfYear % dailyEncouragements.length];
}
