import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity, ArrowLeftRight, ArrowRight, Bookmark, Check, ChevronDown,
  CircleHelp, Compass, Download, ExternalLink, FileText, Globe2, Layers3, LoaderCircle,
  Map, MapPin, Menu, Network, PanelLeftClose, PanelLeftOpen, Plus, Radar, RefreshCw, Search, Settings2, ShieldCheck,
  Sparkles, Trash2, Waypoints, X,
} from 'lucide-react';
import {
  getAtlasOverview, getQlooStatus, getGetAtlasOverviewQueryKey, getGetQlooStatusQueryKey,
  getListActivationPlansQueryKey, getListSavedDiscoveriesQueryKey,
  useDeleteActivationPlan, useDeleteSavedDiscovery, useDiscoverCulturalBridges,
  useGetAtlasOverview, useGetOpportunityHeatmap, useGetQlooStatus, useListActivationPlans,
  useListSavedDiscoveries, useSaveActivationPlan, useSaveDiscovery,
  useSearchQlooEntities, useTestQlooConnection,
} from '@workspace/api-client-react';
import type {
  ActivationPlan, BridgeCandidate, DiscoveryInput, DiscoveryInputRecommendationType, DiscoveryResponse, EntityEvidence, QlooStatus,
  SavedDiscovery,
} from '@workspace/api-client-react';
import { Link, Route, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const navItems = [
  { href: '/', label: 'Overview', icon: Layers3 },
  { href: '/discover', label: 'Discovery studio', icon: Compass },
  { href: '/atlas', label: 'Opportunity atlas', icon: Map },
  { href: '/plans', label: 'Activation planner', icon: FileText },
  { href: '/saved', label: 'Saved discoveries', icon: Bookmark },
  { href: '/settings', label: 'Workspace settings', icon: Settings2 },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function Button({
  children, variant = 'quiet', className, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' | 'outline' | 'danger' }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-[10px] px-3.5 py-2.5 text-[13px] font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-45',
        variant === 'primary' && 'bg-[#9b82ed] text-[#171322] hover:bg-[#b19cff]',
        variant === 'quiet' && 'text-[#aab3c7] hover:bg-white/[.055] hover:text-white',
        variant === 'outline' && 'border border-white/[.13] bg-white/[.025] text-[#cbd1df] hover:border-cyan-200/30 hover:bg-white/[.055]',
        variant === 'danger' && 'text-[#df8b94] hover:bg-rose-400/10',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function PageTitle({ kicker, title, detail, right }: { kicker: string; title: string; detail: string; right?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <div className="eyebrow mb-2 text-[10px] text-[#8e83bd]">{kicker}</div>
        <h1 className="text-[26px] font-semibold tracking-[-.045em] text-[#f0eff8] sm:text-[32px]">{title}</h1>
        <p className="mt-2 max-w-[680px] text-[13px] leading-6 text-[#8f99ae]">{detail}</p>
      </div>
      {right}
    </div>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('surface rounded-2xl p-5 sm:p-6', className)}>{children}</section>;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-white/[.055]', className)} />;
}

function ErrorNotice({ title, onRetry }: { title: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-rose-300/15 bg-rose-300/[.055] p-4">
      <div>
        <div className="text-sm font-semibold text-rose-100">{title}</div>
        <p className="mt-1 text-xs leading-5 text-rose-100/60">The service did not return a usable response. No substitute data is shown.</p>
      </div>
      {onRetry && <Button variant="quiet" onClick={onRetry} aria-label="Retry request"><RefreshCw size={15} /></Button>}
    </div>
  );
}

function StatusPill({ status }: { status?: QlooStatus }) {
  if (!status) return <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-[#939caf]"><span className="h-1.5 w-1.5 rounded-full bg-[#788195]" />Checking connection</span>;
  const positive = status.verified && status.state === 'verified';
  const tone = positive ? 'border-emerald-300/20 bg-emerald-300/[.07] text-emerald-200' : status.configured ? 'border-amber-200/20 bg-amber-200/[.07] text-amber-100' : 'border-white/10 bg-white/[.025] text-[#9ca5b8]';
  return <span className={cx('inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px]', tone)}><span className={cx('h-1.5 w-1.5 rounded-full', positive ? 'bg-emerald-300' : status.configured ? 'bg-amber-200' : 'bg-[#778095]')} />{positive ? 'Verified connection' : status.configured ? 'Configured · unverified' : 'Setup required'}</span>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const overview = useGetAtlasOverview();
  const status = useGetQlooStatus();
  const current = navItems.find((item) => item.href === location) ?? navItems[0];
  return (
    <div className="min-h-[100dvh]">
      <aside className={cx('fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-white/[.07] bg-[#111522]/95 py-5 backdrop-blur-xl transition-[width] duration-200 lg:flex', sidebarCollapsed ? 'w-[76px] px-2.5' : 'w-[246px] px-4')}>
        <div className={cx('mb-8 flex items-center', sidebarCollapsed ? 'justify-center' : 'justify-between')}>
        <Link href="/" className={cx('flex items-center gap-3', sidebarCollapsed ? 'px-0' : 'px-2')} data-testid="link-brand">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-[13px] border border-violet-200/20 bg-violet-300/[.09] text-[#c1afff]">
            <Network size={19} strokeWidth={1.7} />
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#111522] bg-[#75dbe4]" />
          </div>
          {!sidebarCollapsed && <div>
            <div className="text-[12px] font-extrabold tracking-[.08em] text-[#eeeef6]">CULTURAL</div>
            <div className="text-[10px] font-semibold tracking-[.17em] text-[#9ba5b9]">COLLISION ATLAS</div>
          </div>}
        </Link>
        {!sidebarCollapsed && <button onClick={() => setSidebarCollapsed(true)} aria-label="Collapse sidebar" title="Collapse sidebar" data-testid="button-collapse-sidebar" className="flex h-8 w-8 items-center justify-center rounded-lg text-[#79859b] hover:bg-white/[.05] hover:text-[#d4d9e4]"><PanelLeftClose size={16} /></button>}
        </div>
        {sidebarCollapsed && <button onClick={() => setSidebarCollapsed(false)} aria-label="Expand sidebar" title="Expand sidebar" data-testid="button-expand-sidebar" className="mb-4 flex h-8 w-full items-center justify-center rounded-lg text-[#79859b] hover:bg-white/[.05] hover:text-[#d4d9e4]"><PanelLeftOpen size={16} /></button>}
        {!sidebarCollapsed && <div className="eyebrow mb-3 px-3 text-[9px] text-[#687389]">Workspace</div>}
        <nav className="space-y-1" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.href === location;
            return <Link key={item.href} href={item.href} title={sidebarCollapsed ? item.label : undefined} data-testid={`link-nav-${item.href.replace('/', 'home')}`} className={cx('group flex items-center rounded-[10px] py-2.5 text-[12px] font-semibold transition', sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3', active ? 'bg-[#9a82ed]/[.12] text-[#d1c5ff]' : 'text-[#8993a9] hover:bg-white/[.04] hover:text-[#e4e7ee]')}><Icon size={16} strokeWidth={1.8} />{!sidebarCollapsed && <><span>{item.label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#a58df3]" />}</>}</Link>;
          })}
        </nav>
        <div className="mt-auto">
          <div className="mb-4 h-px w-full bg-white/[.07]" />
          <div className={cx('rounded-xl border border-white/[.08] bg-white/[.025]', sidebarCollapsed ? 'flex justify-center p-2' : 'p-3')}>
            {sidebarCollapsed ? <span title={status.data?.message ?? 'Connection status'} className={cx('mt-1 h-2 w-2 rounded-full', status.data?.verified ? 'bg-emerald-300' : status.data?.configured ? 'bg-amber-200' : 'bg-[#778095]')} /> : <>
              <div className="mb-2 flex items-center justify-between"><span className="eyebrow text-[9px] text-[#748098]">Data link</span><Activity size={13} className="text-[#758095]" /></div>
              <StatusPill status={status.data} />
              <div className="mt-3 flex justify-between text-[10px] text-[#788297]"><span>Discoveries</span><span className="mono text-[#aeb7ca]">{overview.data?.savedDiscoveries ?? '—'}</span></div>
              <div className="mt-1 flex justify-between text-[10px] text-[#788297]"><span>Plans</span><span className="mono text-[#aeb7ca]">{overview.data?.savedPlans ?? '—'}</span></div>
            </>}
          </div>
          {!sidebarCollapsed && <div className="mt-4 px-2 text-[9px] leading-5 text-[#626d82]">Evidence first. Inference always labeled.</div>}
        </div>
      </aside>

      <div className={sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[246px]'}>
        <header className="sticky top-0 z-20 border-b border-white/[.065] bg-[#0e121e]/85 backdrop-blur-xl">
          <div className="mx-auto flex h-[62px] max-w-[1600px] items-center justify-between px-4 sm:px-7 lg:px-10">
            <div className="flex items-center gap-3">
              <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-[#aab3c7] lg:hidden" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle navigation" data-testid="button-toggle-navigation"><Menu size={17} /></button>
              <div className="hidden text-[11px] text-[#687287] sm:block">Workspace <span className="mx-2 text-[#4b5364]">/</span> <span className="text-[#bac1d0]">{current.label}</span></div>
              <div className="text-[11px] text-[#bac1d0] sm:hidden">{current.label}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:block"><StatusPill status={status.data} /></div>
              <Link href="/settings" className="flex h-8 w-8 items-center justify-center rounded-full border border-violet-200/15 bg-violet-300/[.08] text-[10px] font-bold text-[#c8baff]" aria-label="Workspace settings" data-testid="link-settings-avatar">CC</Link>
            </div>
          </div>
          {mobileMenu && <nav className="grid grid-cols-2 gap-1 border-t border-white/[.06] p-3 lg:hidden">{navItems.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={() => setMobileMenu(false)} className={cx('flex items-center gap-2 rounded-lg px-3 py-2.5 text-[11px]', location === item.href ? 'bg-violet-300/10 text-violet-100' : 'text-[#a3acc0]')}><Icon size={14} />{item.label}</Link>; })}</nav>}
        </header>
        <main className="mx-auto max-w-[1600px] px-4 pb-16 pt-7 sm:px-7 sm:pt-9 lg:px-10">{children}</main>
      </div>
    </div>
  );
}

function OverviewPage() {
  const overview = useGetAtlasOverview();
  const status = useGetQlooStatus();
  const discoveries = useListSavedDiscoveries<SavedDiscovery[]>();
  const plans = useListActivationPlans<ActivationPlan[]>();
  return (
    <div className="page-in">
      <PageTitle kicker="Cultural intelligence / field notes" title="Overview" detail="A working instrument for finding meaningful overlap—and keeping the line between signal and speculation visible." right={<Link href="/discover" className="inline-flex items-center gap-2 rounded-[10px] bg-[#a58df3] px-4 py-2.5 text-[12px] font-bold text-[#171322] transition hover:bg-[#b9a7ff]">Start a discovery <ArrowRight size={15} /></Link>} />
      {overview.isLoading ? <div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div> : overview.isError ? <ErrorNotice title="Workspace overview could not be loaded" onRetry={() => overview.refetch()} /> : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric label="Saved discoveries" value={overview.data?.savedDiscoveries ?? 0} icon={<Bookmark size={16} />} note="Evidence records in this workspace" />
          <Metric label="Activation plans" value={overview.data?.savedPlans ?? 0} icon={<FileText size={16} />} note="Plans saved for team review" />
          <div className="surface rounded-2xl p-5"><div className="flex items-center justify-between"><span className="eyebrow text-[9px] text-[#78859c]">Qloo connection</span><Activity size={16} className="text-[#78dbe4]" /></div><div className="mt-3"><StatusPill status={status.data ?? overview.data?.qloo} /></div><p className="mt-3 text-[11px] leading-5 text-[#8792a9]">{status.data?.message ?? overview.data?.qloo.message ?? 'Connection state unavailable.'}</p></div>
        </div>
      )}
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.85fr]">
        <Panel className="relative min-h-[300px] overflow-hidden">
          <div className="pointer-events-none absolute -right-8 -top-20 h-64 w-64 rounded-full border border-violet-200/[.08]" />
          <div className="pointer-events-none absolute -right-1 -top-12 h-48 w-48 rounded-full border border-cyan-200/[.08]" />
          <div className="eyebrow text-[10px] text-[#8f80c9]">Start with a tension</div>
          <div className="mt-7 max-w-[660px] text-[clamp(32px,5vw,54px)] font-semibold leading-[1.07] tracking-[-.06em] text-[#f0eff7]">Where two worlds<br /><span className="text-[#a995f1]">find common ground.</span></div>
          <p className="mt-5 max-w-[500px] text-[13px] leading-6 text-[#929db2]">Compare cultural interests, inspect the evidence behind a bridge, then turn promising signals into a clearly labeled activation brief.</p>
          <div className="mt-7 flex flex-wrap gap-2"><Link href="/discover" className="inline-flex items-center gap-2 rounded-[10px] bg-[#a58df3] px-4 py-2.5 text-[12px] font-bold text-[#171322] hover:bg-[#b9a7ff]">Open Discovery Studio <ArrowRight size={15} /></Link><Link href="/atlas" className="inline-flex items-center gap-2 rounded-[10px] border border-white/[.12] px-4 py-2.5 text-[12px] font-semibold text-[#c1c8d6] hover:bg-white/[.04]">View the atlas <MapPin size={14} /></Link></div>
          <div className="absolute bottom-5 right-6 hidden items-center gap-2 text-[9px] text-[#68738a] md:flex"><span className="h-px w-8 signal-line" />Evidence-led exploration</div>
        </Panel>
        <Panel>
          <div className="flex items-center justify-between"><div><div className="eyebrow text-[9px] text-[#77839a]">Data integrity</div><h2 className="mt-2 text-[17px] font-semibold tracking-[-.03em]">Know what you’re looking at</h2></div><ShieldCheck size={20} className="text-[#8d79d9]" /></div>
          <div className="mt-5 space-y-3">
            <EvidenceLegend color="bg-[#67d9e2]" title="Observed API" description="Returned by a connected data source." />
            <EvidenceLegend color="bg-[#91a5ff]" title="External data" description="Third-party context, attributed at source." />
            <EvidenceLegend color="bg-[#bd9aff]" title="Derived score" description="A model or calculation applied to evidence." />
            <EvidenceLegend color="bg-[#e5b96d]" title="Product hypothesis" description="A planning proposition—not measured fact." />
          </div>
          <div className="mt-5 border-t border-white/[.07] pt-4 text-[10px] leading-5 text-[#788398]">No recommendations or place data are invented when integrations are unavailable.</div>
        </Panel>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <RecentDiscoveries query={discoveries} />
        <RecentPlans query={plans} />
      </div>
    </div>
  );
}

function Metric({ label, value, icon, note }: { label: string; value: number; icon: ReactNode; note: string }) {
  return <div className="surface rounded-2xl p-5"><div className="flex items-center justify-between"><span className="eyebrow text-[9px] text-[#78859c]">{label}</span><span className="text-[#9b8be4]">{icon}</span></div><div className="mt-4 text-[34px] font-semibold tracking-[-.06em] text-[#e9e9f3]">{value}</div><div className="mt-1 text-[10px] text-[#778297]">{note}</div></div>;
}

function EvidenceLegend({ color, title, description }: { color: string; title: string; description: string }) {
  return <div className="flex gap-3"><span className={cx('mt-1 h-2 w-2 shrink-0 rounded-full', color)} /><div><div className="text-[11px] font-semibold text-[#cdd2df]">{title}</div><div className="mt-0.5 text-[10px] leading-4 text-[#778297]">{description}</div></div></div>;
}

function RecentDiscoveries({ query }: { query: ReturnType<typeof useListSavedDiscoveries<SavedDiscovery[]>> }) {
  return <Panel><div className="mb-4 flex items-center justify-between"><div><div className="eyebrow text-[9px] text-[#78849a]">Your evidence trail</div><h2 className="mt-1 text-[16px] font-semibold">Recent discoveries</h2></div><Link href="/saved" className="text-[10px] text-[#a995f1] hover:text-[#c2b4ff]">All saved <ArrowRight size={12} className="ml-1 inline" /></Link></div>
    {query.isLoading ? <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-12" /></div> : query.isError ? <ErrorNotice title="Saved discoveries unavailable" onRetry={() => query.refetch()} /> : !query.data?.length ? <EmptyInline title="No discoveries saved yet" description="Your saved evidence-backed comparisons will appear here." /> : <div className="space-y-2">{query.data.slice(0, 3).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[.065] bg-white/[.018] px-3.5 py-3"><div className="min-w-0"><div className="truncate text-[12px] font-semibold text-[#d4d8e4]">{item.title}</div><div className="mt-1 truncate text-[10px] text-[#7d879c]">{item.interestA} <span className="text-[#9f8ce9]">×</span> {item.interestB} · {item.city}</div></div><span className="mono shrink-0 text-[9px] text-[#707b90]">{formatDate(item.createdAt)}</span></div>)}</div>}
  </Panel>;
}

function RecentPlans({ query }: { query: ReturnType<typeof useListActivationPlans<ActivationPlan[]>> }) {
  return <Panel><div className="mb-4 flex items-center justify-between"><div><div className="eyebrow text-[9px] text-[#78849a]">From signal to action</div><h2 className="mt-1 text-[16px] font-semibold">Activation plans</h2></div><Link href="/plans" className="text-[10px] text-[#a995f1] hover:text-[#c2b4ff]">Open planner <ArrowRight size={12} className="ml-1 inline" /></Link></div>
    {query.isLoading ? <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-12" /></div> : query.isError ? <ErrorNotice title="Activation plans unavailable" onRetry={() => query.refetch()} /> : !query.data?.length ? <EmptyInline title="No plans in the workspace" description="Create a plan from a discovery bridge to begin planning." /> : <div className="space-y-2">{query.data.slice(0, 3).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[.065] bg-white/[.018] px-3.5 py-3"><div className="min-w-0"><div className="truncate text-[12px] font-semibold text-[#d4d8e4]">{item.title}</div><div className="mt-1 truncate text-[10px] text-[#7d879c]">{item.bridgeName} · {item.city}</div></div><span className="mono shrink-0 text-[9px] text-[#707b90]">{formatDate(item.createdAt)}</span></div>)}</div>}
  </Panel>;
}

