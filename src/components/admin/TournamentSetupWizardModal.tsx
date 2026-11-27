import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  Check,
  ExternalLink,
  Trash2,
  Trophy,
} from 'lucide-react';
import { SPORT_OPTIONS, SportOption } from '../../constants/sports.ts';
import type {
  TeamData,
  TournamentData,
  TournamentFormat,
  TournamentPaymentMode,
  TournamentTemplateData,
  VenueData,
} from '../../types/index.ts';
import { Modal } from '../common/Modal.tsx';

export type WizardStepIndex = 0 | 1 | 2 | 3;

const WIZARD_STEPS: Array<{ id: WizardStepIndex; title: string; subtitle: string }> = [
  { id: 0, title: 'Basics & Sport', subtitle: 'Name, edition, logo & templates' },
  { id: 1, title: 'Format & Venues', subtitle: 'Bracket, schedule & ground location' },
  { id: 2, title: 'Teams & Fees', subtitle: 'Participating squads & entry mode' },
  { id: 3, title: 'Prizes & Publish', subtitle: 'Podium awards, rules & launch' },
];

export interface TournamentWizardFormState {
  name: string;
  sportType: SportOption;
  format: TournamentFormat;
  season: string;
  prizeMoney: string;
  firstPrizeAmount: string;
  firstPrizeLabel: string;
  secondPrizeAmount: string;
  secondPrizeLabel: string;
  thirdPrizeAmount: string;
  thirdPrizeLabel: string;
  registrationOpen: boolean;
  paymentMode: TournamentPaymentMode;
  registrationFee: string;
  securityDepositAmount: string;
  refundPolicy: string;
  paymentInstructions: string;
  logoUrl: string;
  venueId: string;
  location: string;
  googleMapsUrl: string;
  organizerName: string;
  status: 'UPCOMING' | 'ONGOING' | 'COMPLETED';
  startDate: string;
  endDate: string;
  groupCount: string;
  rules: string;
  qualificationRules: string;
  description: string;
  isPublished: boolean;
  teamIds: string[];
}

interface TournamentSetupWizardModalProps {
  open: boolean;
  editing: TournamentData | null;
  form: TournamentWizardFormState;
  setForm: React.Dispatch<React.SetStateAction<TournamentWizardFormState>>;
  venues: VenueData[];
  teams: TeamData[];
  templates: TournamentTemplateData[];
  selectedTemplateId: string;
  templateName: string;
  setTemplateName: (name: string) => void;
  savingTemplate: boolean;
  saving: boolean;
  onApplyTemplate: (tplId: string) => void;
  onSaveAsTemplate: () => void;
  onDeleteTemplate: (tplId: string) => void;
  onClose: () => void;
  onSubmit: (e?: React.FormEvent) => Promise<void> | void;
  onValidationError: (msg: string) => void;
}

