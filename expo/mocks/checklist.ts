export type ChecklistCategory = 'Prayer' | 'Scripture' | 'Faith Steps' | 'Inner Life' | 'Relationships' | 'Generosity';

export interface ChecklistItem {
  id: string;
  category: ChecklistCategory;
  text: string;
}

export const CHECKLIST_INTRO = 'These are yours. No one else sees this. Just you and God.';

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: 'prayer-prayed-out-loud-first-time',
    category: 'Prayer',
    text: "I've prayed out loud for the first time",
  },
  {
    id: 'prayer-prayed-honestly',
    category: 'Prayer',
    text: "I've prayed honestly — without pretending or polishing my words",
  },
  {
    id: 'prayer-asked-god-specific',
    category: 'Prayer',
    text: "I've asked God for something specific and waited to see what happens",
  },
  {
    id: 'prayer-thanked-god-when-hard',
    category: 'Prayer',
    text: "I've thanked God in a moment when it didn't feel natural",
  },
  {
    id: 'prayer-sat-in-silence',
    category: 'Prayer',
    text: "I've sat in silence with God for at least two full minutes",
  },
  {
    id: 'prayer-prayed-for-someone-else',
    category: 'Prayer',
    text: "I've prayed for someone else — interceded on their behalf",
  },
  {
    id: 'prayer-completed-30-days',
    category: 'Prayer',
    text: "I've completed all 30 days of the prayer journey",
  },
  {
    id: 'scripture-read-passage',
    category: 'Scripture',
    text: "I've read a passage of the Bible from beginning to end",
  },
  {
    id: 'scripture-looked-up-verse',
    category: 'Scripture',
    text: "I've looked up a verse that was mentioned in a prayer session",
  },
  {
    id: 'scripture-saved-verse',
    category: 'Scripture',
    text: "I've written down or saved a verse that meant something to me",
  },
  {
    id: 'scripture-prayed-scripture',
    category: 'Scripture',
    text: "I've prayed a scripture back to God using my own words",
  },
  {
    id: 'scripture-read-psalm',
    category: 'Scripture',
    text: "I've read one of the Psalms all the way through",
  },
  {
    id: 'faith-told-someone',
    category: 'Faith Steps',
    text: "I've told someone I trust that I'm a Christian",
  },
  {
    id: 'faith-attended-service',
    category: 'Faith Steps',
    text: "I've attended a church service",
  },
  {
    id: 'faith-baptized',
    category: 'Faith Steps',
    text: "I've been baptized",
  },
  {
    id: 'faith-taken-communion',
    category: 'Faith Steps',
    text: "I've taken communion for the first time",
  },
  {
    id: 'faith-joined-group',
    category: 'Faith Steps',
    text: "I've joined a small group or Bible study",
  },
  {
    id: 'faith-volunteered',
    category: 'Faith Steps',
    text: "I've volunteered or served at a church or ministry",
  },
  {
    id: 'inner-forgiven-someone',
    category: 'Inner Life',
    text: "I've forgiven someone who hurt me — spoken it out loud",
  },
  {
    id: 'inner-confessed-to-god',
    category: 'Inner Life',
    text: "I've confessed something to God I'd been hiding",
  },
  {
    id: 'inner-released-anxiety',
    category: 'Inner Life',
    text: "I've released an anxiety to God instead of spiraling",
  },
  {
    id: 'inner-spoken-declaration',
    category: 'Inner Life',
    text: "I've spoken a declaration over myself and meant it",
  },
  {
    id: 'inner-noticed-prompting',
    category: 'Inner Life',
    text: "I've noticed the Holy Spirit prompting me and followed it",
  },
  {
    id: 'inner-chosen-trust',
    category: 'Inner Life',
    text: "I've chosen to trust God in a situation I couldn't control",
  },
  {
    id: 'inner-experienced-peace',
    category: 'Inner Life',
    text: "I've experienced peace that didn't make logical sense",
  },
  {
    id: 'relationships-prayed-for-enemy',
    category: 'Relationships',
    text: "I've prayed for an enemy or someone who hurt me",
  },
  {
    id: 'relationships-shared-what-god-did',
    category: 'Relationships',
    text: "I've shared something God did with another person",
  },
  {
    id: 'relationships-asked-someone-to-pray',
    category: 'Relationships',
    text: "I've asked someone to pray with me",
  },
  {
    id: 'relationships-prayed-out-loud-with-another',
    category: 'Relationships',
    text: "I've prayed out loud with another person",
  },
  {
    id: 'relationships-encouraged-someone',
    category: 'Relationships',
    text: "I've encouraged someone using something I learned in prayer",
  },
  {
    id: 'generosity-given-financially',
    category: 'Generosity',
    text: "I've given financially to a church or ministry for the first time",
  },
  {
    id: 'generosity-prayed-for-unknown-person',
    category: 'Generosity',
    text: "I've prayed for someone I don't know by name",
  },
  {
    id: 'generosity-secret-kindness',
    category: 'Generosity',
    text: "I've done a secret act of kindness for a stranger",
  },
  {
    id: 'generosity-shared-faith-story',
    category: 'Generosity',
    text: "I've shared my faith story with someone who doesn't believe",
  },
  {
    id: 'generosity-prayed-for-city',
    category: 'Generosity',
    text: "I've prayed for my city, neighborhood, or nation",
  },
];

export const CHECKLIST_CATEGORIES: ChecklistCategory[] = [
  'Prayer',
  'Scripture',
  'Faith Steps',
  'Inner Life',
  'Relationships',
  'Generosity',
];