function EmptyInline({ title, description }: { title: string; description: string }) {
  return <div className="rounded-xl border border-dashed border-white/[.1] px-4 py-6 text-center"><div className="text-[12px] font-semibold text-[#adb5c7]">{title}</div><p className="mt-1 text-[10px] text-[#748096]">{description}</p></div>;
}

const defaultForm: DiscoveryInput = { interestA: '', interestB: '', interestAId: '', interestBId: '', city: '', recommendationType: 'urn:entity:brand', activationType: 'pop-up', budgetRange: '', objective: '', audienceDescription: '' };
const recommendationCategories: Array<{ value: DiscoveryInputRecommendationType; label: string }> = [
  { value: 'urn:entity:brand', label: 'Brand' },
  { value: 'urn:entity:place', label: 'Place' },
  { value: 'urn:entity:destination', label: 'Destination' },
];
const entitySearchTypes = [
  { value: 'urn:entity:artist', label: 'Artist' },
  { value: 'urn:entity:book', label: 'Book' },
  { value: 'urn:entity:brand', label: 'Brand' },
  { value: 'urn:entity:locality', label: 'Locality' },
  { value: 'urn:entity:movie', label: 'Movie' },
  { value: 'urn:entity:person', label: 'Person' },
  { value: 'urn:entity:place', label: 'Place' },
  { value: 'urn:entity:podcast', label: 'Podcast' },
  { value: 'urn:entity:tv_show', label: 'TV show' },
  { value: 'urn:entity:videogame', label: 'Video game' },
] as const;
type EntitySearchType = typeof entitySearchTypes[number]['value'];

function recommendationCategoryLabel(value: DiscoveryInputRecommendationType | undefined) {
  return recommendationCategories.find((category) => category.value === value)?.label ?? 'Brand';
}

