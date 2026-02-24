
import React, { useState, useMemo, useRef } from 'react';
import { MaintenanceEntry, Equipment, MaintenanceAction, TechnicalReport } from '../types';
import { Search, Calendar, Save, Trash2, ArrowRight, FileText, User, Clock, AlertTriangle, X, Edit2, Check, Wrench, MessageSquare, Activity, MapPin, Filter, ClipboardCheck, Download, CheckCircle, Mic, MicOff, Loader2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../supabase';
import { GoogleGenAI } from "@google/genai";

const getAiClient = () => {
  const apiKey = (import.meta.env.VITE_GEMINI_API_KEY as string) || '';
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no está configurada en las variables de entorno.");
  }
  return new GoogleGenAI({ apiKey });
};

interface HistoryViewProps {
  entries: MaintenanceEntry[];
  refreshData: () => Promise<void>;
  equipment: Equipment[];
}

const reportTextClass = "w-full bg-slate-50 border border-slate-300 rounded p-2 text-xs text-slate-900 h-20 outline-none focus:ring-2 focus:ring-green-500 font-medium resize-none";
const reportLabelClass = "block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1";

const ReportField = ({ label, value, onChange, placeholder, className = reportTextClass }: { label: string, value: string, onChange: (val: string) => void, placeholder: string, className?: string }) => {
  const completedRegex = /\[COMPLETADO - .*?\]$/;
  const isCompleted = completedRegex.test(value);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const toggleCompleted = () => {
    if (isCompleted) {
      onChange(value.replace(completedRegex, '').trim());
    } else {
      const dateStr = new Date().toLocaleDateString('es-AR');
      const suffix = ` [COMPLETADO - ${dateStr}]`;
      const newValue = value.trim() + suffix;
      onChange(newValue);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("No se pudo acceder al micrófono. Verifique los permisos.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        
        try {
          const ai = getAiClient();
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [
              {
                role: "user",
                parts: [
                  {
                    inlineData: {
                      mimeType: "audio/webm",
                      data: base64Data
                    }
                  },
                  {
                    text: "Analiza el archivo de audio. Transcribe el contenido de forma literal, pero corrigiendo errores gramaticales evidentes si el usuario titubea. IMPORTANTE: No añadas comentarios, ni introducciones, ni 'Aquí tienes la transcripción'. Salida: Devuelve ÚNICAMENTE el texto limpio."
                  }
                ]
              }
            ]
          });

          const text = response.text;
          if (text) {
            const cleanText = text.trim();
            onChange((value ? value + " " : "") + cleanText);
          }
        } catch (genAiErr) {
          console.error("Gemini Error:", genAiErr);
          alert("Error en la transcripción con IA.");
        } finally {
          setIsTranscribing(false);
        }
      };
    } catch (err) {
      console.error("Error reading audio file:", err);
      alert("Error al procesar el archivo de audio.");
      setIsTranscribing(false);
    }
  };

  return (
    <div className="relative group">
      <div className="flex justify-between items-center mb-1">
        <label className={reportLabelClass}>{label}</label>
        <div className="flex items-center gap-2">
          <div className="relative group/voice">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isTranscribing}
              className={`p-1 rounded-full transition-all flex items-center justify-center ${
                isRecording 
                  ? 'bg-red-500 text-white animate-pulse' 
                  : isTranscribing 
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                    : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
              }`}
            >
              {isTranscribing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isRecording ? (
                <MicOff className="w-3.5 h-3.5" />
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <div className="relative group/tooltip">
            <button
              onClick={toggleCompleted}
              className={`p-0.5 rounded-full transition-all ${isCompleted ? 'text-red-600 bg-red-50' : 'text-slate-300 hover:text-red-500 hover:bg-slate-100'}`}
            >
              <CheckCircle className={`w-4 h-4 ${isCompleted ? 'fill-current' : ''}`} />
            </button>
          </div>
        </div>
      </div>
      <div className="relative">
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`${className} ${isCompleted ? 'border-red-500 bg-red-50/10' : ''} ${isRecording ? 'ring-2 ring-red-500 border-red-500' : ''}`}
          placeholder={isRecording ? "Escuchando..." : placeholder}
        />
        {isCompleted && (
          <div className="absolute bottom-2 right-2 text-[9px] font-black text-red-600 bg-white/80 px-1.5 py-0.5 rounded border border-red-200 pointer-events-none uppercase tracking-wider shadow-sm backdrop-blur-sm">
            Completado
          </div>
        )}
      </div>
    </div>
  );
};

