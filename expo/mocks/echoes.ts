export interface Echo {
  id: string;
  text: string;
  amens: number;
  timeAgo: string;
}

export const SEED_ECHOES: Echo[] = [
  { id: '1', text: "For my mother's health, she got test results back today.", amens: 14, timeAgo: '2m' },
  { id: '2', text: "For peace of mind today at work. I feel completely overwhelmed.", amens: 42, timeAgo: '15m' },
  { id: '3', text: "Thankful for a new job after 6 months of waiting! God is good.", amens: 108, timeAgo: '1h' },
  { id: '4', text: "For my marriage. We are barely speaking.", amens: 89, timeAgo: '3h' },
  { id: '5', text: "Just feeling so distant from God right now. Need a breakthrough.", amens: 215, timeAgo: '4h' },
  { id: '6', text: "For my son, he's struggling with anxiety and won't leave his room.", amens: 304, timeAgo: '5h' },
  { id: '7', text: "To finally let go of the anger I'm holding onto.", amens: 67, timeAgo: '8h' },
];
