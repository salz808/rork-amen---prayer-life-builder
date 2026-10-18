import { HtmlDayData } from '@/types';

export type SosFeeling = 'anxious' | 'overwhelmed' | 'afraid' | 'grieving';

export interface SosOption {
  id: SosFeeling;
  label: string;
  sublabel: string;
}

export const SOS_OPTIONS: SosOption[] = [
  { id: 'anxious', label: 'Anxious', sublabel: 'When your chest is tight' },
  { id: 'overwhelmed', label: 'Overwhelmed', sublabel: "When it's too much" },
  { id: 'afraid', label: 'Afraid', sublabel: 'When fear is loud' },
  { id: 'grieving', label: 'Grieving', sublabel: 'When your heart is broken' },
];

const BASE: Omit<HtmlDayData, 'title' | 'settle' | 'focus' | 'thank' | 'declare' | 'silenceTxt' | 'act' | 'identity' | 'verse'> = {
  subtitle: 'SOS Prayer',
  phase: 'spirit',
  repent: null,
  invite: null,
  ask: null,
  silence: 1,
};

export const SOS_PRAYERS: Record<SosFeeling, HtmlDayData> = {
  anxious: {
    ...BASE,
    title: 'When You\'re Anxious',
    settle:
      'Stop. Right here. You don\'t have to fix the feeling before you pray — bring it with you. Take one slow breath in... and let it out. Your Father is not waiting for you to calm down. He\'s already here, in the middle of it.',
    focus:
      'Anxiety is a signal, not a sentence. It\'s your body telling you it needs Someone bigger than the worry. You don\'t have to carry what He already carried.',
    thank: '"Father, thank You that I don\'t have to be okay to come to You. Thank You that You\'re not scared of what scares me."',
    declare: '"I cast this anxiety on Him, because He cares for me. Right now. This one. It\'s His now."',
    silenceTxt: 'Hand Him the specific thing. Name it silently, then picture yourself setting it down at His feet.',
    act: 'When the tightness returns today, put your hand on your chest and whisper: "His now."',
    identity: 'You are not your anxiety. You are His — and He is not anxious about you.',
    verse: '1 Peter 5:7 — Cast all your anxiety on him because he cares for you.',
  },
  overwhelmed: {
    ...BASE,
    title: 'When It\'s Too Much',
    settle:
      'You don\'t have to hold it all together for the next three minutes. Let it be too much — that\'s exactly why He\'s here. Close your eyes. Unclench your jaw. Drop your shoulders. You\'re allowed to not be okay right now.',
    focus:
      'Being overwhelmed doesn\'t mean you\'re failing. It means you\'re human and the load is real. God never asked you to carry it alone — that was never the assignment.',
    thank: '"Jesus, thank You that You\'re gentle with the weary. Thank You that I don\'t have to perform strength for You."',
    declare: '"His yoke is easy and His burden is light. I trade my heaviness for His rest — right now."',
    silenceTxt: 'Picture each weight lifting off your shoulders, one by one, as He takes them.',
    act: 'Write down the three heaviest things. Then write "His" next to each one.',
    identity: 'You are not a machine. You are His child — and children were never meant to carry the weight of the world.',
    verse: 'Matthew 11:28 — Come to me, all you who are weary and burdened, and I will give you rest.',
  },
  afraid: {
    ...BASE,
    title: 'When Fear Is Loud',
    settle:
      'Fear is loud, but it\'s not the loudest voice in the room. Take a breath. You are not alone in this moment — not for one second. The One who never sleeps is watching over you right now.',
    focus:
      'Fear tells you what *might* happen. Faith reminds you Who is *already* there. You don\'t have to feel brave to be held. Courage isn\'t the absence of fear — it\'s fear in the presence of a greater love.',
    thank: '"Father, thank You that You haven\'t given me a spirit of fear. Thank You that Your perfect love is already pushing this fear out."',
    declare: '"I will not fear. He is with me. He strengthens me. He holds me with His righteous right hand."',
    silenceTxt: 'Say His name slowly in the quiet. Every time fear speaks, answer with His name.',
    act: 'Tonight, before sleep, speak Isaiah 41:10 out loud over yourself. Let it be the last voice you hear.',
    identity: 'You are not abandoned to your fear. You are guarded, kept, and surrounded.',
    verse: 'Isaiah 41:10 — Do not fear, for I am with you; do not be dismayed, for I am your God.',
  },
  grieving: {
    ...BASE,
    title: 'When Your Heart Is Broken',
    settle:
      'You don\'t need words right now. You just need presence. So let\'s start there: He is here. He is not rushing you. He is not explaining it. He\'s sitting with you in it. Breathe. You\'re allowed to grieve.',
    focus:
      'Grief is love with nowhere to go — and God doesn\'t waste it. He collects every tear. He is close to the brokenhearted in a way He isn\'t close to anyone else. Your pain has His full attention.',
    thank: '"Jesus, thank You that You wept too. Thank You that You\'re not distant from this pain — You\'re in it with me."',
    declare: '"He is close to the brokenhearted. He is saving me, even now, even here. My tears are not wasted."',
    silenceTxt: 'No words needed. Just be held. If tears come, let them — He\'s collecting every one.',
    act: 'Tell one safe person today: "I\'m not okay, and I don\'t need you to fix it. Just sit with me."',
    identity: 'You are not forgotten in your grief. You are seen, held, and He is making a way through.',
    verse: 'Psalm 34:18 — The Lord is close to the brokenhearted and saves those who are crushed in spirit.',
  },
};

export function getSosPrayer(feeling: SosFeeling): HtmlDayData {
  return SOS_PRAYERS[feeling];
}
