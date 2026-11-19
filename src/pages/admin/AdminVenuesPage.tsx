import React, { useCallback, useEffect, useState } from 'react';
import { Edit3, ExternalLink, MapPin, Plus, Trash2 } from 'lucide-react';
import { VenueData } from '../../types/index.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';

function buildDirectionsUrl(v: VenueData): string {
  if (v.latitude !== null && v.latitude !== undefined && v.longitude !== null && v.longitude !== undefined) {
    return `https://www.google.com/maps/search/?api=1&query=${v.latitude},${v.longitude}`;
  }
  const q = [v.name, v.address, v.city, v.state].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function AdminVenuesPage() {
  const [venues, setVenues] = useState<VenueData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<VenueData | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [details, setDetails] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<VenueData | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadVenues = useCallback(async () => {
    try {
      setError(null);
      const data = await platformOpsService.listVenues();
      setVenues(data);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load venues.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVenues();
  }, [loadVenues]);

  function openCreate() {
    setEditing(null);
    setName('');
    setAddress('');
    setCity('');
    setStateName('');
    setDetails('');
    setLatitude('');
    setLongitude('');
    setModalOpen(true);
  }

  function openEdit(v: VenueData) {
    setEditing(v);
    setName(v.name);
    setAddress(v.address || '');
    setCity(v.city || '');
    setStateName(v.state || '');
    setDetails(v.details || '');
    setLatitude(v.latitude !== null && v.latitude !== undefined ? String(v.latitude) : '');
    setLongitude(v.longitude !== null && v.longitude !== undefined ? String(v.longitude) : '');
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      const payload: Partial<VenueData> = {
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        state: stateName.trim(),
        details: details.trim(),
        latitude: latitude.trim() ? Number(latitude) : null,
        longitude: longitude.trim() ? Number(longitude) : null,
      };
      if (editing) {
        await platformOpsService.updateVenue(editing.id, payload);
        setSuccess('Venue updated.');
      } else {
        await platformOpsService.createVenue(payload);
        setSuccess('Venue created.');
      }
      setModalOpen(false);
      await loadVenues();
    } catch (err) {
      setError(extractApiError(err, 'Failed to save venue.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await platformOpsService.deleteVenue(deleteTarget.id);
      setDeleteTarget(null);
      setSuccess('Venue deleted.');
      await loadVenues();
    } catch (err) {
      setError(extractApiError(err, 'Failed to delete venue.'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Grounds &amp; Venues
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage reusable stadiums and local sports grounds for matches, tournaments, and spectator directions.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Add Venue</span>
        </button>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />

      {loading ? (
        <TableSkeleton rows={4} />
      ) : venues.length === 0 ? (
        <EmptyState
          icon={<MapPin className="w-6 h-6" />}
          title="No venues added yet"
          description="Create reusable grounds with street addresses or GPS coordinates for tournaments and streams."
          action={
            <button
              type="button"
              onClick={openCreate}
              className="min-h-[42px] px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg"
            >
              Add First Venue
            </button>
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Venue Name</th>
                <th className="py-3 px-4">Address</th>
                <th className="py-3 px-4">City / State</th>
                <th className="py-3 px-4">Map Link</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {venues.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    <div>{v.name}</div>
                    {v.details && <div className="text-xs text-slate-500 font-normal">{v.details}</div>}
                  </td>
                  <td className="py-3 px-4 text-slate-600">{v.address || '—'}</td>
                  <td className="py-3 px-4 text-slate-600">
                    {[v.city, v.state].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="py-3 px-4">
                    <a
                      href={buildDirectionsUrl(v)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      <span>Open Maps</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(v)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md mr-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(v)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Venue' : 'Add Venue'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Venue Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Shivaji Maidan Ground"
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Street Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Road, sector, or landmark"
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">State / Region</label>
              <input
                type="text"
                value={stateName}
                onChange={(e) => setStateName(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Latitude (Optional)
              </label>
              <input
                type="number"
                step="any"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="e.g. 18.5204"
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Longitude (Optional)
              </label>
              <input
                type="number"
                step="any"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="e.g. 73.8567"
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Ground Notes / Facilities
            </label>
            <textarea
              rows={2}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Turf pitch, floodlights, seating..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[42px] px-5 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Venue'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Venue"
        message={`Remove "${deleteTarget?.name}" from saved venues?`}
        confirmLabel="Delete"
      />
    </div>
  );
}
