
import React, { useState, useMemo, useRef } from 'react';
import { MaintenanceEntry, Equipment, MaintenanceAction, TechnicalReport } from '../types';
import { Plus, Search, Calendar, Save, Trash2, ArrowRight, FileText, User, Clock, AlertTriangle, X, Edit2, Check, Wrench, MessageSquare, Activity, MapPin, Filter, ClipboardCheck, Download, CheckCircle, Loader2, ShoppingCart, CheckCircle2, Lock, Unlock, Key, PackageCheck, Package, FolderDown } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../supabase';
import { exportEquipmentInterventionsPDF } from '../utils/interventionsReport';

interface TrackingViewProps {
  entries: MaintenanceEntry[];
  refreshData: () => Promise<void>;
  equipment: Equipment[];
  allowOperativeDateEdit?: boolean;
}

const TrackingView: React.FC<TrackingViewProps> = ({ entries, refreshData, equipment, allowOperativeDateEdit = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'repair' | 'parts' | 'testing' | 'operative'>('all');
  const [workshopFilter, setWorkshopFilter] = useState<'all' | 'pesados' | 'camiones' | 'livianos' | 'contenedores' | 'alquilados'>('all');
  const [showStalledOnly, setShowStalledOnly] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // States for Operative Date Edit Modal
  const [showOperativeModal, setShowOperativeModal] = useState(false);
  const [operativeModalEntry, setOperativeModalEntry] = useState<MaintenanceEntry | null>(null);
  const [operativeExitDate, setOperativeExitDate] = useState<string>(new Date().toLocaleDateString('en-CA'));
  const [operativeAuthKey, setOperativeAuthKey] = useState<string>('');
  const [isDateUnlocked, setIsDateUnlocked] = useState(false);
  const [operativeError, setOperativeError] = useState<string | null>(null);

  // State for in-memory edits of entries in CONFIRMACION state
  const [confirmationFormMap, setConfirmationFormMap] = useState<Record<string, { note: string; responsable: string; date: string }>>({});
  
  const today = new Date().toLocaleDateString('en-CA'); 
  const MAINTENANCE_GOAL = 90;

  const getGoalStatus = (fechaIngreso: string, fechaSalida?: string) => {
    const start = new Date(fechaIngreso + 'T00:00:00');
    const end = fechaSalida ? new Date(fechaSalida + 'T00:00:00') : new Date();
    end.setHours(0, 0, 0, 0);
    
    const daysElapsed = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const remaining = MAINTENANCE_GOAL - daysElapsed;
    
    let color = 'text-green-600';
    let bgColor = 'bg-green-50';
    let label = 'días restantes';
    
    if (remaining < 0) {
      color = 'text-red-600';
      bgColor = 'bg-red-50';
      label = 'días excedidos';
    } else if (remaining <= 15) {
      color = 'text-orange-500';
      bgColor = 'bg-orange-50';
    }
    
    return { remaining: Math.abs(remaining), color, bgColor, label, isExceeded: remaining < 0 };
  };
  const [newEntry, setNewEntry] = useState({
    interno: '',
    fecha_ingreso: today,
    obra_asignada: '',
    informe_fallas: '',
    firstAction: '',
    responsable: '',
    actionDate: today,
    observaciones: '',
    // Campos para nuevo equipo si no existe
    tipo: '',
    marca: '',
    modelo: ''
  });

  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [actionCategory, setActionCategory] = useState<'pedido' | 'sott' | 'reparacion'>('pedido');
  // Sub-fields according to category
  const [rcNumber, setRcNumber] = useState('');
  const [compartimientos, setCompartimientos] = useState('');
  const [sottComponente, setSottComponente] = useState('');
  const [sottProveedor, setSottProveedor] = useState('');
  const [newActionText, setNewActionText] = useState('');
  const [newActionResponsable, setNewActionResponsable] = useState('');
  const [newActionDate, setNewActionDate] = useState(today);

  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editActionData, setEditActionData] = useState<{
    descripcion: string;
    responsable: string;
    fecha_accion: string;
  }>({ descripcion: '', responsable: '', fecha_accion: '' });

  const [editEntryData, setEditEntryData] = useState<{
    obra_asignada: string;
    informe_fallas: string;
    fecha_ingreso: string;
  }>({ obra_asignada: '', informe_fallas: '', fecha_ingreso: '' });

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [tempComment, setTempComment] = useState('');

  const repuestoKeywords = ['pedido', 'repuesto', 'terceros', 'compra', 'adquisición', 'pendiente', 'insumo', 'falta'];
  const testingKeywords = ['prueba', 'probar', 'prueva'];

  // --- HELPER PARA EXTRAER INFORME (Array u Objeto) ---
  const getExistingReport = (entry: MaintenanceEntry): TechnicalReport | null => {
    if (!entry.informe_taller) return null;
    
    if (Array.isArray(entry.informe_taller)) {
      return entry.informe_taller.length > 0 ? entry.informe_taller[0] : null;
    }
    
    // Si es un objeto único (no array)
    return entry.informe_taller as TechnicalReport;
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  const getDiffDays = (d1: string, d2: string) => {
    if (!d1 || !d2) return 0;
    const start = new Date(d1 + 'T00:00:00');
    const end = new Date(d2 + 'T00:00:00');
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    const diffTime = end.getTime() - start.getTime();
    return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
  };

  const calculateLoss = (days: number, eq?: Equipment) => {
    if (!eq) return 0;
    return (days / 30) * 0.0325 * (eq.demerito || 0.8) * 0.5 * (eq.valor_nuevo || 0);
  };

  const formatCurrencyAbbr = (value: number) => {
    return `USD ${Math.round(value || 0).toLocaleString('de-DE')}`;
  };

  const syncInProgress = useRef(false);

  const syncDailyCounters = async () => {
    if (syncInProgress.current) return;
    syncInProgress.current = true;
    try {
      const activeEntries = entries.filter(e => e.estado !== 'OPERATIVO');
      if (activeEntries.length === 0) return;

      let updatedAny = false;

      for (const entry of activeEntries) {
        const actions = entry.acciones_taller || [];
        const lastSyncAction = [...actions].reverse().find(a => a.descripcion === 'Sincronización diaria de estadía');
        
        const lastSyncDate = lastSyncAction ? lastSyncAction.fecha_accion : entry.fecha_ingreso;
        const daysToSync = getDiffDays(lastSyncDate, today);

        if (daysToSync > 0) {
          const estado = entry.estado || 'REPARACION';
          const updates: any = {};
          
          if (estado === 'REPARACION' || estado === 'CONFIRMACION') {
            updates.estadia_reparacion = Number(entry.estadia_reparacion || 0) + daysToSync;
          } else if (estado === 'COMPRAS') {
            updates.estadia_compras = Number(entry.estadia_compras || 0) + daysToSync;
          } else if (estado === 'PRUEBA') {
            updates.estadia_prueba = Number(entry.estadia_prueba || 0) + daysToSync;
          }

          const { error: updateError } = await supabase
            .from('ingresos_taller')
            .update(updates)
            .eq('id', entry.id);

          if (!updateError) {
            await supabase.from('acciones_taller').insert([{
              ingreso_id: entry.id,
              descripcion: 'Sincronización diaria de estadía',
              fecha_accion: today,
              responsable: 'Sistema'
            }]);
            updatedAny = true;
          }
        }
      }

      if (updatedAny) {
        await refreshData();
      }
    } finally {
      syncInProgress.current = false;
    }
  };

  React.useEffect(() => {
    if (entries.length > 0 && !isProcessing) {
      syncDailyCounters();
    }
  }, [entries.length]);

  const getWorkshopStatus = (entry: MaintenanceEntry) => {
    const estado = entry.estado || 'REPARACION';
    const isOperative = estado === 'OPERATIVO';
    const isWaitingParts = estado === 'COMPRAS';
    const isConfirmation = estado === 'CONFIRMACION';
    const isTesting = estado === 'PRUEBA';
    const isInRepair = estado === 'REPARACION';

    const repairDays = Number(entry.estadia_reparacion || 0);
    const partsDays = Number(entry.estadia_compras || 0);
    const testingDays = Number(entry.estadia_prueba || 0);

    // Total days should be the difference between entry and today/exit
    const endDateStr = isOperative ? (entry.fecha_salida || today) : today;
    const totalDays = getDiffDays(entry.fecha_ingreso, endDateStr);

    return { 
      isOperative, isWaitingParts, isConfirmation, isTesting, isInRepair, 
      endDate: endDateStr, totalDays,
      breakdown: { repairDays, partsDays, testingDays }
    };
  };

  const handleStatusChange = async (entry: MaintenanceEntry, newStatus: string, customExitDate?: string) => {
    setIsProcessing(true);
    try {
      const currentStatus = entry.estado || 'REPARACION';
      if (currentStatus === newStatus && newStatus !== 'OPERATIVO') return;

      const actions = entry.acciones_taller || [];
      const sortedActions = [...actions].sort((a, b) => a.fecha_accion.localeCompare(b.fecha_accion) || a.id.localeCompare(b.id));
      
      const lastCheckpointAction = [...sortedActions].reverse().find(a => 
        a.descripcion.startsWith('Cambio de estado a:') || 
        a.descripcion.includes('Cambio de estado a:') ||
        a.descripcion === 'Sincronización diaria de estadía'
      );
      
      const exitDateToUse = (newStatus === 'OPERATIVO' && customExitDate) ? customExitDate : today;
      const effectiveDateForCalc = newStatus === 'OPERATIVO' ? exitDateToUse : today;
      const lastChangeDate = lastCheckpointAction ? lastCheckpointAction.fecha_accion : entry.fecha_ingreso;
      const daysDiff = Math.max(0, getDiffDays(lastChangeDate, effectiveDateForCalc));

      const updates: any = { estado: newStatus };
      
      if (currentStatus === 'REPARACION' || currentStatus === 'CONFIRMACION') {
        updates.estadia_reparacion = Math.max(0, Number(entry.estadia_reparacion || 0) + daysDiff);
      } else if (currentStatus === 'COMPRAS') {
        updates.estadia_compras = Math.max(0, Number(entry.estadia_compras || 0) + daysDiff);
      } else if (currentStatus === 'PRUEBA') {
        updates.estadia_prueba = Math.max(0, Number(entry.estadia_prueba || 0) + daysDiff);
      }

      if (newStatus === 'OPERATIVO') {
        updates.fecha_salida = exitDateToUse;
      }

      const { error: updateError } = await supabase
        .from('ingresos_taller')
        .update(updates)
        .eq('id', entry.id);

      if (updateError) throw updateError;

      const statusLabels: Record<string, string> = {
        'REPARACION': 'EN REPARACIÓN',
        'COMPRAS': 'ESPERANDO REPUESTOS',
        'CONFIRMACION': 'CONFIRMACIÓN (REPUESTOS RECIBIDOS)',
        'PRUEBA': 'EN PRUEBA',
        'OPERATIVO': 'OPERATIVO'
      };

      const { error: actionError } = await supabase
        .from('acciones_taller')
        .insert([{
          ingreso_id: entry.id,
          descripcion: `Cambio de estado a: ${statusLabels[newStatus]}`,
          fecha_accion: exitDateToUse,
          responsable: 'Sistema'
        }]);

      if (actionError) throw actionError;

      await refreshData();
    } catch (e) {
      alert("Error cambiando estado: " + (e as any).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOperativeClick = (entry: MaintenanceEntry) => {
    if (allowOperativeDateEdit) {
      setOperativeModalEntry(entry);
      setOperativeExitDate(today);
      setOperativeAuthKey('');
      setIsDateUnlocked(false);
      setOperativeError(null);
      setShowOperativeModal(true);
    } else {
      handleStatusChange(entry, 'OPERATIVO', today);
    }
  };

  const handleValidateKey = () => {
    if (operativeAuthKey.trim() === '124') {
      setIsDateUnlocked(true);
      setOperativeError(null);
    } else {
      setIsDateUnlocked(false);
      setOperativeError('Clave incorrecta. No se pudo desbloquear la fecha.');
    }
  };

  const handleConfirmOperative = async () => {
    if (!operativeModalEntry) return;

    const isDateModified = operativeExitDate !== today;
    const isAuthorized = isDateUnlocked || operativeAuthKey.trim() === '124';

    if (isDateModified && !isAuthorized) {
      setOperativeError('Para modificar la fecha de salida debe ingresar y validar la clave de autorización.');
      return;
    }

    const targetEntry = operativeModalEntry;
    const chosenExitDate = operativeExitDate || today;

    setShowOperativeModal(false);
    setOperativeModalEntry(null);
    setIsDateUnlocked(false);
    setOperativeError(null);

    await handleStatusChange(targetEntry, 'OPERATIVO', chosenExitDate);
  };

  const getConfirmationFormData = (entryId: string) => {
    return confirmationFormMap[entryId] || {
      note: 'Repuestos e insumos entregados en taller',
      responsable: 'Depósito / Taller',
      date: today
    };
  };

  const updateConfirmFormData = (entryId: string, field: 'note' | 'responsable' | 'date', val: string) => {
    setConfirmationFormMap(prev => ({
      ...prev,
      [entryId]: {
        ...getConfirmationFormData(entryId),
        [field]: val
      }
    }));
  };

  const handlePartsClick = async (entry: MaintenanceEntry) => {
    const { isWaitingParts } = getWorkshopStatus(entry);
    if (isWaitingParts) {
      // Pasa al estado persistente CONFIRMACION
      await handleStatusChange(entry, 'CONFIRMACION');
    } else {
      // Pasa al estado ESPERANDO REPUESTOS
      await handleStatusChange(entry, 'COMPRAS');
    }
  };

  const handleCancelConfirmation = async (entry: MaintenanceEntry) => {
    // Revertir a Esperando Repuestos
    await handleStatusChange(entry, 'COMPRAS');
  };

  const handleConfirmPartsReceived = async (entry: MaintenanceEntry) => {
    const formData = getConfirmationFormData(entry.id);
    setIsProcessing(true);
    try {
      // Cambiar estado a EN REPARACIÓN
      await handleStatusChange(entry, 'REPARACION');

      // Registrar avance específico de entrega de repuestos
      if (formData.note.trim()) {
        await supabase.from('acciones_taller').insert([{
          ingreso_id: entry.id,
          descripcion: `REPUESTOS ENTREGADOS: ${formData.note.trim()}`,
          fecha_accion: formData.date || today,
          responsable: formData.responsable.trim() || 'Taller'
        }]);
        await refreshData();
      }
    } catch (e: any) {
      alert("Error al confirmar recepción de repuestos: " + (e.message || "Error desconocido"));
    } finally {
      setIsProcessing(false);
    }
  };

  const getWorkshopType = (entry: MaintenanceEntry) => {
    const eq = equipment.find(e => e.id === entry.equipo_id);
    const id = entry.equipo_id.toUpperCase().trim();
    const desc = ((eq?.tipo || '') + ' ' + (eq?.marca || '') + ' ' + (eq?.modelo || '')).toLowerCase();
    
    if (id.startsWith('X')) return 'contenedores';
    if (id.startsWith('E')) return 'pesados';
    if (id.startsWith('A')) return 'camiones';
    if (id.startsWith('G')) return 'livianos';
    if (id.startsWith('Q')) return 'alquilados';
    if (id.startsWith('V')) {
      if (desc.includes('camión') || desc.includes('camion') || desc.includes('colectivo') || desc.includes('bus')) {
        return 'camiones';
      }
      return 'livianos';
    }
    return 'otros';
  };

  const isStalledEntry = (entry: MaintenanceEntry) => {
    const { isOperative } = getWorkshopStatus(entry);
    if (isOperative) return false;

    const actions = (entry.acciones_taller || []).filter(
      (a) => a.responsable !== 'Sistema' && a.descripcion !== 'Sincronización diaria de estadía'
    );
    
    let lastActionDate = entry.fecha_ingreso;
    if (actions.length > 0) {
      const sorted = [...actions].sort((a, b) => a.fecha_accion.localeCompare(b.fecha_accion));
      lastActionDate = sorted[sorted.length - 1].fecha_accion;
    }
    
    const diff = getDiffDays(lastActionDate, today);
    return diff >= 7;
  };

  const filteredEntries = useMemo(() => {
    let result = (entries || []).filter(entry => !getWorkshopStatus(entry).isOperative);

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(entry => {
        const eq = equipment.find(e => e.id === entry.equipo_id);
        return (
          entry.equipo_id?.toLowerCase().includes(term) ||
          entry.informe_fallas?.toLowerCase().includes(term) ||
          (entry.obra_asignada || '').toLowerCase().includes(term) ||
          eq?.tipo?.toLowerCase().includes(term) ||
          eq?.marca?.toLowerCase().includes(term) ||
          (entry.acciones_taller || []).some(action => 
            action.descripcion?.toLowerCase().includes(term) ||
            action.responsable?.toLowerCase().includes(term)
          )
        );
      });
    }

    if (statusFilter !== 'all') {
      result = result.filter(entry => {
        const { isOperative, isWaitingParts, isTesting, isInRepair, isConfirmation } = getWorkshopStatus(entry);
        if (statusFilter === 'operative') return isOperative;
        if (statusFilter === 'confirmation') return isConfirmation;
        if (statusFilter === 'parts') return isWaitingParts;
        if (statusFilter === 'testing') return isTesting;
        if (statusFilter === 'repair') return isInRepair;
        return true;
      });
    }

    if (workshopFilter !== 'all') {
      result = result.filter(entry => getWorkshopType(entry) === workshopFilter);
    }

    if (showStalledOnly) {
      result = result.filter(entry => isStalledEntry(entry));
    }

    // Prioritizar al comienzo todos los registros en estado "CONFIRMACION"
    const inConfirmation = result.filter(e => e.estado === 'CONFIRMACION');
    const others = result.filter(e => e.estado !== 'CONFIRMACION');
    result = [...inConfirmation, ...others];

    return result;
  }, [entries, searchTerm, statusFilter, workshopFilter, showStalledOnly, equipment]);

  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    const todayStr = new Date().toLocaleDateString('en-CA');

    let totalLossAll = 0;
    let totalStayDaysAll = 0;
    let currentlyInWorkshopCount = 0;
    let currentlyInWorkshopPesados = 0;
    let currentlyInWorkshopLivianos = 0;
    let currentlyInWorkshopCamiones = 0;
    let currentlyInWorkshopContenedores = 0;
    let currentlyInWorkshopAlquilados = 0;
    let operativeCount = 0;
    let waitingPartsCount = 0;
    let totalRepairDays = 0;
    let totalPartsDays = 0;
    let entriesWithStay = 0;

    // Calculate summary stats from ALL entries to match Dashboard
    entries.forEach(entry => {
      const eq = equipment.find(e => e.id === entry.equipo_id);
      const { isOperative, isWaitingParts, totalDays, breakdown } = getWorkshopStatus(entry);
      const loss = calculateLoss(totalDays, eq);
      
      totalLossAll += loss;
      totalStayDaysAll += totalDays;
      
      if (totalDays > 0) {
        entriesWithStay++;
        totalRepairDays += breakdown.repairDays;
        totalPartsDays += breakdown.partsDays;
      }

      if (isOperative) {
        operativeCount++;
      } else {
        currentlyInWorkshopCount++;
        if (isWaitingParts) waitingPartsCount++;

        const wType = getWorkshopType(entry);
        if (wType === 'pesados') currentlyInWorkshopPesados++;
        else if (wType === 'livianos') currentlyInWorkshopLivianos++;
        else if (wType === 'camiones') currentlyInWorkshopCamiones++;
        else if (wType === 'contenedores') currentlyInWorkshopContenedores++;
        else if (wType === 'alquilados') currentlyInWorkshopAlquilados++;
      }
    });

    // --- Page 1: Resumen de Gestión y KPI de Flota ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text('Informe de Situación Actual de Taller - GEyT', 14, 20);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-AR')}`, 283, 20, { align: 'right' });

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN DE GESTIÓN Y KPI DE FLOTA', 14, 32);
    
    const avgStay = entries.length > 0 ? (totalStayDaysAll / entries.length).toFixed(2) : "0.00";
    const avgRepair = entriesWithStay > 0 ? (totalRepairDays / entriesWithStay).toFixed(2) : "0.00";
    const avgParts = entriesWithStay > 0 ? (totalPartsDays / entriesWithStay).toFixed(2) : "0.00";

    autoTable(doc, {
      startY: 38,
      head: [['Indicador', 'Valor']],
      body: [
        ['Equipos en taller hoy (Total)', currentlyInWorkshopCount],
        ['   • Taller Pesados (E)', currentlyInWorkshopPesados],
        ['   • Taller Livianos (G/V)', currentlyInWorkshopLivianos],
        ['   • Taller Camiones (A/V)', currentlyInWorkshopCamiones],
        ['   • Taller Contenedores (X)', currentlyInWorkshopContenedores],
        ['   • Equipos Alquilados (Q)', currentlyInWorkshopAlquilados],
        ['Equipos esperando repuestos', waitingPartsCount],
        ['Equipos operativos', operativeCount],
        ['Estadía promedio general', `${avgStay} d.`],
        ['Promedio días en reparación', `${avgRepair} d.`],
        ['Promedio días espera repuestos', `${avgParts} d.`],
        ['Pérdida facturación total', formatCurrencyAbbr(totalLossAll)],
      ],
      theme: 'striped',
      headStyles: { fillColor: [21, 128, 61], fontSize: 10, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9.5, cellPadding: 3.2 },
      columnStyles: {
        0: { cellWidth: 160 },
        1: { cellWidth: 80, halign: 'center', fontStyle: 'bold' }
      }
    });

    // Helper for status sorting inside each workshop: primero "En Reparación", luego "Esperando Repuestos"
    const getStatusSortPriority = (entry: MaintenanceEntry) => {
      const { isWaitingParts, isTesting, isInRepair } = getWorkshopStatus(entry);
      if (isInRepair) return 1;       // "En Reparación" primero
      if (isTesting) return 2;        // "En Prueba"
      if (isWaitingParts) return 3;   // "Esperando Repuestos" luego
      return 4;
    };

    const workshopDefinitions: { key: 'pesados' | 'livianos' | 'camiones' | 'contenedores' | 'alquilados', title: string }[] = [
      { key: 'pesados', title: 'TALLER PESADOS' },
      { key: 'livianos', title: 'TALLER LIVIANOS' },
      { key: 'camiones', title: 'TALLER CAMIONES' },
      { key: 'contenedores', title: 'TALLER CONTENEDORES' },
      { key: 'alquilados', title: 'EQUIPOS ALQUILADOS' }
    ];

    const activeWorkshopGroups: { title: string, entries: MaintenanceEntry[] }[] = [];

    workshopDefinitions.forEach(wDef => {
      const wEntries = filteredEntries.filter(e => getWorkshopType(e) === wDef.key);
      if (wEntries.length > 0) {
        const sorted = [...wEntries].sort((a, b) => {
          const pA = getStatusSortPriority(a);
          const pB = getStatusSortPriority(b);
          if (pA !== pB) return pA - pB;
          return a.equipo_id.localeCompare(b.equipo_id);
        });
        activeWorkshopGroups.push({ title: wDef.title, entries: sorted });
      }
    });

    // Other entries if any
    const otherEntries = filteredEntries.filter(e => {
      const t = getWorkshopType(e);
      return t !== 'pesados' && t !== 'livianos' && t !== 'camiones' && t !== 'contenedores' && t !== 'alquilados';
    });

    if (otherEntries.length > 0) {
      const sorted = [...otherEntries].sort((a, b) => {
        const pA = getStatusSortPriority(a);
        const pB = getStatusSortPriority(b);
        if (pA !== pB) return pA - pB;
        return a.equipo_id.localeCompare(b.equipo_id);
      });
      activeWorkshopGroups.push({ title: 'OTROS EQUIPOS', entries: sorted });
    }

    // Render each workshop starting on a new page
    activeWorkshopGroups.forEach((group) => {
      doc.addPage();
      
      // Workshop page header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text(`Informe de Situación Actual - ${group.title}`, 14, 20);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-AR')}`, 283, 20, { align: 'right' });

      let startY = 30;

      group.entries.forEach((entry, index) => {
        const eq = equipment.find(e => e.id === entry.equipo_id);
        const { isOperative, isWaitingParts, isTesting, totalDays, breakdown } = getWorkshopStatus(entry);
        const loss = calculateLoss(totalDays, eq);

        let headerBg = [219, 234, 254]; 
        if (isOperative) headerBg = [220, 252, 231]; 
        else if (isTesting) headerBg = [237, 233, 254]; 
        else if (isWaitingParts) headerBg = [255, 237, 213]; 

        doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
        doc.rect(14, startY, 269, 26, 'F');
        doc.setDrawColor(200, 200, 200);
        doc.rect(14, startY, 269, 26, 'S');
        
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        
        const statusLabel = isOperative ? 'OPERATIVO' : (isTesting ? 'EN PRUEBA' : (isWaitingParts ? 'EN TALLER (ESPERA REPUESTOS)' : 'EN REPARACIÓN'));
        
        const headerText = `INTERNO: ${entry.equipo_id} | MARCA: ${eq?.marca || ''} ${eq?.modelo || ''} | AÑO: ${eq?.year || 'N/D'} | Hs/Km de arrastre: ${eq?.horas?.toLocaleString('de-DE') || '0'}`;
        doc.text(headerText, 18, startY + 6);

        // Goal display in PDF header
        const goalStatus = getGoalStatus(entry.fecha_ingreso, entry.fecha_salida);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(`OBJETIVO: ${MAINTENANCE_GOAL} DÍAS`, 280, startY + 6, { align: 'right' });
        
        if (goalStatus.isExceeded) {
          doc.setTextColor(153, 27, 27); // Red
        } else if (goalStatus.remaining <= 15) {
          doc.setTextColor(180, 83, 9); // Orange
        } else {
          doc.setTextColor(21, 128, 61); // Green
        }
        doc.text(`${goalStatus.remaining} ${goalStatus.label.toUpperCase()}`, 280, startY + 11.5, { align: 'right' });
        
        // Counting for Cant Pedidos and Cantidad de SOTT (actions where responsable is not COMPRAS)
        const nonComprasActions = (entry.acciones_taller || []).filter(a => {
          const resp = (a.responsable || '').trim().toUpperCase();
          return resp !== 'COMPRAS' && resp !== 'SISTEMA';
        });

        const cantPedidos = nonComprasActions.filter(a => {
          const desc = (a.descripcion || '').trim().toLowerCase();
          return /^pedidos?\s+de\s+repuestos?/i.test(desc);
        }).length;

        const cantSOTT = nonComprasActions.filter(a => {
          const desc = (a.descripcion || '').trim();
          return /(SOTT|SOOT|\bOT\b|O\.T\.?)/i.test(desc);
        }).length;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(30, 41, 59);
        doc.text(`Cant Pedidos: ${cantPedidos}`, 280, startY + 16.5, { align: 'right' });
        doc.text(`Cantidad de SOTT: ${cantSOTT}`, 280, startY + 21.5, { align: 'right' });
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(30, 41, 59);
        const breakdownText = `Reparación: ${breakdown.repairDays}d | Repuestos: ${breakdown.partsDays}d | Prueba: ${breakdown.testingDays}d`;
        doc.text(`INGRESO: ${formatDateDisplay(entry.fecha_ingreso)} | ESTADO ACTUAL: ${statusLabel} | ESTADÍA TOTAL: ${totalDays} días (${breakdownText})`, 18, startY + 11.5);
        
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(153, 27, 27); 
        doc.text(`PÉRDIDA DE FACTURACIÓN ESTIMADA: ${formatCurrencyAbbr(loss)}`, 18, startY + 16.5);
        
        const propietarioVal = eq?.propietario ? String(eq.propietario).trim() : 'N/D';
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(30, 41, 59);
        doc.text(`PROPIETARIO: ${propietarioVal}`, 18, startY + 21.5);
        
        startY += 31;

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('MOTIVO DE INGRESO AL TALLER:', 14, startY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        const prelimText = entry.informe_fallas || 'Sin información registrada.';
        const splitPrelim = doc.splitTextToSize(prelimText, 260);
        doc.text(splitPrelim, 14, startY + 5);
        
        startY += (splitPrelim.length * 5) + 6;

        const actions = (entry.acciones_taller || []).filter(a => a.responsable !== 'Sistema');
        const tableData: any[] = actions.map((action, idx) => {
          const currentActionDate = action.fecha_accion;
          const nextAction = actions[idx + 1];
          let endDateCalc = todayStr;
          if (nextAction) {
            endDateCalc = nextAction.fecha_accion;
          } else {
            endDateCalc = isOperative ? currentActionDate : todayStr;
          }

          const durationStage = getDiffDays(currentActionDate, endDateCalc);
          const accumulated = getDiffDays(entry.fecha_ingreso, endDateCalc);

          return [
            formatDateDisplay(action.fecha_accion),
            action.descripcion,
            action.responsable || '-',
            `${durationStage} d.`,
            `${accumulated} d.`
          ];
        });

        if (entry.observaciones && entry.observaciones.trim() !== "") {
          tableData.push([
            { 
              content: `OBSERVACIONES: ${entry.observaciones}`, 
              colSpan: 5, 
              styles: { 
                fontStyle: 'italic', 
                fillColor: [248, 250, 252], 
                textColor: [100, 116, 139],
                fontSize: 7
              } 
            }
          ]);
        }

        autoTable(doc, {
          startY: startY,
          head: [['Fecha', 'Acción Realizada', 'Responsable', 'Duración Etapa', 'Estadía Acum.']],
          body: tableData,
          theme: 'grid',
          headStyles: { fillColor: [51, 65, 85], fontSize: 7.5 },
          styles: { fontSize: 7.5, cellPadding: 2 }
        });

        startY = (doc as any).lastAutoTable.finalY + 8;
        if (startY > 165 && index < group.entries.length - 1) {
          doc.addPage();
          startY = 20;
        }
      });
    });

    let fileName = `Informe_Taller_${todayStr}`;
    
    if (statusFilter !== 'all') {
      const filterSuffix = statusFilter.toUpperCase();
      fileName += `_${filterSuffix}`;
    }

    if (workshopFilter !== 'all') {
      const workshopSuffix = workshopFilter.toUpperCase();
      fileName += `_${workshopSuffix}`;
    }

    // Add page numbering
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
    }

    doc.save(`${fileName}.pdf`);
  };

  const matchedEquipment = useMemo(() => {
    const searchId = newEntry.interno.trim().toLowerCase();
    if (!searchId) return null;
    return equipment.find(e => e.id.toLowerCase() === searchId);
  }, [newEntry.interno, equipment]);

  const handleAddEntry = async () => {
    const isNewEquipment = !matchedEquipment && newEntry.interno.trim() !== '';
    if (!newEntry.firstAction.trim() || (!matchedEquipment && !isNewEquipment)) return;
    
    // Si es nuevo equipo, validar que tenga tipo y marca al menos
    if (isNewEquipment && (!newEntry.tipo.trim() || !newEntry.marca.trim())) {
      alert("Por favor complete el tipo y marca para el nuevo equipo.");
      return;
    }

    setIsProcessing(true);
    try {
      let equipmentId = matchedEquipment?.id;

      // 1. Si el equipo es nuevo, crearlo en la tabla 'equipos'
      if (isNewEquipment) {
        const { data: eqData, error: eqError } = await supabase
          .from('equipos')
          .insert([{
            id: newEntry.interno.trim(),
            tipo: newEntry.tipo.trim(),
            marca: newEntry.marca.trim(),
            modelo: newEntry.modelo.trim(),
            valor_nuevo: 0,
            demerito: 0.8,
            horas: 0
          }])
          .select();

        if (eqError) throw eqError;
        equipmentId = eqData[0].id;
      }

      const { data: entData, error: entError } = await supabase
        .from('ingresos_taller')
        .insert([{
          equipo_id: equipmentId,
          fecha_ingreso: newEntry.fecha_ingreso,
          obra_asignada: newEntry.obra_asignada,
          informe_fallas: newEntry.informe_fallas,
          observaciones: newEntry.observaciones,
          estado: 'REPARACION'
        }])
        .select();

      if (entError) throw entError;

      const { error: actError } = await supabase
        .from('acciones_taller')
        .insert([
          {
            ingreso_id: entData[0].id,
            descripcion: newEntry.firstAction,
            fecha_accion: newEntry.actionDate,
            responsable: newEntry.responsable || 'Taller'
          },
          {
            ingreso_id: entData[0].id,
            descripcion: 'Cambio de estado a: EN REPARACIÓN',
            fecha_accion: newEntry.fecha_ingreso,
            responsable: 'Sistema'
          }
        ]);

      if (actError) throw actError;

      await refreshData();
      setNewEntry({
        interno: '', fecha_ingreso: today, obra_asignada: '', informe_fallas: '',
        firstAction: '', responsable: '', actionDate: today, observaciones: '',
        tipo: '', marca: '', modelo: ''
      });
      setShowAddForm(false);
    } catch (e) {
      alert("Error registrando ingreso: " + (e as any).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetActionForm = () => {
    setSelectedEntryId(null);
    setActionCategory('pedido');
    setRcNumber('');
    setCompartimientos('');
    setSottComponente('');
    setSottProveedor('');
    setNewActionText('');
    setNewActionResponsable('');
    setNewActionDate(today);
  };

  const handleAddAction = async (entryId: string) => {
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;

    let finalDescripcion = '';
    let targetStatus = '';

    if (actionCategory === 'pedido') {
      const rcTrim = rcNumber.trim();
      const compTrim = compartimientos.trim();
      if (!rcTrim && !compTrim) {
        alert("Por favor ingrese el número de RC y/o los compartimientos.");
        return;
      }
      finalDescripcion = `Pedido de repuestos RC: ${rcTrim ? rcTrim : '-'} ${compTrim}`.trim();
      targetStatus = 'COMPRAS';
    } else if (actionCategory === 'sott') {
      const compTrim = sottComponente.trim();
      const provTrim = sottProveedor.trim();
      if (!compTrim && !provTrim) {
        alert("Por favor ingrese el componente y el proveedor para SOTT.");
        return;
      }
      finalDescripcion = `SOTT ${compTrim} ${provTrim}`.trim();
      targetStatus = 'COMPRAS';
    } else {
      // Avance Diario: No debe cambiar el estado (se mantiene el estado actual)
      const textTrim = newActionText.trim();
      if (!textTrim) {
        alert("Por favor describa el avance diario efectuado.");
        return;
      }
      finalDescripcion = textTrim.toLowerCase().startsWith('avance') ? textTrim : `Avance: ${textTrim}`.trim();
      targetStatus = ''; // No cambia de estado
    }

    setIsProcessing(true);
    try {
      const { error } = await supabase.from('acciones_taller').insert([{
        ingreso_id: entryId,
        descripcion: finalDescripcion,
        fecha_accion: newActionDate,
        responsable: newActionResponsable.trim() || 'Taller'
      }]);
      if (error) throw error;

      // Actualizar estado si corresponde
      if (targetStatus && entry.estado !== targetStatus) {
        await handleStatusChange(entry, targetStatus);
      } else {
        await refreshData();
      }

      resetActionForm();
    } catch (e) {
      alert("Error guardando avance: " + (e as any).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveEditEntry = async (entryId: string) => {
    setIsProcessing(true);
    try {
      const payload = {
        obra_asignada: editEntryData.obra_asignada,
        informe_fallas: editEntryData.informe_fallas,
        fecha_ingreso: editEntryData.fecha_ingreso
      };
      
      const { error } = await supabase.from('ingresos_taller').update(payload).eq('id', entryId);
      if (error) throw error;
      await refreshData();
      setEditingEntryId(null);
    } catch (e) {
      alert("Error actualizando ingreso: " + (e as any).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveEditAction = async () => {
    if (!editActionData.descripcion.trim()) return;
    setIsProcessing(true);
    try {
      const { error } = await supabase.from('acciones_taller').update(editActionData).eq('id', editingActionId);
      if (error) throw error;
      await refreshData();
      setEditingActionId(null);
    } catch (e) {
      alert("Error actualizando acción: " + (e as any).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmDeleteEntry = async () => {
    if (deleteConfirmId) {
      setIsProcessing(true);
      try {
        const { error } = await supabase.from('ingresos_taller').delete().eq('id', deleteConfirmId);
        if (error) throw error;
        await refreshData();
        setDeleteConfirmId(null);
      } catch (e) {
        alert("Error eliminando historial: " + (e as any).message);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const editInputClass = "w-full text-xs p-1.5 border-2 border-slate-400 rounded outline-none font-bold bg-white text-slate-950 shadow-inner";

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Seguimiento de Taller</h2>
        </div>
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" placeholder="Buscar por interno, obra..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500 text-sm font-medium"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-2 text-sm font-medium">
            <Wrench className="w-3.5 h-3.5 text-slate-400" />
            <select 
              className="bg-transparent outline-none py-2 pr-2 text-slate-700 font-bold"
              value={workshopFilter}
              onChange={(e) => setWorkshopFilter(e.target.value as any)}
            >
              <option value="all">TODOS LOS TALLERES</option>
              <option value="pesados">TALLER PESADOS (E)</option>
              <option value="camiones">TALLER CAMIONES (A/V)</option>
              <option value="livianos">TALLER LIVIANOS (G/V)</option>
              <option value="contenedores">TALLER CONTENEDORES (X)</option>
              <option value="alquilados">EQUIPOS ALQUILADOS (Q)</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-2 text-sm font-medium">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select 
              className="bg-transparent outline-none py-2 pr-2 text-slate-700 font-bold"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="all">TODOS LOS ESTADOS</option>
              <option value="repair">EN REPARACIÓN</option>
              <option value="confirmation">CONFIRMACIÓN (REPUESTOS RECIBIDOS)</option>
              <option value="parts">ESPERANDO REPUESTOS</option>
              <option value="testing">EN PRUEBA</option>
            </select>
          </div>

          <button 
            type="button"
            onClick={() => setShowStalledOnly(!showStalledOnly)}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg border text-xs font-black uppercase transition-all select-none ${
              showStalledOnly 
                ? 'bg-red-600 border-red-700 text-white animate-pulse shadow-md shadow-red-950/15' 
                : 'bg-white border-slate-300 text-red-600 hover:bg-red-50 hover:border-red-200'
            }`}
            title="Filtrar por equipos con avance inactivo hace 7 o más días"
          >
            <AlertTriangle className={`w-4 h-4 ${showStalledOnly ? 'text-white' : 'text-red-500 animate-pulse'}`} />
            <span>Avances Inactivos (≥ 7 días)</span>
          </button>

          <button onClick={handleExportPDF} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg border border-slate-300 transition-all font-bold text-sm">
            <FileText className="w-4 h-4" /> PDF
          </button>
          <button onClick={() => setShowAddForm(!showAddForm)} className="flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-lg shadow-md transition-all font-bold text-sm">
            {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {showAddForm ? 'Cancelar' : 'Nuevo Ingreso'}
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="bg-white p-6 rounded-xl border-2 border-green-600 shadow-xl animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
            <div>
              <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase">Interno</label>
              <input type="text" value={newEntry.interno} onChange={e => setNewEntry({...newEntry, interno: e.target.value.toUpperCase()})} className="w-full bg-white border border-slate-400 rounded p-2 text-sm font-bold uppercase text-slate-950" placeholder="E1000" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase">Validación Equipo</label>
              <div className={`border rounded p-2 text-sm h-[38px] flex items-center italic font-medium ${matchedEquipment ? 'bg-green-50 border-green-200 text-green-700' : (newEntry.interno.trim() !== '' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-100 text-slate-700')}`}>
                {matchedEquipment ? `${matchedEquipment.tipo} | ${matchedEquipment.marca}` : (newEntry.interno.trim() !== '' ? '⚠️ Equipo no encontrado. Se creará uno nuevo.' : 'Esperando interno...')}
              </div>
            </div>
            
            {/* Campos condicionales para nuevo equipo */}
            {!matchedEquipment && newEntry.interno.trim() !== '' && (
              <>
                <div className="md:col-span-1">
                  <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase">Tipo (Nuevo)</label>
                  <input type="text" value={newEntry.tipo} onChange={e => setNewEntry({...newEntry, tipo: e.target.value})} className="w-full bg-amber-50 border border-amber-400 rounded p-2 text-sm font-bold text-slate-950" placeholder="Ej: Excavadora" />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase">Marca (Nuevo)</label>
                  <input type="text" value={newEntry.marca} onChange={e => setNewEntry({...newEntry, marca: e.target.value})} className="w-full bg-amber-50 border border-amber-400 rounded p-2 text-sm font-bold text-slate-950" placeholder="Ej: CAT" />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase">Modelo (Nuevo)</label>
                  <input type="text" value={newEntry.modelo} onChange={e => setNewEntry({...newEntry, modelo: e.target.value})} className="w-full bg-amber-50 border border-amber-400 rounded p-2 text-sm font-bold text-slate-950" placeholder="Ej: 320D" />
                </div>
              </>
            )}

            <div>
              <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase">Obra</label>
              <input type="text" value={newEntry.obra_asignada} onChange={e => setNewEntry({...newEntry, obra_asignada: e.target.value})} className="w-full bg-white border border-slate-400 rounded p-2 text-sm outline-none text-slate-950" placeholder="Obra" />
            </div>
            <div className="md:col-span-1">
              <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase">Fecha Ingreso</label>
              <input type="date" value={newEntry.fecha_ingreso} onChange={e => setNewEntry({...newEntry, fecha_ingreso: e.target.value, actionDate: e.target.value})} className="w-full bg-white border border-slate-400 rounded p-2 text-sm font-bold text-slate-950" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase">Falla / Síntoma</label>
              <input type="text" value={newEntry.informe_fallas} onChange={e => setNewEntry({...newEntry, informe_fallas: e.target.value})} className="w-full bg-white border border-slate-400 rounded p-2 text-sm outline-none text-slate-950" placeholder="Descripción de falla" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase">Primer Paso Taller</label>
              <input type="text" value={newEntry.firstAction} onChange={e => setNewEntry({...newEntry, firstAction: e.target.value})} className="w-full bg-white border border-green-600 rounded p-2 text-sm font-black text-slate-950" placeholder="Ej: Diagnóstico" />
            </div>
            <div className="md:col-span-1">
              <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase">Mecánico</label>
              <input type="text" value={newEntry.responsable} onChange={e => setNewEntry({...newEntry, responsable: e.target.value})} className="w-full bg-white border border-slate-400 rounded p-2 text-sm font-bold text-slate-950" placeholder="Nombre" />
            </div>
            <button 
              onClick={handleAddEntry} 
              disabled={(!matchedEquipment && newEntry.interno.trim() === '') || isProcessing} 
              className="w-full h-[38px] bg-green-600 text-white rounded font-black hover:bg-green-700 shadow-md uppercase disabled:bg-slate-300"
            >
              {isProcessing ? '...' : 'Registrar'}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl shadow-lg border border-slate-200 bg-white">
        <table className="w-full text-left border-collapse min-w-[1200px]">
          <thead className="bg-slate-100 text-slate-700 font-bold text-[10px] uppercase tracking-widest">
            <tr>
              <th className="px-4 py-3 border-r border-slate-200 w-24">Interno</th>
              <th className="px-4 py-3 border-r border-slate-200">Equipo</th>
              <th className="px-4 py-3 border-r border-slate-200">Obra</th>
              <th className="px-4 py-3 border-r border-slate-200 text-center">Ingreso</th>
              <th className="px-4 py-3 border-r border-slate-200">Falla</th>
              <th className="px-4 py-3 border-r border-slate-200">AVANCE</th>
              <th className="px-4 py-3 border-r border-slate-200 text-center">Mecánico</th>
              <th className="px-4 py-3 border-r border-slate-200 text-center">Fecha</th>
              <th className="px-4 py-3 border-r border-slate-200 text-center">Días</th>
              <th className="px-4 py-3 w-12 text-center"></th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-20 text-center text-slate-400 italic">No se encontraron registros de taller.</td>
              </tr>
            ) : (
              filteredEntries.map(entry => {
                const eq = equipment.find(e => e.id === entry.equipo_id);
                const { isOperative, isWaitingParts, isTesting, isInRepair, totalDays, breakdown } = getWorkshopStatus(entry);
                const loss = calculateLoss(totalDays, eq);
                const allActions = entry.acciones_taller || [];
                const actions = allActions.filter(a => a.responsable !== 'Sistema');
                const firstAction = actions[0];
                const isEditingFirst = editingActionId === firstAction?.id;
                const isEditingEntry = editingEntryId === entry.id;
                
                // Usar el helper para verificar si hay reporte
                const hasReport = !!getExistingReport(entry);
                
                const nextActionForFirst = actions[1];
                const firstActionEndDate = nextActionForFirst 
                  ? nextActionForFirst.fecha_accion 
                  : (isOperative ? firstAction?.fecha_accion : today);
                
                const firstActionDuration = firstAction 
                  ? getDiffDays(firstAction.fecha_accion, firstActionEndDate) 
                  : 0;

                const isConfirmation = entry.estado === 'CONFIRMACION';
                const itemFormData = getConfirmationFormData(entry.id);

                return (
                  <React.Fragment key={entry.id}>
                    <tr className={`${isConfirmation ? 'bg-amber-100/70 ring-2 ring-amber-400 border-2 border-amber-500 shadow-md' : (isOperative ? 'bg-green-50/50' : isTesting ? 'bg-violet-50/50' : isWaitingParts ? 'bg-orange-50/50' : 'bg-blue-50/30')} border-t-2 border-slate-200 group transition-all`}>
                      <td className="px-4 py-4 border-r border-slate-200">
                        <div className="font-black text-slate-900 leading-none">{entry.equipo_id}</div>
                        
                        {/* Alerta de Avance Inactivo */}
                        {isStalledEntry(entry) && (
                          <div className="mt-2 bg-red-100/90 text-red-700 p-1.5 rounded-lg border border-red-300 font-extrabold uppercase text-[8px] tracking-wide flex items-center justify-center gap-1 shadow-sm leading-tight animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                            <span>Avance Inactivo ≥ 7 d.</span>
                          </div>
                        )}
                        
                        {/* Maintenance Goal Display */}
                        {(() => {
                          const goal = getGoalStatus(entry.fecha_ingreso, entry.fecha_salida);
                          return (
                            <div 
                              className={`mt-2 p-1.5 rounded border flex flex-col items-center justify-center cursor-help transition-all hover:shadow-md ${goal.bgColor} ${goal.color.replace('text-', 'border-')}`}
                              title={`Objetivo de estadía: ${MAINTENANCE_GOAL} días. Se calcula desde la fecha de ingreso.`}
                            >
                              <span className="text-[8px] font-black uppercase opacity-60">Objetivo {MAINTENANCE_GOAL}d</span>
                              <span className={`text-[10px] font-black leading-none ${goal.color}`}>
                                {goal.remaining} {goal.label}
                              </span>
                            </div>
                          );
                        })()}

                        <div className="mt-2 flex flex-col gap-1">
                          <div className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tight shadow-sm ${isOperative ? 'bg-green-600 text-white' : (isTesting ? 'bg-violet-600 text-white' : (isWaitingParts ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white'))}`}>
                            {totalDays} d. Total
                          </div>
                          {/* Desglose de estadía con acumulación en vivo */}
                          <div className="flex flex-col gap-0.5 mt-1">
                            {breakdown.repairDays > 0 && <div className="text-[8px] font-bold text-blue-600 uppercase">Rep: {breakdown.repairDays}d</div>}
                            {breakdown.partsDays > 0 && <div className="text-[8px] font-bold text-orange-600 uppercase">Comp: {breakdown.partsDays}d</div>}
                            {breakdown.testingDays > 0 && <div className="text-[8px] font-bold text-violet-600 uppercase">Pru: {breakdown.testingDays}d</div>}
                          </div>
                          <div 
                            title="Impacto económico estimado por la inactividad del equipo" 
                            className="text-[12px] font-black text-red-600 uppercase tracking-tighter cursor-help"
                          >
                            {formatCurrencyAbbr(loss)}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 border-r border-slate-200">
                        <div className="font-bold text-slate-800 leading-tight">{eq?.marca || 'N/A'} {eq?.modelo || ''}</div>
                        <div className="text-[9px] text-slate-400 uppercase font-black">{eq?.tipo || 'Desconocido'}</div>
                        <div className="text-[10px] text-slate-600 mt-1">Hs/Km de arrastre: {eq?.horas?.toLocaleString('de-DE') || '0'}</div>
                        <div className="text-[10px] text-slate-600">Año: {eq?.year || 'N/D'}</div>
                      </td>
                      <td className="px-4 py-4 border-r border-slate-200">
                        {isEditingEntry ? <input type="text" value={editEntryData.obra_asignada} onChange={e => setEditEntryData({...editEntryData, obra_asignada: e.target.value})} className={editInputClass} /> : <div className="font-bold text-slate-600">{entry.obra_asignada || 'N/A'}</div>}
                      </td>
                      <td className="px-4 py-4 border-r border-slate-200 text-center font-mono font-bold text-slate-500">
                        {isEditingEntry ? <input type="date" value={editEntryData.fecha_ingreso} onChange={e => setEditEntryData({...editEntryData, fecha_ingreso: e.target.value})} className={editInputClass} /> : formatDateDisplay(entry.fecha_ingreso)}
                      </td>
                      <td className="px-4 py-4 border-r border-slate-200 italic text-slate-600">
                        {isEditingEntry ? <input type="text" value={editEntryData.informe_fallas} onChange={e => setEditEntryData({...editEntryData, informe_fallas: e.target.value})} className={editInputClass} /> : entry.informe_fallas}
                      </td>
                      <td className="px-4 py-4 border-r border-slate-200">
                        {isEditingFirst && firstAction ? (
                          <input type="text" value={editActionData.descripcion} onChange={e => setEditActionData({...editActionData, descripcion: e.target.value})} className={editInputClass} />
                        ) : firstAction ? (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-slate-800 font-normal">{firstAction.descripcion}</span>
                            <div className="flex gap-1">
                              {isOperative && <span className="px-1.5 py-0.5 bg-green-200 text-green-800 text-[8px] font-black rounded uppercase shadow-sm">Operativo</span>}
                              {isTesting && <span className="px-1.5 py-0.5 bg-violet-200 text-violet-800 text-[8px] font-black rounded uppercase flex items-center gap-1 shadow-sm">En Prueba</span>}
                              {isWaitingParts && <span className="px-1.5 py-0.5 bg-orange-200 text-orange-800 text-[8px] font-black rounded uppercase flex items-center gap-1 shadow-sm">Esperando Repuestos</span>}
                              {isConfirmation && <span className="px-1.5 py-0.5 bg-amber-500 text-white text-[8px] font-black rounded uppercase flex items-center gap-1 shadow-sm animate-pulse">Confirmación: Repuestos Recibidos</span>}
                              {isInRepair && <span className="px-1.5 py-0.5 bg-blue-200 text-blue-800 text-[8px] font-black rounded uppercase flex items-center gap-1 shadow-sm">EN REPARACIÓN</span>}
                            </div>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-4 border-r border-slate-200 text-center text-slate-600">
                        {isEditingFirst && firstAction ? <input type="text" value={editActionData.responsable} onChange={e => setEditActionData({...editActionData, responsable: e.target.value})} className={editInputClass} /> : firstAction?.responsable}
                      </td>
                      <td className="px-4 py-4 border-r border-slate-200 text-center font-mono font-bold text-slate-500">
                        {isEditingFirst && firstAction ? <input type="date" value={editActionData.fecha_accion} onChange={e => setEditActionData({...editActionData, fecha_accion: e.target.value})} className={editInputClass} /> : formatDateDisplay(firstAction?.fecha_accion)}
                      </td>
                      <td className="px-4 py-4 border-r border-slate-200 text-center font-black text-slate-700 bg-slate-50/50">{firstActionDuration}d</td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <button 
                            onClick={() => exportEquipmentInterventionsPDF(entry, equipment)} 
                            className="p-1.5 text-slate-400 hover:text-green-700 hover:bg-green-50 rounded-lg transition-all"
                            title="Carpeta de Arrastre"
                          >
                            <FolderDown className="w-5 h-5 text-green-700" />
                          </button>

                          {isEditingFirst || isEditingEntry ? (
                            <button onClick={async () => { 
                              if(isEditingFirst) await handleSaveEditAction(); 
                              if(isEditingEntry) await handleSaveEditEntry(entry.id); 
                            }} className="text-green-600 hover:bg-green-50 p-1 rounded transition-colors"><Check className="w-5 h-5" /></button>
                          ) : (
                            <div className="flex gap-1">
                              <button onClick={() => { 
                                setEditingEntryId(entry.id); 
                                setEditingActionId(firstAction?.id || null); 
                                setEditEntryData({ 
                                  obra_asignada: entry.obra_asignada || '', 
                                  informe_fallas: entry.informe_fallas, 
                                  fecha_ingreso: entry.fecha_ingreso
                                }); 
                                if(firstAction) setEditActionData({ descripcion: firstAction.descripcion, responsable: firstAction.responsable, fecha_accion: firstAction.fecha_accion }); 
                              }} className="text-slate-400 hover:text-green-700 opacity-0 group-hover:opacity-100 transition-all p-1"><Edit2 className="w-4 h-4" /></button>
                              <button onClick={() => setDeleteConfirmId(entry.id)} className="text-slate-200 hover:text-red-500 transition-all p-1"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>

                    {actions.slice(1).map((action, idx) => {
                      const isEditing = editingActionId === action.id;
                      const nextAction = actions[idx + 2];
                      const endDate = nextAction 
                        ? nextAction.fecha_accion 
                        : (isOperative ? action.fecha_accion : today);
                      
                      const duration = getDiffDays(action.fecha_accion, endDate);

                      return (
                        <tr key={action.id} className="bg-white border-b border-slate-50 hover:bg-slate-50 group/row transition-colors">
                          <td colSpan={6} className="border-r border-slate-100"></td>
                          <td className="px-4 py-2 border-r border-slate-200">
                            {isEditing ? <input type="text" value={editActionData.descripcion} onChange={e => setEditActionData({...editActionData, descripcion: e.target.value})} className={editInputClass} /> : <span className="text-slate-700 font-medium">{action.descripcion}</span>}
                          </td>
                          <td className="px-4 py-2 border-r border-slate-200 text-center text-slate-500">
                            {isEditing ? <input type="text" value={editActionData.responsable} onChange={e => setEditActionData({...editActionData, responsable: e.target.value})} className={editInputClass} /> : action.responsable}
                          </td>
                          <td className="px-4 py-2 border-r border-slate-200 text-center font-mono text-[11px] font-bold text-slate-400">
                            {isEditing ? <input type="date" value={editActionData.fecha_accion} onChange={e => setEditActionData({...editActionData, fecha_accion: e.target.value})} className={editInputClass} /> : formatDateDisplay(action.fecha_accion)}
                          </td>
                          <td className="px-4 py-2 border-r border-slate-200 text-center text-slate-700 bg-slate-50/30 font-bold">{duration}d</td>
                          <td className="px-4 py-2 text-center">
                            {isEditing ? <button onClick={handleSaveEditAction} className="text-green-600"><Check className="w-5 h-5" /></button> : <button onClick={() => { setEditingActionId(action.id); setEditActionData({ descripcion: action.descripcion, responsable: action.responsable, fecha_accion: action.fecha_accion }); }} className="text-slate-700 hover:text-green-600 opacity-0 group-hover/row:opacity-100"><Edit2 className="w-6 h-6" /></button>}
                          </td>
                        </tr>
                      );
                    })}

                    <tr className="bg-white">
                      <td colSpan={6} className="border-r border-slate-100"></td>
                      <td colSpan={5} className="px-4 py-3 border-b border-slate-200">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-start gap-2 group/comment">
                            <MessageSquare className="w-4 h-4 text-slate-300 mt-1" />
                            {editingCommentId === entry.id ? (
                              <div className="flex-1 flex gap-2">
                                <textarea autoFocus value={tempComment} onChange={e => setTempComment(e.target.value)} className="flex-1 text-xs border-2 border-green-600 rounded p-2 outline-none italic bg-white text-slate-950 font-bold" rows={2} />
                                <button onClick={async () => { await supabase.from('ingresos_taller').update({ observaciones: tempComment }).eq('id', entry.id); setEditingCommentId(null); refreshData(); }} className="bg-green-600 text-white p-2 rounded self-start"><Check className="w-4 h-4" /></button>
                              </div>
                            ) : (
                              <div className="flex-1 flex justify-between items-start">
                                <p className="text-xs text-slate-500 italic"><span className="font-black text-[10px] uppercase not-italic mr-2">Observaciones:</span>{entry.observaciones || 'Sin notas.'}</p>
                                <button onClick={() => { setEditingCommentId(entry.id); setTempComment(entry.observaciones || ''); }} className="text-slate-700 hover:text-green-600 opacity-0 group-hover/comment:opacity-100 transition-all"><Edit2 className="w-6 h-6" /></button>
                              </div>
                            )}
                          </div>
                          {isConfirmation ? (
                            <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 p-4 rounded-2xl border-2 border-amber-500 shadow-xl animate-in zoom-in-95 duration-200">
                              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-amber-200 mb-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="p-2 bg-amber-500 text-white rounded-xl shadow-md">
                                    <PackageCheck className="w-5 h-5 animate-bounce" />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-amber-200 text-amber-900 tracking-wider">
                                        Estado: Confirmación
                                      </span>
                                      <span className="text-xs font-black text-slate-900 uppercase tracking-tight">
                                        REPUESTOS ENTREGADOS EN TALLER
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                                      Este equipo está en <strong className="text-amber-800 font-black">CONFIRMACIÓN</strong> (repuestos recibidos). Al confirmar, pasará al estado <strong className="text-blue-700 uppercase font-black">"En Reparación"</strong>.
                                    </p>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => handleCancelConfirmation(entry)}
                                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition-colors self-end sm:self-center"
                                  title="Volver a Esperando Repuestos"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-3">
                                <div>
                                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide mb-1">
                                    Fecha de Entrega
                                  </label>
                                  <input 
                                    type="date"
                                    value={itemFormData.date}
                                    onChange={(e) => updateConfirmFormData(entry.id, 'date', e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-400"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide mb-1">
                                    Receptor / Mecánico
                                  </label>
                                  <input 
                                    type="text"
                                    value={itemFormData.responsable}
                                    onChange={(e) => updateConfirmFormData(entry.id, 'responsable', e.target.value)}
                                    placeholder="Taller / Depósito"
                                    className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-400"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide mb-1">
                                    Detalle de Repuestos
                                  </label>
                                  <input 
                                    type="text"
                                    value={itemFormData.note}
                                    onChange={(e) => updateConfirmFormData(entry.id, 'note', e.target.value)}
                                    placeholder="Detalle de piezas recibidas..."
                                    className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-400"
                                  />
                                </div>
                              </div>

                              <div className="flex justify-end gap-2 pt-2 border-t border-amber-200">
                                <button 
                                  onClick={() => handleCancelConfirmation(entry)}
                                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold transition-all border border-slate-200"
                                  disabled={isProcessing}
                                >
                                  Volver a Esperando Repuestos
                                </button>
                                <button 
                                  onClick={() => handleConfirmPartsReceived(entry)}
                                  disabled={isProcessing}
                                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-emerald-950/20 flex items-center gap-1.5 disabled:bg-slate-300"
                                >
                                  {isProcessing ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      <span>Guardando...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Check className="w-4 h-4" />
                                      <span>Confirmar y Pasar a En Reparación</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <button 
                                onClick={() => {
                                  resetActionForm();
                                  setSelectedEntryId(entry.id);
                                }} 
                                className="flex items-center gap-1.5 text-[10px] font-black text-green-700 hover:bg-green-700 hover:text-white px-4 py-2 rounded-full border-2 border-green-200 transition-all uppercase tracking-widest w-fit shadow-sm"
                              >
                                <Plus className="w-3 h-3" /> Añadir Avance
                              </button>
                              
                              <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-full border border-slate-200 shadow-inner">
                                <button 
                                  onClick={() => handlePartsClick(entry)}
                                  disabled={isProcessing}
                                  className={`p-1.5 rounded-full transition-all flex items-center gap-1.5 px-3 font-bold ${
                                    isWaitingParts 
                                      ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md ring-2 ring-amber-300 animate-pulse' 
                                      : 'text-slate-400 hover:text-orange-600 hover:bg-orange-50'
                                  }`}
                                  title={isWaitingParts ? "Repuestos recibidos: Click para advertir y pasar a En Reparación" : "Pasar a Esperando Repuestos/Terceros"}
                                >
                                  {isWaitingParts ? <PackageCheck className="w-3.5 h-3.5" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                                  <span className="text-[9px] font-black uppercase tracking-tighter">
                                    {isWaitingParts ? 'RECIBIDO' : 'Repuestos'}
                                  </span>
                                </button>

                                <button 
                                  onClick={() => handleStatusChange(entry, isTesting ? 'REPARACION' : 'PRUEBA')}
                                  disabled={isProcessing}
                                  className={`p-1.5 rounded-full transition-all flex items-center gap-1.5 px-3 ${isTesting ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-violet-600 hover:bg-violet-50'}`}
                                  title={isTesting ? "Finalizar Prueba y volver a Reparación" : "Enviar a Prueba"}
                                >
                                  <Activity className="w-3.5 h-3.5" />
                                  <span className="text-[9px] font-black uppercase tracking-tighter">
                                    {isTesting ? 'Finalizar Prueba' : 'Prueba'}
                                  </span>
                                </button>

                                <button 
                                  onClick={() => handleOperativeClick(entry)}
                                  disabled={isProcessing}
                                  className={`p-1.5 rounded-full transition-all flex items-center gap-1.5 px-3 text-slate-400 hover:text-green-600 hover:bg-green-50`}
                                  title="Operativo"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span className="text-[9px] font-black uppercase tracking-tighter">Operativo</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full border border-slate-200 shadow-2xl text-center">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6"><AlertTriangle className="w-10 h-10" /></div>
            <h3 className="text-xl font-black text-slate-800 mb-2">¿Eliminar registro?</h3>
            <p className="text-sm text-slate-500 mb-8">Borrarás este ingreso y todo su historial de la base de datos.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm">Cancelar</button>
              <button onClick={confirmDeleteEntry} disabled={isProcessing} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-sm shadow-lg disabled:bg-slate-300">{isProcessing ? '...' : 'Eliminar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Editar Fecha al pasar a Operativo */}
      {showOperativeModal && operativeModalEntry && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 text-green-700 rounded-2xl flex items-center justify-center shadow-inner">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Pase a Operativo</h3>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Interno: <span className="text-slate-700">{operativeModalEntry.equipo_id}</span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowOperativeModal(false);
                  setOperativeModalEntry(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Info equipo */}
            {(() => {
              const eq = equipment.find(e => e.id === operativeModalEntry.equipo_id);
              return (
                <div className="my-4 p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
                  <div className="font-bold text-slate-800">{eq?.marca || ''} {eq?.modelo || ''}</div>
                  <div className="text-[10px] text-slate-500 font-semibold uppercase">{eq?.tipo || 'Equipo'} • Ingreso: {formatDateDisplay(operativeModalEntry.fecha_ingreso)}</div>
                </div>
              );
            })()}

            {/* Body */}
            <div className="space-y-4">
              {/* Clave de Autorización */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-slate-400" />
                    Clave de Autorización
                  </label>
                  {isDateUnlocked ? (
                    <span className="text-[9.5px] font-black text-green-600 uppercase flex items-center gap-1 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                      <Unlock className="w-3 h-3" /> Desbloqueado
                    </span>
                  ) : (
                    <span className="text-[9.5px] font-bold text-slate-400 uppercase flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full">
                      <Lock className="w-3 h-3" /> Bloqueado
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={operativeAuthKey}
                    onChange={(e) => {
                      setOperativeAuthKey(e.target.value);
                      if (operativeError) setOperativeError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleValidateKey();
                      }
                    }}
                    placeholder="Ingrese clave de autorización"
                    className={`flex-1 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all outline-none ${
                      isDateUnlocked
                        ? 'border-green-500 ring-2 ring-green-100 bg-green-50/20 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-800 focus:border-slate-400'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handleValidateKey}
                    className={`px-3.5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm ${
                      isDateUnlocked
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-slate-800 hover:bg-slate-900 text-white cursor-pointer'
                    }`}
                  >
                    {isDateUnlocked ? (
                      <>
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Desbloqueado</span>
                      </>
                    ) : (
                      <>
                        <Key className="w-3.5 h-3.5" />
                        <span>Desbloquear</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 italic">
                  * Ingrese la clave y presione <strong>Desbloquear</strong> para habilitar la edición de la fecha de salida. Por defecto se asigna la fecha actual.
                </p>
              </div>

              {/* Fecha de Salida */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Fecha de Salida (Operativo)
                </label>
                <div className="relative">
                  <input 
                    type="date"
                    disabled={!isDateUnlocked}
                    value={operativeExitDate}
                    onChange={(e) => {
                      setOperativeExitDate(e.target.value);
                      if (operativeError) setOperativeError(null);
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl border text-xs font-bold transition-all outline-none ${
                      isDateUnlocked
                        ? 'border-green-500 bg-white text-slate-900 focus:ring-2 focus:ring-green-200 cursor-pointer shadow-sm'
                        : 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed select-none'
                    }`}
                  />
                  {!isDateUnlocked && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" title="Bloqueado. Ingrese clave de autorización para editar">
                      <Lock className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </div>

              {operativeError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-600 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{operativeError}</span>
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100">
              <button 
                type="button"
                onClick={() => {
                  setShowOperativeModal(false);
                  setOperativeModalEntry(null);
                }}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs uppercase tracking-wider transition-all"
                disabled={isProcessing}
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handleConfirmOperative}
                disabled={isProcessing}
                className="flex-1 py-3 bg-[#008000] hover:bg-green-700 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-950/20 disabled:bg-slate-300"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Pasar a Operativo</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal / PopUp de Añadir Avance (Tipo de Avance) */}
      {selectedEntryId && (() => {
        const selectedEntry = entries.find(e => e.id === selectedEntryId);
        const selectedEq = equipment.find(e => e.id === selectedEntry?.equipo_id);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 text-green-700 rounded-xl">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">
                      Añadir Avance de Taller
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Equipo: <strong className="text-slate-800 font-mono">{selectedEntry?.equipo_id}</strong>
                      {selectedEq ? ` (${selectedEq.tipo} ${selectedEq.marca} ${selectedEq.modelo})` : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetActionForm}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
                  title="Cerrar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-5">
                {/* Selector de camino / Tipo de Avance */}
                <div>
                  <label className="block text-[11px] font-black uppercase text-slate-500 tracking-wider mb-2">
                    Seleccione el Tipo de Avance:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* Opción 1: Pedido de repuestos */}
                    <button
                      type="button"
                      onClick={() => setActionCategory('pedido')}
                      className={`p-3 rounded-xl border-2 text-left transition-all flex flex-col gap-1 ${
                        actionCategory === 'pedido'
                          ? 'border-amber-500 bg-amber-50/70 shadow-md ring-2 ring-amber-200'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${actionCategory === 'pedido' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          <ShoppingCart className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-black text-slate-800">Pedido de repuestos</span>
                      </div>
                      <span className="text-[10px] text-amber-700 font-bold mt-1">
                        → Estado: ESPERANDO REPUESTOS
                      </span>
                    </button>

                    {/* Opción 2: SOTT */}
                    <button
                      type="button"
                      onClick={() => setActionCategory('sott')}
                      className={`p-3 rounded-xl border-2 text-left transition-all flex flex-col gap-1 ${
                        actionCategory === 'sott'
                          ? 'border-indigo-500 bg-indigo-50/70 shadow-md ring-2 ring-indigo-200'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${actionCategory === 'sott' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          <Wrench className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-black text-slate-800">SOTT</span>
                      </div>
                      <span className="text-[10px] text-indigo-700 font-bold mt-1">
                        → Estado: ESPERANDO REPUESTOS
                      </span>
                    </button>

                    {/* Opción 3: Avance Diario */}
                    <button
                      type="button"
                      onClick={() => setActionCategory('reparacion')}
                      className={`p-3 rounded-xl border-2 text-left transition-all flex flex-col gap-1 ${
                        actionCategory === 'reparacion'
                          ? 'border-emerald-500 bg-emerald-50/70 shadow-md ring-2 ring-emerald-200'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${actionCategory === 'reparacion' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          <Check className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-black text-slate-800">Avance Diario</span>
                      </div>
                      <span className="text-[10px] text-emerald-700 font-bold mt-1">
                        → Conserva estado actual
                      </span>
                    </button>
                  </div>
                </div>

                {/* Formulario según categoría seleccionada */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3.5">
                  {actionCategory === 'pedido' && (
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                          N° de RC: <span className="text-red-500">*</span>
                        </label>
                        <input
                          autoFocus
                          type="text"
                          value={rcNumber}
                          onChange={e => setRcNumber(e.target.value)}
                          placeholder="Ej: 1234"
                          className="w-full text-xs p-2.5 rounded-lg border-2 border-slate-300 font-bold bg-white text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                        />
                      </div>
                      <div className="sm:col-span-8">
                        <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                          Compartimiento(s): <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={compartimientos}
                          onChange={e => setCompartimientos(e.target.value)}
                          placeholder="Ej: motor, transmisión, sist. eléctrico..."
                          className="w-full text-xs p-2.5 rounded-lg border-2 border-slate-300 font-bold bg-white text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                        />
                      </div>
                    </div>
                  )}

                  {actionCategory === 'sott' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                          Componente: <span className="text-red-500">*</span>
                        </label>
                        <input
                          autoFocus
                          type="text"
                          value={sottComponente}
                          onChange={e => setSottComponente(e.target.value)}
                          placeholder="Ej: Bomba hidráulica, Cilindro de levante..."
                          className="w-full text-xs p-2.5 rounded-lg border-2 border-slate-300 font-bold bg-white text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                          Proveedor: <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={sottProveedor}
                          onChange={e => setSottProveedor(e.target.value)}
                          placeholder="Ej: Finning, Turbos del Sur..."
                          className="w-full text-xs p-2.5 rounded-lg border-2 border-slate-300 font-bold bg-white text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                        />
                      </div>
                    </div>
                  )}

                  {actionCategory === 'reparacion' && (
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                        Descripción de Avance Diario: <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        autoFocus
                        rows={3}
                        value={newActionText}
                        onChange={e => setNewActionText(e.target.value)}
                        placeholder="Describa el trabajo o avance realizado en el equipo..."
                        className="w-full text-xs p-2.5 rounded-lg border-2 border-slate-300 font-bold bg-white text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                      />
                    </div>
                  )}

                  {/* Responsable y Fecha */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-200/60">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                        Mecánico / Responsable:
                      </label>
                      <input
                        type="text"
                        value={newActionResponsable}
                        onChange={e => setNewActionResponsable(e.target.value)}
                        placeholder="Ej: Juan Pérez / Taller"
                        className="w-full text-xs p-2.5 rounded-lg border-2 border-slate-300 font-bold bg-white text-slate-900 outline-none focus:border-slate-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                        Fecha del Avance:
                      </label>
                      <input
                        type="date"
                        value={newActionDate}
                        onChange={e => setNewActionDate(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-lg border-2 border-slate-300 font-bold bg-white text-slate-900 outline-none focus:border-slate-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Previsualización del texto final */}
                <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/80 text-xs">
                  <span className="font-black text-amber-900 uppercase text-[10px] tracking-wider block mb-1">
                    Vista previa de la acción que se registrará:
                  </span>
                  <div className="font-mono text-slate-800 font-semibold bg-white p-2 rounded-lg border border-amber-200">
                    {actionCategory === 'pedido' && `Pedido de repuestos RC: ${rcNumber.trim() || '[RC]'} ${compartimientos.trim() || '[Compartimiento(s)]'}`}
                    {actionCategory === 'sott' && `SOTT ${sottComponente.trim() || '[Componente]'} ${sottProveedor.trim() || '[Proveedor]'}`}
                    {actionCategory === 'reparacion' && (newActionText.trim() ? (newActionText.toLowerCase().startsWith('avance') ? newActionText.trim() : `Avance: ${newActionText.trim()}`) : 'Avance: [Descripción del avance]')}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2.5 px-6 py-4 bg-slate-50 border-t border-slate-200">
                <button
                  type="button"
                  onClick={resetActionForm}
                  disabled={isProcessing}
                  className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold border border-slate-300 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleAddAction(selectedEntryId)}
                  disabled={isProcessing}
                  className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center gap-2 disabled:bg-slate-300"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Guardar Avance</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default TrackingView;
