import type { SupportCardVariant } from './moderation';

/**
 * Support-card copy (wall moderation, self-harm / threat holds).
 *
 * One card, two variants, rendered once from the root layout and
 * driven by AppProvider context — every write path that returns a
 * held row requests the same card, so the composer, the session
 * Ask share, and the journal testimony share/retry cannot drift
 * apart. The card replaces the generic under-review notice ONLY
 * for self_harm and threat holds; every other hold keeps the
 * generic notice. The held post itself stays held and never
 * publishes, whatever the user does on this card.
 *
 * No SOS/crisis banner exists anywhere else in the app: this card
 * appears only on a triggered hold, never on a normal screen.
 *
 * HOTLINE: Billy Graham 24/7 Prayer Line, 888-388-2683 — Kai's
 * provisional selection (2026-10-25 late; a more appropriate
 * deliverance-specific line may replace it later). Test-call
 * verification before shipping is a later step, not done here.
 * The 911 line below is not a hotline recommendation: a prayer
 * line cannot dispatch help, so immediate danger still needs
 * emergency services.
 */

// [NEW] assembly — Kai-approved 2026-10-25 ("so good, yes and amen!").
// NOT Michelle Salzer's verbatim words: an assembly drawing on her
// deliverance teaching (renouncing lies about self, breaking
// agreement, receiving love/peace/grace), with Kai-requested
// phrasing ("curse the spirit of death off my life") included as
// approved. Verbatim Michelle lines inside it still need a
// video spot-check before shipping (auto-caption caveat).
export const SELF_HARM_PRAYER = `Father God, I receive Your love right now, and I receive Your peace from heaven.
I break agreement with every suicidal thought, and I renounce unbelief, depression, and self-hatred.
I renounce the lie that I am rejected, unloved, or shameful. In Christ, I am accepted.
I renounce the lie that I am worthless. In Christ, I am significant.
I rebuke the lie that everyone is better off without me. My life matters. God has a purpose and a plan for me.
I curse the spirit of death off my life, in Jesus' name, and I plead the blood of Jesus over me.
I receive Your grace to stay, to have hope, and to reach for help.
You are with me, and You are not finished with me. Amen.`;

// APPROVED as written — Kai replied "great" to this draft
// (2026-10-25 late), including keeping "spirit of murder, rage,
// and death" together. Do NOT remove death, do NOT reword. This
// variant exists so the card does not reuse the suicide prayer
// as-is for a threat hold: it addresses murder and rage, not only
// the spirit of death. If Kai edits it later, change this constant
// only — no call site needs to change.
export const THREAT_PRAYER = `Father God, I receive Your love right now, and I receive Your peace from heaven.
I break agreement with thoughts of harming someone, and I renounce rage, hatred, and murderous thoughts.
I rebuke the lie that violence will fix this, or that someone deserves to be hurt.
I curse the spirit of murder, rage, and death off my life, in Jesus' name, and I plead the blood of Jesus over me.
I receive Your grace to step back, to choose peace, and to reach for help before I act.
My life matters, and so does theirs. You are with me, and You are not finished with me. Amen.`;

export const SUPPORT_HOTLINE_NAME = 'Billy Graham 24/7 Prayer Line';
export const SUPPORT_HOTLINE_NUMBER = '888-388-2683';
export const SUPPORT_HOTLINE_TEL_URL = 'tel:+18883882683';

export interface SupportCardContent {
  /** Both variants are Kai-approved as of 2026-10-25 late. */
  status: 'approved';
  prayer: string;
  title: string;
}

export function supportCardContent(variant: SupportCardVariant): SupportCardContent {
  if (variant === 'threat') {
    return {
      status: 'approved',
      prayer: THREAT_PRAYER,
      title: 'Pray this before you act',
    };
  }
  return {
    status: 'approved',
    prayer: SELF_HARM_PRAYER,
    title: 'Pray this with us',
  };
}
