const ENCOURAGEMENTS = [
  'Every prayer is heard.',
  'You are not praying alone.',
  'Still waters run deep — so does your faith.',
  'Let your roots grow down into Him.',
  'His mercies are new every morning.',
  'Draw near to God and He will draw near to you.',
  'Be still, and know that He is God.',
  'The Lord is close to the brokenhearted.',
  'Cast all your anxiety on Him because He cares for you.',
  'In quietness and trust is your strength.',
  'He who began a good work in you will carry it on to completion.',
  'My grace is sufficient for you.',
  'Come to me, all who are weary, and I will give you rest.',
  'I can do all things through Christ who strengthens me.',
  'The peace of God, which surpasses all understanding, will guard your heart.',
];

export function getDailyEncouragement(): string {
  const today = new Date();
  const dayOfYear = Math.floor(
    (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000
  );
  return ENCOURAGEMENTS[dayOfYear % ENCOURAGEMENTS.length];
}
