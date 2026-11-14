import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CircleDot,
  ArrowUpCircle,
  MinusCircle,
} from 'lucide-react';

interface StatusTagProps {
  status: string;
}

export function StatusTag({ status }: StatusTagProps) {
  if (status === 'Resolved') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 whitespace-nowrap shrink-0">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
        <span>Resolved</span>
      </span>
    );
  }

  if (status === 'In Progress') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800 whitespace-nowrap shrink-0">
        <Clock className="h-3.5 w-3.5 text-blue-600 shrink-0" />
        <span>In Progress</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 whitespace-nowrap shrink-0">
      <CircleDot className="h-3.5 w-3.5 text-amber-600 shrink-0" />
      <span>Open</span>
    </span>
  );
}

interface PriorityTagProps {
  priority: string;
}

export function PriorityTag({ priority }: PriorityTagProps) {
  const normalized = priority.toUpperCase();

  if (normalized === 'CRITICAL') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800 whitespace-nowrap shrink-0">
        <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
        <span>CRITICAL</span>
      </span>
    );
  }

  if (normalized === 'HIGH') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900 whitespace-nowrap shrink-0">
        <ArrowUpCircle className="h-3.5 w-3.5 text-amber-700 shrink-0" />
        <span>HIGH</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 whitespace-nowrap shrink-0">
      <MinusCircle className="h-3.5 w-3.5 text-slate-500 shrink-0" />
      <span>NORMAL</span>
    </span>
  );
}
