export interface Echo {
  id: string;
  text: string;
  amens: number;
  createdAt: string;
}

/** Fallback seed data — only used when the database is unreachable. */
export const SEED_ECHOES: Echo[] = [
  { id: 'seed-1', text: "For my mother's health, she got test results back today.", amens: 14, createdAt: new Date(Date.now() - 2 * 60000).toISOString() },
  { id: 'seed-2', text: "For peace of mind today at work. I feel completely overwhelmed.", amens: 42, createdAt: new Date(Date.now() - 15 * 60000).toISOString() },
  { id: 'seed-3', text: "Thankful for a new job after 6 months of waiting! God is good.", amens: 108, createdAt: new Date(Date.now() - 60 * 60000).toISOString() },
  { id: 'seed-4', text: "For my marriage. We are barely speaking.", amens: 89, createdAt: new Date(Date.now() - 3 * 3600000).toISOString() },
  { id: 'seed-5', text: "Just feeling so distant from God right now. Need a breakthrough.", amens: 215, createdAt: new Date(Date.now() - 4 * 3600000).toISOString() },
  { id: 'seed-6', text: "For my son, he's struggling with anxiety and won't leave his room.", amens: 304, createdAt: new Date(Date.now() - 5 * 3600000).toISOString() },
  { id: 'seed-7', text: "To finally let go of the anger I'm holding onto.", amens: 67, createdAt: new Date(Date.now() - 8 * 3600000).toISOString() },
  { id: 'seed-8', text: "Starting chemo next week. I'm scared but I know God goes before me.", amens: 176, createdAt: new Date(Date.now() - 12 * 3600000).toISOString() },
  { id: 'seed-9', text: "For my daughter starting college across the country. Praying for protection.", amens: 53, createdAt: new Date(Date.now() - 18 * 3600000).toISOString() },
  { id: 'seed-10', text: "Grateful for 3 years of sobriety today. One day at a time.", amens: 241, createdAt: new Date(Date.now() - 24 * 3600000).toISOString() },
];