function DiscoveryPage() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState<DiscoveryInput>(defaultForm);
  const [response, setResponse] = useState<DiscoveryResponse | null>(null);
  const [selected, setSelected] = useState<BridgeCandidate | null>(null);
  const [savedMessage, setSavedMessage] = useState('');
  const [entitySide, setEntitySide] = useState<'a' | 'b' | null>(null);
  const [entityText, setEntityText] = useState('');
  const [entitySearchType, setEntitySearchType] = useState<EntitySearchType | ''>('');
  const [selectedLocality, setSelectedLocality] = useState<EntityEvidence | null>(null);
  const [localityQuery, setLocalityQuery] = useState('');
  const discover = useDiscoverCulturalBridges();
  const search = useSearchQlooEntities();
  const localitySearch = useSearchQlooEntities();
  const save = useSaveDiscovery();
  const qc = useQueryClient();
  const status = useGetQlooStatus();
  const change = (key: keyof DiscoveryInput, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const canDiscover = !!form.interestA.trim() && !!form.interestB.trim() && !!form.interestAId.trim() && !!form.interestBId.trim() && !!form.city.trim() && !!form.cityEntityId && !!form.budgetRange.trim() && !!form.objective.trim();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canDiscover) return;
    setSavedMessage('');
    setSelected(null);
    discover.mutate({ data: form }, { onSuccess: (result) => setResponse(result), onError: () => setResponse(null) });
  };
  const searchEntity = (side: 'a' | 'b') => {
    const query = side === 'a' ? form.interestA : form.interestB;
    if (!query.trim()) return;
    setEntitySide(side);
    setEntityText(query);
    search.mutate({
      data: {
        query,
        ...(entitySearchType && { types: [entitySearchType] }),
      },
    });
  };
  const searchCityLocalities = () => {
    const query = form.city.trim();
    if (!query) return;
    setLocalityQuery(query);
    setSelectedLocality(null);
    setForm((previous) => ({ ...previous, cityEntityId: undefined }));
    setResponse(null);
    setSelected(null);
    discover.reset();
    localitySearch.mutate({ data: { query, types: ['urn:entity:locality'] } });
  };
  const changeCity = (value: string) => {
    setForm((previous) => ({ ...previous, city: value, cityEntityId: undefined }));
    setSelectedLocality(null);
    setLocalityQuery('');
    localitySearch.reset();
    setResponse(null);
    setSelected(null);
  };
  const saveResult = (candidate: BridgeCandidate) => {
    if (!response) return;
    const title = `${form.interestA} × ${form.interestB}`;
    save.mutate({ data: { title, city: form.city, interestA: form.interestA, interestB: form.interestB, result: { source: response.source, generatedAt: response.generatedAt, caveat: response.caveat, selectedBridge: candidate } } }, {
      onSuccess: () => { setSavedMessage('Discovery saved to your evidence trail.'); qc.invalidateQueries({ queryKey: getListSavedDiscoveriesQueryKey() }); qc.invalidateQueries({ queryKey: getGetAtlasOverviewQueryKey() }); },
    });
  };
  const makePlan = (candidate: BridgeCandidate) => {
    sessionStorage.setItem('atlas:draft-plan', JSON.stringify({ form, candidate, response }));
    setLocation('/plans');
  };
  return (
    <div className="page-in">
      <PageTitle kicker="01 / discovery studio" title="Cultural Bridge Explorer" detail="Set the context for a comparison. Returned candidates are grounded in connected-source evidence; scores and hypotheses stay separately labeled." right={<div className="flex items-center gap-2"><StatusPill status={status.data} /></div>} />
      <div className="grid items-start gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <Panel className="xl:sticky xl:top-[86px]">
          <div className="mb-5 flex items-start justify-between"><div><div className="eyebrow text-[9px] text-[#8c80bf]">Comparison brief</div><h2 className="mt-1 text-[16px] font-semibold">Define your inputs</h2></div><span className="mono rounded-md border border-white/[.09] px-2 py-1 text-[9px] text-[#788398]">01—07</span></div>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-[1fr_26px_1fr] items-end gap-2">
              <Field label="Cultural interest A" required><input className="field" maxLength={120} value={form.interestA} onChange={(e) => { change('interestA', e.target.value); change('interestAId', ''); setEntitySide(null); }} placeholder="e.g. interest or entity" data-testid="input-interest-a" /></Field>
              <div className="mb-3 flex justify-center text-[#8170c9]"><ArrowLeftRight size={15} /></div>
              <Field label="Cultural interest B" required><input className="field" maxLength={120} value={form.interestB} onChange={(e) => { change('interestB', e.target.value); change('interestBId', ''); setEntitySide(null); }} placeholder="Second interest" data-testid="input-interest-b" /></Field>
            </div>
            <div className="flex justify-between gap-2">
              <Button type="button" variant="quiet" className="px-0 text-[10px]" onClick={() => searchEntity('a')} disabled={!form.interestA.trim() || search.isPending}><Search size={12} />Search catalog A</Button>
              <Button type="button" variant="quiet" className="px-0 text-[10px]" onClick={() => searchEntity('b')} disabled={!form.interestB.trim() || search.isPending}><Search size={12} />Search catalog B</Button>
            </div>
            <Field label="Optional catalog category"><select className="field" value={entitySearchType} onChange={(event) => { setEntitySearchType(event.target.value as EntitySearchType | ''); setEntitySide(null); }} data-testid="select-entity-search-type"><option value="">Any category</option>{entitySearchTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></Field>
            <Field label="Recommendation category"><select className="field" value={form.recommendationType ?? 'urn:entity:brand'} disabled={discover.isPending} onChange={(event) => { const category = recommendationCategories.find(({ value }) => value === event.target.value); if (category) { change('recommendationType', category.value); setResponse(null); setSelected(null); discover.reset(); } }} data-testid="select-recommendation-category">{recommendationCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Entity ID · A" required><input className="field mono text-[10px]" value={form.interestAId} readOnly placeholder="Select catalog result" data-testid="input-entity-a-id" /></Field>
              <Field label="Entity ID · B" required><input className="field mono text-[10px]" value={form.interestBId} readOnly placeholder="Select catalog result" data-testid="input-entity-b-id" /></Field>
            </div>
            {search.isPending && <div className="rounded-lg border border-white/[.08] p-3 text-[10px] text-[#8d98ad]"><LoaderCircle className="mr-2 inline animate-spin" size={12} />Searching connected entity catalog…</div>}
            {search.data && entitySide && entityText === (entitySide === 'a' ? form.interestA : form.interestB) && <div className="rounded-xl border border-cyan-100/10 bg-cyan-200/[.025] p-3"><div className="mb-2 flex items-center justify-between text-[10px] text-[#a9e5ea]">Catalog results for “{entityText}”<button onClick={() => { setEntitySide(null); }} type="button" aria-label="Dismiss catalog results"><X size={13} /></button></div>{search.data.entities.length ? <div className="space-y-1">{search.data.entities.map((entity) => <button type="button" key={entity.id} onClick={() => { if (entitySide === 'a') { change('interestA', entity.name); change('interestAId', entity.id); } if (entitySide === 'b') { change('interestB', entity.name); change('interestBId', entity.id); } setEntitySide(null); }} className="flex w-full flex-col gap-1 rounded-lg px-2 py-2 text-left hover:bg-white/[.05]"><span className="flex w-full items-start justify-between gap-3"><span className="min-w-0 text-[11px] text-[#d7dce8]">{entity.name}<span className="mt-0.5 block mono text-[8px] text-[#778398]">{entity.id}</span></span><span className="shrink-0 text-right text-[9px] text-[#aab8ca]">{entity.type ?? 'Type unavailable'}{entity.subtype && <span className="block text-[8px] text-[#8d9bae]">Subtype: {entity.subtype}</span>}</span></span>{entity.description && <span className="line-clamp-2 pr-1 text-[9px] leading-4 text-[#8e9bb0]">{entity.description}</span>}</button>)}</div> : <div className="text-[10px] text-[#818ca1]">No matching entities returned.</div>}</div>}
            {search.isError && <div className="text-[10px] text-rose-200/80">Catalog search unavailable. Check the Qloo connection in settings.</div>}
            <Field label="City" required><div className="flex gap-2"><div className="relative min-w-0 flex-1"><MapPin size={14} className="absolute left-3 top-3.5 text-[#707b92]" /><input className="field pl-9" maxLength={120} value={form.city} onChange={(e) => changeCity(e.target.value)} placeholder="Where should this live?" data-testid="input-city" disabled={discover.isPending} /></div><Button type="button" variant="outline" className="shrink-0 px-2" onClick={searchCityLocalities} disabled={!form.city.trim() || localitySearch.isPending || discover.isPending} aria-label="Search Qloo city localities">{localitySearch.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <Search size={14} />}</Button></div></Field>
            <p className="-mt-2 text-[9px] leading-4 text-[#78849a]">Search and select the intended Qloo city entity. Ambiguous matches are never selected automatically.</p>
            {selectedLocality && <div className="rounded-lg border border-cyan-100/10 bg-cyan-100/[.025] px-3 py-2 text-[9px] leading-4 text-[#a8dfe3]">Selected Qloo locality: <b>{selectedLocality.name}</b>{selectedLocality.placeType && ` · ${selectedLocality.placeType}`}{selectedLocality.administrativeLevel != null && ` · admin level ${selectedLocality.administrativeLevel}`}<span className="mono mt-1 block break-all text-[#8c9db0]">{selectedLocality.id}</span></div>}
            {localitySearch.isPending && <div className="rounded-lg border border-white/[.08] p-3 text-[10px] text-[#8d98ad]"><LoaderCircle className="mr-2 inline animate-spin" size={12} />Searching Qloo city localities…</div>}
            {localitySearch.data && localityQuery === form.city.trim() && <div className="max-h-48 space-y-1 overflow-auto rounded-xl border border-cyan-100/10 bg-cyan-200/[.025] p-2" role="listbox" aria-label="Qloo city locality results">{localitySearch.data.entities.length ? localitySearch.data.entities.map((entity) => <button key={entity.id} type="button" role="option" aria-selected={form.cityEntityId === entity.id} disabled={entity.placeType !== 'city' || discover.isPending} onClick={() => { setSelectedLocality(entity); setForm((previous) => ({ ...previous, cityEntityId: entity.id })); setResponse(null); setSelected(null); }} className={cx('w-full rounded-lg px-2 py-2 text-left hover:bg-white/[.05] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent', form.cityEntityId === entity.id && 'bg-cyan-100/[.06]')}><span className="flex items-start justify-between gap-2"><span className="text-[10px] font-semibold text-[#d8e0ec]">{entity.name}</span><span className="shrink-0 text-[8px] text-[#aab8ca]">{entity.placeType ?? 'Place type unavailable'}{entity.administrativeLevel != null && ` · admin ${entity.administrativeLevel}`}</span></span>{entity.ancestorNames?.length ? <span className="mt-1 block text-[9px] text-[#8795aa]">Ancestors: {entity.ancestorNames.join(' · ')}</span> : <span className="mt-1 block text-[9px] text-[#8795aa]">Ancestor context unavailable</span>}<span className="mono mt-1 block break-all text-[8px] text-[#718096]">{entity.id}</span>{entity.placeType !== 'city' && <span className="mt-1 block text-[8px] text-[#be9d73]">Not selectable: choose a city-level result.</span>}</button>) : <div className="px-2 py-3 text-[10px] text-[#818ca1]">No locality results returned. Try a more specific city query.</div>}</div>}
            {localitySearch.isError && <div className="text-[10px] text-rose-200/80">Qloo locality search failed; no city was selected.</div>}
            <Field label="Activation type" required><div className="relative"><select className="field appearance-none pr-9" value={form.activationType} onChange={(e) => change('activationType', e.target.value)} data-testid="select-activation-type"><option value="pop-up">Pop-up</option><option value="live_event">Live event</option><option value="brand_collaboration">Brand collaboration</option><option value="retail_experience">Retail experience</option><option value="community_event">Community event</option></select><ChevronDown size={14} className="pointer-events-none absolute right-3 top-3.5 text-[#758097]" /></div></Field>
            <Field label="Budget range" required><input className="field" maxLength={80} value={form.budgetRange} onChange={(e) => change('budgetRange', e.target.value)} placeholder="e.g. $25k–$50k" data-testid="input-budget-range" /></Field>
            <Field label="Objective" required><textarea className="field min-h-[76px] resize-y" maxLength={300} value={form.objective} onChange={(e) => change('objective', e.target.value)} placeholder="What should the activation change or prove?" data-testid="input-objective" /></Field>
            <Field label="Audience context"><textarea className="field min-h-[66px] resize-y" maxLength={500} value={form.audienceDescription} onChange={(e) => change('audienceDescription', e.target.value)} placeholder="Optional: who are you hoping to reach?" data-testid="input-audience" /></Field>
            {discover.isError && <ErrorNotice title="Bridge discovery failed" />}
            {!status.data?.configured && <div className="rounded-lg border border-amber-200/15 bg-amber-100/[.04] px-3 py-2.5 text-[10px] leading-5 text-amber-100/75">Qloo is not configured. Discovery will return its explicit setup response; recommendations are never simulated. <Link href="/settings" className="ml-1 text-amber-100 underline underline-offset-2">Review settings</Link></div>}
            <Button type="submit" variant="primary" className="w-full py-3" disabled={!canDiscover || discover.isPending} data-testid="button-discover-bridges">{discover.isPending ? <><LoaderCircle size={15} className="animate-spin" />Reading signal…</> : <><Sparkles size={15} />Find cultural bridges</>}</Button>
          </form>
        </Panel>
        <section className="min-w-0">
          {!response && !discover.isPending && !discover.isError && <div className="surface flex min-h-[475px] flex-col items-center justify-center rounded-2xl px-6 text-center"><div className="relative mb-6 flex h-[90px] w-[90px] items-center justify-center rounded-full border border-violet-200/15 bg-violet-300/[.04]"><div className="absolute inset-3 rounded-full border border-cyan-200/10" /><Waypoints size={27} className="text-[#a890f2]" /><span className="absolute right-1 top-4 h-2 w-2 rounded-full bg-[#70dce7]" /></div><div className="eyebrow text-[9px] text-[#8b7cc0]">Ready for inquiry</div><h2 className="mt-3 text-[20px] font-semibold text-[#e4e5ef]">Your evidence panel is waiting</h2><p className="mt-2 max-w-[360px] text-[12px] leading-6 text-[#828da3]">Submit two interests and a planning context. Returned evidence will appear here with its source and confidence level.</p></div>}
          {discover.isPending && <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-48" /><Skeleton className="h-48" /></div>}
          {discover.isError && <ErrorNotice title="We couldn’t complete this comparison" onRetry={() => discover.mutate({ data: form }, { onSuccess: setResponse })} />}
          {response && <Results response={response} city={form.city} interestA={form.interestA} interestB={form.interestB} recommendationType={form.recommendationType} selected={selected} onSelect={setSelected} onSave={saveResult} onPlan={makePlan} saving={save.isPending} savedMessage={savedMessage} />}
        </section>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold text-[#a8b0c1]">{label}{required && <span className="text-[#c69aff]">*</span>}</span>{children}</label>;
}

function Results({ response, city, interestA, interestB, recommendationType, selected, onSelect, onSave, onPlan, saving, savedMessage }: {
  response: DiscoveryResponse; city: string; interestA: string; interestB: string; recommendationType: DiscoveryInputRecommendationType | undefined; selected: BridgeCandidate | null;
  onSelect: (candidate: BridgeCandidate | null) => void; onSave: (candidate: BridgeCandidate) => void;
  onPlan: (candidate: BridgeCandidate) => void; saving: boolean; savedMessage: string;
}) {
  const candidates = response.candidates ?? [];
  return <div className="space-y-4 page-in">
    <div className="surface rounded-2xl p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="eyebrow text-[9px] text-[#78859b]">Comparison result / {city} · {recommendationCategoryLabel(recommendationType)} recommendations</div><h2 className="mt-2 text-[18px] font-semibold tracking-[-.035em]">{interestA} <span className="text-[#9b89e8]">×</span> {interestB}</h2></div><span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200/15 bg-cyan-100/[.04] px-2.5 py-1 text-[9px] text-[#9cdee3]"><span className="h-1.5 w-1.5 rounded-full bg-[#72dbe4]" />{response.source}</span></div><p className="mt-3 text-[11px] leading-5 text-[#8f9ab0]">{response.caveat}</p><div className="mt-3 border-t border-white/[.06] pt-3 text-[9px] text-[#727d93]">Generated {formatDate(response.generatedAt)} · Candidate count {candidates.length}</div>{recommendationType === 'urn:entity:place' && <p className="mt-3 text-[10px] leading-5 text-[#8f9ab0]">Exact selected-city ID matches are prioritized when available. Other Place results remain as fallbacks and are labeled outside the selected city or locality unavailable; they are not treated as local matches.</p>}</div>
    {!candidates.length ? <div className="surface rounded-2xl px-6 py-12 text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/[.04] text-[#8995aa]"><Search size={18} /></div><h3 className="mt-4 text-[14px] font-semibold text-[#d1d5e1]">No {recommendationCategoryLabel(recommendationType).toLowerCase()} recommendations returned</h3><p className="mx-auto mt-1 max-w-[400px] text-[11px] leading-5 text-[#7e899f]">Qloo returned no candidates in this category for this comparison. Try another category or adjust the inputs; no sample results are substituted.</p></div> : candidates.map((candidate, index) => {
        const rawEvidence: unknown = candidate.evidence;
        const evidenceAvailable = Array.isArray(rawEvidence);
        const evidenceItems = evidenceAvailable ? rawEvidence.filter(isDisplayableEvidence) : [];
        const evidenceComplete = evidenceAvailable && rawEvidence.every(isDisplayableEvidence);
        const attributionEvidence = evidenceItems.find((item) => item.label === 'Per-result input attribution');
        const tasteEvidence = evidenceItems.filter((item) => item.label.startsWith('Taste Analysis overlap ·'));
        const displayedConfidence = evidenceComplete && attributionEvidence ? candidate.confidence : 'low';
        return <article key={candidate.id} className={cx('surface overflow-hidden rounded-2xl transition', selected?.id === candidate.id && 'border-violet-200/30')} data-testid={`card-bridge-${candidate.id}`}>
      <div className="p-5"><div className="flex items-start gap-4"><div className="mono flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-200/15 bg-violet-200/[.05] text-[10px] text-[#b7a5f2]">{String(index + 1).padStart(2, '0')}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-[16px] font-semibold tracking-[-.02em] text-[#e5e5ef]">{candidate.name}</h3><p className="mt-1.5 max-w-[620px] text-[11px] leading-5 text-[#8f9ab0]">{candidate.explanation}</p></div><div className="text-right"><div className="mono text-[22px] font-medium tracking-[-.06em] text-[#b5a2f4]">{candidate.score}<span className="text-[10px] text-[#778198]">/100</span></div><div className="text-[8px] uppercase tracking-[.13em] text-[#778197]">Derived score</div></div></div>
        <div className="mt-4 flex flex-wrap items-center gap-2"><span className={cx('rounded-full border px-2 py-1 text-[9px] tracking-[.04em]', displayedConfidence === 'high' ? 'border-emerald-200/20 bg-emerald-100/[.04] text-emerald-100/80' : displayedConfidence === 'medium' ? 'border-amber-200/20 bg-amber-100/[.04] text-amber-100/80' : 'border-white/10 text-[#a0a8b8]')}>{displayedConfidence === 'high' ? 'Both inputs attributed' : displayedConfidence === 'medium' ? 'One input attributed' : 'Input attribution unavailable'}</span><span className="rounded-full border border-violet-200/15 px-2 py-1 text-[9px] text-[#a99ae1]">{evidenceItems.length} evidence items</span><button onClick={() => onSelect(selected?.id === candidate.id ? null : candidate)} className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#a9b4c9] hover:text-white" data-testid={`button-evidence-${candidate.id}`}>{selected?.id === candidate.id ? 'Hide evidence' : 'Inspect evidence'}<ChevronDown size={13} className={cx('transition-transform', selected?.id === candidate.id && 'rotate-180')} /></button></div>
      </div></div></div>
      {tasteEvidence.length > 0 && <div className="grid gap-3 border-t border-white/[.06] px-5 py-4 md:grid-cols-2">
        {tasteEvidence.map((item) => {
          const status = tasteEvidenceStatus(item.value);
          return <div key={item.label} className="rounded-xl border border-white/[.07] bg-white/[.018] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[10px] font-semibold text-[#d2d7e4]">{item.label}</div>
              <span className="rounded-full border border-violet-200/15 px-2 py-1 text-[8px] text-[#b8a6ee]">{status}</span>
            </div>
            <p className="mt-2 text-[10px] leading-5 text-[#a3adbf]">{item.value}</p>
          </div>;
        })}
      </div>}
      <div className="grid gap-3 border-t border-white/[.06] px-5 py-4 md:grid-cols-2">
        <div className="rounded-xl border border-white/[.07] bg-white/[.018] p-3">
          <div className="text-[10px] font-semibold text-[#d2d7e4]">Qloo input attribution</div>
          <p className="mt-2 text-[10px] leading-5 text-[#a3adbf]">{attributionEvidence?.value ?? (evidenceComplete ? 'Per-result input attribution was not returned.' : 'Evidence details are incomplete; per-result input attribution could not be verified.')}</p>
        </div>
        <div className="rounded-xl border border-white/[.07] bg-white/[.018] p-3">
          <div className="text-[10px] font-semibold text-[#d2d7e4]">Standalone-interest results (sample)</div>
          <div className="mt-2 space-y-2">
            {[interestA, interestB].map((interest) => {
              const evidence = evidenceItems.find((item) => item.label === `Supporting single-interest comparison: ${interest}`);
              const status = evidence?.value ?? (evidenceComplete
                ? 'Not returned in this sample; this is not evidence against a connection.'
                : 'Evidence details are incomplete; standalone result status is unavailable. Absence is not evidence against a connection.');
              return <div key={interest} className="text-[10px] leading-5 text-[#a3adbf]"><span className="font-semibold text-[#cbd2df]">{interest}: </span>{status}</div>;
            })}
          </div>
          {recommendationType === 'urn:entity:place' && <div className="rounded-xl border border-white/[.07] bg-white/[.018] p-3">
            <div className="text-[10px] font-semibold text-[#d2d7e4]">Place locality evidence</div>
            <p className="mt-2 text-[10px] leading-5 text-[#a3adbf]">{candidate.localityStatus === 'matches_selected_city' ? 'Exact selected-city match' : candidate.localityStatus === 'outside_selected_city' ? 'Outside selected city' : 'Location unavailable; exact match not verified'}. This compares Qloo city entity IDs under a city-proper interpretation; it does not establish cultural relevance.</p>
            {typeof candidate.localityCityEntityId === 'string' && <p className="mono mt-2 break-all text-[8px] text-[#78849a]">Returned city entity ID · {candidate.localityCityEntityId}</p>}
          </div>}
        </div>
      </div>
      {selected?.id === candidate.id && <div className="border-t border-white/[.07] bg-[#0c111c]/55 px-5 py-4"><div className="mb-3 flex items-center justify-between"><div><div className="eyebrow text-[9px] text-[#8791a7]">Evidence ledger</div><div className="mt-1 text-[10px] text-[#707b90]">{candidate.scoreDescription}</div></div><CircleHelp size={15} className="text-[#748097]" /></div>{evidenceItems.length ? <div className="grid gap-2 md:grid-cols-2">{evidenceItems.map((item, i) => <div key={`${item.source}-${i}`} className="rounded-xl border border-white/[.07] bg-white/[.018] p-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold text-[#d2d7e4]">{item.label}</span><EvidenceKind kind={item.kind} /></div><div className="mt-2 text-[11px] leading-5 text-[#a3adbf]">{item.value}</div><div className="mt-2 mono text-[9px] text-[#727e94]">Source · {item.source}</div></div>)}</div> : <EmptyInline title="No evidence details returned" description="This candidate has no evidence records to inspect." />}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[.06] px-5 py-3"><span className="text-[9px] text-[#717d93]">Score is derived, not a direct measure of audience size.</span><div className="flex gap-1"><Button variant="quiet" className="text-[10px]" onClick={() => onSave(candidate)} disabled={saving}><Bookmark size={13} />{saving ? 'Saving…' : 'Save discovery'}</Button><Button variant="outline" className="text-[10px]" onClick={() => onPlan(candidate)}><FileText size={13} />Build plan</Button></div></div>
        </article>;
    })}
    {savedMessage && <div className="text-[11px] text-emerald-200"><Check size={13} className="mr-1 inline" />{savedMessage}</div>}
  </div>;
}

function isDisplayableEvidence(value: unknown): value is { label: string; value: string; source: string; kind: string } {
  return typeof value === 'object' && value !== null &&
    'label' in value && typeof value.label === 'string' && value.label.trim().length > 0 &&
    'value' in value && typeof value.value === 'string' && value.value.trim().length > 0 &&
    'source' in value && typeof value.source === 'string' && value.source.trim().length > 0 &&
    'kind' in value && (value.kind === 'observed_api' || value.kind === 'external_data' || value.kind === 'derived' || value.kind === 'hypothesis');
}

function tasteEvidenceStatus(value: string): string {
  const incomplete = value.includes('list may be partial');
  if (value.startsWith('Cultural/domain tag overlap observed')) return incomplete ? 'Cultural/domain · incomplete' : 'Cultural/domain evidence';
  if (value.startsWith('Generic operational attribute overlap observed')) return incomplete ? 'Operational · incomplete' : 'Generic operational attribute';
  if (value.startsWith('Unclassified tag overlap observed')) return incomplete ? 'Unclassified · incomplete' : 'Unclassified tag evidence';
  if (value.startsWith('Multiple tag categories observed')) return incomplete ? 'Multiple categories · incomplete' : 'Multiple tag categories';
  if (value.startsWith('No exact tag-ID overlap observed')) return 'No observed overlap';
  if (value.startsWith('Exact matching tag IDs observed')) return 'Exact tag overlap observed';
  return 'Evidence unavailable or incomplete';
}

function EvidenceKind({ kind }: { kind: string }) {
  const label = kind === 'observed_api' ? 'Observed API' : kind === 'external_data' ? 'External data' : kind === 'derived' ? 'Derived' : 'Hypothesis';
  const cls = kind === 'observed_api' ? 'text-[#79dce4] border-cyan-200/15' : kind === 'external_data' ? 'text-[#a5b1ff] border-indigo-200/15' : kind === 'derived' ? 'text-[#c4a1ff] border-violet-200/15' : 'text-[#e2ba75] border-amber-200/15';
  return <span className={cx('rounded-full border px-2 py-0.5 text-[8px] uppercase tracking-[.1em]', cls)}>{label}</span>;
}

function AtlasPage() {
  const overview = useGetAtlasOverview();
  const [city, setCity] = useState('');
  const [entityQuery, setEntityQuery] = useState('');
  const [entityId, setEntityId] = useState('');
  const heatmap = useGetOpportunityHeatmap();
  const status = useGetQlooStatus();
  const catalogSearch = useSearchQlooEntities();
  const searchCatalog = () => {
    if (!entityQuery.trim()) return;
    setEntityId('');
    catalogSearch.reset();
    catalogSearch.mutate({ data: { query: entityQuery.trim() } });
  };
  const run = (event: FormEvent) => {
    event.preventDefault();
    if (!city.trim() || !entityId.trim() || !status.data?.configured) return;
    heatmap.mutate({ data: { city, entityId } });
  };
  const points = heatmap.data?.points ?? [];
  const bounds = useMemo(() => {
    if (!points.length) return null;
    const lats = points.map((p) => p.latitude);
    const lons = points.map((p) => p.longitude);
    return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) };
  }, [points]);
  return <div className="page-in">
    <PageTitle kicker="02 / geographic context" title="Opportunity Atlas" detail="Explore geography only when a connected source returns spatial evidence. No venue pins, addresses, or neighborhood claims are fabricated." right={<StatusPill status={status.data} />} />
    {!overview.isLoading && !overview.data?.venueProviderConfigured && <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200/15 bg-amber-100/[.035] p-4"><MapPin size={16} className="mt-0.5 shrink-0 text-[#dbb969]" /><div><div className="text-[12px] font-semibold text-[#ded1ac]">Venue layer unavailable</div><p className="mt-1 text-[10px] leading-5 text-[#928a77]">No venue provider is configured for this workspace. Place search, venue details, and suitability claims are hidden until a source is connected.</p></div></div>}
    {!status.isLoading && !status.data?.configured && <div className="mb-5 flex items-start gap-3 rounded-xl border border-white/[.09] bg-white/[.02] p-4"><Globe2 size={16} className="mt-0.5 shrink-0 text-[#858fa4]" /><div><div className="text-[12px] font-semibold text-[#bdc4d2]">Heatmap source unavailable</div><p className="mt-1 text-[10px] leading-5 text-[#828da2]">Qloo is not configured for this workspace. Geographic signal requests are disabled until an administrator configures the source.</p></div></div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
      <Panel className="min-h-[490px]">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><div className="eyebrow text-[9px] text-[#78849a]">Spatial evidence</div><h2 className="mt-1 text-[16px] font-semibold">Affinity field</h2></div><span className="rounded-full border border-white/[.1] px-2 py-1 text-[9px] text-[#8c97aa]">Source dependent</span></div>
        {heatmap.isPending ? <div className="grid h-[350px] place-items-center rounded-xl border border-white/[.07] bg-[#0b101b]"><div className="text-center text-[11px] text-[#93a0b5]"><LoaderCircle size={18} className="mx-auto mb-3 animate-spin text-[#8fe2e8]" />Requesting geographic evidence…</div></div> : heatmap.isError ? <ErrorNotice title="Geographic evidence unavailable" /> : !heatmap.data ? <div className="relative grid h-[350px] place-items-center overflow-hidden rounded-xl border border-white/[.07] bg-[#0b101b]"><div className="absolute inset-0 opacity-35" style={{ backgroundImage: 'linear-gradient(rgba(142,156,188,.07) 1px, transparent 1px),linear-gradient(90deg,rgba(142,156,188,.07) 1px,transparent 1px)', backgroundSize: '42px 42px' }} /><div className="relative max-w-[350px] px-5 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-cyan-100/10 bg-cyan-100/[.04] text-[#72dbe4]"><Globe2 size={20} /></div><h3 className="mt-4 text-[14px] font-semibold">No location data loaded</h3><p className="mt-2 text-[11px] leading-5 text-[#7f8ba0]">Add a city and an entity ID from a connected catalog search to request an evidence-backed heatmap.</p></div></div> : !points.length ? <div className="grid h-[350px] place-items-center rounded-xl border border-dashed border-white/[.1] bg-[#0b101b] px-6 text-center"><div><Map size={22} className="mx-auto text-[#718097]" /><h3 className="mt-3 text-[13px] font-semibold text-[#c4cad8]">No geographic points returned</h3><p className="mt-1 text-[10px] text-[#788499]">The source returned an empty heatmap for this entity and city.</p></div></div> : <div className="relative h-[350px] overflow-hidden rounded-xl border border-cyan-100/[.12] bg-[#0b101b]"><div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(rgba(142,156,188,.07) 1px, transparent 1px),linear-gradient(90deg,rgba(142,156,188,.07) 1px,transparent 1px)', backgroundSize: '42px 42px' }} /><div className="absolute left-4 top-4 rounded-lg border border-white/[.08] bg-[#111827]/90 px-3 py-2 text-[9px] text-[#9eabc0]">API coordinate field · {points.length} points</div>{bounds && points.map((point, i) => { const x = bounds.maxLon === bounds.minLon ? 50 : 8 + ((point.longitude - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * 84; const y = bounds.maxLat === bounds.minLat ? 50 : 8 + ((bounds.maxLat - point.latitude) / (bounds.maxLat - bounds.minLat)) * 84; const weight = point.affinity ?? point.popularity ?? 0.5; return <div key={`${point.latitude}-${point.longitude}-${i}`} title={`Lat ${point.latitude}, lon ${point.longitude}${point.affinity != null ? ` · affinity ${point.affinity}` : ''}`} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100/35 bg-cyan-300/30" style={{ left: `${x}%`, top: `${y}%`, width: `${8 + Math.min(18, Math.max(0, weight * 16))}px`, height: `${8 + Math.min(18, Math.max(0, weight * 16))}px` }} />; })}<div className="absolute bottom-3 right-3 text-[8px] text-[#717c90]">Points plotted by returned latitude / longitude · no basemap</div></div>}
        {heatmap.data && <div className="mt-3 flex flex-wrap gap-4 text-[9px] text-[#7e8a9f]"><span>Response source: <b className="font-medium text-[#b6c0d2]">{heatmap.data.source}</b></span><span>Points: <b className="font-medium text-[#b6c0d2]">{points.length}</b></span></div>}
      </Panel>
      <div className="space-y-5">
        <Panel>
          <div className="eyebrow text-[9px] text-[#8a7cc0]">Query the source</div>
          <h2 className="mt-1 text-[15px] font-semibold">Request heatmap</h2>
          <p className="mt-2 text-[10px] leading-5 text-[#838ea3]">Choose a bridge from Qloo’s entity catalog. The heatmap is requested only for the returned entity ID.</p>
          <form onSubmit={run} className="mt-4 space-y-3">
            <Field label="City" required><input value={city} onChange={(e) => setCity(e.target.value)} className="field" placeholder="City name" data-testid="input-atlas-city" /></Field>
            <Field label="Bridge / cultural entity" required>
              <div className="flex gap-2">
                <input value={entityQuery} onChange={(e) => { setEntityQuery(e.target.value); setEntityId(''); }} className="field min-w-0 flex-1" placeholder="Search the catalog" data-testid="input-atlas-bridge" />
                <Button variant="outline" type="button" disabled={!entityQuery.trim() || catalogSearch.isPending || !status.data?.configured} onClick={searchCatalog} aria-label="Search Qloo catalog">{catalogSearch.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <Search size={14} />}</Button>
              </div>
            </Field>
            {catalogSearch.isError && <div className="text-[10px] text-rose-200/80">Catalog search failed. Check the Qloo connection in Settings.</div>}
            {catalogSearch.data && <div className="max-h-40 space-y-1 overflow-auto rounded-lg border border-white/[.08] p-2" role="listbox" aria-label="Qloo catalog results">
              {catalogSearch.data.entities.length ? catalogSearch.data.entities.map((entity) => <button type="button" key={entity.id} role="option" aria-selected={entityId === entity.id} onClick={() => { setEntityId(entity.id); setEntityQuery(entity.name); }} className={cx('flex w-full items-start justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/[.05]', entityId === entity.id && 'bg-cyan-100/[.06]')}>
                <span className="min-w-0"><span className="block truncate text-[10px] text-[#d4dbe7]">{entity.name}</span><span className="mono mt-1 block break-all text-[8px] text-[#718096]">{entity.id}</span></span><span className="shrink-0 text-[8px] text-[#7f8ba0]">{entity.type ?? entity.subtype ?? 'Entity'}</span>
              </button>) : <div className="px-2 py-3 text-[10px] text-[#818ca1]">No matching entities returned.</div>}
            </div>}
            {entityId && <div className="rounded-lg border border-cyan-100/10 bg-cyan-100/[.025] px-3 py-2 text-[9px] text-[#9bdae0]">Selected Qloo ID <span className="mono ml-1 break-all text-[#b5c4d3]">{entityId}</span></div>}
            <Button variant="primary" className="w-full" disabled={!city.trim() || !entityId.trim() || heatmap.isPending || !status.data?.configured} type="submit"><Radar size={14} />Request spatial signal</Button>
          </form>
          <div className="mt-5 border-t border-white/[.07] pt-4">
            <div className="eyebrow text-[9px] text-[#78849a]">Venue planning filters</div>
            <p className="mt-1 text-[9px] leading-4 text-[#79859a]">These filters apply to sourced venue records, not Qloo’s affinity heatmap. They stay unavailable until a venue provider is configured.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Field label="Activation type"><select className="field opacity-45" disabled aria-label="Activation type venue filter"><option>Any type</option></select></Field>
              <Field label="Budget range"><select className="field opacity-45" disabled aria-label="Budget venue filter"><option>Any range</option></select></Field>
            </div>
          </div>
        </Panel>
        <Panel><div className="eyebrow text-[9px] text-[#78849a]">How to read this</div><div className="mt-3 space-y-3"><EvidenceLegend color="bg-[#67d9e2]" title="Returned coordinates" description="Only plotted when supplied by the API." /><EvidenceLegend color="bg-[#e5b96d]" title="Venue layer" description={overview.data?.venueProviderConfigured ? 'Provider configured; venue coverage is still source-dependent.' : 'Not configured for this workspace.'} /></div><div className="mt-4 border-t border-white/[.07] pt-3 text-[9px] leading-5 text-[#747f94]">A point field is not a venue recommendation or proof of event suitability.</div></Panel>
      </div>
    </div>
  </div>;
}

function PlansPage() {
  const qc = useQueryClient();
  const plansQuery = useListActivationPlans<ActivationPlan[]>();
  const savePlan = useSaveActivationPlan();
  const deletePlan = useDeleteActivationPlan();
  const [draft, setDraft] = useState<{ form: DiscoveryInput; candidate: BridgeCandidate; response: DiscoveryResponse } | null>(() => {
    try { const raw = sessionStorage.getItem('atlas:draft-plan'); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const [title, setTitle] = useState('');
  const [exported, setExported] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const planContent = useMemo(() => draft ? ({
    sections: [
      { title: 'Strategic rationale', content: `Observed bridge candidate: ${draft.candidate.name}. Hypothesis: it may provide a relevant meeting point between ${draft.form.interestA} and ${draft.form.interestB}. The aggregate affinity evidence does not establish that the same individuals share both interests.` },
      { title: 'Audience hypothesis', content: draft.form.audienceDescription?.trim() || `Hypothesis to validate: some people in ${draft.form.city} interested in ${draft.form.interestA} may also respond to an experience involving ${draft.form.interestB}. The audience has not been identified or measured.` },
      { title: 'Recommended experience', content: `Working concept for a ${draft.form.activationType.replaceAll('_', ' ')} in ${draft.form.city}: prototype a participatory experience around ${draft.candidate.name}, with cultural contributors shaping the concept. This is a creative direction, not a validated recommendation. Objective supplied for planning: ${draft.form.objective}` },
      { title: 'Venue options', content: 'None sourced. No venue-data provider is connected, so no venue names, addresses, capacities, availability, or suitability claims are included.' },
      { title: 'Budget breakdown', content: `No itemized vendor quotes are available. The entered range (${draft.form.budgetRange}) is a user-supplied planning constraint, not an estimate. Obtain sourced quotes for venue, production, contributors, accessibility, insurance, staffing, and measurement before approving spend.` },
      { title: 'Execution timeline', content: '1. Validate the concept with the intended audience and local contributors before booking. 2. Source venues and partners; confirm availability, permissions, accessibility, and itemized costs. 3. Produce a small opt-in pilot only after approvals. 4. Measure the agreed objectives during and after the pilot; timing depends on partner and venue confirmation.' },
      { title: 'Partners and resources', content: 'To source and validate: local cultural contributors, a venue host, a production lead, research support, accessibility and safety support, and any required permits. No partner is confirmed.' },
      { title: 'Risks and mitigations', content: 'The bridge may not resonate: test it with the intended audience first. The concept may feel extractive or tokenizing: involve compensated cultural contributors early and give them meaningful decision-making power. Venue, permissions, and costs are unknown: obtain written confirmation and itemized quotes before committing.' },
      { title: 'Success metrics', content: 'Proposed measures to agree before the pilot: qualified opt-ins, participation rate, concept recall, participant-reported relevance, and follow-up interest in the experience. No target values or outcomes are forecast.' },
      { title: 'Audience-interest test', content: `Run a small, opt-in concept test with people who self-identify as interested in ${draft.form.interestA}, ${draft.form.interestB}, or both. Show a neutral ${draft.candidate.name} experience concept, measure stated relevance, and record how the sample was recruited. Stated interest is not a forecast of attendance or campaign performance.` },
    ],
    planningEstimates: { budgetRange: draft.form.budgetRange, status: 'User-supplied planning input only; not a cost estimate or supplier quote.' },
    evidence: draft.candidate.evidence,
    source: draft.response.source,
    caveat: draft.response.caveat,
    assumptions: ['Audience fit and experience direction are hypotheses to test.', 'No venue, partner, permit, or supplier quote has been confirmed.', 'Costs, attendance, and campaign outcomes are not estimates or guarantees.'],
  }) : null, [draft]);
  const saveCurrent = (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !planContent || !title.trim()) return;
    setSaveError(false);
    savePlan.mutate({ data: { title, city: draft.form.city, interestA: draft.form.interestA, interestB: draft.form.interestB, bridgeName: draft.candidate.name, objective: draft.form.objective, plan: planContent } }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListActivationPlansQueryKey() }); qc.invalidateQueries({ queryKey: getGetAtlasOverviewQueryKey() }); setDraft(null); sessionStorage.removeItem('atlas:draft-plan'); setTitle(''); },
      onError: () => setSaveError(true),
    });
  };
  const exportPlan = (plan: ActivationPlan | null) => {
    const payload = plan ? { title: plan.title, city: plan.city, interests: [plan.interestA, plan.interestB], bridge: plan.bridgeName, objective: plan.objective, plan: plan.plan, createdAt: plan.createdAt } : draft && planContent ? { title: title || `${draft.form.interestA} × ${draft.form.interestB} activation brief`, city: draft.form.city, interests: [draft.form.interestA, draft.form.interestB], bridge: draft.candidate.name, objective: draft.form.objective, plan: planContent } : null;
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href; anchor.download = `${slug(payload.title)}-brief.json`; anchor.click(); URL.revokeObjectURL(href);
    setExported(true); window.setTimeout(() => setExported(false), 2200);
  };
  return <div className="page-in">
    <PageTitle kicker="03 / activation planning" title="Activation Planner" detail="Translate an evidence-backed bridge into a reviewable brief. Strategic ideas are clearly identified as hypotheses; budgets remain planning inputs." />
    {draft && planContent && <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
      <Panel><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="eyebrow text-[9px] text-[#8d7ec3]">Current working brief · hypothesis-led</div><h2 className="mt-1 text-[18px] font-semibold">{draft.candidate.name}</h2><p className="mt-1 text-[11px] text-[#8d98ad]">{draft.form.interestA} × {draft.form.interestB} · {draft.form.city}</p></div><EvidenceKind kind="hypothesis" /></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{planContent.sections.map((section, i) => <div key={section.title} className="rounded-xl border border-white/[.07] bg-white/[.018] p-4"><div className="eyebrow text-[9px] text-[#8490a6]">0{i + 1} / {section.title}</div><p className="mt-2 text-[11px] leading-5 text-[#b0b9ca]">{section.content}</p></div>)}</div>
        <div className="mt-4 rounded-xl border border-amber-100/10 bg-amber-100/[.025] p-3 text-[10px] leading-5 text-[#bbaa83]"><strong className="font-semibold text-[#d6c18f]">Planning assumptions</strong><ul className="mt-1 list-disc pl-4">{planContent.assumptions.map((x) => <li key={x}>{x}</li>)}</ul></div>
      </Panel>
      <Panel><div className="eyebrow text-[9px] text-[#78849a]">Save & share</div><h3 className="mt-1 text-[15px] font-semibold">Name this plan</h3><form className="mt-4 space-y-3" onSubmit={saveCurrent}><Field label="Plan title" required><input className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder={`${draft.form.city} cultural bridge`} data-testid="input-plan-title" /></Field><div className="rounded-lg border border-white/[.07] p-3 text-[10px] leading-5 text-[#808ca1]">Budget range: <span className="text-[#bec6d5]">{draft.form.budgetRange}</span><br />Source response: <span className="text-[#bec6d5]">{draft.response.source}</span></div>{saveError && <div className="text-[10px] text-rose-200">Plan could not be saved. Try again.</div>}<Button variant="primary" type="submit" className="w-full" disabled={!title.trim() || savePlan.isPending}>{savePlan.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <Bookmark size={14} />}{savePlan.isPending ? 'Saving plan…' : 'Save activation plan'}</Button><Button variant="outline" type="button" className="w-full" onClick={() => exportPlan(null)}><Download size={14} />{exported ? 'Brief exported' : 'Export brief as JSON'}</Button><Button variant="quiet" type="button" className="w-full" onClick={() => { setDraft(null); sessionStorage.removeItem('atlas:draft-plan'); }}>Discard working brief</Button></form></Panel>
    </div>}
    <Panel><div className="mb-4 flex items-center justify-between"><div><div className="eyebrow text-[9px] text-[#78849a]">Workspace library</div><h2 className="mt-1 text-[16px] font-semibold">Saved activation plans</h2></div><span className="mono rounded-md border border-white/[.08] px-2 py-1 text-[9px] text-[#7c879c]">{plansQuery.data?.length ?? '—'} plans</span></div>
      {plansQuery.isLoading ? <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : plansQuery.isError ? <ErrorNotice title="Saved plans could not be loaded" onRetry={() => plansQuery.refetch()} /> : !plansQuery.data?.length ? <div className="rounded-xl border border-dashed border-white/[.1] px-5 py-10 text-center"><FileText size={22} className="mx-auto text-[#727f95]" /><h3 className="mt-3 text-[13px] font-semibold text-[#c4cada]">{draft ? 'Your first plan is ready to save' : 'No saved plans yet'}</h3><p className="mx-auto mt-1 max-w-[400px] text-[10px] leading-5 text-[#7b879c]">{draft ? 'Give the brief a title above, then save it to the workspace library.' : 'Choose “Build plan” on a discovery bridge to create a clearly labeled working brief.'}</p></div> : <div className="space-y-2">{plansQuery.data.map((plan) => <PlanRow key={plan.id} plan={plan} onExport={() => exportPlan(plan)} onDelete={() => { if (window.confirm(`Delete “${plan.title}” from saved plans?`)) deletePlan.mutate({ id: plan.id }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListActivationPlansQueryKey() }); qc.invalidateQueries({ queryKey: getGetAtlasOverviewQueryKey() }); } }); }} deleting={deletePlan.isPending} />)}</div>}
    </Panel>
  </div>;
}

function PlanRow({ plan, onExport, onDelete, deleting }: { plan: ActivationPlan; onExport: () => void; onDelete: () => void; deleting: boolean }) {
  return <div className="flex flex-col justify-between gap-3 rounded-xl border border-white/[.07] bg-white/[.018] p-4 sm:flex-row sm:items-center" data-testid={`row-plan-${plan.id}`}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-[12px] font-semibold text-[#d6dbe6]">{plan.title}</h3><EvidenceKind kind="hypothesis" /></div><div className="mt-1 text-[10px] text-[#7e899f]">{plan.bridgeName} · {plan.city} · {formatDate(plan.createdAt)}</div><div className="mt-1 truncate text-[10px] text-[#909bb0]">{plan.interestA} × {plan.interestB}</div></div><div className="flex shrink-0 items-center gap-1"><Button variant="quiet" onClick={onExport} className="text-[10px]"><Download size={13} />Export</Button><Button variant="danger" onClick={onDelete} disabled={deleting} aria-label={`Delete ${plan.title}`}><Trash2 size={14} /></Button></div></div>;
}

function SavedPage() {
  const qc = useQueryClient();
  const query = useListSavedDiscoveries<SavedDiscovery[]>();
  const deletion = useDeleteSavedDiscovery();
  const [expanded, setExpanded] = useState<number | null>(null);
  return <div className="page-in">
    <PageTitle kicker="04 / evidence library" title="Saved Discoveries" detail="A durable record of comparisons worth returning to. Each item keeps its returned result and source caveat together." right={<Link href="/discover" className="inline-flex items-center gap-2 rounded-[10px] border border-white/[.12] px-3.5 py-2.5 text-[11px] font-semibold text-[#c4cada] hover:bg-white/[.04]"><Plus size={14} />New discovery</Link>} />
    <Panel>
      {query.isLoading ? <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div> : query.isError ? <ErrorNotice title="Saved discoveries could not be loaded" onRetry={() => query.refetch()} /> : !query.data?.length ? <div className="px-4 py-14 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-violet-100/10 bg-violet-100/[.035] text-[#ab99ec]"><Bookmark size={19} /></div><h2 className="mt-4 text-[15px] font-semibold">Your evidence trail starts here</h2><p className="mx-auto mt-2 max-w-[390px] text-[11px] leading-5 text-[#818ca1]">Run a comparison in Discovery Studio and save a result to build a searchable library. Empty is empty—no starter records are inserted.</p><Link href="/discover" className="mt-5 inline-flex items-center gap-2 rounded-[10px] bg-[#a58df3] px-4 py-2.5 text-[11px] font-bold text-[#171322]">Open Discovery Studio <ArrowRight size={14} /></Link></div> : <div className="space-y-3">{query.data.map((item) => <SavedCard key={item.id} item={item} expanded={expanded === item.id} onExpand={() => setExpanded(expanded === item.id ? null : item.id)} onDelete={() => { if (window.confirm(`Delete “${item.title}” from saved discoveries?`)) deletion.mutate({ id: item.id }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListSavedDiscoveriesQueryKey() }); qc.invalidateQueries({ queryKey: getGetAtlasOverviewQueryKey() }); } }); }} deleting={deletion.isPending} />)}</div>}
    </Panel>
  </div>;
}

function SavedCard({ item, expanded, onExpand, onDelete, deleting }: { item: SavedDiscovery; expanded: boolean; onExpand: () => void; onDelete: () => void; deleting: boolean }) {
  const result = item.result as Record<string, unknown>;
  const candidate = result?.selectedBridge as BridgeCandidate | undefined;
  const caveat = typeof result?.caveat === 'string' ? result.caveat : 'Saved result did not include a source caveat.';
  return <article className="rounded-xl border border-white/[.07] bg-white/[.018] p-4" data-testid={`card-saved-${item.id}`}><div className="flex flex-wrap items-center justify-between gap-3"><button onClick={onExpand} className="min-w-0 flex-1 text-left" data-testid={`button-open-saved-${item.id}`}><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-[13px] font-semibold text-[#dce0ea]">{item.title}</h2><span className="rounded-full border border-cyan-100/10 px-2 py-0.5 text-[8px] text-[#7edce3]">Saved record</span></div><div className="mt-1.5 text-[10px] text-[#838ea4]">{item.interestA} <span className="text-[#a995f1]">×</span> {item.interestB} · {item.city} · {formatDate(item.createdAt)}</div></button><div className="flex items-center gap-1"><Button variant="quiet" className="text-[10px]" onClick={onExpand}>{expanded ? 'Close details' : 'Inspect result'}<ChevronDown size={13} className={cx('transition-transform', expanded && 'rotate-180')} /></Button><Button variant="danger" onClick={onDelete} disabled={deleting} aria-label={`Delete ${item.title}`}><Trash2 size={14} /></Button></div></div>
    {expanded && <div className="mt-4 border-t border-white/[.07] pt-4"><div className="eyebrow text-[9px] text-[#77849a]">Stored response · no refresh implied</div>{candidate ? <div className="mt-3 rounded-lg border border-white/[.07] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-[12px] font-semibold text-[#d6dbe7]">{candidate.name}</div><div className="mono text-[11px] text-[#b2a0f1]">{candidate.score}/100 · derived</div></div><p className="mt-2 text-[10px] leading-5 text-[#929db2]">{candidate.explanation}</p>{candidate.evidence?.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{candidate.evidence.map((ev, idx) => <div key={idx} className="rounded-lg bg-white/[.025] p-2.5"><div className="flex justify-between gap-2"><span className="text-[10px] text-[#c5ccda]">{ev.label}</span><EvidenceKind kind={ev.kind} /></div><div className="mt-1 text-[10px] leading-4 text-[#8995aa]">{ev.value}</div><div className="mt-1 mono text-[8px] text-[#717d92]">{ev.source}</div></div>)}</div>}</div> : <div className="text-[10px] text-[#8994a8]">No selected bridge details were stored in this record.</div>}<p className="mt-3 text-[10px] leading-5 text-[#8b96ab]">Caveat: {caveat}</p></div>}
  </article>;
}

function SettingsPage() {
  const qc = useQueryClient();
  const status = useGetQlooStatus();
  const overview = useGetAtlasOverview();
  const test = useTestQlooConnection();
  const [testQuery, setTestQuery] = useState('cultural signal verification');
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      const [qloo, summary] = await Promise.all([getQlooStatus(), getAtlasOverview()]);
      qc.setQueryData(getGetQlooStatusQueryKey(), qloo);
      qc.setQueryData(getGetAtlasOverviewQueryKey(), summary);
    } catch {
      await Promise.all([status.refetch(), overview.refetch()]);
    } finally { setRefreshing(false); }
  };
  return <div className="page-in">
    <PageTitle kicker="05 / workspace controls" title="Settings & Integrations" detail="Inspect source readiness and verify integrations. Credentials are managed by the server environment—not entered or stored in this browser." right={<Button variant="outline" onClick={refresh} disabled={refreshing}><RefreshCw size={14} className={cx(refreshing && 'animate-spin')} />Refresh status</Button>} />
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div className="space-y-5">
        <Panel><div className="flex items-start justify-between gap-4"><div><div className="eyebrow text-[9px] text-[#8d7fc4]">Cultural graph provider</div><h2 className="mt-1 text-[17px] font-semibold">Qloo connection</h2><p className="mt-2 max-w-[560px] text-[11px] leading-5 text-[#8792a7]">Connection state is reported by the API. “Configured” does not mean a request has been verified; failed or unverified states remain explicit.</p></div><div className="hidden h-10 w-10 items-center justify-center rounded-xl border border-violet-100/10 bg-violet-100/[.04] text-[#a994f1] sm:flex"><Activity size={19} /></div></div>
          <div className="mt-5 rounded-xl border border-white/[.07] bg-[#0c111d]/60 p-4">{status.isLoading ? <Skeleton className="h-16" /> : status.isError ? <ErrorNotice title="Qloo status could not be read" onRetry={() => status.refetch()} /> : status.data ? <><div className="flex flex-wrap items-center justify-between gap-3"><StatusPill status={status.data} /><span className="mono text-[9px] text-[#707c91]">State · {status.data.state}</span></div><p className="mt-3 text-[11px] leading-5 text-[#9aa4b7]">{status.data.message}</p><div className="mt-3 grid gap-2 border-t border-white/[.06] pt-3 sm:grid-cols-3"><SettingValue label="Configured" value={status.data.configured ? 'Yes' : 'No'} /><SettingValue label="Verified" value={status.data.verified ? 'Yes' : 'No'} /><SettingValue label="Last checked" value={status.data.checkedAt ? formatDate(status.data.checkedAt) : 'Not recorded'} /></div></> : null}</div>
          <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (!testQuery.trim()) return; test.mutate({ data: { query: testQuery } }, { onSuccess: (result) => { qc.setQueryData(getGetQlooStatusQueryKey(), result); qc.invalidateQueries({ queryKey: getGetAtlasOverviewQueryKey() }); } }); }}>
            <input className="field" value={testQuery} onChange={(e) => setTestQuery(e.target.value)} maxLength={120} aria-label="Connection test query" data-testid="input-connection-query" />
            <Button variant="primary" type="submit" disabled={!testQuery.trim() || test.isPending} className="shrink-0">{test.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <ShieldCheck size={14} />}Test connection</Button>
          </form>
          {test.isError && <div className="mt-3"><ErrorNotice title="Connection test failed; status remains unverified" /></div>}
          {test.data && <div className="mt-3 rounded-lg border border-white/[.07] p-3"><div className="flex items-center justify-between"><span className="text-[10px] text-[#a7b0c3]">Latest test response</span><StatusPill status={test.data} /></div><p className="mt-2 text-[10px] leading-5 text-[#8792a7]">{test.data.message}</p></div>}
          {!status.data?.configured && !status.isLoading && <div className="mt-4 rounded-xl border border-amber-100/15 bg-amber-100/[.035] p-4"><div className="flex gap-2 text-[11px] font-semibold text-amber-100"><Settings2 size={14} />Setup required</div><p className="mt-2 text-[10px] leading-5 text-[#a19576]">The API reports no configured Qloo credential. Ask a workspace administrator to configure the provider secret on the server, then refresh status and run a connection test. The browser never collects the secret.</p></div>}
        </Panel>
        <Panel><div className="eyebrow text-[9px] text-[#78849a]">Location data</div><h2 className="mt-1 text-[16px] font-semibold">Venue provider</h2>{overview.isLoading ? <Skeleton className="mt-4 h-14" /> : overview.isError ? <ErrorNotice title="Venue provider status unavailable" onRetry={() => overview.refetch()} /> : <div className="mt-4 flex items-start gap-3 rounded-xl border border-white/[.07] bg-white/[.018] p-4"><MapPin size={16} className={overview.data?.venueProviderConfigured ? 'text-emerald-200' : 'text-[#d9b66b]'} /><div><div className="text-[11px] font-semibold text-[#cfd5e1]">{overview.data?.venueProviderConfigured ? 'Provider configured' : 'Not configured'}</div><p className="mt-1 text-[10px] leading-5 text-[#828da2]">{overview.data?.venueProviderConfigured ? 'Venue features remain dependent on provider coverage and returned data.' : 'The Opportunity Atlas will not show venue search or invented place information.'}</p></div></div>}</Panel>
      </div>
      <div className="space-y-5">
        <Panel><div className="eyebrow text-[9px] text-[#78849a]">Workspace counts</div><h2 className="mt-1 text-[15px] font-semibold">Current inventory</h2>{overview.isLoading ? <div className="mt-4 space-y-2"><Skeleton className="h-9" /><Skeleton className="h-9" /></div> : overview.data && <div className="mt-4 space-y-2"><SettingValue label="Saved discoveries" value={String(overview.data.savedDiscoveries)} /><SettingValue label="Saved plans" value={String(overview.data.savedPlans)} /></div>}</Panel>
        <Panel><div className="flex items-center gap-2 text-[#8c7cc4]"><ShieldCheck size={16} /><div className="eyebrow text-[9px]">Evidence policy</div></div><div className="mt-3 space-y-3"><EvidenceLegend color="bg-[#67d9e2]" title="Observed" description="Direct API return, with source context." /><EvidenceLegend color="bg-[#bd9aff]" title="Derived" description="Score or ranking computed from signal." /><EvidenceLegend color="bg-[#e5b96d]" title="Hypothesis" description="Planning idea to test—not a fact." /></div></Panel>
        <div className="rounded-xl border border-white/[.06] px-4 py-3 text-[9px] leading-5 text-[#717d92]"><ExternalLink size={12} className="mr-1 inline" />Integration changes are applied server-side. No credentials are transmitted from this UI.</div>
      </div>
    </div>
  </div>;
}

function SettingValue({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[.06] bg-white/[.018] px-3 py-2"><span className="text-[9px] text-[#7f8ba0]">{label}</span><span className="mono text-[9px] text-[#b8c1d1]">{value}</span></div>;
}

function formatDate(input: string) {
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? input : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}
function slug(text: string) { return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'activation-brief'; }

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return <RoutedErrorBoundary><Shell><Switch>
    <Route path="/" component={OverviewPage} />
    <Route path="/discover" component={DiscoveryPage} />
    <Route path="/atlas" component={AtlasPage} />
    <Route path="/plans" component={PlansPage} />
    <Route path="/saved" component={SavedPage} />
    <Route path="/settings" component={SettingsPage} />
    <Route component={NotFound} />
  </Switch></Shell></RoutedErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><Router /></QueryClientProvider>;
}

export default App;
