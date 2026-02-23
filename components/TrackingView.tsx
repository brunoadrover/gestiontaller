
import React, { useState, useMemo, useRef } from 'react';
import { MaintenanceEntry, Equipment, MaintenanceAction, TechnicalReport } from '../types';
import { Plus, Search, Calendar, Save, Trash2, ArrowRight, FileText, User, Clock, AlertTriangle, X, Edit2, Check, Wrench, MessageSquare, Activity, MapPin, Filter, ClipboardCheck, Download, CheckCircle, Mic, MicOff, Loader2 } from 'lucide-react';
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

interface TrackingViewProps {
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
          {/* Voice Transcription Button */}
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
            <div className="absolute bottom-full right-0 mb-2 hidden group-hover/voice:block w-40 bg-slate-800 text-white text-[9px] p-2 rounded shadow-lg z-10 text-center">
              {isRecording ? "Detener y transcribir" : "Dictar por voz (IA)"}
              <div className="absolute -bottom-1 right-2 w-2 h-2 bg-slate-800 rotate-45"></div>
            </div>
          </div>

          {/* Completion Toggle */}
          <div className="relative group/tooltip">
            <button
              onClick={toggleCompleted}
              className={`p-0.5 rounded-full transition-all ${isCompleted ? 'text-red-600 bg-red-50' : 'text-slate-300 hover:text-red-500 hover:bg-slate-100'}`}
            >
              <CheckCircle className={`w-4 h-4 ${isCompleted ? 'fill-current' : ''}`} />
            </button>
            <div className="absolute bottom-full right-0 mb-2 hidden group-hover/tooltip:block w-48 bg-slate-800 text-white text-[10px] p-2 rounded shadow-lg z-10 text-center">
              Marca este ítem como revisado y finalizado agregando una firma de fecha.
              <div className="absolute -bottom-1 right-2 w-2 h-2 bg-slate-800 rotate-45"></div>
            </div>
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
        {isTranscribing && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center rounded">
            <div className="flex items-center gap-2 text-blue-600 font-black text-[10px] uppercase tracking-widest">
              <Loader2 className="w-4 h-4 animate-spin" />
              Transcribiendo...
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const TrackingView: React.FC<TrackingViewProps> = ({ entries, refreshData, equipment }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'repair' | 'parts' | 'testing' | 'operative'>('all');
  const [workshopFilter, setWorkshopFilter] = useState<'all' | 'pesados' | 'camiones' | 'livianos'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // States for Technical Report Modal
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
  
  const [newEntry, setNewEntry] = useState({
    interno: '',
    fecha_ingreso: today,
    fecha_salida: '', // Nuevo campo estado inicial
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
    fecha_salida: string; // Nuevo campo en edición
  }>({ obra_asignada: '', informe_fallas: '', fecha_ingreso: '', fecha_salida: '' });

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
          eq?.marca?.toLowerCase().includes(term)
        );
      });
    }

    if (statusFilter !== 'all') {
      result = result.filter(entry => {
        const { isOperative, isWaitingParts, isTesting, isInRepair } = getWorkshopStatus(entry);
        if (statusFilter === 'operative') return isOperative;
        if (statusFilter === 'parts') return isWaitingParts;
        if (statusFilter === 'testing') return isTesting;
        if (statusFilter === 'repair') return isInRepair;
        return true;
      });
    }

    if (workshopFilter !== 'all') {
      result = result.filter(entry => getWorkshopType(entry) === workshopFilter);
    }

    return result;
  }, [entries, searchTerm, statusFilter, workshopFilter, equipment]);

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
      const { isOperative, isWaitingParts, isTesting, totalDays } = getWorkshopStatus(entry);
      const loss = calculateLoss(totalDays, eq);
      totalLossAll += loss;
      totalStayDaysAll += totalDays;
      if (isOperative) operativeCount++; else currentlyInWorkshopCount++;

      let headerBg = [219, 234, 254]; 
      if (isOperative) headerBg = [220, 252, 231]; 
      else if (isTesting) headerBg = [237, 233, 254]; 
      else if (isWaitingParts) headerBg = [255, 237, 213]; 

      doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
      doc.rect(14, startY, 269, 22, 'F');
      doc.setDrawColor(200, 200, 200);
      doc.rect(14, startY, 269, 22, 'S');
      
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      
      const statusLabel = isOperative ? 'OPERATIVO' : (isTesting ? 'EN PRUEBA' : (isWaitingParts ? 'EN TALLER (ESPERA REPUESTOS)' : 'EN REPARACIÓN'));
      const estSalida = entry.fecha_salida ? formatDateDisplay(entry.fecha_salida) : 'N/A';
      
      const headerText = `INTERNO: ${entry.equipo_id} | MARCA: ${eq?.marca || ''} ${eq?.modelo || ''} | OBRA: ${entry.obra_asignada || 'N/A'} | SALIDA ESTIMADA: ${estSalida}`;
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
      const filterSuffix = statusFilter.toUpperCase();
      fileName += `_${filterSuffix}`;
    }

    if (workshopFilter !== 'all') {
      const workshopSuffix = workshopFilter.toUpperCase();
      fileName += `_${workshopSuffix}`;
    }

    doc.save(`${fileName}.pdf`);
  };

  const handleExportReportPDF = () => {
    if (!currentReportEntry) return;

    const eq = equipment.find(e => e.id === currentReportEntry.equipo_id);
    const doc = new jsPDF();
    const todayStr = new Date().toLocaleDateString('es-AR');

    // --- Header ---
    doc.setFillColor(30, 41, 59); // Slate 800
    doc.rect(0, 0, 210, 25, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('times', 'bold');
    doc.setFontSize(22);
    doc.text('GEyT', 14, 18); // Ajustado ligeramente
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('INFORME TÉCNICO', 200, 13, { align: 'right' }); // Texto simplificado
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha de Emisión: ${todayStr}`, 200, 19, { align: 'right' });

    // --- Datos del Equipo ---
    let startY = 35;
    
    doc.setFillColor(241, 245, 249); // Slate 100
    doc.rect(14, startY, 182, 35, 'F');
    doc.setDrawColor(203, 213, 225); // Slate 300
    doc.rect(14, startY, 182, 35, 'S');

    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL EQUIPO E INGRESO', 18, startY + 6);
    
    const estSalida = currentReportEntry.fecha_salida ? formatDateDisplay(currentReportEntry.fecha_salida) : 'N/A';
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    // Fila 1
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

    // Fila 2
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

    // Fila 3 (Motivo)
    doc.setFont('helvetica', 'normal');
    doc.text(`Motivo Ingreso:`, 18, startY + 30);
    doc.text(currentReportEntry.informe_fallas || '-', 45, startY + 30);


    // --- Evaluación Técnica ---
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

    // Se ha eliminado el bloque de Historial de Intervenciones

    // --- Footer ---
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
          fecha_salida: newEntry.fecha_salida || null, // Guardar fecha salida
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
        interno: '', fecha_ingreso: today, fecha_salida: '', obra_asignada: '', informe_fallas: '',
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
      const payload = {
        obra_asignada: editEntryData.obra_asignada,
        informe_fallas: editEntryData.informe_fallas,
        fecha_ingreso: editEntryData.fecha_ingreso,
        fecha_salida: editEntryData.fecha_salida || null // Actualizar fecha salida
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

  const handleOpenReport = (entry: MaintenanceEntry) => {
    setCurrentReportEntry(entry);
    
    // Usar la función auxiliar segura
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
      // Resetear formulario si no hay informe previo
      setReportData({
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
    }
    setShowReportModal(true);
  };

  const handleSaveReport = async () => {
    if (!currentReportEntry) return;
    setIsProcessing(true);
    try {
      const payload = {
        ...reportData,
        ingreso_id: currentReportEntry.id,
        equipo_id: currentReportEntry.equipo_id
      };

      // Upsert: Si existe (unique constraint en ingreso_id), actualiza. Si no, inserta.
      const { error } = await supabase
        .from('informe_taller')
        .upsert(payload, { onConflict: 'ingreso_id' });

      if (error) throw error;

      await refreshData();
      setShowReportModal(false);
    } catch (e) {
      alert("Error guardando informe técnico: " + (e as any).message);
    } finally {
      setIsProcessing(false);
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
              <option value="pesados">TALLER PESADOS</option>
              <option value="camiones">TALLER CAMIONES</option>
              <option value="livianos">TALLER LIVIANOS</option>
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
              <option value="parts">ESPERANDO REPUESTOS</option>
              <option value="testing">EN PRUEBA</option>
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
            <div className="md:col-span-1">
              <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase">Fecha Ingreso</label>
              <input type="date" value={newEntry.fecha_ingreso} onChange={e => setNewEntry({...newEntry, fecha_ingreso: e.target.value, actionDate: e.target.value})} className="w-full bg-white border border-slate-400 rounded p-2 text-sm font-bold text-slate-950" />
            </div>
            <div className="md:col-span-1">
              <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase">Salida Estimada</label>
              <input type="date" value={newEntry.fecha_salida} onChange={e => setNewEntry({...newEntry, fecha_salida: e.target.value})} className="w-full bg-white border border-slate-400 rounded p-2 text-sm font-bold text-slate-950" />
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
              <th className="px-4 py-3 border-r border-slate-200 text-center">Salida Estimada</th>
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
                <td colSpan={11} className="px-4 py-20 text-center text-slate-400 italic">No se encontraron registros de taller.</td>
              </tr>
            ) : (
              filteredEntries.map(entry => {
                const eq = equipment.find(e => e.id === entry.equipo_id);
                const { isOperative, isWaitingParts, isTesting, totalDays } = getWorkshopStatus(entry);
                const loss = calculateLoss(totalDays, eq);
                const actions = entry.acciones_taller || [];
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

                return (
                  <React.Fragment key={entry.id}>
                    <tr className={`${isOperative ? 'bg-green-50/50' : isTesting ? 'bg-violet-50/50' : isWaitingParts ? 'bg-orange-50/50' : 'bg-blue-50/30'} border-t-2 border-slate-200 group`}>
                      <td className="px-4 py-4 border-r border-slate-200">
                        <div className="font-black text-slate-900 leading-none">{entry.equipo_id}</div>
                        <div className="mt-2 flex flex-col gap-1">
                          <div className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tight shadow-sm ${isOperative ? 'bg-green-600 text-white' : (isTesting ? 'bg-violet-600 text-white' : (isWaitingParts ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white'))}`}>
                            {totalDays} d. Total
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
                      </td>
                      <td className="px-4 py-4 border-r border-slate-200">
                        {isEditingEntry ? <input type="text" value={editEntryData.obra_asignada} onChange={e => setEditEntryData({...editEntryData, obra_asignada: e.target.value})} className={editInputClass} /> : <div className="font-bold text-slate-600">{entry.obra_asignada || 'N/A'}</div>}
                      </td>
                      <td className="px-4 py-4 border-r border-slate-200 text-center font-mono font-bold text-slate-500">
                        {isEditingEntry ? <input type="date" value={editEntryData.fecha_ingreso} onChange={e => setEditEntryData({...editEntryData, fecha_ingreso: e.target.value})} className={editInputClass} /> : formatDateDisplay(entry.fecha_ingreso)}
                      </td>
                      <td className="px-4 py-4 border-r border-slate-200 text-center font-mono font-bold text-slate-500">
                        {isEditingEntry ? <input type="date" value={editEntryData.fecha_salida} onChange={e => setEditEntryData({...editEntryData, fecha_salida: e.target.value})} className={editInputClass} /> : formatDateDisplay(entry.fecha_salida || '')}
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
                              {!isOperative && !isWaitingParts && !isTesting && <span className="px-1.5 py-0.5 bg-blue-200 text-blue-800 text-[8px] font-black rounded uppercase flex items-center gap-1 shadow-sm">En Reparación</span>}
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
                            onClick={() => handleOpenReport(entry)} 
                            className={`p-1 rounded transition-colors ${hasReport ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100' : 'text-slate-300 hover:text-indigo-500'}`}
                            title="Informe Técnico"
                          >
                            <ClipboardCheck className="w-5 h-5" />
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
                                  fecha_ingreso: entry.fecha_ingreso,
                                  fecha_salida: entry.fecha_salida || '' 
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

      {/* Modal de Informe Técnico */}
      {showReportModal && currentReportEntry && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
            <div className="p-6 bg-slate-800 text-white flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-3">
                  <ClipboardCheck className="w-6 h-6 text-green-400" />
                  Informe Técnico de Taller
                </h2>
                <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-bold">
                  Interno: {currentReportEntry.equipo_id} | Ingreso: {formatDateDisplay(currentReportEntry.fecha_ingreso)}
                </p>
              </div>
              <button onClick={() => setShowReportModal(false)} className="text-slate-400 hover:text-white"><X className="w-6 h-6" /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <ReportField label="Motor" value={reportData.motor || ''} onChange={(val: string) => setReportData({...reportData, motor: val})} placeholder="Estado del motor, fugas, ruidos..." />
                <ReportField label="Sistema Hidráulico" value={reportData.sistema_hidraulico || ''} onChange={(val: string) => setReportData({...reportData, sistema_hidraulico: val})} placeholder="Cilindros, mangueras, bombas..." />
                <ReportField label="Sistema Eléctrico" value={reportData.sistema_electrico || ''} onChange={(val: string) => setReportData({...reportData, sistema_electrico: val})} placeholder="Baterías, arranque, luces..." />
                <ReportField label="Sistema Neumático" value={reportData.sistema_neumatico || ''} onChange={(val: string) => setReportData({...reportData, sistema_neumatico: val})} placeholder="Compresor, válvulas, fugas aire..." />
                <ReportField label="Estructura / Chasis" value={reportData.estructura || ''} onChange={(val: string) => setReportData({...reportData, estructura: val})} placeholder="Fisuras, soldaduras, deformaciones..." />
                <ReportField label="Cabina / Operador" value={reportData.cabina || ''} onChange={(val: string) => setReportData({...reportData, cabina: val})} placeholder="Instrumentos, asiento, vidrios..." />
                <ReportField label="Tren Rodante / Neumáticos" value={reportData.tren_rodante || ''} onChange={(val: string) => setReportData({...reportData, tren_rodante: val})} placeholder="Desgaste orugas, estado cubiertas..." />
                <ReportField label="Elementos de Desgaste" value={reportData.elementos_desgaste || ''} onChange={(val: string) => setReportData({...reportData, elementos_desgaste: val})} placeholder="Cuchillas, dientes, pernos..." />
                <ReportField label="Componentes Específicos" value={reportData.componentes_especificos || ''} onChange={(val: string) => setReportData({...reportData, componentes_especificos: val})} placeholder="Otros sistemas especiales..." />
              </div>
              <div className="mt-6">
                <ReportField 
                  label="Observaciones Generales" 
                  value={reportData.observaciones || ''} 
                  onChange={(val: string) => setReportData({...reportData, observaciones: val})} 
                  placeholder="Conclusiones generales del estado del equipo..." 
                  className="w-full bg-white border-2 border-slate-300 rounded p-4 text-sm text-slate-900 h-32 outline-none focus:border-green-500 font-medium resize-none"
                />
              </div>
            </div>

            <div className="p-6 bg-white border-t border-slate-200 flex justify-between gap-3 items-center">
              <button 
                onClick={handleExportReportPDF} 
                className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-md transition-all flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                Exportar PDF
              </button>
              
              <div className="flex gap-3">
                <button onClick={() => setShowReportModal(false)} className="px-6 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancelar</button>
                <button onClick={handleSaveReport} disabled={isProcessing} className="px-8 py-3 bg-green-700 text-white font-bold rounded-xl hover:bg-green-800 shadow-lg transition-all disabled:bg-slate-300 flex items-center gap-2">
                  <Save className="w-5 h-5" />
                  {isProcessing ? 'Guardando...' : 'Guardar Informe'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrackingView;
