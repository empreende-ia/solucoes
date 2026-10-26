import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  AlignLeft,
  Bot,
  Calendar as CalendarIcon,
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Columns,
  ExternalLink,
  LayoutGrid,
  List,
  Loader2,
  Pencil,
  Plus,
  User,
  UserCircle,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './Button';
import { Contact } from '../types';
import { api } from '../services/api';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  APPOINTMENT_OUTCOMES,
  APPOINTMENT_OUTCOME_ACTION,
  APPOINTMENT_STATUS_LABEL,
  APPOINTMENT_STATUS_TONE,
  EMPTY_CONFLICT_REPORT,
  appointmentEndTime,
  attendanceStats,
  checkScheduleConflicts,
  describeScheduleWriteError,
  fetchSchedule,
  formatDateLabel,
  GRID_END_HOUR,
  GRID_START_HOUR,
  gridHour,
  isPendingClosure,
  localDateKey,
  registerAppointmentOutcome,
} from '../services/scheduling';
import type {
  AppointmentOutcome,
  AppointmentStatus,
  ConflictReport,
  ScheduleEntry,
  ScheduleOwner,
} from '../services/scheduling';

type ViewMode = 'month' | 'week' | 'day';
type OwnerFilter = 'all' | 'unassigned' | string;
type StatusFilter = 'all' | 'pending_closure' | AppointmentStatus;
type ConflictState = 'idle' | 'checking' | 'free' | 'conflict' | 'error';

/** Alerta funcional em amber: só pelo token do DS, nunca por cor bruta. */
const ALERT_TOKEN = 'var(--eia-accent-alert)';
const alertText: React.CSSProperties = { color: ALERT_TOKEN };
const alertSurface: React.CSSProperties = {
  border: `1px solid color-mix(in srgb, ${ALERT_TOKEN} 40%, transparent)`,
  background: `color-mix(in srgb, ${ALERT_TOKEN} 10%, transparent)`,
};

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todos os status' },
  { value: 'pending_closure', label: 'Sem desfecho registrado' },
  { value: 'scheduled', label: APPOINTMENT_STATUS_LABEL.scheduled },
  { value: 'completed', label: APPOINTMENT_STATUS_LABEL.completed },
  { value: 'no_show', label: APPOINTMENT_STATUS_LABEL.no_show },
  { value: 'rescheduled', label: APPOINTMENT_STATUS_LABEL.rescheduled },
  { value: 'cancelled', label: APPOINTMENT_STATUS_LABEL.cancelled },
];

const CalendarSyncMark: React.FC<{ appointment: ScheduleEntry; className?: string }> = ({ appointment, className = '' }) => {
  if (appointment.calendar_sync_status === 'synced') {
    return <CalendarCheck2 className={`shrink-0 text-success ${className}`} aria-label="Sincronizado com a agenda externa" />;
  }
  if (appointment.calendar_sync_status === 'pending') {
    return <Loader2 className={`shrink-0 animate-spin text-muted-foreground ${className}`} aria-label="Sincronizando com a agenda externa" />;
  }
  if (appointment.calendar_sync_status === 'error') {
    return <CircleAlert className={`shrink-0 text-destructive ${className}`} aria-label="Erro ao sincronizar com a agenda externa" />;
  }
  return null;
};

const StatusPill: React.FC<{ status: AppointmentStatus; className?: string }> = ({ status, className = '' }) => {
  const tone = APPOINTMENT_STATUS_TONE[status];
  const label = APPOINTMENT_STATUS_LABEL[status];

  if (tone === 'alert') {
    return (
      <span className={`eia-pill ${className}`} style={{ ...alertSurface, ...alertText }}>
        {label}
      </span>
    );
  }

  const toneClass =
    tone === 'success'
      ? 'border border-success/30 bg-success/10 text-success'
      : tone === 'destructive'
        ? 'border border-destructive/20 bg-destructive/10 text-destructive'
        : 'border border-border bg-secondary text-muted-foreground';

  return <span className={`eia-pill ${toneClass} ${className}`}>{label}</span>;
};

/**
 * Antes de a reunião começar, comparecimento não existe ainda — e registrar um
 * libera o horário na restrição do banco e some com a linha da checagem de
 * disponibilidade da Lara, abrindo espaço para dobrar o compromisso. Antes da
 * hora só cabem remarcar e cancelar.
 */
const UPCOMING_OUTCOMES: AppointmentOutcome[] = ['rescheduled', 'cancelled'];

const OutcomeActions: React.FC<{
  entry: ScheduleEntry;
  busy: boolean;
  outcomes?: AppointmentOutcome[];
  onPick: (entry: ScheduleEntry, outcome: AppointmentOutcome) => void;
}> = ({ entry, busy, outcomes = APPOINTMENT_OUTCOMES, onPick }) => (
  <div className="flex flex-wrap gap-2">
    {outcomes.map(outcome => (
      <Button
        key={outcome}
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => onPick(entry, outcome)}
      >
        {APPOINTMENT_OUTCOME_ACTION[outcome]}
      </Button>
    ))}
  </div>
);

const ConflictNotice: React.FC<{
  state: ConflictState;
  report: ConflictReport;
  onUseSuggestion: (time: string) => void;
}> = ({ state, report, onUseSuggestion }) => {
  if (state === 'idle') return null;

  if (state === 'checking') {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Verificando o horário.
      </p>
    );
  }

  if (state === 'error') {
    return (
      <p className="text-xs text-muted-foreground">
        Não foi possível conferir o horário agora. O banco ainda recusa sobreposição ao salvar.
      </p>
    );
  }

  if (state === 'free') {
    return (
      <p className="flex items-center gap-2 text-xs text-success">
        <CalendarCheck2 className="h-3.5 w-3.5" />
        Horário livre.
      </p>
    );
  }

  const headline = report.sameOwner.length
    ? 'O mesmo responsável já tem compromisso nesse horário.'
    : 'Outro responsável ocupa esse horário. A agenda não aceita sobreposição.';

  return (
    <div className="rounded-lg p-3" style={alertSurface}>
      <p className="flex items-center gap-2 text-xs font-semibold" style={alertText}>
        <AlertTriangle className="h-3.5 w-3.5" />
        {headline}
      </p>
      <ul className="mt-2 space-y-1">
        {report.conflicts.map(conflict => (
          <li key={conflict.id} className="text-xs text-foreground">
            <span className="font-mono">{conflict.time} às {conflict.endTime}</span>
            {' · '}
            {conflict.title}
            {' · '}
            <span className="text-muted-foreground">{conflict.ownerName}</span>
          </li>
        ))}
      </ul>
      {report.suggestion ? (
        <div className="mt-3">
          <Button type="button" variant="outline" size="sm" onClick={() => onUseSuggestion(report.suggestion as string)}>
            Usar {report.suggestion}
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Nenhum horário livre neste dia até as 22:00.</p>
      )}
    </div>
  );
};

