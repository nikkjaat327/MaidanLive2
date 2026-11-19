import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, CreditCard, Plus, Radio, Trophy } from 'lucide-react';
import {
  AuthUser,
  LiveStreamData,
  OrganizerSubscriptionData,
  RevenueRecordData,
  SubscriptionPlanData,
  TournamentData,
} from '../../types/index.ts';
import { useAuth } from '../../hooks/useAuth.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';

export function AdminOrganizerMonetizationPage() {
  const { adminUser } = useAuth();
  const isSuperOrAdmin = adminUser?.role === 'SUPER_ADMIN' || adminUser?.role === 'ADMIN';

  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlanData[]>([]);
  const [subscriptions, setSubscriptions] = useState<OrganizerSubscriptionData[]>([]);
  const [revenueRecords, setRevenueRecords] = useState<RevenueRecordData[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [staffUsers, setStaffUsers] = useState<AuthUser[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create Plan modal
  const [planOpen, setPlanOpen] = useState(false);
  const [planCode, setPlanCode] = useState('');
  const [planName, setPlanName] = useState('');
  const [planPrice, setPlanPrice] = useState('0');
  const [planCurrency, setPlanCurrency] = useState('INR');
  const [planMaxStreams, setPlanMaxStreams] = useState('5');
  const [planMaxTours, setPlanMaxTours] = useState('5');
  const [planFeatures, setPlanFeatures] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);

  // Assign Subscription modal
  const [subOpen, setSubOpen] = useState(false);
  const [subUserId, setSubUserId] = useState('');
  const [subPlanId, setSubPlanId] = useState('');
  const [subStatus, setSubStatus] = useState<'ACTIVE' | 'PENDING' | 'EXPIRED' | 'CANCELLED'>('ACTIVE');
  const [subNotes, setSubNotes] = useState('');
  const [savingSub, setSavingSub] = useState(false);

  // Record Revenue modal
  const [revOpen, setRevOpen] = useState(false);
  const [revOrganizerId, setRevOrganizerId] = useState('');
  const [revTournamentId, setRevTournamentId] = useState('');
  const [revSourceType, setRevSourceType] = useState<'SUBSCRIPTION' | 'SPONSORSHIP' | 'REGISTRATION' | 'OTHER'>('SPONSORSHIP');
  const [revDescription, setRevDescription] = useState('');
  const [revAmount, setRevAmount] = useState('0');
  const [revCurrency, setRevCurrency] = useState('INR');
  const [revStatus, setRevStatus] = useState<'RECORDED' | 'PAID' | 'REFUNDED'>('PAID');
  const [revRef, setRevRef] = useState('');
  const [savingRev, setSavingRev] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setError(null);
      const overview = await platformOpsService.getOrganizerOverview();
      setTournaments(overview.tournaments || []);
      setStreams(overview.streams || []);
      setPlans(overview.plans || []);
      setSubscriptions(overview.subscriptions || []);
      setRevenueRecords(overview.revenueRecords || []);
      setTotalRevenue(overview.totalRevenue || 0);

      if (adminUser?.role === 'SUPER_ADMIN') {
        const users = await entityService.listUsers().catch(() => [] as AuthUser[]);
        setStaffUsers(users);
      }
    } catch (err) {
      setError(extractApiError(err, 'Failed to load organizer workspace.'));
    } finally {
      setLoading(false);
    }
  }, [adminUser?.role]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingPlan(true);
      setError(null);
      await platformOpsService.createSubscriptionPlan({
        code: planCode.trim().toUpperCase(),
        name: planName.trim(),
        monthlyPrice: Math.max(0, Number(planPrice) || 0),
        currency: planCurrency.trim() || 'INR',
        maxActiveStreams: Math.max(1, Number(planMaxStreams) || 5),
        maxTournaments: Math.max(1, Number(planMaxTours) || 5),
        features: planFeatures
          .split(/\n|,/)
          .map((f) => f.trim())
          .filter(Boolean),
      });
      setPlanOpen(false);
      setPlanCode('');
      setPlanName('');
      setPlanFeatures('');
      setSuccess('Subscription plan saved.');
      await loadAll();
    } catch (err) {
      setError(extractApiError(err, 'Failed to create subscription plan.'));
    } finally {
      setSavingPlan(false);
    }
  }

  async function handleAssignSubscription(e: React.FormEvent) {
    e.preventDefault();
    if (!subUserId || !subPlanId) return;
    try {
      setSavingSub(true);
      setError(null);
      await platformOpsService.assignOrganizerSubscription({
        organizerUserId: subUserId,
        planId: subPlanId,
        status: subStatus,
        notes: subNotes.trim(),
      });
      setSubOpen(false);
      setSuccess('Organizer subscription updated.');
      await loadAll();
    } catch (err) {
      setError(extractApiError(err, 'Failed to assign subscription.'));
    } finally {
      setSavingSub(false);
    }
  }

  async function handleCreateRevenue(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingRev(true);
      setError(null);
      await platformOpsService.createRevenueRecord({
        organizerUserId: revOrganizerId || adminUser?.id,
        tournamentId: revTournamentId || null,
        sourceType: revSourceType,
        description: revDescription.trim(),
        amount: Math.max(0, Number(revAmount) || 0),
        currency: revCurrency.trim() || 'INR',
        status: revStatus,
        referenceNumber: revRef.trim(),
      });
      setRevOpen(false);
      setRevDescription('');
      setRevRef('');
      setSuccess('Revenue ledger entry recorded.');
      await loadAll();
    } catch (err) {
      setError(extractApiError(err, 'Failed to record revenue.'));
    } finally {
      setSavingRev(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Organizer Workspace &amp; Monetization
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage owned tournaments, broadcasts, organizer subscription plans, and verified revenue ledger records.
          </p>
        </div>

        {isSuperOrAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPlanOpen(true)}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              <Plus className="w-4 h-4" />
              <span>New Plan</span>
            </button>
            <button
              type="button"
              disabled={plans.length === 0}
              onClick={() => {
                setSubUserId(staffUsers[0]?.id || adminUser?.id || '');
                setSubPlanId(plans[0]?.id || '');
                setSubOpen(true);
              }}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4" />
              <span>Assign Plan</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRevOrganizerId(adminUser?.id || '');
                setRevOpen(true);
              }}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
            >
              <Plus className="w-4 h-4" />
              <span>Record Revenue</span>
            </button>
          </div>
        )}
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />

      {loading ? (
        <TableSkeleton rows={4} />
      ) : (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-medium text-slate-500">Managed Tournaments</p>
              <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
                {tournaments.length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-medium text-slate-500">Managed Broadcasts</p>
              <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
                {streams.length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-medium text-slate-500">Active Subscriptions</p>
              <p className="font-mono tabular-nums text-2xl font-bold text-emerald-700 mt-1">
                {subscriptions.filter((s) => s.status === 'ACTIVE').length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-medium text-slate-500">Recorded Revenue</p>
              <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
                {totalRevenue.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tournaments & Streams Overview */}
            <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                <Trophy className="w-4 h-4 text-emerald-600" />
                <span>Workspace Tournaments &amp; Broadcasts</span>
              </h2>
              {tournaments.length === 0 && streams.length === 0 ? (
                <EmptyState
                  icon={<Briefcase className="w-5 h-5" />}
                  title="No tournaments or streams in workspace"
                  description="Create a tournament or launch a stream to manage it from this hub."
                />
              ) : (
                <div className="space-y-2 text-xs">
                  {tournaments.slice(0, 6).map((t) => (
                    <div
                      key={t.id}
                      className="p-2.5 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-between gap-2"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">{t.name}</p>
                        <p className="text-slate-500">
                          {t.sportType} · {t.status}
                        </p>
                      </div>
                      <Link
                        to={`/admin/tournaments/${t.id}/fixtures`}
                        className="font-semibold text-emerald-700 hover:underline shrink-0"
                      >
                        Manage Fixtures
                      </Link>
                    </div>
                  ))}
                  {streams.slice(0, 4).map((s) => (
                    <div
                      key={s.id}
                      className="p-2.5 rounded-lg border border-slate-100 bg-white flex items-center justify-between gap-2"
                    >
                      <div className="inline-flex items-center gap-2 min-w-0">
                        <Radio className="w-3.5 h-3.5 text-red-600 shrink-0" />
                        <span className="font-medium text-slate-900 truncate">
                          {s.matchTitle || `${s.teamAName} vs ${s.teamBName}` || s.youtubeVideoId}
                        </span>
                      </div>
                      <Link
                        to={`/admin/scoreboard/${s.id}`}
                        className="font-semibold text-slate-700 hover:underline shrink-0"
                      >
                        Scoreboard
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Subscription Plans & Active Assignments */}
            <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
              <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-slate-700" />
                <span>Subscription Plans &amp; Organizer Tiers</span>
              </h2>

              {plans.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  No subscription plans defined yet.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {plans.map((p) => (
                    <div key={p.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{p.name}</span>
                        <span className="font-mono text-xs font-semibold text-emerald-700">
                          {p.currency} {p.monthlyPrice}/mo
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Max {p.maxActiveStreams} active streams · {p.maxTournaments} tournaments
                      </p>
                      {p.features.length > 0 && (
                        <p className="text-[11px] text-slate-600">{p.features.join(' · ')}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {subscriptions.length > 0 && (
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <h3 className="text-xs font-semibold text-slate-600 uppercase">
                    Assigned Subscriptions
                  </h3>
                  {subscriptions.map((sub) => {
                    const org =
                      typeof sub.organizerUserId === 'object' ? sub.organizerUserId : null;
                    const pl = typeof sub.planId === 'object' ? sub.planId : null;
                    return (
                      <div
                        key={sub.id}
                        className="text-xs flex items-center justify-between py-1.5 border-b border-slate-100 last:border-b-0"
                      >
                        <div>
                          <span className="font-semibold text-slate-900">
                            {org?.name || 'Organizer'}
                          </span>
                          <span className="text-slate-500"> · {pl?.name || 'Plan'}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                          {sub.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Revenue Ledger */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Revenue Ledger</h2>
              <span className="text-xs text-slate-500 font-mono">
                {revenueRecords.length} record{revenueRecords.length === 1 ? '' : 's'}
              </span>
            </div>
            {revenueRecords.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No verified revenue records logged yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4">Source</th>
                      <th className="py-2.5 px-4">Description</th>
                      <th className="py-2.5 px-4">Reference</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {revenueRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-mono text-slate-500">
                          {new Date(rec.recordedAt).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-slate-800">
                          {rec.sourceType}
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">{rec.description || '—'}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-500">
                          {rec.referenceNumber || '—'}
                        </td>
                        <td className="py-2.5 px-4 font-semibold">{rec.status}</td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                          {rec.currency} {rec.amount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* Create Plan Modal */}
      <Modal open={planOpen} onClose={() => setPlanOpen(false)} title="Create Subscription Plan">
        <form onSubmit={handleCreatePlan} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Plan Code *</label>
              <input
                type="text"
                required
                value={planCode}
                onChange={(e) => setPlanCode(e.target.value)}
                placeholder="PRO_ORGANIZER"
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Plan Name *</label>
              <input
                type="text"
                required
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="Pro Organizer"
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Monthly Price</label>
              <input
                type="number"
                min={0}
                value={planPrice}
                onChange={(e) => setPlanPrice(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Currency</label>
              <input
                type="text"
                value={planCurrency}
                onChange={(e) => setPlanCurrency(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Max Active Streams
              </label>
              <input
                type="number"
                min={1}
                value={planMaxStreams}
                onChange={(e) => setPlanMaxStreams(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Max Tournaments
              </label>
              <input
                type="number"
                min={1}
                value={planMaxTours}
                onChange={(e) => setPlanMaxTours(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Features (comma or line separated)
            </label>
            <textarea
              rows={2}
              value={planFeatures}
              onChange={(e) => setPlanFeatures(e.target.value)}
              placeholder="Custom sponsor overlays, Bracket generator, Analytics"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPlanOpen(false)}
              className="min-h-[40px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingPlan}
              className="min-h-[40px] px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg"
            >
              {savingPlan ? 'Saving...' : 'Create Plan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Assign Subscription Modal */}
      <Modal
        open={subOpen}
        onClose={() => setSubOpen(false)}
        title="Assign Organizer Subscription"
      >
        <form onSubmit={handleAssignSubscription} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Organizer</label>
            <select
              value={subUserId}
              onChange={(e) => setSubUserId(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {staffUsers.length > 0 ? (
                staffUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))
              ) : (
                <option value={adminUser?.id || ''}>{adminUser?.name}</option>
              )}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Plan</label>
            <select
              value={subPlanId}
              onChange={(e) => setSubPlanId(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.currency} {p.monthlyPrice}/mo)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select
              value={subStatus}
              onChange={(e) => setSubStatus(e.target.value as any)}
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="PENDING">PENDING</option>
              <option value="EXPIRED">EXPIRED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <input
              type="text"
              value={subNotes}
              onChange={(e) => setSubNotes(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setSubOpen(false)}
              className="min-h-[40px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingSub}
              className="min-h-[40px] px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg"
            >
              {savingSub ? 'Saving...' : 'Assign Subscription'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Record Revenue Modal */}
      <Modal open={revOpen} onClose={() => setRevOpen(false)} title="Record Verified Revenue">
        <form onSubmit={handleCreateRevenue} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Source Type</label>
              <select
                value={revSourceType}
                onChange={(e) => setRevSourceType(e.target.value as any)}
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="SPONSORSHIP">SPONSORSHIP</option>
                <option value="SUBSCRIPTION">SUBSCRIPTION</option>
                <option value="REGISTRATION">REGISTRATION</option>
                <option value="OTHER">OTHER</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
              <select
                value={revStatus}
                onChange={(e) => setRevStatus(e.target.value as any)}
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="PAID">PAID</option>
                <option value="RECORDED">RECORDED</option>
                <option value="REFUNDED">REFUNDED</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Amount *</label>
              <input
                type="number"
                min={0}
                required
                value={revAmount}
                onChange={(e) => setRevAmount(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Currency</label>
              <input
                type="text"
                value={revCurrency}
                onChange={(e) => setRevCurrency(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Tournament (Optional)
              </label>
              <select
                value={revTournamentId}
                onChange={(e) => setRevTournamentId(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">None</option>
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
              <input
                type="text"
                value={revDescription}
                onChange={(e) => setRevDescription(e.target.value)}
                placeholder="e.g. Title sponsor invoice #104"
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Reference Number (Optional)
              </label>
              <input
                type="text"
                value={revRef}
                onChange={(e) => setRevRef(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setRevOpen(false)}
              className="min-h-[40px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingRev}
              className="min-h-[40px] px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg"
            >
              {savingRev ? 'Recording...' : 'Record Entry'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