export function TournamentSetupWizardModal({
  open,
  editing,
  form,
  setForm,
  venues,
  teams,
  templates,
  selectedTemplateId,
  templateName,
  setTemplateName,
  savingTemplate,
  saving,
  onApplyTemplate,
  onSaveAsTemplate,
  onDeleteTemplate,
  onClose,
  onSubmit,
  onValidationError,
}: TournamentSetupWizardModalProps) {
  const [step, setStep] = useState<WizardStepIndex>(0);

  useEffect(() => {
    if (open) {
      setStep(0);
    }
  }, [open, editing?.id]);

  function update<K extends keyof TournamentWizardFormState>(
    key: K,
    value: TournamentWizardFormState[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleTeamId(id: string) {
    setForm((prev) => ({
      ...prev,
      teamIds: prev.teamIds.includes(id)
        ? prev.teamIds.filter((item) => item !== id)
        : [...prev.teamIds, id],
    }));
  }

  function validateStep(targetStep: WizardStepIndex): boolean {
    if (targetStep === 0 && !form.name.trim()) {
      onValidationError('Please enter a Tournament Name before continuing.');
      return false;
    }
    if (targetStep === 1 && form.googleMapsUrl.trim()) {
      try {
        const u = new URL(form.googleMapsUrl.trim());
        if (!['http:', 'https:'].includes(u.protocol)) {
          onValidationError('Google Maps link must start with https:// or http://.');
          return false;
        }
      } catch {
        onValidationError('Please enter a valid Google Maps URL.');
        return false;
      }
    }
    if (targetStep === 2) {
      const entryAmt = Math.max(0, Number(form.registrationFee) || 0);
      const depositAmt = Math.max(0, Number(form.securityDepositAmount) || 0);
      if (form.paymentMode === 'ENTRY_FEE' && entryAmt <= 0) {
        onValidationError('Enter an Entry Fee amount greater than 0, or choose Free.');
        return false;
      }
      if (form.paymentMode === 'SECURITY_DEPOSIT' && depositAmt <= 0) {
        onValidationError('Enter a Refundable Security Deposit amount greater than 0, or choose Free.');
        return false;
      }
    }
    return true;
  }

  function handleNext() {
    if (!validateStep(step)) return;
    if (step < 3) {
      setStep((prev) => (prev + 1) as WizardStepIndex);
    }
  }

  function handleStepTabClick(nextStep: WizardStepIndex) {
    if (nextStep > step && !editing) {
      for (let s = step; s < nextStep; s += 1) {
        if (!validateStep(s as WizardStepIndex)) return;
      }
    }
    setStep(nextStep);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Tournament Setup' : 'Create Tournament'}
      subtitle={`Step ${step + 1} of 4 · ${WIZARD_STEPS[step].subtitle}`}
      maxWidthClass="max-w-3xl"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!validateStep(0) || !validateStep(1) || !validateStep(2)) return;
          void onSubmit(e);
        }}
        className="space-y-5"
      >
        {/* Step Progress Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {WIZARD_STEPS.map((s) => {
            const isActive = step === s.id;
            const isCompleted = step > s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleStepTabClick(s.id)}
                className={`text-left px-3 py-2 rounded-xl border transition-colors flex items-center gap-2 ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900'
                    : isCompleted
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full text-[11px] font-mono font-bold flex items-center justify-center shrink-0 ${
                    isActive
                      ? 'bg-[#EA580C] text-white'
                      : isCompleted
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {isCompleted ? <Check className="w-3 h-3" /> : s.id + 1}
                </span>
                <span className="text-xs font-semibold truncate">{s.title}</span>
              </button>
            );
          })}
        </div>

        {/* STEP 1: BASICS & SPORT */}
        {step === 0 && (
          <div className="space-y-4">
            {/* Saved Templates Bar */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 inline-flex items-center gap-1.5">
                  <BookmarkPlus className="w-3.5 h-3.5 text-[#EA580C]" />
                  <span>Quick Start from Preset Template</span>
                </span>
                {templates.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => onApplyTemplate(e.target.value)}
                      className="min-h-[34px] px-2.5 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">Apply saved template...</option>
                      {templates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name} ({tpl.sportType})
                        </option>
                      ))}
                    </select>
                    {selectedTemplateId && (
                      <button
                        type="button"
                        onClick={() => onDeleteTemplate(selectedTemplateId)}
                        title="Delete selected template"
                        className="min-h-[34px] px-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Save current settings as template (optional)..."
                  className="flex-1 min-w-[180px] min-h-[36px] px-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                />
                <button
                  type="button"
                  disabled={savingTemplate}
                  onClick={onSaveAsTemplate}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                >
                  {savingTemplate ? 'Saving...' : 'Save as Template'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Tournament Name *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="e.g. Haryana Premier Kabaddi Cup 2026"
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Sport</label>
                <select
                  value={form.sportType}
                  onChange={(e) => update('sportType', e.target.value as SportOption)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {SPORT_OPTIONS.map((sp) => (
                    <option key={sp} value={sp}>
                      {sp}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    update('status', e.target.value as 'UPCOMING' | 'ONGOING' | 'COMPLETED')
                  }
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="UPCOMING">UPCOMING</option>
                  <option value="ONGOING">ONGOING</option>
                  <option value="COMPLETED">COMPLETED</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Season / Edition
                </label>
                <input
                  type="text"
                  value={form.season}
                  onChange={(e) => update('season', e.target.value)}
                  placeholder="e.g. Season 2026"
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Organizer Name
                </label>
                <input
                  type="text"
                  value={form.organizerName}
                  onChange={(e) => update('organizerName', e.target.value)}
                  placeholder="Club or association name"
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Tournament Logo URL (Optional)
                </label>
                <input
                  type="url"
                  value={form.logoUrl}
                  onChange={(e) => update('logoUrl', e.target.value)}
                  placeholder="https://..."
                  className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  placeholder="Short public overview of the competition..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: FORMAT & VENUES */}
        {step === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Format</label>
              <select
                value={form.format}
                onChange={(e) => update('format', e.target.value as TournamentFormat)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="KNOCKOUT">Knockout Bracket</option>
                <option value="LEAGUE">League / Round-Robin</option>
                <option value="GROUP_STAGE">Group Stage</option>
                <option value="GROUP_KNOCKOUT">Group Stage + Knockout</option>
              </select>
            </div>

            {(form.format === 'GROUP_STAGE' || form.format === 'GROUP_KNOCKOUT') && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Group Count
                </label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={form.groupCount}
                  onChange={(e) => update('groupCount', e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => update('startDate', e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => update('endDate', e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Saved Venue (Optional)
              </label>
              <select
                value={form.venueId}
                onChange={(e) => {
                  const id = e.target.value;
                  const found = venues.find((v) => v.id === id);
                  setForm((prev) => ({
                    ...prev,
                    venueId: id,
                    location:
                      found && !prev.location.trim()
                        ? [found.name, found.city].filter(Boolean).join(', ')
                        : prev.location,
                  }));
                }}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Manual location / None</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} {v.city ? `(${v.city})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Location Name
              </label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => update('location', e.target.value)}
                placeholder="e.g. Azad Maidan Ground, Delhi"
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-sm font-medium text-slate-700">
                  Google Maps Location Link (Optional)
                </label>
                {form.googleMapsUrl.trim() && (
                  <a
                    href={form.googleMapsUrl.trim()}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                  >
                    <span>Test Map Link</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <input
                type="url"
                value={form.googleMapsUrl}
                onChange={(e) => update('googleMapsUrl', e.target.value)}
                placeholder="https://maps.google.com/?q=..."
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
        )}

        {/* STEP 3: TEAMS & REGISTRATION */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-bold text-slate-800">
                  Team Payment Requirement
                </label>
                <span className="text-[11px] text-slate-500">
                  Free, Entry Fee, or Refundable Security Deposit
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(
                  [
                    { id: 'NONE', label: 'No Payment (Free)' },
                    { id: 'ENTRY_FEE', label: 'Entry Fee' },
                    { id: 'SECURITY_DEPOSIT', label: 'Refundable Deposit' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => update('paymentMode', opt.id)}
                    className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      form.paymentMode === opt.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {form.paymentMode === 'ENTRY_FEE' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Entry Registration Fee (₹) *
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={form.registrationFee}
                      onChange={(e) => update('registrationFee', e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Payment / UPI Instructions
                    </label>
                    <input
                      type="text"
                      value={form.paymentInstructions}
                      onChange={(e) => update('paymentInstructions', e.target.value)}
                      placeholder="e.g. UPI ID: club@upi — upload screenshot"
                      className="w-full min-h-[38px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                </div>
              )}

              {form.paymentMode === 'SECURITY_DEPOSIT' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Refundable Security Deposit (₹) *
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={form.securityDepositAmount}
                        onChange={(e) => update('securityDepositAmount', e.target.value)}
                        className="w-full min-h-[38px] px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Payment / UPI Instructions
                      </label>
                      <input
                        type="text"
                        value={form.paymentInstructions}
                        onChange={(e) => update('paymentInstructions', e.target.value)}
                        placeholder="e.g. UPI ID: club@upi — upload receipt"
                        className="w-full min-h-[38px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Refundable Deposit Policy
                    </label>
                    <textarea
                      rows={2}
                      value={form.refundPolicy}
                      onChange={(e) => update('refundPolicy', e.target.value)}
                      placeholder="e.g. 100% refundable after completion of group matches."
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                </div>
              )}
            </div>

            {teams.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Participating Teams ({form.teamIds.length} selected)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto p-2.5 border border-slate-200 rounded-lg bg-slate-50">
                  {teams.map((tm) => (
                    <label key={tm.id} className="inline-flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={form.teamIds.includes(tm.id)}
                        onChange={() => toggleTeamId(tm.id)}
                        className="w-3.5 h-3.5 rounded border-slate-300"
                      />
                      <span className="truncate">{tm.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.registrationOpen}
                onChange={(e) => update('registrationOpen', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#EA580C]"
              />
              <span>Open Captain Team Registration on Player Portal</span>
            </label>
          </div>
        )}

        {/* STEP 4: PRIZES, RULES & PUBLISH */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Prize Pool Summary (Optional)
              </label>
              <input
                type="text"
                value={form.prizeMoney}
                onChange={(e) => update('prizeMoney', e.target.value)}
                placeholder="e.g. ₹50,000 + Trophy"
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800 inline-flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-amber-600" />
                  <span>Podium Prize Breakdown (Optional)</span>
                </span>
                <span className="text-[11px] text-slate-500">Leave blank if not awarded</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="p-2.5 rounded-lg bg-white border border-amber-200 space-y-1.5">
                  <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                    1st Prize
                  </p>
                  <input
                    type="text"
                    value={form.firstPrizeAmount}
                    onChange={(e) => update('firstPrizeAmount', e.target.value)}
                    placeholder="Amount (e.g. ₹25,000)"
                    className="w-full min-h-[34px] px-2.5 text-xs border border-slate-300 rounded-md"
                  />
                  <input
                    type="text"
                    value={form.firstPrizeLabel}
                    onChange={(e) => update('firstPrizeLabel', e.target.value)}
                    placeholder="Label (e.g. Champion)"
                    className="w-full min-h-[34px] px-2.5 text-xs border border-slate-300 rounded-md"
                  />
                </div>
                <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1.5">
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    2nd Prize
                  </p>
                  <input
                    type="text"
                    value={form.secondPrizeAmount}
                    onChange={(e) => update('secondPrizeAmount', e.target.value)}
                    placeholder="Amount (e.g. ₹15,000)"
                    className="w-full min-h-[34px] px-2.5 text-xs border border-slate-300 rounded-md"
                  />
                  <input
                    type="text"
                    value={form.secondPrizeLabel}
                    onChange={(e) => update('secondPrizeLabel', e.target.value)}
                    placeholder="Label (e.g. Runner-Up)"
                    className="w-full min-h-[34px] px-2.5 text-xs border border-slate-300 rounded-md"
                  />
                </div>
                <div className="p-2.5 rounded-lg bg-white border border-orange-200/80 space-y-1.5">
                  <p className="text-[11px] font-bold text-orange-800 uppercase tracking-wider">
                    3rd Prize
                  </p>
                  <input
                    type="text"
                    value={form.thirdPrizeAmount}
                    onChange={(e) => update('thirdPrizeAmount', e.target.value)}
                    placeholder="Amount (e.g. ₹5,000)"
                    className="w-full min-h-[34px] px-2.5 text-xs border border-slate-300 rounded-md"
                  />
                  <input
                    type="text"
                    value={form.thirdPrizeLabel}
                    onChange={(e) => update('thirdPrizeLabel', e.target.value)}
                    placeholder="Label (e.g. 3rd Place)"
                    className="w-full min-h-[34px] px-2.5 text-xs border border-slate-300 rounded-md"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Tournament Rules
                </label>
                <textarea
                  rows={2}
                  value={form.rules}
                  onChange={(e) => update('rules', e.target.value)}
                  placeholder="Match overs, half durations, tie-breakers..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Qualification Criteria
                </label>
                <textarea
                  rows={2}
                  value={form.qualificationRules}
                  onChange={(e) => update('qualificationRules', e.target.value)}
                  placeholder="Top 2 per group advance to Semi-Finals..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            {/* Review Summary & Publish Flag */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Setup Summary
              </p>
              <p className="text-xs text-slate-700">
                <strong className="text-slate-900">{form.name || 'Untitled Tournament'}</strong> ·{' '}
                {form.sportType} · {form.format.replace('_', ' ')} ·{' '}
                {form.teamIds.length} teams ·{' '}
                {form.paymentMode === 'ENTRY_FEE'
                  ? `Entry Fee ₹${form.registrationFee}`
                  : form.paymentMode === 'SECURITY_DEPOSIT'
                    ? `Security Deposit ₹${form.securityDepositAmount}`
                    : 'Free Entry'}
              </p>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={form.isPublished}
                  onChange={(e) => update('isPublished', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600"
                />
                <span>Publish tournament publicly on Player Portal</span>
              </label>
            </div>
          </div>
        )}

        {/* Footer Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((prev) => (prev - 1) as WizardStepIndex)}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {editing && step < 3 && (
              <button
                type="submit"
                disabled={saving}
                className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
              >
                <span>Next: {WIZARD_STEPS[step + 1].title}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={saving}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>
                  {saving
                    ? 'Saving...'
                    : editing
                      ? 'Save Tournament'
                      : form.isPublished
                        ? 'Create & Publish Tournament'
                        : 'Save Tournament Draft'}
                </span>
              </button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