const Scheduling: React.FC = () => {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [owners, setOwners] = useState<ScheduleOwner[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [outcomeBusyId, setOutcomeBusyId] = useState<string | null>(null);

  // O relógio guia "hoje" e "já passou sem desfecho". Sem esse tique a tela
  // envelhece sozinha e a pendência só aparece depois de um recarregamento.
  const [now, setNow] = useState(() => new Date());

  // Modais
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  // Filtros
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showAllPending, setShowAllPending] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    time: '09:00',
    type: 'demo',
    description: '',
    duration: 60,
    attendees: '',
  });

  const [editFormData, setEditFormData] = useState({
    title: '',
    date: '',
    time: '09:00',
    type: 'demo',
    description: '',
    duration: 60,
    attendees: '',
  });
  const [editContactId, setEditContactId] = useState<string | null>(null);

  const [createConflict, setCreateConflict] = useState<{ state: ConflictState; report: ConflictReport }>({
    state: 'idle',
    report: EMPTY_CONFLICT_REPORT,
  });
  const [editConflict, setEditConflict] = useState<{ state: ConflictState; report: ConflictReport }>({
    state: 'idle',
    report: EMPTY_CONFLICT_REPORT,
  });

  const loadData = useCallback(async () => {
    try {
      const [snapshot, contactsData] = await Promise.all([fetchSchedule(), api.fetchContacts()]);
      setEntries(snapshot.entries);
      setOwners(snapshot.owners);
      setCurrentUserId(snapshot.currentUserId);
      setCurrentUserName(snapshot.currentUserName);
      setContacts(contactsData);
      setLoadError(false);
    } catch (error) {
      console.error('Erro ao carregar a agenda', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('appointments-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const selectedAppointment = useMemo(
    () => entries.find(entry => entry.id === selectedId) ?? null,
    [entries, selectedId],
  );

  // --- FILTROS -------------------------------------------------------------

  const matchesOwner = useCallback(
    (entry: ScheduleEntry) => {
      if (ownerFilter === 'all') return true;
      if (ownerFilter === 'unassigned') return entry.ownerId === null;
      return entry.ownerId === ownerFilter;
    },
    [ownerFilter],
  );

  const ownerScoped = useMemo(() => entries.filter(matchesOwner), [entries, matchesOwner]);

  const visibleEntries = useMemo(() => {
    if (statusFilter === 'all') return ownerScoped;
    if (statusFilter === 'pending_closure') return ownerScoped.filter(entry => isPendingClosure(entry, now));
    return ownerScoped.filter(entry => entry.status === statusFilter);
  }, [ownerScoped, statusFilter, now]);

  const hasFilters = ownerFilter !== 'all' || statusFilter !== 'all';
  const clearFilters = () => {
    setOwnerFilter('all');
    setStatusFilter('all');
  };

  // --- DIA E PENDÊNCIAS ----------------------------------------------------

  const todayKey = localDateKey(now);

  const pendingClosures = useMemo(
    () =>
      ownerScoped
        .filter(entry => isPendingClosure(entry, now))
        .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime()),
    [ownerScoped, now],
  );

  const todayEntries = useMemo(
    () => ownerScoped.filter(entry => entry.date === todayKey).sort((a, b) => a.time.localeCompare(b.time)),
    [ownerScoped, todayKey],
  );

  const stats = useMemo(() => attendanceStats(ownerScoped), [ownerScoped]);

  const visiblePending = showAllPending ? pendingClosures : pendingClosures.slice(0, 4);

  // --- NAVEGAÇÃO -----------------------------------------------------------

  const navigateDate = (direction: number) => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + direction);
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + direction * 7);
    } else {
      newDate.setDate(newDate.getDate() + direction);
    }
    setCurrentDate(newDate);
  };

  const goToToday = () => setCurrentDate(new Date());

  const getMonthLabel = () => currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
  const getDayLabel = () => currentDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const getWeekLabel = () => {
    const start = getStartOfWeek(currentDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${start.getDate()} ${start.toLocaleString('pt-BR', { month: 'short' })} - ${end.getDate()} ${end.toLocaleString('pt-BR', { month: 'short' })}`;
  };

  const getStartOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  };

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const goToDay = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    setCurrentDate(new Date(year, (month || 1) - 1, day || 1));
    setViewMode('day');
  };

  // --- CRIAÇÃO E EDIÇÃO ----------------------------------------------------

  const openCreateModal = (dateStr: string, time?: string) => {
    setSelectedDate(dateStr);
    if (time) setFormData(prev => ({ ...prev, time }));
    setCreateConflict({ state: 'idle', report: EMPTY_CONFLICT_REPORT });
    setShowCreateModal(true);
  };

  const resetCreateForm = () => {
    setFormData({ title: '', time: '09:00', type: 'demo', description: '', duration: 60, attendees: '' });
    setSelectedDate(null);
    setSelectedContactId(null);
    setCreateConflict({ state: 'idle', report: EMPTY_CONFLICT_REPORT });
  };

  const handleDateClick = (day: number) => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    openCreateModal(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  };

  const handleAppointmentClick = (entry: ScheduleEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    setShowEditModal(false);
    setSelectedId(entry.id);
  };

  // A conferência é uma leitura anterior à escrita: ela avisa cedo, mas quem
  // garante é a restrição do banco. Por isso o resultado nunca some da tela.
  useEffect(() => {
    if (!showCreateModal) return;
    if (!selectedDate) {
      setCreateConflict({ state: 'idle', report: EMPTY_CONFLICT_REPORT });
      return;
    }

    let active = true;
    setCreateConflict(prev => ({ state: 'checking', report: prev.report }));

    const timer = window.setTimeout(async () => {
      try {
        const report = await checkScheduleConflicts({
          date: selectedDate,
          time: formData.time,
          duration: formData.duration,
          ownerId: currentUserId,
        });
        if (!active) return;
        setCreateConflict({ state: report.conflicts.length ? 'conflict' : 'free', report });
      } catch {
        if (active) setCreateConflict({ state: 'error', report: EMPTY_CONFLICT_REPORT });
      }
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [showCreateModal, selectedDate, formData.time, formData.duration, currentUserId]);

  useEffect(() => {
    if (!showEditModal || !selectedAppointment) return;
    if (!editFormData.date) {
      setEditConflict({ state: 'idle', report: EMPTY_CONFLICT_REPORT });
      return;
    }

    let active = true;
    setEditConflict(prev => ({ state: 'checking', report: prev.report }));

    const timer = window.setTimeout(async () => {
      try {
        const report = await checkScheduleConflicts({
          date: editFormData.date,
          time: editFormData.time,
          duration: editFormData.duration,
          ownerId: selectedAppointment.ownerId,
          excludeId: selectedAppointment.id,
        });
        if (!active) return;
        setEditConflict({ state: report.conflicts.length ? 'conflict' : 'free', report });
      } catch {
        if (active) setEditConflict({ state: 'error', report: EMPTY_CONFLICT_REPORT });
      }
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    showEditModal,
    selectedAppointment,
    editFormData.date,
    editFormData.time,
    editFormData.duration,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || createConflict.state === 'conflict') return;

    setIsSaving(true);
    try {
      await api.createAppointment({
        title: formData.title,
        description: formData.description,
        date: selectedDate,
        time: formData.time,
        duration: formData.duration,
        type: formData.type as ScheduleEntry['type'],
        attendees: formData.attendees.split(',').map(a => a.trim()).filter(Boolean),
        contact_id: selectedContactId || undefined,
      });

      toast.success('Agendamento criado.');
      setShowCreateModal(false);
      resetCreateForm();
      loadData();
    } catch (error) {
      console.error('Erro ao criar agendamento:', error);
      toast.error(describeScheduleWriteError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditClick = (entry: ScheduleEntry) => {
    setEditFormData({
      title: entry.title,
      date: entry.date,
      time: entry.time,
      type: entry.type,
      description: entry.description || '',
      duration: entry.duration,
      attendees: entry.attendees?.join(', ') || '',
    });
    setEditContactId(entry.contact_id || null);
    setEditConflict({ state: 'idle', report: EMPTY_CONFLICT_REPORT });
    setSelectedId(entry.id);
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setSelectedId(null);
    setEditConflict({ state: 'idle', report: EMPTY_CONFLICT_REPORT });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointment || editConflict.state === 'conflict') return;

    setIsSaving(true);
    try {
      await api.updateAppointment(selectedAppointment.id, {
        title: editFormData.title,
        date: editFormData.date,
        time: editFormData.time,
        type: editFormData.type as ScheduleEntry['type'],
        description: editFormData.description,
        duration: editFormData.duration,
        attendees: editFormData.attendees.split(',').map(a => a.trim()).filter(Boolean),
        contact_id: editContactId || undefined,
      });

      toast.success('Agendamento atualizado.');
      closeEditModal();
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar agendamento:', error);
      toast.error(describeScheduleWriteError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    if (!window.confirm('Excluir este agendamento? O registro sai da agenda e do histórico.')) return;

    try {
      await api.deleteAppointment(id);
      toast.success('Agendamento excluído.');
      setSelectedId(null);
      loadData();
    } catch (error) {
      console.error('Erro ao excluir agendamento:', error);
      toast.error('Não foi possível excluir o agendamento.');
    }
  };

  // --- DESFECHO ------------------------------------------------------------

  const handleOutcome = async (entry: ScheduleEntry, outcome: AppointmentOutcome) => {
    setOutcomeBusyId(entry.id);
    const previous = entry.status;

    // Atualização otimista: o clique é o gesto mais repetido desta tela e
    // esperar o servidor faria a lista piscar a cada registro.
    setEntries(current => current.map(item => (item.id === entry.id ? { ...item, status: outcome } : item)));

    try {
      await registerAppointmentOutcome(entry, outcome, currentUserName);

      if (outcome === 'rescheduled') {
        toast.success('Desfecho registrado. Marque o novo horário.');
        setFormData({
          title: entry.title,
          time: entry.time,
          type: entry.type,
          description: entry.description || '',
          duration: entry.duration,
          attendees: entry.attendees?.join(', ') || '',
        });
        setSelectedContactId(entry.contact_id || null);
        setSelectedId(null);
        openCreateModal(todayKey, entry.time);
      } else {
        toast.success(`Desfecho registrado: ${APPOINTMENT_STATUS_LABEL[outcome].toLowerCase()}.`);
      }
    } catch (error) {
      console.error('Erro ao registrar desfecho:', error);
      setEntries(current => current.map(item => (item.id === entry.id ? { ...item, status: previous } : item)));
      toast.error('Não foi possível registrar o desfecho.');
    } finally {
      setOutcomeBusyId(null);
    }
  };

  const handleReopenOutcome = async (entry: ScheduleEntry) => {
    setOutcomeBusyId(entry.id);
    const previous = entry.status;
    setEntries(current => current.map(item => (item.id === entry.id ? { ...item, status: 'scheduled' } : item)));

    try {
      await registerAppointmentOutcome(entry, 'scheduled', currentUserName);
      toast.success('Desfecho removido.');
    } catch (error) {
      console.error('Erro ao reabrir agendamento:', error);
      setEntries(current => current.map(item => (item.id === entry.id ? { ...item, status: previous } : item)));
      toast.error(describeScheduleWriteError(error));
    } finally {
      setOutcomeBusyId(null);
    }
  };

  // --- APARÊNCIA -----------------------------------------------------------

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'demo':
        return 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20';
      case 'meeting':
        return 'bg-secondary text-secondary-foreground border-border hover:bg-accent';
      case 'support':
        return 'bg-secondary text-foreground border-border hover:bg-accent';
      case 'followup':
        return 'bg-muted text-muted-foreground border-border hover:bg-accent';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  /**
   * Pendência de fechamento e desfecho registrado falam antes do tipo.
   * A largura da borda vem da classe `border` na base de cada visão; aqui só
   * a cor. No caso pendente quem pinta é o estilo inline do token de alerta.
   */
  const getEntryChipClass = (entry: ScheduleEntry) => {
    if (isPendingClosure(entry, now)) return '';
    if (entry.status !== 'scheduled') return 'bg-muted text-muted-foreground border-border hover:bg-accent';
    return getEventTypeColor(entry.type);
  };

  const getEntryChipStyle = (entry: ScheduleEntry): React.CSSProperties | undefined =>
    isPendingClosure(entry, now) ? { ...alertSurface, ...alertText } : undefined;

  const describeEntry = (entry: ScheduleEntry) =>
    `${entry.time} às ${appointmentEndTime(entry.time, entry.duration)} · ${entry.title} · ${entry.ownerName} · ${
      isPendingClosure(entry, now) ? 'sem desfecho registrado' : APPOINTMENT_STATUS_LABEL[entry.status]
    }`;

  // --- RENDERIZADORES ------------------------------------------------------

  const renderMonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const days = daysInMonth(year, month);
    const firstDay = firstDayOfMonth(year, month);

    return (
      <div className="grid grid-cols-7 flex-1 auto-rows-fr">
        {Array.from({ length: firstDay }).map((_, index) => (
          <div key={`empty-${index}`} className="border-b border-r border-border/50 bg-muted/40 min-h-[100px]" />
        ))}
        {Array.from({ length: days }).map((_, index) => {
          const day = index + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayAppointments = visibleEntries.filter(a => a.date === dateStr);
          const isToday = todayKey === dateStr;

          return (
            <div
              key={day}
              onClick={() => handleDateClick(day)}
              className={`border-b border-r border-border/50 p-2 min-h-[120px] cursor-pointer transition-colors hover:bg-accent/30 group relative ${isToday ? 'bg-primary/5' : ''}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground group-hover:text-foreground'}`}>
                  {day}
                </span>
                {isToday && <span className="eia-eyebrow text-primary">Hoje</span>}
              </div>
              <div className="space-y-1">
                {dayAppointments.map(app => (
                  <div
                    key={app.id}
                    title={describeEntry(app)}
                    className={`text-[10px] px-2 py-1 rounded border truncate font-medium cursor-pointer relative ${getEntryChipClass(app)}`}
                    style={getEntryChipStyle(app)}
                    onClick={e => handleAppointmentClick(app, e)}
                  >
                    {app.metadata?.source === 'lara_ai' && <Bot className="w-2.5 h-2.5 inline-block mr-0.5" />}
                    <CalendarSyncMark appointment={app} className="mr-0.5 inline-block h-2.5 w-2.5" />
                    {app.time} - {app.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {Array.from({ length: Math.max(0, 42 - (days + firstDay)) }).map((_, index) => (
          <div key={`remaining-${index}`} className="border-b border-r border-border/50 bg-muted/40" />
        ))}
      </div>
    );
  };

  const renderWeekView = () => {
    const startOfWeek = getStartOfWeek(currentDate);
    const weekDays = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      return d;
    });
    const hours = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }).map((_, i) => i + GRID_START_HOUR);

    return (
      <div className="flex flex-col flex-1 overflow-y-auto custom-scrollbar bg-card">
        <div className="grid grid-cols-8 border-b border-border sticky top-0 bg-card z-10">
          <div className="p-4 text-xs font-medium text-muted-foreground border-r border-border">GMT-3</div>
          {weekDays.map((day, i) => {
            const isToday = todayKey === localDateKey(day);
            return (
              <div key={i} className={`p-2 text-center border-r border-border/50 ${isToday ? 'bg-primary/10' : ''}`}>
                <div className={`text-xs uppercase font-semibold ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                  {day.toLocaleDateString('pt-BR', { weekday: 'short' })}
                </div>
                <div className={`text-xl font-semibold ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                  {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex-1">
          {hours.map(hour => {
            const timeStr = `${String(hour).padStart(2, '0')}:00`;
            return (
              <div key={hour} className="grid grid-cols-8 min-h-[80px]">
                <div className="border-r border-b border-border/50 p-2 text-xs text-muted-foreground text-right sticky left-0 bg-card">
                  {timeStr}
                </div>
                {weekDays.map((day, i) => {
                  const dateStr = localDateKey(day);
                  const isToday = todayKey === dateStr;
                  const apps = visibleEntries
                    .filter(a => a.date === dateStr && gridHour(a.time) === hour)
                    .sort((a, b) => a.time.localeCompare(b.time));

                  return (
                    <div
                      key={i}
                      onClick={() => openCreateModal(dateStr, timeStr)}
                      className={`border-r border-b border-border/50 relative p-1 transition-colors hover:bg-accent/20 group cursor-pointer ${isToday ? 'bg-primary/5' : ''}`}
                    >
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                        <Plus className="w-4 h-4 text-muted-foreground" />
                      </div>

                      {apps.map(app => (
                        <div
                          key={app.id}
                          title={describeEntry(app)}
                          className={`mb-1 p-2 rounded border text-xs cursor-pointer hover:brightness-110 relative z-10 shadow-sm ${getEntryChipClass(app)}`}
                          style={{ minHeight: `${Math.max(40, (app.duration / 60) * 80)}px`, ...getEntryChipStyle(app) }}
                          onClick={e => handleAppointmentClick(app, e)}
                        >
                          <div className="font-semibold truncate flex items-center gap-1">
                            {app.metadata?.source === 'lara_ai' && <Bot className="w-3 h-3 flex-shrink-0" />}
                            <CalendarSyncMark appointment={app} className="h-3 w-3" />
                            {app.title}
                          </div>
                          <div className="text-[10px]">
                            {app.time} - {appointmentEndTime(app.time, app.duration)}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const hours = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }).map((_, i) => i + GRID_START_HOUR);
    const dateStr = localDateKey(currentDate);
    const isToday = dateStr === todayKey;
    const dayEntries = visibleEntries.filter(a => a.date === dateStr);

    return (
      <div className="flex flex-col flex-1 overflow-y-auto custom-scrollbar bg-card">
        <div className="p-4 border-b border-border bg-card sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-semibold text-foreground capitalize">
            {currentDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          <div className="flex items-center gap-2">
            {isToday && <span className="eia-pill border border-primary/30 bg-primary/10 text-primary">Hoje</span>}
            <span className="text-xs text-muted-foreground">
              {dayEntries.length === 1 ? '1 compromisso' : `${dayEntries.length} compromissos`}
            </span>
          </div>
        </div>

        <div className="flex-1 p-4">
          {hours.map(hour => {
            const timeStr = `${String(hour).padStart(2, '0')}:00`;
            const apps = dayEntries
              .filter(a => gridHour(a.time) === hour)
              .sort((a, b) => a.time.localeCompare(b.time));

            return (
              <div key={hour} className="flex border-b border-border/50 min-h-[100px] group hover:bg-accent/30 transition-colors">
                <div className="w-20 py-4 pr-6 text-right text-sm font-medium text-muted-foreground border-r border-border/50">
                  {timeStr}
                </div>
                <div className="flex-1 p-2 relative cursor-pointer" onClick={() => openCreateModal(dateStr, timeStr)}>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-10 pointer-events-none">
                    <Plus className="w-6 h-6 text-muted-foreground" />
                  </div>
                  {apps.map(app => (
                    <div
                      key={app.id}
                      title={describeEntry(app)}
                      className={`mb-2 p-3 rounded-lg border flex flex-wrap justify-between items-center gap-3 shadow-md relative z-10 cursor-pointer hover:brightness-110 ${getEntryChipClass(app)}`}
                      style={{ minHeight: `${Math.max(60, (app.duration / 60) * 100)}px`, ...getEntryChipStyle(app) }}
                      onClick={e => handleAppointmentClick(app, e)}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-sm flex items-center gap-1.5">
                          {app.metadata?.source === 'lara_ai' && <Bot className="w-3.5 h-3.5 flex-shrink-0" />}
                          <CalendarSyncMark appointment={app} className="h-3.5 w-3.5" />
                          {app.title}
                        </div>
                        <div className="text-xs mt-1">{app.description || 'Sem descrição.'}</div>
                        <div className="eia-eyebrow mt-2">{app.ownerName}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm">
                          {app.time} - {appointmentEndTime(app.time, app.duration)}
                        </div>
                        <div className="mt-2 flex justify-end">
                          {isPendingClosure(app, now) ? (
                            <span className="eia-pill" style={{ ...alertSurface, ...alertText }}>
                              Sem desfecho
                            </span>
                          ) : (
                            <StatusPill status={app.status} />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDayPanel = () => {
    if (loading) return null;

    if (loadError) {
      return (
        <div className="eia-card mb-4 p-5">
          <p className="eia-eyebrow">Agenda</p>
          <p className="mt-2 text-sm text-foreground">A agenda não pôde ser carregada.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pode ser conexão ou vínculo com o workspace. Tente de novo e, se persistir, confira o acesso em
            Configurações.
          </p>
          <div className="mt-4 flex gap-3">
            <Button
              onClick={() => {
                setLoading(true);
                loadData();
              }}
            >
              Tentar de novo
            </Button>
            <Button variant="outline" onClick={() => navigate('/settings')}>
              Abrir configurações
            </Button>
          </div>
        </div>
      );
    }

    if (!entries.length) {
      return (
        <div className="eia-card mb-4 p-5">
          <p className="eia-eyebrow">Agenda</p>
          <p className="mt-2 text-sm text-foreground">Nenhum agendamento registrado ainda.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Clique em um dia do calendário para marcar o primeiro compromisso, ou use o botão abaixo. A Lara
            também cria agendamentos sozinha quando o lead aceita um horário.
          </p>
          <div className="mt-4">
            <Button onClick={() => openCreateModal(todayKey)}>
              <Plus className="w-4 h-4 mr-2" />
              Agendar
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="eia-card mb-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="eia-eyebrow">Fechamento da agenda</p>
            <p className="mt-2 text-sm text-muted-foreground">
              O desfecho de cada reunião é o que alimenta a taxa de comparecimento.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-8">
            <div>
              <p className="eia-eyebrow">Hoje</p>
              <p className="mt-1 font-mono text-2xl text-foreground">{todayEntries.length}</p>
            </div>
            <div>
              <p className="eia-eyebrow">Sem desfecho</p>
              <p
                className="mt-1 font-mono text-2xl text-foreground"
                style={pendingClosures.length ? alertText : undefined}
              >
                {pendingClosures.length}
              </p>
            </div>
            <div>
              <p className="eia-eyebrow">Comparecimento</p>
              <p className="mt-1 font-mono text-2xl text-foreground">
                {stats.rate === null ? '—' : `${stats.rate}%`}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {stats.closed === 0
                  ? 'Nenhuma reunião fechada ainda.'
                  : `${stats.attended} de ${stats.closed} fechadas.`}
              </p>
            </div>
          </div>
        </div>

        {todayEntries.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="eia-eyebrow">Compromissos de hoje</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {todayEntries.map(entry => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(entry.id)}
                    className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-accent"
                  >
                    <span className="font-mono">{entry.time}</span>
                    <span className="max-w-[180px] truncate">{entry.title}</span>
                    <span className="text-muted-foreground">{entry.ownerName}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-4">
            <p className="eia-eyebrow">Pendências de fechamento</p>
            {pendingClosures.length > 4 && (
              <button
                type="button"
                onClick={() => setShowAllPending(value => !value)}
                className="text-xs text-primary underline"
              >
                {showAllPending ? 'Mostrar menos' : `Ver todas (${pendingClosures.length})`}
              </button>
            )}
          </div>

          {pendingClosures.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Nenhuma reunião passada esperando desfecho.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {visiblePending.map(entry => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg p-3"
                  style={alertSurface}
                >
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelectedId(entry.id)}
                      className="text-left text-sm font-medium text-foreground hover:underline"
                    >
                      {entry.title}
                    </button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-mono">
                        {formatDateLabel(entry.date)} · {entry.time} às {appointmentEndTime(entry.time, entry.duration)}
                      </span>
                      {' · '}
                      {entry.ownerName}
                      {entry.contact?.name ? ` · ${entry.contact.name}` : ''}
                    </p>
                  </div>
                  <OutcomeActions entry={entry} busy={outcomeBusyId === entry.id} onPick={handleOutcome} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  };

  const renderFilters = () => (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="relative">
        <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <select
          aria-label="Filtrar por responsável"
          value={ownerFilter}
          onChange={e => setOwnerFilter(e.target.value)}
          className="appearance-none rounded-lg border border-input bg-secondary py-2 pl-10 pr-8 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">Todos os responsáveis</option>
          {owners.map(owner => (
            <option key={owner.id ?? 'unassigned'} value={owner.id ?? 'unassigned'}>
              {owner.isCurrentUser ? `${owner.name} (você)` : owner.name} · {owner.count}
            </option>
          ))}
        </select>
      </div>

      <div className="relative">
        <CalendarCheck2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <select
          aria-label="Filtrar por status"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          className="appearance-none rounded-lg border border-input bg-secondary py-2 pl-10 pr-8 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
        >
          {STATUS_FILTER_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <span className="text-xs text-muted-foreground">
        {visibleEntries.length === 1 ? '1 agendamento' : `${visibleEntries.length} agendamentos`}
      </span>

      {hasFilters && (
        <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
          Limpar filtros
        </Button>
      )}

      {hasFilters && visibleEntries.length === 0 && entries.length > 0 && (
        <span className="text-xs text-muted-foreground">
          Nenhum agendamento com esses filtros. Limpe os filtros para ver a agenda inteira.
        </span>
      )}
    </div>
  );

  return (
    <div className="scheduling-page">
      <header className="scheduling-header">
        <div>
          <p className="eia-eyebrow">Calendário comercial</p>
          <h1>Agendamentos.</h1>
          <p>Gerencie demos, reuniões e suporte técnico.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto">
          <div className="flex bg-card p-1 rounded-lg border border-border">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all ${viewMode === 'month' ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Mês
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all ${viewMode === 'week' ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Columns className="w-3.5 h-3.5" /> Semana
            </button>
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all ${viewMode === 'day' ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <List className="w-3.5 h-3.5" /> Dia
            </button>
          </div>

          <div className="flex items-center bg-card border border-border rounded-lg p-1">
            <button
              onClick={() => navigateDate(-1)}
              aria-label="Período anterior"
              className="p-2 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center justify-center w-48 px-2 cursor-pointer" onClick={goToToday} title="Ir para hoje">
              <span className="text-sm font-semibold text-foreground capitalize">
                {viewMode === 'month' ? getMonthLabel() : viewMode === 'week' ? getWeekLabel() : getDayLabel()}
              </span>
              {viewMode === 'week' && <span className="text-[10px] text-muted-foreground">{currentDate.getFullYear()}</span>}
            </div>
            <button
              onClick={() => navigateDate(1)}
              aria-label="Próximo período"
              className="p-2 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <Button variant="secondary" onClick={() => navigate('/settings?tab=calendar')} className="gap-2">
            <CalendarCheck2 className="w-4 h-4" />
            Agenda externa
          </Button>

          <Button onClick={() => openCreateModal(todayKey)}>
            <Plus className="w-4 h-4 mr-2" />
            Agendar
          </Button>
        </div>
      </header>

      {renderDayPanel()}
      {!loading && entries.length > 0 && renderFilters()}

      <div className="scheduling-calendar">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {viewMode === 'month' && (
              <>
                <div className="grid grid-cols-7 border-b border-border bg-card">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                    <div key={day} className="py-3 text-center eia-eyebrow text-muted-foreground">
                      {day}
                    </div>
                  ))}
                </div>
                {renderMonthView()}
              </>
            )}
            {viewMode === 'week' && renderWeekView()}
            {viewMode === 'day' && renderDayView()}
          </>
        )}
      </div>

      {/* Criar */}
      {showCreateModal && (
        <div className="eia-dialog-overlay fixed inset-0 z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="eia-dialog-content relative max-w-md w-full max-h-[calc(100svh-2rem)] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-appointment-title"
          >
            <div className="p-6 border-b border-border flex justify-between items-center">
              <div>
                <p className="eia-eyebrow mb-2">Calendário comercial</p>
                <h3 id="create-appointment-title" className="eia-dialog-title">Novo agendamento</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  resetCreateForm();
                }}
                aria-label="Fechar novo agendamento"
                className="eia-dialog-close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
              <div className="space-y-2">
                <label htmlFor="create-appointment-date" className="eia-eyebrow">Data</label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    id="create-appointment-date"
                    type="date"
                    required
                    className="w-full bg-secondary border border-input rounded-lg pl-10 pr-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none"
                    value={selectedDate ?? ''}
                    onChange={e => setSelectedDate(e.target.value || null)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="create-appointment-time" className="eia-eyebrow">Horário</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      id="create-appointment-time"
                      type="time"
                      className="w-full bg-secondary border border-input rounded-lg pl-10 pr-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none"
                      value={formData.time}
                      onChange={e => setFormData({ ...formData, time: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="create-appointment-duration" className="eia-eyebrow">Duração</label>
                  <select
                    id="create-appointment-duration"
                    className="w-full bg-secondary border border-input rounded-lg px-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none appearance-none"
                    value={formData.duration}
                    onChange={e => setFormData({ ...formData, duration: parseInt(e.target.value, 10) })}
                  >
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">1 hora</option>
                    <option value="90">1h 30min</option>
                    <option value="120">2 horas</option>
                  </select>
                </div>
              </div>

              <ConflictNotice
                state={createConflict.state}
                report={createConflict.report}
                onUseSuggestion={time => setFormData(prev => ({ ...prev, time }))}
              />

              <div className="space-y-2">
                <label htmlFor="create-appointment-type" className="eia-eyebrow">Tipo</label>
                <select
                  id="create-appointment-type"
                  className="w-full bg-secondary border border-input rounded-lg px-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none appearance-none"
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value })}
                >
                  <option value="demo">Demo</option>
                  <option value="meeting">Reunião</option>
                  <option value="support">Suporte</option>
                  <option value="followup">Follow-up</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="create-appointment-name" className="eia-eyebrow">Título do evento</label>
                <input
                  id="create-appointment-name"
                  required
                  type="text"
                  className="w-full bg-secondary border border-input rounded-lg p-3 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none placeholder:text-muted-foreground"
                  placeholder="Ex: Apresentação para Cliente X"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="create-appointment-description" className="eia-eyebrow">Descrição</label>
                <div className="relative">
                  <AlignLeft className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <textarea
                    id="create-appointment-description"
                    className="w-full bg-secondary border border-input rounded-lg pl-10 pr-3 py-3 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none placeholder:text-muted-foreground resize-none h-24"
                    placeholder="Detalhes adicionais."
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="create-appointment-contact" className="eia-eyebrow">Contato vinculado</label>
                <div className="relative">
                  <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <select
                    id="create-appointment-contact"
                    value={selectedContactId || ''}
                    onChange={e => setSelectedContactId(e.target.value || null)}
                    className="w-full bg-secondary border border-input rounded-lg pl-10 pr-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none appearance-none"
                  >
                    <option value="">Selecionar contato (opcional)</option>
                    {contacts.map(contact => (
                      <option key={contact.id} value={contact.id}>
                        {contact.name || contact.phone} - {contact.phone}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-muted-foreground">Vincule um contato existente ao evento.</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="create-appointment-attendees" className="eia-eyebrow">Participantes adicionais</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    id="create-appointment-attendees"
                    type="text"
                    name="attendees"
                    className="w-full bg-secondary border border-input rounded-lg pl-10 pr-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none placeholder:text-muted-foreground"
                    placeholder="Ex: joao@empresa.com, maria@empresa.com"
                    value={formData.attendees}
                    onChange={e => setFormData({ ...formData, attendees: e.target.value })}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Separe os e-mails por vírgula. Eles recebem o convite.</p>
              </div>

              <div className="pt-4 flex gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowCreateModal(false);
                    resetCreateForm();
                  }}
                  className="flex-1 border"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSaving || createConflict.state === 'conflict'} className="flex-1">
                  {isSaving ? 'Salvando' : 'Salvar'}
                </Button>
              </div>
              {createConflict.state === 'conflict' && (
                <p className="text-xs text-muted-foreground">
                  Escolha um horário livre para liberar o botão. A agenda não aceita dois compromissos sobrepostos.
                </p>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Detalhe */}
      {selectedAppointment && !showEditModal && (
        <div className="eia-dialog-overlay fixed inset-0 z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="eia-dialog-content relative max-w-md w-full max-h-[calc(100svh-2rem)] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="appointment-details-title"
          >
            <div className="p-6 border-b border-border">
              <div className="flex justify-between items-start mb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2 py-1 rounded text-[11px] font-medium border ${getEventTypeColor(selectedAppointment.type)}`}>
                    {selectedAppointment.type}
                  </span>
                  <StatusPill status={selectedAppointment.status} />
                  {isPendingClosure(selectedAppointment, now) && (
                    <span className="eia-pill" style={{ ...alertSurface, ...alertText }}>
                      Sem desfecho
                    </span>
                  )}
                  {selectedAppointment.metadata?.source === 'lara_ai' && (
                    <span className="px-2 py-1 rounded text-[11px] font-medium border bg-primary/10 text-primary border-primary/30 flex items-center gap-1">
                      <Bot className="w-3 h-3" />
                      Criado por IA
                    </span>
                  )}
                  {selectedAppointment.calendar_sync_status === 'synced' && (
                    <span className="eia-meta-chip flex items-center gap-1 text-success">
                      <CalendarCheck2 className="h-3 w-3" />
                      Agenda externa
                    </span>
                  )}
                  {selectedAppointment.calendar_sync_status === 'error' && (
                    <span className="eia-meta-chip flex items-center gap-1 border-destructive/20 bg-destructive/10 text-destructive">
                      <CircleAlert className="h-3 w-3" />
                      Falha ao sincronizar
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label="Fechar detalhes do agendamento"
                  className="eia-dialog-close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <h3 id="appointment-details-title" className="eia-dialog-title mb-2">{selectedAppointment.title}</h3>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-primary" />
                  {selectedAppointment.time} - {appointmentEndTime(selectedAppointment.time, selectedAppointment.duration)} ({selectedAppointment.duration}min)
                </div>
                <button
                  type="button"
                  onClick={() => {
                    goToDay(selectedAppointment.date);
                    setSelectedId(null);
                  }}
                  className="flex items-center gap-1.5 hover:text-foreground"
                >
                  <CalendarIcon className="w-4 h-4 text-primary" />
                  {formatDateLabel(selectedAppointment.date)}
                </button>
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-primary" />
                  {selectedAppointment.isMine ? `${selectedAppointment.ownerName} (você)` : selectedAppointment.ownerName}
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
              <div className="space-y-2">
                <h4 className="eia-eyebrow">Desfecho</h4>
                {selectedAppointment.status === 'scheduled' ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {isPendingClosure(selectedAppointment, now)
                        ? 'Esta reunião já passou e ainda não tem desfecho. Registre o que aconteceu.'
                        : selectedAppointment.startsAt.getTime() > now.getTime()
                          ? 'A reunião ainda não começou. Dá para remarcar ou cancelar agora; o comparecimento se registra depois que ela terminar.'
                          : 'Registre o que aconteceu assim que a reunião terminar.'}
                    </p>
                    <div className="pt-1">
                      <OutcomeActions
                        entry={selectedAppointment}
                        busy={outcomeBusyId === selectedAppointment.id}
                        outcomes={
                          selectedAppointment.startsAt.getTime() > now.getTime()
                            ? UPCOMING_OUTCOMES
                            : APPOINTMENT_OUTCOMES
                        }
                        onPick={handleOutcome}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary p-3">
                    <div>
                      <p className="text-sm text-foreground">{APPOINTMENT_STATUS_LABEL[selectedAppointment.status]}</p>
                      {selectedAppointment.metadata?.outcome_at && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Registrado em {new Date(selectedAppointment.metadata.outcome_at).toLocaleString('pt-BR')}.
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={outcomeBusyId === selectedAppointment.id}
                      onClick={() => handleReopenOutcome(selectedAppointment)}
                    >
                      Alterar desfecho
                    </Button>
                  </div>
                )}
              </div>

              {selectedAppointment.description && (
                <div className="space-y-2">
                  <h4 className="eia-eyebrow">Descrição</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed bg-secondary p-3 rounded-lg border border-border">
                    {selectedAppointment.description}
                  </p>
                </div>
              )}

              {selectedAppointment.contact_id && (
                <div className="space-y-2">
                  <h4 className="eia-eyebrow">Contato vinculado</h4>
                  <div className="flex items-center gap-2 bg-secondary px-3 py-2 rounded-lg border border-border">
                    <UserCircle className="w-5 h-5 text-primary" />
                    <div className="flex-1">
                      <span className="text-sm text-foreground font-medium">
                        {selectedAppointment.contact?.name || 'Contato'}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {selectedAppointment.contact?.phone_number}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="eia-eyebrow">Participantes</h4>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedAppointment.attendees && selectedAppointment.attendees.length > 0 ? (
                    selectedAppointment.attendees.map((attendee, i) => (
                      <div key={i} className="flex items-center gap-2 bg-secondary px-3 py-1.5 rounded-full border border-border">
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[10px] text-primary-foreground font-semibold">
                          {attendee.charAt(0)}
                        </div>
                        <span className="text-xs text-foreground">{attendee}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">Nenhum participante adicional.</span>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleDeleteAppointment(selectedAppointment.id)}
                    className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
                  >
                    Excluir
                  </Button>
                  <Button type="button" variant="outline" onClick={() => handleEditClick(selectedAppointment)} className="flex-1">
                    <Pencil className="w-4 h-4 mr-1" />
                    Editar
                  </Button>
                </div>

                {selectedAppointment.meeting_url ? (
                  <>
                    <Button
                      className="w-full py-3"
                      size="lg"
                      onClick={() => window.open(selectedAppointment.meeting_url, '_blank', 'noopener,noreferrer')}
                    >
                      <Video className="w-5 h-5 mr-2" />
                      Entrar na reunião
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      A sala fica disponível 5 minutos antes do horário.
                    </p>
                  </>
                ) : (
                  <p className="text-center text-xs text-muted-foreground">
                    Este agendamento não tem link de reunião. Conecte a agenda externa para que cada evento
                    nasça com sala própria.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Editar */}
      {showEditModal && selectedAppointment && (
        <div className="eia-dialog-overlay fixed inset-0 z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="eia-dialog-content relative max-w-lg w-full max-h-[calc(100svh-2rem)] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-appointment-title"
          >
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <p className="eia-eyebrow mb-2">Calendário comercial</p>
                <h2 id="edit-appointment-title" className="eia-dialog-title">Editar agendamento</h2>
                <p className="mt-2 text-xs text-muted-foreground">
                  Responsável: {selectedAppointment.isMine ? `${selectedAppointment.ownerName} (você)` : selectedAppointment.ownerName}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                aria-label="Fechar edição do agendamento"
                className="eia-dialog-close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="edit-appointment-date" className="eia-eyebrow">Data</label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      id="edit-appointment-date"
                      type="date"
                      required
                      className="w-full bg-secondary border border-input rounded-lg pl-10 pr-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none"
                      value={editFormData.date}
                      onChange={e => setEditFormData({ ...editFormData, date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="edit-appointment-time" className="eia-eyebrow">Horário</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      id="edit-appointment-time"
                      type="time"
                      className="w-full bg-secondary border border-input rounded-lg pl-10 pr-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none"
                      value={editFormData.time}
                      onChange={e => setEditFormData({ ...editFormData, time: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="edit-appointment-duration" className="eia-eyebrow">Duração</label>
                  <select
                    id="edit-appointment-duration"
                    className="w-full bg-secondary border border-input rounded-lg px-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none appearance-none"
                    value={editFormData.duration}
                    onChange={e => setEditFormData({ ...editFormData, duration: parseInt(e.target.value, 10) })}
                  >
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">1 hora</option>
                    <option value="90">1h 30min</option>
                    <option value="120">2 horas</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="edit-appointment-type" className="eia-eyebrow">Tipo</label>
                  <select
                    id="edit-appointment-type"
                    className="w-full bg-secondary border border-input rounded-lg px-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none appearance-none"
                    value={editFormData.type}
                    onChange={e => setEditFormData({ ...editFormData, type: e.target.value })}
                  >
                    <option value="demo">Demo</option>
                    <option value="meeting">Reunião</option>
                    <option value="support">Suporte</option>
                    <option value="followup">Follow-up</option>
                  </select>
                </div>
              </div>

              <ConflictNotice
                state={editConflict.state}
                report={editConflict.report}
                onUseSuggestion={time => setEditFormData(prev => ({ ...prev, time }))}
              />

              <div className="space-y-2">
                <label htmlFor="edit-appointment-name" className="eia-eyebrow">Título do evento</label>
                <input
                  id="edit-appointment-name"
                  required
                  type="text"
                  className="w-full bg-secondary border border-input rounded-lg p-3 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none placeholder:text-muted-foreground"
                  placeholder="Ex: Apresentação para Cliente X"
                  value={editFormData.title}
                  onChange={e => setEditFormData({ ...editFormData, title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="edit-appointment-description" className="eia-eyebrow">Descrição</label>
                <div className="relative">
                  <AlignLeft className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <textarea
                    id="edit-appointment-description"
                    className="w-full bg-secondary border border-input rounded-lg pl-10 pr-3 py-3 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none placeholder:text-muted-foreground resize-none h-24"
                    placeholder="Detalhes adicionais."
                    value={editFormData.description}
                    onChange={e => setEditFormData({ ...editFormData, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="edit-appointment-contact" className="eia-eyebrow">Contato vinculado</label>
                <div className="relative">
                  <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <select
                    id="edit-appointment-contact"
                    value={editContactId || ''}
                    onChange={e => setEditContactId(e.target.value || null)}
                    className="w-full bg-secondary border border-input rounded-lg pl-10 pr-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none appearance-none"
                  >
                    <option value="">Selecionar contato (opcional)</option>
                    {contacts.map(contact => (
                      <option key={contact.id} value={contact.id}>
                        {contact.name || contact.phone} - {contact.phone}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="edit-appointment-attendees" className="eia-eyebrow">Participantes adicionais</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    id="edit-appointment-attendees"
                    type="text"
                    className="w-full bg-secondary border border-input rounded-lg pl-10 pr-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none placeholder:text-muted-foreground"
                    placeholder="Ex: joao@empresa.com, maria@empresa.com"
                    value={editFormData.attendees}
                    onChange={e => setEditFormData({ ...editFormData, attendees: e.target.value })}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Separe os e-mails por vírgula. Eles recebem o convite.</p>
              </div>

              <div className="pt-4 flex gap-3">
                <Button type="button" variant="ghost" onClick={closeEditModal} className="flex-1 border">
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSaving || editConflict.state === 'conflict'} className="flex-1">
                  {isSaving ? 'Salvando' : 'Salvar alterações'}
                </Button>
              </div>
              {editConflict.state === 'conflict' && (
                <p className="text-xs text-muted-foreground">
                  Escolha um horário livre para liberar o botão. A agenda não aceita dois compromissos sobrepostos.
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Scheduling;
