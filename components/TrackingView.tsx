
import React, { useState, useMemo } from 'react';
import { MaintenanceEntry, Equipment, MaintenanceAction } from '../types';
import { Plus, Search, Calendar, Save, Trash2, ArrowRight, FileText, User, Clock, AlertTriangle, X, Edit2, Check, Wrench, MessageSquare, Activity } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface TrackingViewProps {
  entries: MaintenanceEntry[];
  setEntries: React.Dispatch<React.SetStateAction<MaintenanceEntry[]>>;
  equipment: Equipment[];
}

const TrackingView: React.FC<TrackingViewProps> = ({ entries, setEntries, equipment }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  const today = new Date().toISOString().split('T')[0];
  
  const [newEntry, setNewEntry] = useState({
    interno: '',
    entryDate: today,
    preliminary: '',
    firstAction: '',
    actionPerformedBy: '',
    actionDate: today,
    comment: ''
  });

  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [newActionText, setNewActionText] = useState('');
  const [newActionPerformedBy, setNewActionPerformedBy] = useState('');
  const [newActionDate, setNewActionDate] = useState(today);

  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [editActionData, setEditActionData] = useState<{
    description: string;
    performedBy: string;
    date: string;
  }>({ description: '', performedBy: '', date: '' });

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [tempComment, setTempComment] = useState('');

  const repuestoKeywords = ['pedido', 'repuesto', 'terceros', 'compra', 'adquisición', 'pendiente', 'insumo', 'falta'];

  // Función para formatear fecha evitando el error de zona horaria (UTC vs Local)
  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  const getDiffDays = (d1: string, d2: string) => {
    const start = new Date(d1 + 'T00:00:00');
    const end = new Date(d2 + 'T00:00:00');
    const diffTime = end.getTime() - start.getTime();
    return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
  };

  const calculateLoss = (days: number, eq?: Equipment) => {
    if (!eq) return 0;
    return (days / 30) * 0.0325 * (eq.demerito || 0.8) * 0.5 * (eq.valorNuevo || 0);
  };

  const formatCurrencyAbbr = (value: number) => {
    if (value >= 1000000) return `$ ${(value / 1000000).toFixed(1)} Mill.`;
    if (value >= 1000) return `$ ${(value / 1000).toFixed(1)} Mil`;
    return `$ ${value.toFixed(0)}`;
  };

  const getWorkshopStatus = (entry: MaintenanceEntry) => {
    const actions = entry.actions;
    if (actions.length === 0) return { isOperative: false, isWaitingParts: false, isInRepair: true, totalDays: 0 };

    const lastAction = actions[actions.length - 1];
    const desc = lastAction.description.toLowerCase();
    
    const isOperative = desc.includes('operativo');
    const isWaitingParts = !isOperative && repuestoKeywords.some(kw => desc.includes(kw));
    const isInRepair = !isOperative && !isWaitingParts;

    const endDateStr = isOperative ? lastAction.date : today;
    const totalDays = getDiffDays(entry.entryDate, endDateStr);

    return { isOperative, isWaitingParts, isInRepair, endDate: endDateStr, totalDays };
  };

  const filteredEntries = useMemo(() => {
    const sorted = [...entries].sort((a, b) => {
      const sA = getWorkshopStatus(a);
      const sB = getWorkshopStatus(b);
      if (sA.isOperative === sB.isOperative) {
        return new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime();
      }
      return sA.isOperative ? 1 : -1;
    });

    if (!searchTerm) return sorted;
    const term = searchTerm.toLowerCase();
    return sorted.filter(entry => {
      const eq = equipment.find(e => e.id === entry.equipmentId);
      return (
        entry.equipmentId.toLowerCase().includes(term) ||
        entry.preliminaryInfo.toLowerCase().includes(term) ||
        eq?.type.toLowerCase().includes(term) ||
        eq?.brand.toLowerCase().includes(term)
      );
    });
  }, [entries, searchTerm, equipment]);

  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    const todayStr = new Date().toISOString().split('T')[0];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text('Reporte de Historial de Taller - GEyT', 14, 20);
    
    let startY = 35;
    let totalLossAll = 0;
    let totalStayDaysAll = 0;

    filteredEntries.forEach((entry, index) => {
      const eq = equipment.find(e => e.id === entry.equipmentId);
      const { isOperative, isWaitingParts, totalDays } = getWorkshopStatus(entry);
      const loss = calculateLoss(totalDays, eq);
      totalLossAll += loss;
      totalStayDaysAll += totalDays;

      let headerBg = [219, 234, 254]; 
      if (isOperative) headerBg = [220, 252, 231]; 
      else if (isWaitingParts) headerBg = [255, 237, 213]; 

      doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
      doc.rect(14, startY, 269, 22, 'F');
      doc.setDrawColor(200, 200, 200);
      doc.rect(14, startY, 269, 22, 'S');
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      
      const statusLabel = isOperative ? 'OPERATIVO' : (isWaitingParts ? 'EN TALLER (ESPERA REPUESTOS)' : 'EN REPARACIÓN');
      
      // Se agrega Hs de Arrastre al encabezado del PDF
      doc.text(`INTERNO: ${entry.equipmentId} | ${eq?.type || 'N/A'} | ${eq?.brand || ''} ${eq?.model || ''} | Hs Arrastre: ${eq?.hours.toLocaleString() || '0'}`, 18, startY + 7);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`INGRESO: ${formatDateDisplay(entry.entryDate)} | ESTADO: ${statusLabel} | ESTADÍA: ${totalDays} días`, 18, startY + 13);
      
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(153, 27, 27); 
      doc.text(`PÉRDIDA DE FACTURACIÓN: ${formatCurrencyAbbr(loss)}`, 18, startY + 18);
      
      startY += 28;

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('INFORME PRELIMINAR / SÍNTOMAS:', 14, startY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      const prelimText = entry.preliminaryInfo || 'Sin información preliminar registrada.';
      const splitPrelim = doc.splitTextToSize(prelimText, 260);
      doc.text(splitPrelim, 14, startY + 5);
      
      startY += (splitPrelim.length * 5) + 6;

      const tableData = entry.actions.map((action, idx) => {
        const prevDate = idx === 0 ? entry.entryDate : entry.actions[idx - 1].date;
        return [
          formatDateDisplay(action.date),
          action.description,
          action.performedBy || '-',
          `${getDiffDays(prevDate, action.date)} d.`,
          `${getDiffDays(entry.entryDate, action.date)} d.`
        ];
      });

      autoTable(doc, {
        startY: startY,
        head: [['Fecha', 'Acción Realizada', 'Responsable', 'Parcial', 'Acumulado']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [51, 65, 85], fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 }
      });

      startY = (doc as any).lastAutoTable.finalY + 8;

      if (entry.comment) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('OBSERVACIONES DE ESTE INGRESO:', 14, startY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        const commentText = entry.comment;
        const splitComment = doc.splitTextToSize(commentText, 260);
        doc.text(splitComment, 14, startY + 5);
        startY += (splitComment.length * 5) + 8;
      }

      if (eq?.generalComment) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 128, 0); 
        doc.text(`OBSERVACIONES GENERALES DEL EQUIPO ${entry.equipmentId}:`, 14, startY);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(51, 65, 85);
        const genCommentText = eq.generalComment;
        const splitGenComment = doc.splitTextToSize(genCommentText, 260);
        doc.text(splitGenComment, 14, startY + 5);
        startY += (splitGenComment.length * 5) + 12;
      } else {
        startY += 8;
      }

      if (startY > 160 && index < filteredEntries.length - 1) {
        doc.addPage();
        startY = 20;
      }
    });

    doc.addPage();
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('RESUMEN ESTADÍSTICO DE GESTIÓN', 14, 20);
    
    let currentlyInWorkshopCount = 0;
    let operativeCount = 0;

    entries.forEach(entry => {
      const { isOperative } = getWorkshopStatus(entry);
      if (isOperative) operativeCount++; else currentlyInWorkshopCount++;
    });

    const avgStay = filteredEntries.length > 0 ? (totalStayDaysAll / filteredEntries.length).toFixed(2) : "0.00";

    autoTable(doc, {
      startY: 35,
      head: [['Indicador Clave de Desempeño (KPI)', 'Valor']],
      body: [
        ['Equipos actualmente en Taller', currentlyInWorkshopCount],
        ['Total Equipos Operativos (Histórico)', operativeCount],
        ['Estadía Promedio (Días)', `${avgStay} d.`],
        ['Pérdida de facturación total (Dólares)', formatCurrencyAbbr(totalLossAll)],
      ],
      theme: 'striped',
      headStyles: { fillColor: [21, 128, 61] },
      styles: { fontSize: 10, cellPadding: 5 }
    });

    doc.save(`Historial_Taller_GEyT_${todayStr}.pdf`);
  };

  const matchedEquipment = useMemo(() => {
    const searchId = newEntry.interno.trim().toLowerCase();
    if (!searchId) return null;
    return equipment.find(e => e.id.toLowerCase() === searchId);
  }, [newEntry.interno, equipment]);

  const handleAddEntry = () => {
    if (!matchedEquipment || !newEntry.firstAction.trim()) return;
    const entry: MaintenanceEntry = {
      id: `ENT-${Date.now()}`,
      equipmentId: matchedEquipment.id,
      entryDate: newEntry.entryDate,
      preliminaryInfo: newEntry.preliminary.trim(),
      comment: newEntry.comment.trim(),
      actions: [{
        id: `ACT-${Date.now()}`,
        description: newEntry.firstAction.trim(),
        date: newEntry.actionDate,
        performedBy: newEntry.actionPerformedBy.trim() || 'Taller'
      }]
    };
    setEntries(prev => [entry, ...prev]);
    setNewEntry({
      interno: '', entryDate: today, preliminary: '',
      firstAction: '', actionPerformedBy: '', actionDate: today,
      comment: ''
    });
    setShowAddForm(false);
  };

  const handleAddAction = (entryId: string) => {
    if (!newActionText.trim()) return;
    setEntries(prev => prev.map(entry => {
      if (entry.id === entryId) {
        return {
          ...entry,
          actions: [...entry.actions, {
            id: `ACT-${Date.now()}`,
            description: newActionText.trim(),
            date: newActionDate,
            performedBy: newActionPerformedBy.trim() || 'Taller'
          }]
        };
      }
      return entry;
    }));
    setNewActionText(''); setNewActionPerformedBy(''); setSelectedEntryId(null);
  };

  const handleStartEditComment = (entry: MaintenanceEntry) => {
    setEditingCommentId(entry.id);
    setTempComment(entry.comment || '');
  };

  const handleSaveComment = (entryId: string) => {
    setEntries(prev => prev.map(entry => entry.id === entryId ? { ...entry, comment: tempComment } : entry));
    setEditingCommentId(null);
  };

  const handleSaveEditAction = (entryId: string) => {
    if (!editActionData.description.trim()) return;
    setEntries(prev => prev.map(entry => {
      if (entry.id === entryId) {
        return {
          ...entry,
          actions: entry.actions.map(a => a.id === editingActionId ? { ...a, ...editActionData } : a)
        };
      }
      return entry;
    }));
    setEditingActionId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Seguimiento de Taller</h2>
          <p className="text-sm text-slate-500">Gestión de tiempos y pérdidas por inactividad.</p>
        </div>
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button onClick={handleExportPDF} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg border border-slate-300 transition-all font-medium text-sm">
            <FileText className="w-4 h-4" /> PDF
          </button>
          <button onClick={() => setShowAddForm(!showAddForm)} className="flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-lg shadow-md transition-all font-medium text-sm">
            {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {showAddForm ? 'Cancelar' : 'Nuevo Ingreso'}
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="bg-white p-6 rounded-xl border-2 border-green-600 shadow-xl animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
            <div className="md:col-span-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Interno</label>
              <input type="text" value={newEntry.interno} onChange={e => setNewEntry({...newEntry, interno: e.target.value.toUpperCase()})} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm focus:bg-white outline-none" placeholder="E-000" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Equipo</label>
              <div className="bg-slate-50 border border-slate-100 rounded p-2 text-sm h-[38px] flex items-center text-slate-700 italic">
                {matchedEquipment ? `${matchedEquipment.type} | ${matchedEquipment.brand}` : 'Ingrese Interno para validar...'}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fecha Ingreso</label>
              <input type="date" value={newEntry.entryDate} onChange={e => setNewEntry({...newEntry, entryDate: e.target.value, actionDate: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm focus:bg-white outline-none" />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Informe Preliminar</label>
              <input type="text" value={newEntry.preliminary} onChange={e => setNewEntry({...newEntry, preliminary: e.target.value})} className="w-full bg-white border border-slate-200 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-green-500" placeholder="Ruidos, fugas, etc." />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Primera Acción</label>
              <input type="text" value={newEntry.firstAction} onChange={e => setNewEntry({...newEntry, firstAction: e.target.value})} className="w-full bg-white border border-green-200 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-green-500" placeholder="Ej: Revisión de motor" />
            </div>
            <div className="md:col-span-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Responsable</label>
              <input type="text" value={newEntry.actionPerformedBy} onChange={e => setNewEntry({...newEntry, actionPerformedBy: e.target.value})} className="w-full bg-white border border-slate-200 rounded p-2 text-sm outline-none" placeholder="Nombre" />
            </div>
            <div className="md:col-span-1">
              <button onClick={handleAddEntry} disabled={!matchedEquipment} className={`w-full h-[38px] flex items-center justify-center gap-2 rounded font-bold transition-all ${matchedEquipment ? 'bg-green-600 hover:bg-green-700 text-white shadow-md' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
                <Save className="w-4 h-4" /> Registrar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl shadow-lg border border-slate-200 bg-white">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-100 text-slate-700 font-bold text-[10px] uppercase tracking-widest">
            <tr>
              <th className="px-4 py-3 border-r border-slate-200 w-24">Interno</th>
              <th className="px-4 py-3 border-r border-slate-200">Equipo</th>
              <th className="px-4 py-3 border-r border-slate-200 w-24 text-center">Ingreso</th>
              <th className="px-4 py-3 border-r border-slate-200">Informe Preliminar</th>
              <th className="px-4 py-3 border-r border-slate-200">Acción Registrada</th>
              <th className="px-4 py-3 border-r border-slate-200 w-32 text-center">Responsable</th>
              <th className="px-4 py-3 border-r border-slate-200 w-28 text-center">Fecha</th>
              <th className="px-4 py-3 border-r border-slate-200 w-16 text-center">D. Total</th>
              <th className="px-4 py-3 w-12 text-center"></th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {filteredEntries.map(entry => {
              const eq = equipment.find(e => e.id === entry.equipmentId);
              const { isOperative, isWaitingParts, totalDays } = getWorkshopStatus(entry);
              const loss = calculateLoss(totalDays, eq);
              const firstAction = entry.actions[0];
              const isEditingFirst = editingActionId === firstAction.id;

              return (
                <React.Fragment key={entry.id}>
                  <tr className={`${isOperative ? 'bg-green-50/50' : isWaitingParts ? 'bg-orange-50/50' : 'bg-blue-50/30'} border-t-2 border-slate-200 group`}>
                    <td className="px-4 py-4 border-r border-slate-200">
                      <div className="font-bold text-slate-900 leading-none">{entry.equipmentId}</div>
                      <div className="mt-2 flex flex-col gap-1">
                        <div 
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tight shadow-sm cursor-help ${isOperative ? 'bg-green-600 text-white' : (isWaitingParts ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white')}`}
                          title="Estadía acumulada: Días transcurridos desde el ingreso a taller."
                        >
                          {totalDays} d.
                        </div>
                        <div 
                          className="inline-flex items-center text-[9px] font-black text-red-600 uppercase tracking-tighter whitespace-nowrap cursor-help"
                          title="Pérdida de facturación: Estimación económica por inactividad del equipo."
                        >
                          {formatCurrencyAbbr(loss)}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 border-r border-slate-200">
                      <div className="font-bold text-slate-800 leading-tight">{eq?.brand} {eq?.model}</div>
                      <div className="text-[9px] text-slate-400 uppercase font-black">{eq?.type}</div>
                      <div className="flex items-center gap-1 mt-1 text-[10px] font-bold text-slate-600">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>Hs Arrastre: {eq?.hours.toLocaleString() || '0'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 border-r border-slate-200 text-center text-slate-500 font-mono">
                      {formatDateDisplay(entry.entryDate)}
                    </td>
                    <td className="px-4 py-4 border-r border-slate-200 text-slate-600 italic">
                      {entry.preliminaryInfo}
                    </td>
                    <td className="px-4 py-4 border-r border-slate-200">
                      {isEditingFirst ? (
                        <input type="text" value={editActionData.description} onChange={e => setEditActionData({...editActionData, description: e.target.value})} className="w-full text-xs p-1.5 bg-white text-slate-900 border-2 border-green-400 rounded outline-none shadow-sm" />
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-slate-800 font-medium">{firstAction.description}</span>
                          <div className="flex gap-1">
                            {isOperative && <span className="px-1.5 py-0.5 bg-green-200 text-green-800 text-[8px] font-black rounded uppercase">Operativo</span>}
                            {isWaitingParts && <span className="px-1.5 py-0.5 bg-orange-200 text-orange-800 text-[8px] font-black rounded uppercase flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> Esperando Repuestos</span>}
                            {!isOperative && !isWaitingParts && <span className="px-1.5 py-0.5 bg-blue-200 text-blue-800 text-[8px] font-black rounded uppercase flex items-center gap-1"><Wrench className="w-2.5 h-2.5" /> En Reparación</span>}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 border-r border-slate-200 text-center text-slate-600">
                      {isEditingFirst ? (
                        <input type="text" value={editActionData.performedBy} onChange={e => setEditActionData({...editActionData, performedBy: e.target.value})} className="w-full text-[10px] p-1 bg-white text-slate-900 border-2 border-green-400 rounded outline-none" />
                      ) : firstAction.performedBy}
                    </td>
                    <td className="px-4 py-4 border-r border-slate-200 text-center text-slate-500 font-mono">
                      {isEditingFirst ? (
                        <input type="date" value={editActionData.date} onChange={e => setEditActionData({...editActionData, date: e.target.value})} className="w-full text-[10px] p-1 bg-white text-slate-900 border-2 border-green-400 rounded outline-none" />
                      ) : formatDateDisplay(firstAction.date)}
                    </td>
                    <td className="px-4 py-4 border-r border-slate-200 text-center font-black text-slate-700">
                      {totalDays}d
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {isEditingFirst ? (
                          <button onClick={() => handleSaveEditAction(entry.id)} className="text-green-600 hover:bg-green-50 p-1 rounded"><Check className="w-4 h-4" /></button>
                        ) : (
                          <>
                            <button onClick={() => { setEditingActionId(firstAction.id); setEditActionData({ description: firstAction.description, performedBy: firstAction.performedBy, date: firstAction.date }); }} className="text-slate-300 hover:text-green-700 opacity-0 group-hover:opacity-100"><Edit2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setDeleteConfirmId(entry.id)} className="text-slate-200 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {entry.actions.slice(1).map((action, idx) => {
                    const isEditing = editingActionId === action.id;
                    return (
                      <tr key={action.id} className="bg-white border-b border-slate-50 hover:bg-slate-50 group/row">
                        <td colSpan={4} className="border-r border-slate-100"></td>
                        <td className="px-4 py-2 border-r border-slate-200">
                          {isEditing ? (
                            <input type="text" value={editActionData.description} onChange={e => setEditActionData({...editActionData, description: e.target.value})} className="w-full text-xs p-1 bg-white text-slate-900 border border-green-400 rounded outline-none" />
                          ) : (
                            <span className="text-slate-700">{action.description}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 border-r border-slate-200 text-center text-slate-500">
                          {isEditing ? (
                            <input type="text" value={editActionData.performedBy} onChange={e => setEditActionData({...editActionData, performedBy: e.target.value})} className="w-full text-[10px] p-1 bg-white text-slate-900 border border-green-400 rounded outline-none" />
                          ) : action.performedBy}
                        </td>
                        <td className="px-4 py-2 border-r border-slate-200 text-center text-slate-400 font-mono text-[11px]">
                          {isEditing ? (
                            <input type="date" value={editActionData.date} onChange={e => setEditActionData({...editActionData, date: e.target.value})} className="w-full text-[10px] p-1 bg-white text-slate-900 border border-green-400 rounded outline-none" />
                          ) : formatDateDisplay(action.date)}
                        </td>
                        <td className="px-4 py-2 border-r border-slate-200 text-center font-black text-slate-700">
                          {getDiffDays(entry.entryDate, action.date)}d
                        </td>
                        <td className="px-4 py-2 text-center">
                          {isEditing ? (
                            <button onClick={() => handleSaveEditAction(entry.id)} className="text-green-600"><Check className="w-4 h-4" /></button>
                          ) : (
                            <button onClick={() => { setEditingActionId(action.id); setEditActionData({ description: action.description, performedBy: action.performedBy, date: action.date }); }} className="text-slate-200 hover:text-green-600 opacity-0 group-hover/row:opacity-100"><Edit2 className="w-3.5 h-3.5" /></button>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  <tr className="bg-white">
                    <td colSpan={4} className="border-r border-slate-100"></td>
                    <td colSpan={5} className="px-4 py-3 border-b border-slate-200">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-start gap-2 group/comment">
                          <MessageSquare className="w-4 h-4 text-slate-300 mt-1" />
                          {editingCommentId === entry.id ? (
                            <div className="flex-1 flex gap-2">
                              <textarea autoFocus value={tempComment} onChange={e => setTempComment(e.target.value)} className="flex-1 text-xs border border-green-400 rounded p-2 outline-none focus:ring-1 focus:ring-green-500 italic bg-white" rows={2} placeholder="Escriba un comentario para este ingreso..." />
                              <button onClick={() => handleSaveComment(entry.id)} className="bg-green-600 text-white p-2 rounded self-start"><Check className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <div className="flex-1 flex justify-between items-start">
                              <p className={`text-xs ${entry.comment ? 'text-slate-500 italic' : 'text-slate-300'}`}>
                                <span className="font-bold text-[10px] uppercase not-italic mr-2">Obs. Ingreso:</span>
                                {entry.comment || 'Sin comentarios adicionales.'}
                              </p>
                              <button onClick={() => handleStartEditComment(entry)} className="text-slate-300 hover:text-green-600 opacity-0 group-hover/comment:opacity-100"><Edit2 className="w-3 h-3" /></button>
                            </div>
                          )}
                        </div>

                        {eq?.generalComment && (
                          <div className="flex items-start gap-2 pl-6">
                            <Activity className="w-3.5 h-3.5 text-green-400 mt-0.5" />
                            <p className="text-[10px] text-green-700 italic">
                              <span className="font-bold uppercase not-italic mr-2">Obs. Equipo ({eq.id}):</span>
                              {eq.generalComment}
                            </p>
                          </div>
                        )}

                        {selectedEntryId === entry.id ? (
                          <div className="flex gap-2 items-center bg-green-50 p-2 rounded-lg border border-green-100 animate-in zoom-in-95 mt-1">
                            <input autoFocus type="text" value={newActionText} onChange={e => setNewActionText(e.target.value)} placeholder="¿Qué se hizo ahora?" className="flex-[3] text-xs bg-white text-slate-900 border border-slate-300 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-green-500" />
                            <input type="text" value={newActionPerformedBy} onChange={e => setNewActionPerformedBy(e.target.value)} placeholder="Responsable" className="flex-1 text-xs bg-white text-slate-900 border border-slate-300 rounded px-3 py-2 outline-none" />
                            <input type="date" value={newActionDate} onChange={e => setNewActionDate(e.target.value)} className="text-xs bg-white text-slate-900 border border-slate-300 rounded px-2 py-2 outline-none w-32" />
                            <button onClick={() => handleAddAction(entry.id)} className="bg-green-600 text-white p-2 rounded hover:bg-green-700 shadow-md"><Save className="w-4 h-4" /></button>
                            <button onClick={() => setSelectedEntryId(null)} className="text-slate-400 p-2 hover:bg-slate-200 rounded"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <button onClick={() => setSelectedEntryId(entry.id)} className="flex items-center gap-1.5 text-[10px] font-black text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-full border border-green-200 transition-all uppercase tracking-widest w-fit">
                            <Plus className="w-3 h-3" /> Añadir Avance de Taller
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full border border-slate-200 shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4"><AlertTriangle className="w-8 h-8" /></div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">¿Eliminar registro?</h3>
            <p className="text-sm text-slate-500 mb-6">Esta acción borrará todo el historial de este ingreso a taller.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm">Cancelar</button>
              <button onClick={() => { setEntries(prev => prev.filter(e => e.id !== deleteConfirmId)); setDeleteConfirmId(null); }} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-200 text-sm">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrackingView;
