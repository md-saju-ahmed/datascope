export interface DemoAccount {
  id: 'analyst' | 'admin' | 'viewer';
  role: string;
  badge: string;
  tagline: string;
  email: string;
  password: string;
  description: string;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    id: 'analyst',
    role: 'Analyst',
    badge: 'Recommended',
    tagline: '100k Explorer & Saved Views',
    email:
      process.env.NEXT_PUBLIC_DEMO_ANALYST_EMAIL ||
      'analyst@datascope.example.test',
    password:
      process.env.NEXT_PUBLIC_DEMO_ANALYST_PASSWORD ||
      '7294055d164d4665fcd818e77954b9f82d6975bb5a89202d',
    description:
      'Evaluate 100,000-record exploration, 350ms debounced search, multi-column sorting, saved views, charts, and CSV export.',
  },
  {
    id: 'admin',
    role: 'Admin',
    badge: 'Full Access',
    tagline: 'Platform Administration',
    email:
      process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL ||
      'admin@datascope.example.test',
    password:
      process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD ||
      'ed2916f1a714d967960818e156802066b406bd5efffd7f93',
    description:
      'Evaluate full admin capabilities: user management, dataset permissions, system audit logs, and restricted datasets.',
  },
  {
    id: 'viewer',
    role: 'Viewer',
    badge: 'Read-Only',
    tagline: 'Read-Only Dataset Exploration',
    email:
      process.env.NEXT_PUBLIC_DEMO_VIEWER_EMAIL ||
      'viewer@datascope.example.test',
    password:
      process.env.NEXT_PUBLIC_DEMO_VIEWER_PASSWORD ||
      '64e3f82a9df3445cea3408ae549cca919d31af01739ffec7',
    description:
      'Evaluate read-only access: bounded view execution, dataset browsing, and restricted export and management permissions.',
  },
] as const;
