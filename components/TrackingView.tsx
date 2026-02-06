
import React, { useState, useMemo } from 'react';
import { MaintenanceEntry, Equipment, MaintenanceAction } from '../types';
import { Plus, Search, Calendar, Save, Trash2, ArrowRight, FileText, User, Clock, AlertTriangle, X, Edit2, Check, Wrench, MessageSquare, Activity, MapPin, Filter } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../supabase';

interface TrackingViewProps {
  entries: MaintenanceEntry[];
  refreshData: () => Promise<void>;
  equipment: Equipment[];
}

const TrackingView: React.FC<TrackingViewProps> = ({ entries, refreshData, equipment }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'repair' | 'parts' | 'operative'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  const today = new Date().toLocaleDateString('en-CA'); 
  
  const [newEntry, setNewEntry] = useState({
    interno: '',
    fecha_ingreso: today,
    obra_asignada: '',
    informe_fallas: '',
    firstAction: '',
    responsable: '',
    actionDate: today,
    observaciones: ''
  });

  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
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

  const getWorkshopStatus = (entry: MaintenanceEntry) => {
    const actions = entry.acciones_taller || [];
    if (actions.length === 0) return { isOperative: false, isWaitingParts: false, isInRepair: true, totalDays: 0 };

    const lastAction = actions[actions.length - 1];
    const desc = lastAction?.descripcion?.toLowerCase() || '';
    
    const isForcedRepair = desc.includes('entrega');
    const isOperative = !isForcedRepair && desc.includes('operativo');
    const isWaitingParts = !isOperative && !isForcedRepair && repuestoKeywords.some(kw => desc.includes(kw));
    const isInRepair = !isOperative && !isWaitingParts;

    const endDateStr = isOperative ? lastAction.fecha_accion : today;
    const totalDays = getDiffDays(entry.fecha_ingreso, endDateStr);

    return { isOperative, isWaitingParts, isInRepair, endDate: endDateStr, totalDays };
  };

  const filteredEntries = useMemo(() => {
    let result = entries || [];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(entry => {
        const eq = equipment.find(e => e.id === entry.equipo_id);
        return (
          entry.equipo_id?.toLowerCase().includes(term) ||
          entry.informe_fallas?.toLowerCase().includes(term) ||
          (entry.obra_asignada || '').toLowerCase().includes(term) ||
          eq?.tipo?.toLowerCase().includes(term) ||
          eq?.marca?.toLowerCase().includes(term)
        );
      });
    }

    if (statusFilter !== 'all') {
      result = result.filter(entry => {
        const { isOperative, isWaitingParts, isInRepair } = getWorkshopStatus(entry);
        if (statusFilter === 'operative') return isOperative;
        if (statusFilter === 'parts') return isWaitingParts;
        if (statusFilter === 'repair') return isInRepair;
        return true;
      });
    }

    return result;
  }, [entries, searchTerm, statusFilter, equipment]);

  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    const todayStr = new Date().toLocaleDateString('en-CA');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text('Reporte de Historial de Taller - GEyT', 14, 20);
    
    let startY = 35;
    let totalLossAll = 0;
    let totalStayDaysAll = 0;
    let currentlyInWorkshopCount = 0;
    let operativeCount = 0;

    filteredEntries.forEach((entry, index) => {
      const eq = equipment.find(e => e.id === entry.equipo_id);
      const { isOperative, isWaitingParts, totalDays } = getWorkshopStatus(entry);
      const loss = calculateLoss(totalDays, eq);
      totalLossAll += loss;
      totalStayDaysAll += totalDays;
      if (isOperative) operativeCount++; else currentlyInWorkshopCount++;

      let headerBg = [219, 234, 254]; 
      if (isOperative) headerBg = [220, 252, 231]; 
      else if (isWaitingParts) headerBg = [255, 237, 213]; 

      doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
      doc.rect(14, startY, 269, 22, 'F');
      doc.setDrawColor(200, 200, 200);
      doc.rect(14, startY, 269, 22, 'S');
      
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      
      const statusLabel = isOperative ? 'OPERATIVO' : (isWaitingParts ? 'EN TALLER (ESPERA REPUESTOS)' : 'EN REPARACIÓN');
      const headerText = `INTERNO: ${entry.equipo_id} | TIPO: ${eq?.tipo || 'N/A'} | MARCA: ${eq?.marca || ''} ${eq?.modelo || ''} | OBRA: ${entry.obra_asignada || 'N/A'} | HS: ${eq?.horas?.toLocaleString('de-DE') || '0'}`;
      doc.text(headerText, 18, startY + 7);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(`INGRESO: ${formatDateDisplay(entry.fecha_ingreso)} | ESTADO ACTUAL: ${statusLabel} | ESTADÍA TOTAL ACUMULADA: ${totalDays} días`, 18, startY + 13);
      
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(153, 27, 27); 
      doc.text(`PÉRDIDA DE FACTURACIÓN ESTIMADA: ${formatCurrencyAbbr(loss)}`, 18, startY + 18);
      
      startY += 28;

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('INFORME DE FALLAS:', 14, startY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      const prelimText = entry.informe_fallas || 'Sin información registrada.';
      const splitPrelim = doc.splitTextToSize(prelimText, 260);
      doc.text(splitPrelim, 14, startY + 5);
      
      startY += (splitPrelim.length * 5) + 6;

      const actions = entry.acciones_taller || [];
      const tableData: any[] = actions.map((action, idx) => {
        const prevDate = idx === 0 ? entry.fecha_ingreso : actions[idx - 1].fecha_accion;
        const isLast = idx === actions.length - 1;
        const endDateForAction = (isLast && !isOperative) ? todayStr : action.fecha_accion;
        const actionDuration = getDiffDays(prevDate, endDateForAction);

        return [
          formatDateDisplay(action.fecha_accion),
          action.descripcion,
          action.responsable || '-',
          `${actionDuration} d.`,
          `${getDiffDays(entry.fecha_ingreso, endDateForAction)} d.`
        ];
      });

      tableData.push([
        { 
          content: `OBSERVACIONES DEL EQUIPO: ${entry.observaciones || 'Sin notas adicionales.'}`, 
          colSpan: 5, 
          styles: { 
            fontStyle: 'italic', 
            fillColor: [248, 250, 252], 
            textColor: [100, 116, 139],
            fontSize: 7
          } 
        }
      ]);

      autoTable(doc, {
        startY: startY,
        head: [['Fecha', 'Acción Realizada', 'Responsable', 'Duración Etapa', 'Estadía Acum.']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [51, 65, 85], fontSize: 7.5 },
        styles: { fontSize: 7.5, cellPadding: 2 }
      });

      startY = (doc as any).lastAutoTable.finalY + 8;
      if (startY > 165 && index < filteredEntries.length - 1) {
        doc.addPage();
        startY = 20;
      }
    });

    doc.addPage();
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('RESUMEN DE GESTIÓN Y KPI DE FLOTA', 14, 25);
    
    const avgStay = entries.length > 0 ? (totalStayDaysAll / entries.length).toFixed(2) : "0.00";
    autoTable(doc, {
      startY: 40,
      head: [['Indicador', 'Valor']],
      body: [
        ['Equipos en taller hoy', currentlyInWorkshopCount],
        ['Equipos operativos', operativeCount],
        ['Estadía promedio', `${avgStay} d.`],
        ['Pérdida facturación total', formatCurrencyAbbr(totalLossAll)],
      ],
      theme: 'striped',
      headStyles: { fillColor: [21, 128, 61], fontSize: 11 },
      bodyStyles: { fontSize: 11, cellPadding: 6 }
    });

    let fileName = `Informe_Taller_${todayStr}`;
    if (statusFilter !== 'all') {
      const filterSuffix = statusFilter === 'repair' ? 'EN_REPARACION' : 
                           statusFilter === 'parts' ? 'ESPERANDO_REPUESTOS' : 
                           'OPERATIVO';
      fileName += `_${filterSuffix}`;
    }
    doc.save(`${fileName}.pdf`);
  };

  const matchedEquipment = useMemo(() => {
    const searchId = newEntry.interno.trim().toLowerCase();
    if (!searchId) return null;
    return equipment.find(e => e.id.toLowerCase() === searchId);
  }, [newEntry.interno, equipment]);

  const handleAddEntry = async () => {
    if (!matchedEquipment || !newEntry.firstAction.trim()) return;
    setIsProcessing(true);
    try {
      const { data: entData, error: entError } = await supabase
        .from('ingresos_taller')
        .insert([{
          equipo_id: matchedEquipment.id,
          fecha_ingreso: newEntry.fecha_ingreso,
          obra_asignada: newEntry.obra_asignada,
          informe_fallas: newEntry.informe_fallas,
          observaciones: newEntry.observaciones
        }])
        .select();

      if (entError) throw entError;

      const { error: actError } = await supabase
        .from('acciones_taller')
        .insert([{
          ingreso_id: entData[0].id,
          descripcion: newEntry.firstAction,
          fecha_accion: newEntry.actionDate,
          responsable: newEntry.responsable || 'Taller'
        }]);

      if (actError) throw actError;

      await refreshData();
      setNewEntry({
        interno: '', fecha_ingreso: today, obra_asignada: '', informe_fallas: '',
        firstAction: '', responsable: '', actionDate: today, observaciones: ''
      });
      setShowAddForm(false);
    } catch (e) {
      alert("Error registrando ingreso: " + (e as any).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddAction = async (entryId: string) => {
    if (!newActionText.trim()) return;
    setIsProcessing(true);
    try {
      const { error } = await supabase.from('acciones_taller').insert([{
        ingreso_id: entryId,
        descripcion: newActionText,
        fecha_accion: newActionDate,
        responsable: newActionResponsable || 'Taller'
      }]);
      if (error) throw error;
      await refreshData();
      setNewActionText(''); setNewActionResponsable(''); setSelectedEntryId(null);
    } catch (e) {
      alert("Error guardando avance: " + (e as any).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveEditEntry = async (entryId: string) => {
    setIsProcessing(true);
    try {
      const { error } = await supabase.from('ingresos_taller').update(editEntryData).eq('id', entryId);
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
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select 
              className="bg-transparent outline-none py-2 pr-2 text-slate-700 font-bold"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="all">TODOS LOS ESTADOS</option>
              <option value="repair">EN REPARACIÓN</option>
              <option value="parts">ESPERANDO REPUESTOS</option>
              <option value="operative">OPERATIVO</option>
            </select>
          </div>
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
              <input type="text" value={newEntry.interno} onChange={e => setNewEntry({...newEntry, interno: e.target.value.toUpperCase()})} className="w-full bg-white border border-slate-400 rounded p-2 text-sm font-bold uppercase text-slate-950" placeholder="E-000" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase">Validación Equipo</label>
              <div className="bg-slate-50 border border-slate-100 rounded p-2 text-sm h-[38px] flex items-center text-slate-700 italic font-medium">
                {matchedEquipment ? `${matchedEquipment.tipo} | ${matchedEquipment.marca}` : 'Interno no encontrado...'}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase">Obra</label>
              <input type="text" value={newEntry.obra_asignada} onChange={e => setNewEntry({...newEntry, obra_asignada: e.target.value})} className="w-full bg-white border border-slate-400 rounded p-2 text-sm outline-none text-slate-950" placeholder="Obra" />
            </div>
            <div className="md:col-span-2">
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
            <div>
              <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase">Mecánico</label>
              <input type="text" value={newEntry.responsable} onChange={e => setNewEntry({...newEntry, responsable: e.target.value})} className="w-full bg-white border border-slate-400 rounded p-2 text-sm font-bold text-slate-950" placeholder="Nombre" />
            </div>
            <button onClick={handleAddEntry} disabled={!matchedEquipment || isProcessing} className="w-full h-[38px] bg-green-600 text-white rounded font-black hover:bg-green-700 shadow-md uppercase disabled:bg-slate-300">
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
                const { isOperative, isWaitingParts, totalDays } = getWorkshopStatus(entry);
                const loss = calculateLoss(totalDays, eq);
                const actions = entry.acciones_taller || [];
                const firstAction = actions[0];
                const isEditingFirst = editingActionId === firstAction?.id;
                const isEditingEntry = editingEntryId === entry.id;
                const firstActionDuration = actions.length > 0 ? getDiffDays(entry.fecha_ingreso, actions.length === 1 && !isOperative ? today : firstAction.fecha_accion) : 0;

                return (
                  <React.Fragment key={entry.id}>
                    <tr className={`${isOperative ? 'bg-green-50/50' : isWaitingParts ? 'bg-orange-50/50' : 'bg-blue-50/30'} border-t-2 border-slate-200 group`}>
                      <td className="px-4 py-4 border-r border-slate-200">
                        <div className="font-black text-slate-900 leading-none">{entry.equipo_id}</div>
                        <div className="mt-2 flex flex-col gap-1">
                          <div className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tight shadow-sm ${isOperative ? 'bg-green-600 text-white' : (isWaitingParts ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white')}`}>
                            {totalDays} d. Total
                          </div>
                          <div 
                            title="Pérdida de facturación estimada por los días de inactividad del equipo" 
                            className="text-[11px] font-black text-red-600 uppercase tracking-tighter cursor-help"
                          >
                            {formatCurrencyAbbr(loss)}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 border-r border-slate-200">
                        <div className="font-bold text-slate-800 leading-tight">{eq?.marca || 'N/A'} {eq?.modelo || ''}</div>
                        <div className="text-[9px] text-slate-400 uppercase font-black">{eq?.tipo || 'Desconocido'}</div>
                        <div className="text-[10px] text-slate-600 mt-1">Hs/Km de arrastre: {eq?.horas?.toLocaleString('de-DE') || '0'}</div>
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
                              {isWaitingParts && <span className="px-1.5 py-0.5 bg-orange-200 text-orange-800 text-[8px] font-black rounded uppercase flex items-center gap-1 shadow-sm">Esperando Repuestos</span>}
                              {!isOperative && !isWaitingParts && <span className="px-1.5 py-0.5 bg-blue-200 text-blue-800 text-[8px] font-black rounded uppercase flex items-center gap-1 shadow-sm">En Reparación</span>}
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
                        <div className="flex items-center justify-center gap-2">
                          {isEditingFirst || isEditingEntry ? (
                            <button onClick={async () => { 
                              if(isEditingFirst) await handleSaveEditAction(); 
                              if(isEditingEntry) await handleSaveEditEntry(entry.id); 
                            }} className="text-green-600 hover:bg-green-50 p-1 rounded transition-colors"><Check className="w-5 h-5" /></button>
                          ) : (
                            <>
                              <button onClick={() => { 
                                setEditingEntryId(entry.id); 
                                setEditingActionId(firstAction?.id || null); 
                                setEditEntryData({ obra_asignada: entry.obra_asignada || '', informe_fallas: entry.informe_fallas, fecha_ingreso: entry.fecha_ingreso }); 
                                if(firstAction) setEditActionData({ descripcion: firstAction.descripcion, responsable: firstAction.responsable, fecha_accion: firstAction.fecha_accion }); 
                              }} className="text-slate-500 hover:text-green-700 opacity-0 group-hover:opacity-100 transition-all"><Edit2 className="w-5 h-5" /></button>
                              <button onClick={() => setDeleteConfirmId(entry.id)} className="text-slate-200 hover:text-red-500 transition-all"><Trash2 className="w-4 h-4" /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {actions.slice(1).map((action, idx) => {
                      const isEditing = editingActionId === action.id;
                      const prevDate = actions[idx].fecha_accion; 
                      const duration = getDiffDays(prevDate, (idx === actions.slice(1).length - 1 && !isOperative) ? today : action.fecha_accion);

                      return (
                        <tr key={action.id} className="bg-white border-b border-slate-50 hover:bg-slate-50 group/row transition-colors">
                          <td colSpan={5} className="border-r border-slate-100"></td>
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
                            {isEditing ? <button onClick={handleSaveEditAction} className="text-green-600"><Check className="w-5 h-5" /></button> : <button onClick={() => { setEditingActionId(action.id); setEditActionData({ descripcion: action.descripcion, responsable: action.responsable, fecha_accion: action.fecha_accion }); }} className="text-slate-500 hover:text-green-600 opacity-0 group-hover/row:opacity-100"><Edit2 className="w-4.5 h-4.5" /></button>}
                          </td>
                        </tr>
                      );
                    })}

                    <tr className="bg-white">
                      <td colSpan={5} className="border-r border-slate-100"></td>
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
                                <button onClick={() => { setEditingCommentId(entry.id); setTempComment(entry.observaciones || ''); }} className="text-slate-500 hover:text-green-600 opacity-0 group-hover/comment:opacity-100 transition-all"><Edit2 className="w-4 h-4" /></button>
                              </div>
                            )}
                          </div>
                          {selectedEntryId === entry.id ? (
                            <div className="flex gap-2 items-center bg-slate-100 p-3 rounded-lg border-2 border-green-600 animate-in zoom-in-95 shadow-xl">
                              <input autoFocus type="text" value={newActionText} onChange={e => setNewActionText(e.target.value)} placeholder="¿Qué se hizo?" className="flex-[3] text-xs p-2 rounded border-2 border-slate-400 font-bold bg-white text-slate-950 outline-none" />
                              <input type="text" value={newActionResponsable} onChange={e => setNewActionResponsable(e.target.value)} placeholder="Mecánico" className="flex-1 text-xs p-2 rounded border-2 border-slate-400 font-bold bg-white text-slate-950 outline-none" />
                              <input type="date" value={newActionDate} onChange={e => setNewActionDate(e.target.value)} className="text-xs p-2 rounded border-2 border-slate-400 w-32 font-bold bg-white text-slate-950 outline-none" />
                              <button onClick={() => handleAddAction(entry.id)} disabled={isProcessing} className="bg-green-600 text-white p-2 rounded hover:bg-green-700 disabled:bg-slate-300 shadow-md"><Save className="w-4 h-4" /></button>
                              <button onClick={() => setSelectedEntryId(null)} className="text-slate-500 p-2 hover:bg-slate-200 rounded transition-colors"><X className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <button onClick={() => setSelectedEntryId(entry.id)} className="flex items-center gap-1.5 text-[10px] font-black text-green-700 hover:bg-green-700 hover:text-white px-4 py-2 rounded-full border-2 border-green-200 transition-all uppercase tracking-widest w-fit shadow-sm">
                              <Plus className="w-3 h-3" /> Añadir Avance
                            </button>
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
    </div>
  );
};

export default TrackingView;