const HistoryView: React.FC<HistoryViewProps> = ({ entries, refreshData, equipment }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [workshopFilter, setWorkshopFilter] = useState<'all' | 'pesados' | 'camiones' | 'livianos'>('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [selectedEntryForActions, setSelectedEntryForActions] = useState<MaintenanceEntry | null>(null);

  const [showReportModal, setShowReportModal] = useState(false);
  const [currentReportEntry, setCurrentReportEntry] = useState<MaintenanceEntry | null>(null);
  const [reportData, setReportData] = useState<Partial<TechnicalReport>>({
    motor: '',
    sistema_hidraulico: '',
    sistema_electrico: '',
    sistema_neumatico: '',
    estructura: '',
    cabina: '',
    tren_rodante: '',
    elementos_desgaste: '',
    componentes_especificos: '',
    observaciones: ''
  });
  
  const today = new Date().toLocaleDateString('en-CA'); 

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
    fecha_salida: string;
  }>({ obra_asignada: '', informe_fallas: '', fecha_ingreso: '', fecha_salida: '' });

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [tempComment, setTempComment] = useState('');

  const repuestoKeywords = ['pedido', 'repuesto', 'terceros', 'compra', 'adquisición', 'pendiente', 'insumo', 'falta'];
  const testingKeywords = ['prueba', 'probar', 'prueva'];

  const getExistingReport = (entry: MaintenanceEntry): TechnicalReport | null => {
    if (!entry.informe_taller) return null;
    if (Array.isArray(entry.informe_taller)) {
      return entry.informe_taller.length > 0 ? entry.informe_taller[0] : null;
    }
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

  const getWorkshopStatus = (entry: MaintenanceEntry) => {
    const actions = entry.acciones_taller || [];
    if (actions.length === 0) return { isOperative: false, isWaitingParts: false, isTesting: false, isInRepair: true, totalDays: 0 };

    const lastAction = actions[actions.length - 1];
    const desc = lastAction?.descripcion?.toLowerCase() || '';
    
    const isForcedRepair = desc.includes('entrega');
    const isOperative = !isForcedRepair && desc.includes('operativo');
    const isTesting = !isOperative && !isForcedRepair && testingKeywords.some(kw => desc.includes(kw));
    const isWaitingParts = !isOperative && !isTesting && !isForcedRepair && repuestoKeywords.some(kw => desc.includes(kw));
    const isInRepair = !isOperative && !isWaitingParts && !isTesting;

    const endDateStr = isOperative ? lastAction.fecha_accion : today;
    const totalDays = getDiffDays(entry.fecha_ingreso, endDateStr);

    return { isOperative, isWaitingParts, isTesting, isInRepair, endDate: endDateStr, totalDays };
  };

  const getWorkshopType = (entry: MaintenanceEntry) => {
    const eq = equipment.find(e => e.id === entry.equipo_id);
    const id = entry.equipo_id.toUpperCase();
    const desc = ((eq?.tipo || '') + ' ' + (eq?.marca || '') + ' ' + (eq?.modelo || '')).toLowerCase();
    
    if (id.startsWith('E')) return 'pesados';
    if (id.startsWith('V')) {
      if (desc.includes('camión') || desc.includes('camion') || desc.includes('colectivo')) {
        return 'camiones';
      }
      return 'livianos';
    }
    return 'otros';
  };

  const filteredEntries = useMemo(() => {
    let result = (entries || []).filter(entry => getWorkshopStatus(entry).isOperative);

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

    if (workshopFilter !== 'all') {
      result = result.filter(entry => getWorkshopType(entry) === workshopFilter);
    }

    return result;
  }, [entries, searchTerm, workshopFilter, equipment]);

  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    const todayStr = new Date().toLocaleDateString('en-CA');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text('Reporte de Equipos Operativos - GEyT', 14, 20);
    
    let startY = 35;

    filteredEntries.forEach((entry, index) => {
      const eq = equipment.find(e => e.id === entry.equipo_id);
      const { isOperative, totalDays } = getWorkshopStatus(entry);
      const loss = calculateLoss(totalDays, eq);

      let headerBg = [220, 252, 231]; 

      doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
      doc.rect(14, startY, 269, 22, 'F');
      doc.setDrawColor(200, 200, 200);
      doc.rect(14, startY, 269, 22, 'S');
      
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      
      const statusLabel = 'OPERATIVO';
      const estSalida = entry.fecha_salida ? formatDateDisplay(entry.fecha_salida) : 'N/A';
      
      const headerText = `INTERNO: ${entry.equipo_id} | MARCA: ${eq?.marca || ''} ${eq?.modelo || ''} | OBRA: ${entry.obra_asignada || 'N/A'} | SALIDA REAL: ${formatDateDisplay(getWorkshopStatus(entry).endDate || '')}`;
      doc.text(headerText, 18, startY + 7);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(`INGRESO: ${formatDateDisplay(entry.fecha_ingreso)} | ESTADO: ${statusLabel} | ESTADÍA TOTAL: ${totalDays} días`, 18, startY + 13);
      
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
      if (startY > 165 && index < filteredEntries.length - 1) {
        doc.addPage();
        startY = 20;
      }
    });

    const fileName = `Operativos_${new Date().toLocaleDateString('es-AR').replace(/\//g, '-')}`;
    doc.save(`${fileName}.pdf`);
  };

  const handleExportReportPDF = () => {
    if (!currentReportEntry) return;

    const eq = equipment.find(e => e.id === currentReportEntry.equipo_id);
    const doc = new jsPDF();
    const todayStr = new Date().toLocaleDateString('es-AR');

    doc.setFillColor(30, 41, 59); 
    doc.rect(0, 0, 210, 25, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('times', 'bold');
    doc.setFontSize(22);
    doc.text('GEyT', 14, 18); 
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('INFORME TÉCNICO', 200, 13, { align: 'right' }); 
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha de Emisión: ${todayStr}`, 200, 19, { align: 'right' });

    let startY = 35;
    
    doc.setFillColor(241, 245, 249); 
    doc.rect(14, startY, 182, 35, 'F');
    doc.setDrawColor(203, 213, 225); 
    doc.rect(14, startY, 182, 35, 'S');

    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL EQUIPO E INGRESO', 18, startY + 6);
    
    const estSalida = currentReportEntry.fecha_salida ? formatDateDisplay(currentReportEntry.fecha_salida) : 'N/A';
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    doc.text(`Interno:`, 18, startY + 14);
    doc.setFont('helvetica', 'bold');
    doc.text(`${currentReportEntry.equipo_id}`, 35, startY + 14);
    
    doc.setFont('helvetica', 'normal');
    doc.text(`Marca/Modelo:`, 70, startY + 14);
    doc.setFont('helvetica', 'bold');
    doc.text(`${eq?.marca || ''} ${eq?.modelo || ''}`, 95, startY + 14);

    doc.setFont('helvetica', 'normal');
    doc.text(`Hs Arrastre:`, 140, startY + 14);
    doc.setFont('helvetica', 'bold');
    doc.text(`${eq?.horas?.toLocaleString() || '-'}`, 160, startY + 14);

    doc.setFont('helvetica', 'normal');
    doc.text(`Obra:`, 18, startY + 22);
    doc.setFont('helvetica', 'bold');
    doc.text(`${currentReportEntry.obra_asignada || 'Sin asignar'}`, 35, startY + 22);

    doc.setFont('helvetica', 'normal');
    doc.text(`Ingreso:`, 70, startY + 22);
    doc.setFont('helvetica', 'bold');
    doc.text(`${formatDateDisplay(currentReportEntry.fecha_ingreso)}`, 95, startY + 22);

    doc.setFont('helvetica', 'normal');
    doc.text(`Salida Est.:`, 140, startY + 22);
    doc.setFont('helvetica', 'bold');
    doc.text(`${estSalida}`, 160, startY + 22);

    doc.setFont('helvetica', 'normal');
    doc.text(`Motivo Ingreso:`, 18, startY + 30);
    doc.text(currentReportEntry.informe_fallas || '-', 45, startY + 30);

    startY += 45;
    
    const techData = [
      ['Motor', reportData.motor || '-'],
      ['Sistema Hidráulico', reportData.sistema_hidraulico || '-'],
      ['Sistema Eléctrico', reportData.sistema_electrico || '-'],
      ['Sistema Neumático', reportData.sistema_neumatico || '-'],
      ['Estructura / Chasis', reportData.estructura || '-'],
      ['Cabina / Operador', reportData.cabina || '-'],
      ['Tren Rodante / Neumáticos', reportData.tren_rodante || '-'],
      ['Elementos de Desgaste', reportData.elementos_desgaste || '-'],
      ['Componentes Específicos', reportData.componentes_especificos || '-'],
      ['Observaciones Finales', reportData.observaciones || '-']
    ];

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('EVALUACIÓN TÉCNICA', 14, startY - 2);

    autoTable(doc, {
      startY: startY,
      head: [['Sistema / Componente', 'Estado / Observaciones']],
      body: techData,
      theme: 'grid',
      headStyles: { fillColor: [21, 128, 61], fontSize: 9, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 50, fontStyle: 'bold', fillColor: [248, 250, 252] },
        1: { cellWidth: 'auto' }
      },
      styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' }
    });

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Página ${i} de ${pageCount} - Generado por Sistema GEyT`, 105, 290, { align: 'center' });
    }

    const fileName = `${currentReportEntry.equipo_id}_${todayStr.replace(/\//g, '-')}_informe_taller.pdf`;
    doc.save(fileName);
  };

  const handleOpenReport = (entry: MaintenanceEntry) => {
    setCurrentReportEntry(entry);
    const existingReport = getExistingReport(entry);
    if (existingReport) {
      setReportData({
        motor: existingReport.motor || '',
        sistema_hidraulico: existingReport.sistema_hidraulico || '',
        sistema_electrico: existingReport.sistema_electrico || '',
        sistema_neumatico: existingReport.sistema_neumatico || '',
        estructura: existingReport.estructura || '',
        cabina: existingReport.cabina || '',
        tren_rodante: existingReport.tren_rodante || '',
        elementos_desgaste: existingReport.elementos_desgaste || '',
        componentes_especificos: existingReport.componentes_especificos || '',
        observaciones: existingReport.observaciones || ''
      });
    } else {
      setReportData({
        motor: '', sistema_hidraulico: '', sistema_electrico: '', sistema_neumatico: '', estructura: '',
        cabina: '', tren_rodante: '', elementos_desgaste: '', componentes_especificos: '', observaciones: ''
      });
    }
    setShowReportModal(true);
  };

  const handleSaveReport = async () => {
    if (!currentReportEntry) return;
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('informe_taller')
        .upsert([{
          ingreso_id: currentReportEntry.id,
          ...reportData
        }], { onConflict: 'ingreso_id' });

      if (error) throw error;
      await refreshData();
      setShowReportModal(false);
    } catch (e) {
      alert("Error guardando informe: " + (e as any).message);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Historial / Equipos Operativos</h2>
          <p className="text-xs text-slate-500 mt-1 font-bold uppercase tracking-widest">Registros finalizados y entregados</p>
        </div>
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar por interno, obra..."
              className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 w-full md:w-64 text-sm font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-green-500"
            value={workshopFilter}
            onChange={(e: any) => setWorkshopFilter(e.target.value)}
          >
            <option value="all">Todos los Talleres</option>
            <option value="pesados">Taller Pesados (E)</option>
            <option value="camiones">Taller Camiones (V)</option>
            <option value="livianos">Taller Livianos (V)</option>
          </select>
          <button 
            onClick={handleExportPDF}
            className="flex items-center justify-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-xl hover:bg-slate-900 transition-all shadow-lg text-xs font-black uppercase tracking-widest"
          >
            <Download className="w-4 h-4" /> Exportar Operativos
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1200px]">
            <thead className="bg-slate-50 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] border-b border-slate-200">
              <tr>
                <th className="px-4 py-4">Equipo / Interno</th>
                <th className="px-4 py-4">Ingreso / Obra</th>
                <th className="px-4 py-4">Motivo / Informe Fallas</th>
                <th className="px-4 py-4">Último Avance / Estado</th>
                <th className="px-4 py-4 text-center">Estadía</th>
                <th className="px-4 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {filteredEntries.map(entry => {
                const eq = equipment.find(e => e.id === entry.equipo_id);
                const { isOperative, totalDays, endDate } = getWorkshopStatus(entry);
                const loss = calculateLoss(totalDays, eq);
                const actions = entry.acciones_taller || [];
                const lastAction = actions[actions.length - 1];
                
                const isEditingEntry = editingEntryId === entry.id;

                return (
                  <tr key={entry.id} className="bg-green-50/30 border-t-2 border-slate-200 group">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 text-green-700 rounded-xl flex items-center justify-center font-black text-xs shadow-sm border border-green-200">
                          {entry.equipo_id}
                        </div>
                        <div>
                          <p className="font-black text-slate-800 leading-none">{eq?.marca || 'S/M'} {eq?.modelo || ''}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{eq?.tipo || 'Equipo'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {isEditingEntry ? (
                        <div className="space-y-1">
                          <input type="date" value={editEntryData.fecha_ingreso} onChange={e => setEditEntryData({...editEntryData, fecha_ingreso: e.target.value})} className="w-full p-1 text-xs border rounded" />
                          <input type="text" value={editEntryData.obra_asignada} onChange={e => setEditEntryData({...editEntryData, obra_asignada: e.target.value})} className="w-full p-1 text-xs border rounded" />
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {formatDateDisplay(entry.fecha_ingreso)}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold uppercase mt-1">
                            <MapPin className="w-3 h-3" />
                            {entry.obra_asignada || 'Sin Obra'}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {isEditingEntry ? (
                        <textarea value={editEntryData.informe_fallas} onChange={e => setEditEntryData({...editEntryData, informe_fallas: e.target.value})} className="w-full p-1 text-xs border rounded h-12" />
                      ) : (
                        <p className="text-xs text-slate-600 font-medium line-clamp-2 max-w-xs italic">
                          "{entry.informe_fallas || 'Sin informe inicial'}"
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <div className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tight shadow-sm bg-green-600 text-white">
                            <CheckCircle className="w-3 h-3 mr-1" /> OPERATIVO
                          </div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase">Finalizado el {formatDateDisplay(endDate || '')}</span>
                        </div>
                        {lastAction && (
                          <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-sm">
                            <p className="text-[10px] text-slate-800 font-bold leading-tight">{lastAction.descripcion}</p>
                            <p className="text-[9px] text-slate-400 font-medium mt-1 uppercase">{lastAction.responsable} • {formatDateDisplay(lastAction.fecha_accion)}</p>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="inline-flex flex-col items-center">
                        <span className="text-lg font-black text-slate-800 leading-none">{totalDays}</span>
                        <span className="text-[9px] text-slate-400 font-black uppercase tracking-tighter">Días Totales</span>
                        <div className="mt-1 px-1.5 py-0.5 bg-red-50 text-red-700 text-[9px] font-black rounded border border-red-100">
                          -{formatCurrencyAbbr(loss)}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-2">
                        {isEditingEntry ? (
                          <>
                            <button onClick={() => handleSaveEditEntry(entry.id)} className="p-2 bg-green-600 text-white rounded-lg shadow-md"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setEditingEntryId(null)} className="p-2 bg-slate-200 text-slate-600 rounded-lg"><X className="w-4 h-4" /></button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setSelectedEntryForActions(entry); setShowActionsModal(true); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="Historial de Avances"><Clock className="w-4 h-4" /></button>
                            <button onClick={() => handleOpenReport(entry)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all" title="Informe Técnico"><FileText className="w-4 h-4" /></button>
                            <button onClick={() => { setEditingEntryId(entry.id); setEditEntryData({ obra_asignada: entry.obra_asignada || '', informe_fallas: entry.informe_fallas || '', fecha_ingreso: entry.fecha_ingreso, fecha_salida: entry.fecha_salida || '' }); }} className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-xl transition-all"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => setDeleteConfirmId(entry.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400 italic font-medium">
                    No hay equipos operativos registrados en el historial.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showReportModal && currentReportEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-white/20">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="px-3 h-12 min-w-12 bg-green-600 rounded-2xl flex items-center justify-center font-black text-base shadow-lg shadow-green-900/40">
                  {currentReportEntry.equipo_id}
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter">Informe Técnico de Taller</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Evaluación de Sistemas y Componentes</p>
                </div>
              </div>
              <button onClick={() => setShowReportModal(false)} className="p-2 hover:bg-slate-800 rounded-full transition-all"><X className="w-6 h-6" /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ReportField label="Motor / Transmisión" value={reportData.motor || ''} onChange={(val: string) => setReportData({...reportData, motor: val})} placeholder="Estado de motor, fugas, ruidos, niveles..." />
                <ReportField label="Sistema Hidráulico" value={reportData.sistema_hidraulico || ''} onChange={(val: string) => setReportData({...reportData, sistema_hidraulico: val})} placeholder="Bombas, mangueras, cilindros, mandos..." />
                <ReportField label="Sistema Eléctrico" value={reportData.sistema_electrico || ''} onChange={(val: string) => setReportData({...reportData, sistema_electrico: val})} placeholder="Baterías, alternador, luces, sensores..." />
                <ReportField label="Sistema Neumático" value={reportData.sistema_neumatico || ''} onChange={(val: string) => setReportData({...reportData, sistema_neumatico: val})} placeholder="Compresor, válvulas, fugas aire..." />
                <ReportField label="Estructura / Chasis" value={reportData.estructura || ''} onChange={(val: string) => setReportData({...reportData, estructura: val})} placeholder="Soldaduras, fisuras, pasadores, bujes..." />
                <ReportField label="Cabina / Mandos" value={reportData.cabina || ''} onChange={(val: string) => setReportData({...reportData, cabina: val})} placeholder="Asiento, cristales, aire acond., controles..." />
                <ReportField label="Tren Rodante / Neumáticos" value={reportData.tren_rodante || ''} onChange={(val: string) => setReportData({...reportData, tren_rodante: val})} placeholder="Cadenas, rodillos, cubiertas, llantas..." />
                <ReportField label="Elementos de Desgaste" value={reportData.elementos_desgaste || ''} onChange={(val: string) => setReportData({...reportData, elementos_desgaste: val})} placeholder="Cuchillas, dientes, calzas, protecciones..." />
                <ReportField label="Componentes Específicos" value={reportData.componentes_especificos || ''} onChange={(val: string) => setReportData({...reportData, componentes_especificos: val})} placeholder="Martillo, balde, pluma, quinta rueda..." />
                <ReportField label="Observaciones Finales" value={reportData.observaciones || ''} onChange={(val: string) => setReportData({...reportData, observaciones: val})} placeholder="Resumen general del estado del equipo..." />
              </div>
            </div>

            <div className="p-6 bg-white border-t border-slate-100 flex justify-between items-center">
              <button onClick={handleExportReportPDF} className="flex items-center gap-2 px-6 py-3 bg-slate-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-900 transition-all shadow-xl">
                <Download className="w-4 h-4" /> Descargar PDF
              </button>
              <div className="flex gap-3">
                <button onClick={() => setShowReportModal(false)} className="px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">Cerrar</button>
                <button onClick={handleSaveReport} disabled={isProcessing} className="px-8 py-3 bg-green-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-green-800 transition-all shadow-xl shadow-green-900/20 disabled:bg-slate-300">
                  {isProcessing ? 'Guardando...' : 'Guardar Informe'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showActionsModal && selectedEntryForActions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col border border-white/20">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="px-3 h-12 min-w-12 bg-indigo-600 rounded-2xl flex items-center justify-center font-black text-base shadow-lg shadow-indigo-900/40">
                  {selectedEntryForActions.equipo_id}
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter">Historial de Avances</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Cronología de intervenciones en taller</p>
                </div>
              </div>
              <button onClick={() => setShowActionsModal(false)} className="p-2 hover:bg-slate-800 rounded-full transition-all"><X className="w-6 h-6" /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
              <div className="space-y-4">
                {(selectedEntryForActions.acciones_taller || []).length > 0 ? (
                  (selectedEntryForActions.acciones_taller || []).map((action, idx) => (
                    <div key={action.id} className="relative pl-8 before:absolute before:left-3 before:top-0 before:bottom-0 before:w-0.5 before:bg-slate-200 last:before:h-4">
                      <div className="absolute left-0 top-1 w-6 h-6 bg-white border-2 border-indigo-500 rounded-full flex items-center justify-center z-10">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                      </div>
                      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-wider">
                            {formatDateDisplay(action.fecha_accion)}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">
                            Resp: {action.responsable}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 font-medium leading-relaxed">
                          {action.descripcion}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-slate-400 italic font-medium">
                    No hay avances registrados para este equipo.
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-white border-t border-slate-100 flex justify-end">
              <button onClick={() => setShowActionsModal(false)} className="px-8 py-3 bg-slate-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-900 transition-all shadow-xl">
                Cerrar Historial
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center border border-slate-200">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner"><AlertTriangle className="w-10 h-10" /></div>
            <h3 className="text-xl font-black text-slate-800 mb-2 uppercase tracking-tighter">¿Eliminar Registro?</h3>
            <p className="text-sm text-slate-500 mb-8 font-medium">Esta acción borrará permanentemente este ingreso del historial. Esta operación no se puede deshacer.</p>
            <div className="flex gap-4">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">Cancelar</button>
              <button onClick={confirmDeleteEntry} disabled={isProcessing} className="flex-1 px-6 py-3 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all shadow-xl shadow-red-900/20 disabled:bg-slate-300">
                {isProcessing ? 'Eliminando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryView;
