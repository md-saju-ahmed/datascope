import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Database,
  Filter,
  ShieldCheck,
  Search,
  SlidersHorizontal,
  Bookmark,
  ChartNoAxesCombined,
  CheckCircle2,
  Zap,
  Sparkles,
  Users,
  Lock,
} from 'lucide-react';
import { getSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export default async function PublicEntry() {
  const user = await getSession();

  return (
    <div className="space-y-24 sm:space-y-36">
      {/* ─────────────────────────────────────────────────────────────
          SECTION 1: HERO & INTERACTIVE STUDIO WINDOW PREVIEW
         ───────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center text-center">
        {/* Subtle background ambient blur */}
        <div
          className="pointer-events-none absolute -top-28 left-1/2 -z-10 h-96 w-full max-w-4xl -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
          aria-hidden="true"
        />

        {/* Top Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-4 py-1.5 text-xs font-medium text-foreground backdrop-blur">
          <Sparkles size={14} className="text-primary" aria-hidden="true" />
          <span>Enterprise Data Discovery &amp; Intelligence</span>
          <span className="hidden text-muted-foreground/60 sm:inline" aria-hidden="true">
            &bull;
          </span>
          <span className="hidden font-normal text-muted-foreground sm:inline">
            100,000+ Record Exploration
          </span>
        </div>

        {/* Main Title */}
        <h1 className="max-w-4xl text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
          Find the signal.{' '}
          <span className="bg-gradient-to-r from-primary via-primary/90 to-primary/70 bg-clip-text text-transparent">
            Keep the context.
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg sm:leading-8">
          Explore and query high-volume enterprise datasets without downloading entire tables.
          Engineered with sub-50ms server-side pagination, trigram full-text search, and strict dataset-level permissions.
        </p>

        {/* Action CTAs */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5 sm:gap-4">
          {user ? (
            <>
              <Button asChild className="min-h-12 px-6 text-base font-medium shadow-md shadow-primary/20">
                <Link href="/dashboard">
                  Open Workspace <ArrowRight size={18} className="ml-1" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="min-h-12 px-6 text-base font-medium">
                <Link href="/datasets">Browse Datasets</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild className="min-h-12 px-6 text-base font-medium shadow-md shadow-primary/20">
                <Link href="/login">
                  Sign in to Workspace <ArrowRight size={18} className="ml-1" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="min-h-12 px-6 text-base font-medium">
                <Link href="/register">Create Viewer Account</Link>
              </Button>
            </>
          )}
        </div>

        {/* Trust Badges */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-primary" aria-hidden="true" />
            <span>1-Click Demo Accounts</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-primary" aria-hidden="true" />
            <span>100k Seed Records</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-primary" aria-hidden="true" />
            <span>Server-Enforced RBAC</span>
          </div>
        </div>

        {/* Handcrafted Studio Explorer Preview Window */}
        <div className="mt-12 w-full max-w-5xl overflow-hidden rounded-xl border border-border bg-surface text-left shadow-2xl transition-all duration-300">
          {/* Window Chrome */}
          <div className="flex h-11 items-center justify-between border-b border-border bg-muted/40 px-4">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-destructive/60" aria-hidden="true" />
              <span className="size-3 rounded-full bg-amber-500/60" aria-hidden="true" />
              <span className="size-3 rounded-full bg-emerald-500/60" aria-hidden="true" />
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-surface/80 px-3 py-1 text-xs text-muted-foreground shadow-xs">
              <Database size={12} className="text-primary" aria-hidden="true" />
              <span className="font-medium text-foreground">Global Transactions</span>
              <span className="text-[10px] text-muted-foreground">(100,000 rows)</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Zap size={13} className="text-amber-500" aria-hidden="true" />
              <span className="font-mono text-[11px]">24ms</span>
            </div>
          </div>

          {/* Explorer Header / Filters Bar */}
          <div className="border-b border-border bg-surface/50 p-3 sm:px-6 sm:py-3.5">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground">
                <Search size={14} className="text-muted-foreground/80" aria-hidden="true" />
                <span className="font-mono text-foreground">status:active AND region:EMEA</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 font-medium text-primary">
                  Status: Active
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-medium text-foreground">
                  Region: EMEA
                </span>
                <span className="hidden text-muted-foreground sm:inline">Multi-Sort: Date &darr;</span>
              </div>
            </div>
          </div>

          {/* Explorer Mock Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/20 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium sm:px-6">Record ID</th>
                  <th className="px-4 py-2.5 font-medium sm:px-6">Entity Name</th>
                  <th className="px-4 py-2.5 font-medium sm:px-6">Status</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell sm:px-6">Category</th>
                  <th className="hidden px-4 py-2.5 font-medium sm:table-cell sm:px-6">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {[
                  { id: 'REC-98241', name: 'Stripe Gateway EMEA Settled', status: 'Verified', category: 'Payment Gateway', time: '12s ago' },
                  { id: 'REC-98240', name: 'Nordic Bank SEPA Clearing', status: 'Verified', category: 'Wire Transfer', time: '45s ago' },
                  { id: 'REC-98239', name: 'Zurich Reinsurance Allocation', status: 'Audit Pending', category: 'Underwriting', time: '2m ago' },
                  { id: 'REC-98238', name: 'London Securities Settlement', status: 'Verified', category: 'Equities', time: '5m ago' },
                  { id: 'REC-98237', name: 'Frankfurt Liquidity Pool Alpha', status: 'Archived', category: 'Treasury', time: '14m ago' },
                ].map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-mono text-foreground sm:px-6">{row.id}</td>
                    <td className="px-4 py-2.5 font-medium text-foreground sm:px-6">{row.name}</td>
                    <td className="px-4 py-2.5 sm:px-6">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide',
                          row.status === 'Verified' && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                          row.status === 'Audit Pending' && 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                          row.status === 'Archived' && 'bg-muted text-muted-foreground',
                        )}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell sm:px-6">{row.category}</td>
                    <td className="hidden px-4 py-2.5 font-mono text-muted-foreground sm:table-cell sm:px-6">{row.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Explorer Footer Status */}
          <div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground sm:px-6">
            <div className="flex items-center gap-3">
              <span>
                Showing <strong className="text-foreground">1&ndash;5</strong> of{' '}
                <strong className="text-foreground">100,000</strong> records
              </span>
              <span className="hidden sm:inline" aria-hidden="true">
                &bull;
              </span>
              <span className="hidden sm:inline">Server-side paginated</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">Page 1 of 4,000</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 2: CORE ENGINEERING PILLARS (UPDATED 3-CARD GRID)
         ───────────────────────────────────────────────────────────── */}
      <section className="relative">
        <div className="mb-12 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Architecture Standard</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Engineered for high volume. Bounded by contract.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground">
            No mocks. No client-side full-data filters. Every query, pagination boundary, and authorization check is executed where it belongs: in PostgreSQL.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Card 1: Bounded Memory Transfers */}
          <div className="group relative rounded-xl border border-border bg-surface p-6 shadow-xs transition-all duration-300 hover:border-primary/40 hover:shadow-md">
            <div className="mb-5 inline-flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Database size={22} aria-hidden="true" />
            </div>
            <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              100k+ Scale
            </span>
            <h3 className="mt-3 text-lg font-semibold text-foreground">Bounded Memory Transfers</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Fixed page sizes and database-level cursor execution ensure 100,000-record datasets never trigger memory spikes or high payload transfers in client browsers.
            </p>
            <ul className="mt-4 space-y-2 border-t border-border/60 pt-4 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-primary" aria-hidden="true" />
                <span>Deterministic seeded PostgreSQL dataset</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-primary" aria-hidden="true" />
                <span>Zero client-side memory exhaustion</span>
              </li>
            </ul>
          </div>

          {/* Card 2: Precision Search */}
          <div className="group relative rounded-xl border border-border bg-surface p-6 shadow-xs transition-all duration-300 hover:border-primary/40 hover:shadow-md">
            <div className="mb-5 inline-flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Filter size={22} aria-hidden="true" />
            </div>
            <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              PostgreSQL FTS &amp; Trigram
            </span>
            <h3 className="mt-3 text-lg font-semibold text-foreground">Context-Aware Precision Search</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Debounced 350ms input triggers indexed tsvector and trigram similarity queries. Multi-column sorting and structured condition builders produce exact result sets.
            </p>
            <ul className="mt-4 space-y-2 border-t border-border/60 pt-4 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-primary" aria-hidden="true" />
                <span>Deep URL query state persistence</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-primary" aria-hidden="true" />
                <span>Multi-sort with changeable column direction</span>
              </li>
            </ul>
          </div>

          {/* Card 3: Enterprise Governance */}
          <div className="group relative rounded-xl border border-border bg-surface p-6 shadow-xs transition-all duration-300 hover:border-primary/40 hover:shadow-md sm:col-span-2 lg:col-span-1">
            <div className="mb-5 inline-flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck size={22} aria-hidden="true" />
            </div>
            <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              Zero Trust Security
            </span>
            <h3 className="mt-3 text-lg font-semibold text-foreground">Dataset-Level Authorization</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Strict server-side validation checks session cookies, HMAC CSRF tokens, and explicit user-to-dataset grant policies. Unpermitted datasets are strictly denied.
            </p>
            <ul className="mt-4 space-y-2 border-t border-border/60 pt-4 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-primary" aria-hidden="true" />
                <span>HttpOnly session tokens with zero leakage</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-primary" aria-hidden="true" />
                <span>Granular dataset permission grants</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 3 (NEW): END-TO-END DATA WORKFLOW SHOWCASE
         ───────────────────────────────────────────────────────────── */}
      <section className="relative">
        <div className="mb-12 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Discovery Workflow</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            From raw datasets to actionable team insights
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground">
            A unified pipeline connecting cataloging, condition building, collaborative views, and aggregate intelligence.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              step: '01',
              title: 'Dataset Cataloging',
              icon: Database,
              description: 'Inspect schemas, column definitions, and volume bounds across public and restricted enterprise datasets.',
            },
            {
              step: '02',
              title: 'Condition Builder',
              icon: SlidersHorizontal,
              description: 'Compose structured multi-condition queries with AND logic, field comparison, and URL-synchronized state.',
            },
            {
              step: '03',
              title: 'Saved Views & Sharing',
              icon: Bookmark,
              description: 'Save complex exploration queries and share them across your team while respecting dataset-level access policies.',
            },
            {
              step: '04',
              title: 'Aggregate Analytics',
              icon: ChartNoAxesCombined,
              description: 'Track query activity, status breakdowns, and dataset distributions generated directly from server aggregates.',
            },
          ].map(({ step, title, icon: Icon, description }) => (
            <div
              key={step}
              className="relative flex flex-col rounded-xl border border-border bg-surface p-6 shadow-xs transition-all duration-300 hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-primary">{step}</span>
                <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon size={18} aria-hidden="true" />
                </div>
              </div>
              <h3 className="mt-5 text-base font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 4 (NEW): ROLE-AWARE GOVERNANCE MATRIX
         ───────────────────────────────────────────────────────────── */}
      <section className="relative rounded-2xl border border-border bg-gradient-to-b from-muted/30 to-surface p-8 sm:p-12">
        <div className="mb-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Enterprise Governance</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Tailored workspaces for every data role
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            DataScope dynamically configures navigation, query capabilities, and admin modules based on verified session credentials.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Viewer Role Card */}
          <div className="flex flex-col rounded-xl border border-border bg-surface p-6 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="rounded bg-muted px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Viewer
              </span>
              <Lock size={16} className="text-muted-foreground" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">Read-Only Exploration</h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Focused on bounded search, record inspection, and reading authorized views without configuration mutations.
            </p>
            <ul className="mt-5 space-y-2.5 border-t border-border/60 pt-5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-primary" aria-hidden="true" />
                <span>Bounded table pagination &amp; search</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-primary" aria-hidden="true" />
                <span>Record detail &amp; audit history view</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-primary" aria-hidden="true" />
                <span>Restricted from admin &amp; analytics</span>
              </li>
            </ul>
          </div>

          {/* Analyst Role Card (Highlighted) */}
          <div className="relative flex flex-col rounded-xl border-2 border-primary bg-surface p-6 shadow-md shadow-primary/5">
            <div className="flex items-center justify-between">
              <span className="rounded bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
                Analyst
              </span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Recommended
              </span>
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">Investigation &amp; Analytics</h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Deep search analysis, multi-condition filter building, saved view sharing, and server aggregate charts.
            </p>
            <ul className="mt-5 space-y-2.5 border-t border-border/60 pt-5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-primary" aria-hidden="true" />
                <span>Advanced condition builder &amp; multi-sort</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-primary" aria-hidden="true" />
                <span>Create &amp; share saved view configurations</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-primary" aria-hidden="true" />
                <span>Full access to analytics charts &amp; history</span>
              </li>
            </ul>
          </div>

          {/* Admin Role Card */}
          <div className="flex flex-col rounded-xl border border-border bg-surface p-6 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="rounded bg-muted px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Administrator
              </span>
              <Users size={16} className="text-muted-foreground" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">Governance &amp; Grants</h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Full administrative authority over platform users, dataset grants, system configuration, and audit logs.
            </p>
            <ul className="mt-5 space-y-2.5 border-t border-border/60 pt-5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-primary" aria-hidden="true" />
                <span>Grant &amp; revoke dataset access policies</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-primary" aria-hidden="true" />
                <span>User role management &amp; lifecycle control</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-primary" aria-hidden="true" />
                <span>System configuration &amp; diagnostic audit</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 5: HIGH-IMPACT CLOSING CALL TO ACTION
         ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-muted/50 via-surface to-muted/50 px-6 py-12 text-center sm:px-12 sm:py-16">
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-radial from-primary/10 via-transparent to-transparent"
          aria-hidden="true"
        />
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Ready to discover enterprise datasets?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
          Jump right into an Analyst, Admin, or Viewer role with pre-configured 1-click credentials, or register your own Viewer workspace.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Button asChild className="min-h-11 px-6 text-base font-medium shadow-md shadow-primary/20">
            <Link href="/login">
              Explore Live Demo <ArrowRight size={16} className="ml-1" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 px-6 text-base font-medium">
            <Link href="/register">Create Viewer Account</Link>
          </Button>
        </div>
        <p className="mt-5 text-xs text-muted-foreground">
          PostgreSQL 17 &bull; Drizzle ORM &bull; TanStack Table &bull; Redux Toolkit RTK Query
        </p>
      </section>
    </div>
  );
}
