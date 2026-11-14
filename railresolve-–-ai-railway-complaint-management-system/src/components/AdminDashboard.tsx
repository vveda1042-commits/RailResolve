import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PhoneCall,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { fetchComplaints, updateComplaintStatus } from '../lib/api';
import {
  COMMAND_DEPARTMENTS,
  COMPLAINT_CATEGORIES,
  COMPLAINT_PRIORITIES,
  COMPLAINT_STATUSES,
  type CommandDepartmentFilter,
  type ComplaintRecord,
  type ComplaintStatus,
} from '../types/complaint';
import { PriorityTag, StatusTag } from './StatusTag';

function formatShortDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AdminDashboard() {
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [deptFilter, setDeptFilter] =
    useState<CommandDepartmentFilter>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Inspector / Update panel state
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<ComplaintStatus>('Open');
  const [editNotes, setEditNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const loadComplaints = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const list = await fetchComplaints();
      setComplaints(list);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Failed to load complaints from Supabase.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadComplaints();
  }, [loadComplaints]);

  const selectedComplaint = useMemo(
    () => complaints.find((c) => c.ticket_id === selectedTicketId) || null,
    [complaints, selectedTicketId]
  );

  function handleSelectComplaint(item: ComplaintRecord) {
    setSelectedTicketId(item.ticket_id);
    const validStatus = COMPLAINT_STATUSES.find((s) => s === item.status);
    setEditStatus(validStatus || 'Open');
    setEditNotes(item.resolution_notes || '');
    setSaveError(null);
    setSaveSuccess(null);
  }

  async function handleSaveUpdate(e: FormEvent) {
    e.preventDefault();
    if (!selectedComplaint) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const updated = await updateComplaintStatus(selectedComplaint.ticket_id, {
        status: editStatus,
        resolution_notes: editNotes,
      });

      setComplaints((prev) =>
        prev.map((c) => (c.ticket_id === updated.ticket_id ? updated : c))
      );
      setSaveSuccess(`Saved status "${updated.status}" to Supabase.`);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Failed to save status update.'
      );
    } finally {
      setIsSaving(false);
    }
  }

  const metrics = useMemo(() => {
    const total = complaints.length;
    const open = complaints.filter((c) => c.status === 'Open').length;
    const inProgress = complaints.filter(
      (c) => c.status === 'In Progress'
    ).length;
    const resolved = complaints.filter((c) => c.status === 'Resolved').length;
    const critical = complaints.filter(
      (c) => c.priority === 'Critical' && c.status !== 'Resolved'
    ).length;
    return { total, open, inProgress, resolved, critical };
  }, [complaints]);

  const filteredComplaints = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return complaints
      .filter((c) => {
        if (statusFilter !== 'All' && c.status !== statusFilter) return false;
        if (priorityFilter !== 'All' && c.priority !== priorityFilter)
          return false;
        if (categoryFilter !== 'All' && c.category !== categoryFilter)
          return false;
        if (deptFilter !== 'All') {
          const dept = (c.department || '').toLowerCase();
          const cat = (c.category || '').toLowerCase();
          if (
            deptFilter === 'Security/SOS' &&
            !(
              c.sos ||
              c.emergency_call ||
              dept.includes('security') ||
              dept.includes('rpf') ||
              dept.includes('sos') ||
              cat.includes('security')
            )
          ) {
            return false;
          }
          if (
            deptFilter === 'Medical' &&
            !(dept.includes('medical') || dept.includes('health'))
          ) {
            return false;
          }
          if (
            deptFilter === 'Electrical/AC' &&
            !(
              dept.includes('electrical') ||
              dept.includes('ac') ||
              dept.includes('hvac') ||
              cat.includes('electrical')
            )
          ) {
            return false;
          }
          if (
            deptFilter === 'Housekeeping' &&
            !(
              dept.includes('housekeeping') ||
              dept.includes('obhs') ||
              dept.includes('sanitation') ||
              cat.includes('cleanliness') ||
              cat.includes('water')
            )
          ) {
            return false;
          }
          if (
            deptFilter === 'Catering' &&
            !(
              dept.includes('catering') ||
              dept.includes('irctc') ||
              dept.includes('food') ||
              cat.includes('food')
            )
          ) {
            return false;
          }
        }
        if (q) {
          const hay = [
            c.ticket_id,
            c.pnr_number,
            c.passenger_name,
            c.train_number,
            c.coach,
            c.category,
            c.department,
            c.description,
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aRes = a.status === 'Resolved' ? 1 : 0;
        const bRes = b.status === 'Resolved' ? 1 : 0;
        if (aRes !== bRes) return aRes - bRes;

        const aCrit =
          a.sos || a.emergency_call || a.urgency === 'CRITICAL' ? 0 : 1;
        const bCrit =
          b.sos || b.emergency_call || b.urgency === 'CRITICAL' ? 0 : 1;
        if (aCrit !== bCrit) return aCrit - bCrit;

        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
  }, [
    complaints,
    statusFilter,
    deptFilter,
    priorityFilter,
    categoryFilter,
    searchTerm,
  ]);

  function clearFilters() {
    setStatusFilter('All');
    setDeptFilter('All');
    setPriorityFilter('All');
    setCategoryFilter('All');
    setSearchTerm('');
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Admin Operations Dashboard
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Authorized staff console for reviewing complaints and updating
            ticket statuses and resolution notes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadComplaints()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap shrink-0"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
          />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Summary Metrics Strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-slate-200 border-t-4 border-t-[#0B1F3A] bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Total Tickets</p>
          <p className="mt-1 font-mono text-2xl font-bold text-[#0B1F3A] tabular-nums">
            {metrics.total}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 border-t-4 border-t-amber-500 bg-gradient-to-b from-amber-50/40 to-white px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-amber-800">Open</p>
          <p className="mt-1 font-mono text-2xl font-bold text-amber-700 tabular-nums">
            {metrics.open}
          </p>
        </div>
        <div className="rounded-xl border border-blue-200 border-t-4 border-t-blue-600 bg-gradient-to-b from-blue-50/40 to-white px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-blue-800">In Progress</p>
          <p className="mt-1 font-mono text-2xl font-bold text-blue-700 tabular-nums">
            {metrics.inProgress}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 border-t-4 border-t-emerald-600 bg-gradient-to-b from-emerald-50/40 to-white px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-emerald-800">Resolved</p>
          <p className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
            {metrics.resolved}
          </p>
        </div>
        <div className="col-span-2 rounded-xl border border-red-200 border-t-4 border-t-red-600 bg-gradient-to-b from-red-50/50 to-white px-5 py-4 shadow-sm sm:col-span-1">
          <p className="text-xs font-medium text-red-800">Active Critical</p>
          <p className="mt-1 font-mono text-2xl font-bold text-red-700 tabular-nums">
            {metrics.critical}
          </p>
        </div>
      </div>

      {/* Department Tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-xs">
        {COMMAND_DEPARTMENTS.map((dept) => (
          <button
            key={dept}
            type="button"
            onClick={() => setDeptFilter(dept)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              deptFilter === dept
                ? 'bg-[#0B1F3A] text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {dept}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-md bg-slate-100 p-1">
          {(['All', ...COMPLAINT_STATUSES] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === status
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-3 lg:justify-end">
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search ticket, train, passenger..."
              className="block w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15"
            />
          </div>

          <select
            aria-label="Filter by priority"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-blue-700 focus:outline-none"
          >
            <option value="All">All Priorities</option>
            {COMPLAINT_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-blue-700 focus:outline-none"
          >
            <option value="All">All Categories</option>
            {COMPLAINT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error State */}
      {errorMsg && (
        <div
          role="alert"
          className="mb-6 flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div>
              <p className="font-semibold">Unable to load complaints</p>
              <p className="mt-0.5 text-xs text-red-800">{errorMsg}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadComplaints()}
            className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 whitespace-nowrap shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Split Workspace: Table + Inspector */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        <div
          className={`${
            selectedComplaint ? 'lg:col-span-7 xl:col-span-8' : 'lg:col-span-12'
          } overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md`}
        >
          {isLoading ? (
            <div className="divide-y divide-slate-100">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 animate-pulse"
                >
                  <div className="h-4 w-32 rounded bg-slate-200" />
                  <div className="h-4 w-40 rounded bg-slate-100" />
                  <div className="h-4 w-24 rounded bg-slate-100" />
                  <div className="h-5 w-20 rounded bg-slate-200" />
                </div>
              ))}
            </div>
          ) : filteredComplaints.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-semibold text-slate-900">
                {complaints.length === 0
                  ? 'No complaints logged yet'
                  : 'No complaints match your active filters'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {complaints.length === 0
                  ? 'Submitted passenger complaints will appear here automatically.'
                  : 'Try adjusting the search text, status, priority, or category filters.'}
              </p>
              {complaints.length > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">
                      Ticket ID
                    </th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">
                      Passenger &amp; Train
                    </th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">
                      Category &amp; Dept
                    </th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">
                      Priority
                    </th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">
                      Status
                    </th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">
                      Submitted
                    </th>
                    <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredComplaints.map((item) => {
                    const isSelected =
                      selectedComplaint?.ticket_id === item.ticket_id;
                    const isCritOpen =
                      (item.sos ||
                        item.emergency_call ||
                        item.urgency === 'CRITICAL') &&
                      item.status !== 'Resolved';
                    return (
                      <tr
                        key={item.ticket_id}
                        onClick={() => handleSelectComplaint(item)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50/70'
                            : isCritOpen
                              ? 'bg-red-50/60 hover:bg-red-50'
                              : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-4 py-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                          <div>{item.ticket_id}</div>
                          {(item.sos || item.emergency_call) && (
                            <div className="mt-1 flex items-center gap-1">
                              {item.sos && (
                                <span className="rounded bg-red-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                  SOS
                                </span>
                              )}
                              {item.emergency_call && (
                                <span className="inline-flex items-center gap-0.5 rounded border border-red-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                                  <PhoneCall className="h-2.5 w-2.5" />
                                  CALL
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">
                            {item.passenger_name}
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            Train {item.train_number} · {item.coach}/
                            {item.seat_number}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 whitespace-nowrap">
                            {item.category}
                          </div>
                          <div className="mt-0.5 max-w-[180px] truncate text-[11px] text-slate-500">
                            {item.department}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <PriorityTag priority={item.urgency} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <StatusTag status={item.status} />
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {formatShortDate(item.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectComplaint(item);
                            }}
                            className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Side Management Inspector */}
        {selectedComplaint && (
          <aside className="lg:col-span-5 xl:col-span-4 rounded-xl border border-slate-200 bg-white p-5 shadow-md sm:p-6">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Manage Ticket
                </p>
                <h2 className="mt-0.5 font-mono text-lg font-semibold text-slate-900">
                  {selectedComplaint.ticket_id}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close ticket inspector"
                onClick={() => setSelectedTicketId(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {selectedComplaint.priority === 'Critical' && (
              <div className="mt-4 flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                <div>
                  <p className="font-semibold">
                    Critical Priority — Immediate Human Escalation
                  </p>
                  <p className="mt-0.5 text-red-800">
                    Verify onboard safety immediately and coordinate directly
                    with RPF / Train Guard / Control Room.
                  </p>
                </div>
              </div>
            )}

            <div className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Passenger</span>
                <span className="font-medium text-slate-900">
                  {selectedComplaint.passenger_name}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Contact</span>
                <span className="font-mono text-slate-900">
                  {selectedComplaint.contact}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Train / Coach / Seat</span>
                <span className="font-mono font-medium text-slate-900">
                  {selectedComplaint.train_number} · {selectedComplaint.coach}/
                  {selectedComplaint.seat_number}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Category</span>
                <span className="font-medium text-slate-900">
                  {selectedComplaint.category}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Department</span>
                <span className="text-right font-medium text-slate-900">
                  {selectedComplaint.department}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Priority</span>
                <PriorityTag priority={selectedComplaint.priority} />
              </div>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-xs font-medium text-slate-500">
                Complaint Description
              </p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                {selectedComplaint.description}
              </p>
            </div>

            {(selectedComplaint.ai_reasoning ||
              selectedComplaint.recommended_action) && (
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                {selectedComplaint.ai_reasoning && (
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      AI Reasoning
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-700">
                      {selectedComplaint.ai_reasoning}
                    </p>
                  </div>
                )}
                {selectedComplaint.recommended_action && (
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Recommended Action
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-700">
                      {selectedComplaint.recommended_action}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Status Update Form */}
            <form
              onSubmit={handleSaveUpdate}
              className="mt-5 space-y-4 border-t border-slate-200 pt-5"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-800">
                  Update Complaint Status
                </label>
                <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-md bg-slate-100 p-1">
                  {COMPLAINT_STATUSES.map((statusOption) => (
                    <button
                      key={statusOption}
                      type="button"
                      disabled={isSaving}
                      onClick={() => setEditStatus(statusOption)}
                      className={`rounded px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        editStatus === statusOption
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {statusOption}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="resolution_notes"
                  className="block text-xs font-semibold text-slate-800"
                >
                  Resolution / Dispatch Notes
                </label>
                <textarea
                  id="resolution_notes"
                  rows={3}
                  disabled={isSaving}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Enter staff action taken, coach inspection details, or closure remarks..."
                  className="mt-1.5 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15 disabled:bg-slate-50"
                />
              </div>

              {saveError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-800"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                  <span>{saveError}</span>
                </div>
              )}

              {saveSuccess && (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800"
                >
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span>{saveSuccess}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#0B1F3A] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#14345E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1F3A] focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving Changes...</span>
                  </>
                ) : (
                  <span>Save Status Update</span>
                )}
              </button>
            </form>
          </aside>
        )}
      </div>
    </div>
  );
}
