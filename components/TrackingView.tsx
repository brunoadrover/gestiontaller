
import React, { useState, useMemo } from 'react';
import { MaintenanceEntry, Equipment, MaintenanceAction } from '../types';
import { Plus, Search, Calendar, Save, Trash2, ArrowRight, FileText, User, Clock, AlertTriangle, X, Edit2, Check, Wrench, MessageSquare } from 'lucide-react';
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
  
  const [newEntry, setNewEntry] = useState({
    interno: '',
    entryDate: new Date().toISOString().split('T')[0],
    preliminary: '',
    firstAction: '',
    actionPerformedBy: '',
    actionDate: new Date().toISOString().split('T')[0],
    comment: ''
  });

  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [newActionText, setNewActionText] = useState('');
  const [newActionPerformedBy, setNewActionPerformedBy] = useState('');
  const [newActionDate, setNewActionDate] = useState(new Date().toISOString().split('T')[0]);

  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [editActionData, setEditActionData] = useState<{
    description: string;
    performedBy: string;
    date: string;
  }>({ description: '', performedBy: '', date: '' });

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [tempComment, setTempComment] = useState('');

  const repuestoKeywords = ['pedido', 'repuesto', 'terceros', 'compra', 'adquisición', 'pendiente', 'insumo', 'falta'];

  const getDiffDays = (d1: string, d2: string) => {
    const start = new Date(d1);
    const end = new Date(d2);
    start.setHours(0,0,0,0);
    end.setHours(0,0,0,0);
    const diffTime = end.getTime() - start.getTime();
    return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
  };

  const getWorkshopStatus = (entry: MaintenanceEntry) => {
    const actions = entry.actions;
    if (actions.length === 0) return { isOperative: false, isWaitingParts: false, isInRepair: true, totalDays: 0 };

    const lastAction = actions[actions.length - 1];
    const desc = lastAction.description.toLowerCase();
    
    const isOperative = desc.includes('operativo');
    const isWaitingParts = !isOperative && repuestoKeywords.some(kw => desc.includes(kw));
    const isInRepair = !isOperative && !isWaitingParts;

    const endDateStr = isOperative ? lastAction.date : new Date().toISOString().split('T')[0];
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

    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text('Reporte de Historial de Taller', 14, 20);
    
    let startY = 35;

    filteredEntries.forEach((entry, index) => {
      const eq = equipment.find(e => e.id === entry.equipmentId);
      const { isOperative, isWaitingParts, totalDays } = getWorkshopStatus(entry);

      // Definir color de fondo según estado (Esquema de la pantalla)
      // Operativo: Verde, Esperando Repuestos: Naranja, En Reparación: Azul
      let headerBg = [219, 234, 254]; // Default Azul (En taller)
      let textColor = [30, 41, 59];
      
      if (isOperative) {
        headerBg = [220, 252, 231]; // Verde suave
      } else if (isWaitingParts) {
        headerBg = [255, 237, 213]; // Naranja suave
      }

      // Encabezado del Equipo con Color de Estado
      doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
      doc.rect(14, startY, 269, 18, 'F');
      doc.setDrawColor(200, 200, 200);
      doc.rect(14, startY, 269, 18, 'S');
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      
      const statusLabel = isOperative ? 'OPERATIVO' : (isWaitingParts ? 'EN TALLER (ESPERA REPUESTOS)' : 'EN REPARACIÓN');
      
      doc.text(`INTERNO: ${entry.equipmentId} | ${eq?.type || 'N/A'} | ${eq?.brand || ''} ${eq?.model || ''}`, 18, startY + 7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`INGRESO: ${new Date(entry.entryDate).toLocaleDateString()} | ESTADO: ${statusLabel} | ESTADÍA: ${totalDays} días`, 18, startY + 13);
      
      startY += 24;

      // Informe Preliminar
      doc.setFont('helvetica', 'bold');
      doc.text('INFORME PRELIMINAR / SÍNTOMAS:', 14, startY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      const prelimText = entry.preliminaryInfo || 'Sin información preliminar registrada.';
      const splitPrelim = doc.splitTextToSize(prelimText, 260);
      doc.text(splitPrelim, 14, startY + 5);
      
      startY += (splitPrelim.length * 5) + 6;

      // Tabla de Acciones
      const tableData = entry.actions.map((action, idx) => {
        const prevDate = idx === 0 ? entry.entryDate : entry.actions[idx - 1].date;
        return [
          new Date(action.date).toLocaleDateString(),
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

      // Sección de Comentarios (AL FINAL DEL CUADRO DE ACCIONES)
      if (entry.comment) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('OBSERVACIONES GENERALES:', 14, startY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        const commentText = entry.comment;
        const splitComment = doc.splitTextToSize(commentText, 260);
        doc.text(splitComment, 14, startY + 5);
        startY += (splitComment.length * 5) + 12;
      } else {
        startY += 10;
      }

      // Nueva página si es necesario
      if (startY > 160 && index < filteredEntries.length - 1) {
        doc.addPage();
        startY = 20;
      }
    });

    // --- SECCIÓN DE RESUMEN ---
    doc.addPage();
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('RESUMEN ESTADÍSTICO DE GESTIÓN', 14, 25);
    
    let totalWorkshopDays = 0;
    let currentlyInWorkshop = 0;
    let operativeCount = 0;
    let waitingPartsCount = 0;
    let inRepairCount = 0;

    entries.forEach(entry => {
      const { isOperative, isWaitingParts, totalDays } = getWorkshopStatus(entry);
      totalWorkshopDays += totalDays;
      if (isOperative) operativeCount++;
      else {
        currentlyInWorkshop++;
        if (isWaitingParts) waitingPartsCount++;
        else inRepairCount++;
      }
    });

    const avgStay = entries.length > 0 ? (totalWorkshopDays / entries.length).toFixed(2) : "0.00";

    autoTable(doc, {
      startY: 35,
      head: [['Indicador Clave de Desempeño (KPI)', 'Valor']],
      body: [
        ['Equipos actualmente en Taller', currentlyInWorkshop],
        ['Estadía Promedio Total (días)', `${avgStay} d.`],
        ['Total Equipos Operativos (Histórico)', operativeCount],
        ['Equipos en Espera de Repuestos (Actual)', waitingPartsCount],
        ['Equipos en Reparación Activa (Actual)', inRepairCount],
      ],
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] },
      styles: { fontSize: 10, cellPadding: 5 }
    });

    doc.save(`Historial_Taller_${todayStr}.pdf`);
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
      interno: '', entryDate: new Date().toISOString().split('T')[0], preliminary: '',
      firstAction: '', actionPerformedBy: '', actionDate: new Date().toISOString().split('T')[0],
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

  /**
   * Initializes the editing state for a maintenance action.
   */
  const handleStartEditAction = (action: MaintenanceAction) => {
    setEditingActionId(action.id);
    setEditActionData({
      description: action.description,
      performedBy: action.performedBy,
      date: action.date
    });
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
          <p className="text-sm text-slate-500">Gestión de tiempos y estados de reparación.</p>
        </div>
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button onClick={handleExportPDF} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg border border-slate-300 transition-all font-medium text-sm">
            <FileText className="w-4 h-4" /> PDF
          </button>
          <button onClick={() => setShowAddForm(!showAddForm)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-md transition-all font-medium text-sm">
            {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {showAddForm ? 'Cancelar' : 'Nuevo Ingreso'}
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="bg-white p-6 rounded-xl border-2 border-blue-500 shadow-xl animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4 items-end">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Interno</label>
              <input type="text" value={newEntry.interno} onChange={e => setNewEntry({...newEntry, interno: e.target.value.toUpperCase()})} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm focus:bg-white outline-none" placeholder="E-000" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Equipo</label>
              <div className="bg-slate-50 border border-slate-100 rounded p-2 text-sm h-[38px] flex items-center text-slate-700 italic">
                {matchedEquipment ? `${matchedEquipment.type} | ${matchedEquipment.brand}` : 'Ingrese Interno para validar...'}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fecha Ingreso</label>
              <input type="date" value={newEntry.entryDate} onChange={e => setNewEntry({...newEntry, entryDate: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm focus:bg-white outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Informe Preliminar</label>
              <input type="text" value={newEntry.preliminary} onChange={e => setNewEntry({...newEntry, preliminary: e.target.value})} className="w-full bg-white border border-slate-200 rounded p-2 text-sm outline-none" placeholder="¿Por qué ingresa?" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Comentario / Observación</label>
              <input type="text" value={newEntry.comment} onChange={e => setNewEntry({...newEntry, comment: e.target.value})} className="w-full bg-white border border-slate-200 rounded p-2 text-sm outline-none italic" placeholder="Opcional..." />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Primera Acción</label>
              <input type="text" value={newEntry.firstAction} onChange={e => setNewEntry({...newEntry, firstAction: e.target.value})} className="w-full bg-white border border-blue-200 rounded p-2 text-sm outline-none" placeholder="Ej: Revisión de motor" />
            </div>
            <div className="lg:col-span-1">
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
              <th className="px-4 py-3 border-r border-slate-200 w-28">Responsable</th>
              <th className="px-4 py-3 border-r border-slate-200 w-24 text-center">Fecha</th>
              <th className="px-4 py-3 border-r border-slate-200 w-16 text-center">D. Parcial</th>
              <th className="px-4 py-3 border-r border-slate-200 w-16 text-center">D. Total</th>
              <th className="px-4 py-3 w-12 text-center"></th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {filteredEntries.map(entry => {
              const eq = equipment.find(e => e.id === entry.equipmentId);
              const { isOperative, isWaitingParts, isInRepair, totalDays } = getWorkshopStatus(entry);
              const firstAction = entry.actions[0];
              const isEditingFirst = editingActionId === firstAction.id;

              return (
                <React.Fragment key={entry.id}>
                  <tr className={`${isOperative ? 'bg-green-50/50' : isWaitingParts ? 'bg-orange-50/50' : 'bg-blue-50/30'} border-t-2 border-slate-200 group`}>
                    <td className="px-4 py-4 border-r border-slate-200">
                      <div className="font-bold text-slate-900 leading-none">{entry.equipmentId}</div>
                      <div className={`mt-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tight shadow-sm ${isOperative ? 'bg-green-600 text-white' : (isWaitingParts ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white')}`}>
                        {totalDays} d.
                      </div>
                    </td>
                    <td className="px-4 py-4 border-r border-slate-200">
                      <div className="font-bold text-slate-800 leading-tight">{eq?.brand} {eq?.model}</div>
                      <div className="text-[9px] text-slate-400 uppercase font-black">{eq?.type}</div>
                    </td>
                    <td className="px-4 py-4 border-r border-slate-200 text-center text-slate-500 font-mono">
                      {new Date(entry.entryDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 border-r border-slate-200 text-slate-600 italic">
                      {entry.preliminaryInfo}
                    </td>
                    <td className="px-4 py-4 border-r border-slate-200">
                      {isEditingFirst ? (
                        <input type="text" value={editActionData.description} onChange={e => setEditActionData({...editActionData, description: e.target.value})} className="w-full text-xs p-1.5 bg-white text-slate-900 border-2 border-blue-400 rounded outline-none shadow-sm" />
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-slate-800 font-medium">{firstAction.description}</span>
                          <div className="flex gap-1">
                            {isOperative && <span className="px-1.5 py-0.5 bg-green-200 text-green-800 text-[8px] font-black rounded uppercase">Operativo</span>}
                            {isWaitingParts && <span className="px-1.5 py-0.5 bg-orange-200 text-orange-800 text-[8px] font-black rounded uppercase flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> Esperando Repuestos</span>}
                            {isInRepair && <span className="px-1.5 py-0.5 bg-blue-200 text-blue-800 text-[8px] font-black rounded uppercase flex items-center gap-1"><Wrench className="w-2.5 h-2.5" /> En Reparación</span>}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 border-r border-slate-200 text-slate-600">
                      {isEditingFirst ? (
                        <input type="text" value={editActionData.performedBy} onChange={e => setEditActionData({...editActionData, performedBy: e.target.value})} className="w-full text-xs p-1.5 bg-white text-slate-900 border-2 border-blue-400 rounded outline-none" />
                      ) : firstAction.performedBy}
                    </td>
                    <td className="px-4 py-4 border-r border-slate-200 text-center text-slate-500 font-mono">
                      {isEditingFirst ? (
                        <input type="date" value={editActionData.date} onChange={e => setEditActionData({...editActionData, date: e.target.value})} className="w-full text-[10px] p-1 bg-white text-slate-900 border-2 border-blue-400 rounded outline-none" />
                      ) : new Date(firstAction.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 border-r border-slate-200 text-center font-bold text-slate-300">
                      {getDiffDays(entry.entryDate, firstAction.date)}d
                    </td>
                    <td className="px-4 py-4 border-r border-slate-200 text-center font-black text-slate-700">
                      {getDiffDays(entry.entryDate, firstAction.date)}d
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {isEditingFirst ? (
                          <button onClick={() => handleSaveEditAction(entry.id)} className="text-green-600 hover:bg-green-50 p-1 rounded"><Check className="w-4 h-4" /></button>
                        ) : (
                          <>
                            <button onClick={() => handleStartEditAction(firstAction)} className="text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100"><Edit2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setDeleteConfirmId(entry.id)} className="text-slate-200 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {entry.actions.slice(1).map((action, idx) => {
                    const isEditing = editingActionId === action.id;
                    const prevDate = entry.actions[idx].date;
                    const isLastAction = idx === entry.actions.length - 2;

                    return (
                      <tr key={action.id} className="bg-white border-b border-slate-50 hover:bg-slate-50 group/row">
                        <td colSpan={4} className="border-r border-slate-100"></td>
                        <td className="px-4 py-2 border-r border-slate-200">
                          {isEditing ? (
                            <input type="text" value={editActionData.description} onChange={e => setEditActionData({...editActionData, description: e.target.value})} className="w-full text-xs p-1.5 bg-white text-slate-900 border-2 border-blue-400 rounded outline-none" />
                          ) : (
                            <div className="flex flex-col gap-1">
                              <span className="text-slate-700">{action.description}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 border-r border-slate-200 text-slate-500 italic">
                          {isEditing ? (
                            <input type="text" value={editActionData.performedBy} onChange={e => setEditActionData({...editActionData, performedBy: e.target.value})} className="w-full text-xs p-1.5 bg-white text-slate-900 border-2 border-blue-400 rounded outline-none" />
                          ) : action.performedBy}
                        </td>
                        <td className="px-4 py-2 border-r border-slate-200 text-center text-slate-400 font-mono text-[11px]">
                          {isEditing ? (
                            <input type="date" value={editActionData.date} onChange={e => setEditActionData({...editActionData, date: e.target.value})} className="w-full text-[10px] p-1 bg-white text-slate-900 border-2 border-blue-400 rounded outline-none" />
                          ) : new Date(action.date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2 border-r border-slate-200 text-center font-bold text-blue-400 bg-blue-50/10">
                          {getDiffDays(prevDate, action.date)}d
                        </td>
                        <td className="px-4 py-2 border-r border-slate-200 text-center font-black text-slate-700">
                          {getDiffDays(entry.entryDate, action.date)}d
                        </td>
                        <td className="px-4 py-2 text-center">
                          {isEditing ? (
                            <button onClick={() => handleSaveEditAction(entry.id)} className="text-green-600"><Check className="w-4 h-4" /></button>
                          ) : (
                            <button onClick={() => handleStartEditAction(action)} className="text-slate-200 hover:text-blue-500 opacity-0 group-hover/row:opacity-100"><Edit2 className="w-3.5 h-3.5" /></button>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  <tr className="bg-white">
                    <td colSpan={4} className="border-r border-slate-100"></td>
                    <td colSpan={6} className="px-4 py-3 border-b border-slate-200">
                      <div className="flex flex-col gap-3">
                        {/* Sección de Comentario editable */}
                        <div className="flex items-start gap-2 group/comment">
                          <MessageSquare className="w-4 h-4 text-slate-300 mt-1" />
                          {editingCommentId === entry.id ? (
                            <div className="flex-1 flex gap-2">
                              <textarea autoFocus value={tempComment} onChange={e => setTempComment(e.target.value)} className="flex-1 text-xs border border-blue-400 rounded p-2 outline-none focus:ring-1 focus:ring-blue-500 italic bg-white" rows={2} placeholder="Escriba un comentario o nota para el reporte final..." />
                              <button onClick={() => handleSaveComment(entry.id)} className="bg-green-600 text-white p-2 rounded self-start"><Check className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <div className="flex-1 flex justify-between items-start">
                              <p className={`text-xs ${entry.comment ? 'text-slate-500 italic' : 'text-slate-300'}`}>
                                {entry.comment || 'Sin comentarios adicionales.'}
                              </p>
                              <button onClick={() => handleStartEditComment(entry)} className="text-slate-300 hover:text-blue-500 opacity-0 group-hover/comment:opacity-100"><Edit2 className="w-3 h-3" /></button>
                            </div>
                          )}
                        </div>

                        {/* Botón para añadir avance */}
                        {selectedEntryId === entry.id ? (
                          <div className="flex gap-2 items-center bg-blue-50 p-2 rounded-lg border border-blue-100 animate-in zoom-in-95 mt-1">
                            <input autoFocus type="text" value={newActionText} onChange={e => setNewActionText(e.target.value)} placeholder="¿Qué se hizo ahora?" className="flex-[3] text-xs bg-white text-slate-900 border border-slate-300 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" />
                            <input type="text" value={newActionPerformedBy} onChange={e => setNewActionPerformedBy(e.target.value)} placeholder="Responsable" className="flex-1 text-xs bg-white text-slate-900 border border-slate-300 rounded px-3 py-2 outline-none" />
                            <input type="date" value={newActionDate} onChange={e => setNewActionDate(e.target.value)} className="text-xs bg-white text-slate-900 border border-slate-300 rounded px-2 py-2 outline-none w-32" />
                            <button onClick={() => handleAddAction(entry.id)} className="bg-green-600 text-white p-2 rounded hover:bg-green-700 shadow-md"><Save className="w-4 h-4" /></button>
                            <button onClick={() => setSelectedEntryId(null)} className="text-slate-400 p-2 hover:bg-slate-200 rounded"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <div className="flex">
                            <button onClick={() => setSelectedEntryId(entry.id)} className="flex items-center gap-1.5 text-[10px] font-black text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-full border border-blue-200 transition-all uppercase tracking-widest">
                              <Plus className="w-3 h-3" /> Añadir Avance de Taller
                            </button>
                          </div>
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
