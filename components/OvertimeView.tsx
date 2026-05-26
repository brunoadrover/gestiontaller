import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabase';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Plus, Calendar, Wrench, User, Trash2, Edit2, Clock, X, Search, 
  Utensils, Layout, Check, ShieldAlert, ArrowLeft, Loader2, UserPlus, 
  ChevronRight, ListTodo, Users, HelpCircle, HardHat, Printer
} from 'lucide-react';

interface Dia {
  id: string;
  fecha: string;
  supervisor: string;
  cont_tareas: number;
  cont_colaborad: number;
  hora_entrada: string;
  hora_salida: string;
  comedor: boolean;
}

interface Tarea {
  id: string;
  titulo: string;
  descripcion: string;
  sector: string;
  equipo: string;
  recursos: string;
  seguridad: string;
  id_dia: string;
  id_colab1: string | null;
  id_colab2: string | null;
  id_colab3: string | null;
  id_colab4: string | null;
}

interface Colaborador {
  id: string;
  nombre: string;
  apellido: string;
}

interface Sector {
  sectores: string;
}

// Custom Combobox search component for Sectors and Collaborators
interface SearchDropdownProps<T> {
  label: string;
  items: T[];
  selectedId: string | null;
  selectedText: string;
  onSelect: (item: T | null) => void;
  getSearchText: (item: T) => string;
  getDisplayValue: (item: T) => string;
  getId: (item: T) => string;
  placeholder: string;
  disabled?: boolean;
}

function SearchDropdown<T>({
  label,
  items,
  selectedId,
  selectedText,
  onSelect,
  getSearchText,
  getDisplayValue,
  getId,
  placeholder,
  disabled = false
}: SearchDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter items based on query
  const filteredItems = useMemo(() => {
    if (!searchQuery) return items;
    const query = searchQuery.toLowerCase().trim();
    return items.filter(item => 
      getSearchText(item).toLowerCase().includes(query)
    );
  }, [items, searchQuery, getSearchText]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative flex flex-col w-full" ref={containerRef}>
      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">{label}</label>
      
      {selectedId ? (
        <div className="flex items-center justify-between w-full px-3.5 py-2.5 bg-green-50/80 border border-green-300 rounded-xl text-xs font-semibold text-green-900 shadow-sm animate-in fade-in duration-200">
          <span className="truncate">{selectedText}</span>
          <button
            type="button"
            onClick={() => {
              if (disabled) return;
              onSelect(null);
              setSearchQuery('');
            }}
            className="p-1 hover:bg-green-100 rounded-full text-green-600 transition-colors"
            disabled={disabled}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            className="w-full px-3.5 py-2.5 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 font-medium outline-none focus:bg-white focus:ring-2 focus:ring-green-400 focus:border-green-400 transition-all shadow-sm"
            placeholder={placeholder}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => {
              if (!disabled) setIsOpen(true);
            }}
            disabled={disabled}
          />
          <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-slate-400" />
          </div>

          {isOpen && !disabled && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto overflow-x-hidden animate-in slide-in-from-top-2 duration-150">
              {filteredItems.length === 0 ? (
                <div className="p-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Sin Resultados
                </div>
              ) : (
                filteredItems.map((item) => {
                  const id = getId(item);
                  const display = getDisplayValue(item);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        onSelect(item);
                        setIsOpen(false);
                        setSearchQuery('');
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-50 text-xs text-slate-700 font-medium border-b border-slate-50 last:border-b-0 transition-colors truncate"
                    >
                      {display}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface OvertimeViewProps {
  customTitle?: string;
  customSugerencia?: string;
}

const OvertimeView: React.FC<OvertimeViewProps> = ({ customTitle, customSugerencia }) => {
  // DB States
  const [dias, setDias] = useState<Dia[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [sectores, setSectores] = useState<Sector[]>([]);
  
  // UI States
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedDia, setSelectedDia] = useState<Dia | null>(null);
  
  // Modals
  const [showDiaModal, setShowDiaModal] = useState(false);
  const [editingDia, setEditingDia] = useState<Dia | null>(null);
  const [showTareaModal, setShowTareaModal] = useState(false);
  const [editingTarea, setEditingTarea] = useState<Tarea | null>(null);
  const [selectedTaskForDetails, setSelectedTaskForDetails] = useState<Tarea | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    type: 'dia' | 'tarea';
    title: string;
    message: string;
  } | null>(null);

  // Dia Form Fields
  const [diaFecha, setDiaFecha] = useState('');
  const [diaSupervisor, setDiaSupervisor] = useState('');
  const [diaHoraEntrada, setDiaHoraEntrada] = useState('07:30');
  const [diaHoraSalida, setDiaHoraSalida] = useState('14:30');
  const [diaComedor, setDiaComedor] = useState(true);

  // Tarea Form Fields
  const [tareaTitulo, setTareaTitulo] = useState('');
  const [tareaDescripcion, setTareaDescripcion] = useState('');
  const [tareaSector, setTareaSector] = useState('');
  const [tareaEquipo, setTareaEquipo] = useState('');
  const [tareaRecursos, setTareaRecursos] = useState('');
  const [tareaSeguridad, setTareaSeguridad] = useState('');
  const [colab1, setColab1] = useState<Colaborador | null>(null);
  const [colab2, setColab2] = useState<Colaborador | null>(null);
  const [colab3, setColab3] = useState<Colaborador | null>(null);
  const [colab4, setColab4] = useState<Colaborador | null>(null);

  // Search filter for master list days
  const [diaSearch, setDiaSearch] = useState('');

  // Fetch helper to fetch days
  const loadDias = async () => {
    try {
      const { data, error } = await supabase
        .from('dia')
        .select('*')
        .order('fecha', { ascending: false });
      if (error) throw error;
      setDias(data || []);
    } catch (err) {
      console.error("Error loading overtime days:", err);
    }
  };

  // Fetch helpers
  const loadMetadata = async () => {
    try {
      // 1. Fetch colaboradores
      const { data: colData, error: colError } = await supabase
        .from('colaboradores')
        .select('id, nombre, apellido');
      if (colError) throw colError;
      setColaboradores(colData || []);

      // 2. Fetch sectores
      const { data: secData, error: secError } = await supabase
        .from('sectores')
        .select('sectores');
      if (secError) throw secError;
      setSectores(secData || []);
    } catch (err) {
      console.error("Error loading collaborators or sectors metadata:", err);
    }
  };

  // Fetch tasks of selected day
  const loadTareasForSelectedDay = async (diaId: string) => {
    try {
      const { data, error } = await supabase
        .from('tareas')
        .select('*')
        .eq('id_dia', diaId);
      if (error) throw error;
      setTareas(data || []);
    } catch (err) {
      console.error("Error loading tasks for day:", err);
    }
  };

  // Helper to calculate the next Saturday starting from today or any start date
  const getNextSaturdayStr = () => {
    const d = new Date();
    const day = d.getDay();
    // Immediate next Saturday calculation
    // Sunday (0) -> Saturday (6) is 6 days.
    // Friday (5) -> Saturday (6) is 1 day.
    // Saturday (6) -> next Saturday is 7 days.
    const diff = (6 - day + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
  };

  // Trigger loading on mount
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([loadDias(), loadMetadata()]);
      setIsLoading(false);
    };
    init();
  }, []);

  // Sync selected day details if update occurs
  useEffect(() => {
    if (selectedDia) {
      loadTareasForSelectedDay(selectedDia.id);
      // Also update selectedDia itself from updated dias list if available
      const found = dias.find(d => d.id === selectedDia.id);
      if (found) {
        setSelectedDia(found);
      }
    }
  }, [selectedDia?.id, dias]);

  // Update dia counters inside DB for a custom selected day
  const updateDiaCounters = async (diaId: string) => {
    try {
      // 1. Fetch current tasks for diaId
      const { data: qTasks, error: qError } = await supabase
        .from('tareas')
        .select('id, id_colab1, id_colab2, id_colab3, id_colab4')
        .eq('id_dia', diaId);
      
      if (qError) throw qError;
      
      const cont_tareas = qTasks ? qTasks.length : 0;
      
      // Calculate distinct collaborators count
      const colabIds = new Set<string>();
      qTasks?.forEach(t => {
        if (t.id_colab1) colabIds.add(t.id_colab1);
        if (t.id_colab2) colabIds.add(t.id_colab2);
        if (t.id_colab3) colabIds.add(t.id_colab3);
        if (t.id_colab4) colabIds.add(t.id_colab4);
      });
      const cont_colaborad = colabIds.size;

      // 2. Update DB dia table with newly calculated values
      const { error: updError } = await supabase
        .from('dia')
        .update({
          cont_tareas,
          cont_colaborad
        })
        .eq('id', diaId);

      if (updError) throw updError;

      // 3. Reload dias from DB to ensure state sync
      await loadDias();
    } catch (err) {
      console.error("Error recalulating and updating counters for day:", err);
    }
  };

  // Modal Open/Reset for Dia
  const handleOpenNewDia = () => {
    setEditingDia(null);
    setDiaFecha(getNextSaturdayStr());
    setDiaSupervisor('');
    setDiaHoraEntrada('07:30');
    setDiaHoraSalida('14:30');
    setDiaComedor(true);
    setShowDiaModal(true);
  };

  const handleOpenEditDia = (dia: Dia) => {
    setEditingDia(dia);
    setDiaFecha(dia.fecha);
    setDiaSupervisor(dia.supervisor || '');
    setDiaHoraEntrada(dia.hora_entrada || '07:30');
    setDiaHoraSalida(dia.hora_salida || '14:30');
    setDiaComedor(dia.comedor !== false); // default to true
    setShowDiaModal(true);
  };

  // Submit Dia Create/Update
  const handleSaveDia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!diaFecha) {
      alert("La fecha es obligatoria");
      return;
    }

    setIsProcessing(true);
    try {
      if (editingDia) {
        // Update
        const { error } = await supabase
          .from('dia')
          .update({
            fecha: diaFecha,
            supervisor: diaSupervisor || null,
            hora_entrada: diaHoraEntrada || null,
            hora_salida: diaHoraSalida || null,
            comedor: diaComedor
          })
          .eq('id', editingDia.id);
        if (error) throw error;
      } else {
        // Create
        const { error } = await supabase
          .from('dia')
          .insert([{
            fecha: diaFecha,
            supervisor: diaSupervisor || null,
            hora_entrada: diaHoraEntrada || null,
            hora_salida: diaHoraSalida || null,
            comedor: diaComedor,
            cont_tareas: 0,
            cont_colaborad: 0
          }]);
        if (error) throw error;
      }

      await loadDias();
      setShowDiaModal(false);
    } catch (err: any) {
      console.error("Error saving dia:", err);
      alert("Error al guardar: " + (err.message || err.toString()));
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete Overtime Day
  const handleDeleteDia = (id: string) => {
    setDeleteConfirm({
      id,
      type: 'dia',
      title: 'Eliminar Jornada de Sábado',
      message: '¿Está seguro de que desea eliminar permanentemente esta jornada de horas extras? Se desvincularán o eliminarán todas sus tareas asociadas.'
    });
  };

  // Execute physical deletion after confirmation
  const handleExecuteDelete = async () => {
    if (!deleteConfirm) return;
    setIsProcessing(true);
    try {
      if (deleteConfirm.type === 'dia') {
        const id = deleteConfirm.id;
        // 1. Delete tasks first to prevent FK constraint failures
        await supabase
          .from('tareas')
          .delete()
          .eq('id_dia', id);

        // 2. Delete day
        const { error } = await supabase
          .from('dia')
          .delete()
          .eq('id', id);
        if (error) throw error;

        if (selectedDia?.id === id) {
          setSelectedDia(null);
        }
        await loadDias();
      } else if (deleteConfirm.type === 'tarea') {
        const taskId = deleteConfirm.id;
        if (!selectedDia) return;
        const { error } = await supabase
          .from('tareas')
          .delete()
          .eq('id', taskId);
        if (error) throw error;

        await loadTareasForSelectedDay(selectedDia.id);
        await updateDiaCounters(selectedDia.id);
      }
      setDeleteConfirm(null);
    } catch (err: any) {
      console.error("Error executing deletion:", err);
      alert("Error al eliminar elemento: " + (err.message || err.toString()));
    } finally {
      setIsProcessing(false);
    }
  };

  // Modal Open/Reset for Task
  const handleOpenNewTarea = (sectorPreselected?: string) => {
    if (!selectedDia) return;
    setEditingTarea(null);
    setTareaTitulo('');
    setTareaDescripcion('');
    setTareaSector(sectorPreselected || '');
    setTareaEquipo('');
    setTareaRecursos('');
    setTareaSeguridad('');
    setColab1(null);
    setColab2(null);
    setColab3(null);
    setColab4(null);
    setShowTareaModal(true);
  };

  const handleOpenEditTarea = (tarea: Tarea) => {
    if (!selectedDia) return;
    setEditingTarea(tarea);
    setTareaTitulo(tarea.titulo);
    setTareaDescripcion(tarea.descripcion || '');
    setTareaSector(tarea.sector || '');
    setTareaEquipo(tarea.equipo || '');
    setTareaRecursos(tarea.recursos || '');
    setTareaSeguridad(tarea.seguridad || '');

    // Set collaborators based on matching ID
    setColab1(colaboradores.find(c => c.id === tarea.id_colab1) || null);
    setColab2(colaboradores.find(c => c.id === tarea.id_colab2) || null);
    setColab3(colaboradores.find(c => c.id === tarea.id_colab3) || null);
    setColab4(colaboradores.find(c => c.id === tarea.id_colab4) || null);
    setShowTareaModal(true);
  };

  // Submit Task Create/Update
  const handleSaveTarea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDia) return;
    if (!tareaTitulo.trim()) {
      alert("El título de la tarea es obligatorio");
      return;
    }
    if (!tareaSector.trim()) {
      alert("El sector es obligatorio");
      return;
    }

    setIsProcessing(true);
    try {
      const payload = {
        titulo: tareaTitulo.trim(),
        descripcion: tareaDescripcion.trim() || null,
        sector: tareaSector.trim(),
        equipo: tareaEquipo.trim() || null,
        recursos: tareaRecursos.trim() || null,
        seguridad: tareaSeguridad.trim() || null,
        id_dia: selectedDia.id,
        id_colab1: colab1?.id || null,
        id_colab2: colab2?.id || null,
        id_colab3: colab3?.id || null,
        id_colab4: colab4?.id || null,
      };

      if (editingTarea) {
        // Update task
        const { error } = await supabase
          .from('tareas')
          .update(payload)
          .eq('id', editingTarea.id);
        if (error) throw error;
      } else {
        // Insert task
        const { error } = await supabase
          .from('tareas')
          .insert([payload]);
        if (error) throw error;
      }

      // Reload tasks for the selected day
      await loadTareasForSelectedDay(selectedDia.id);
      
      // Update counters triggers recalculation of counts in Table `dia`
      await updateDiaCounters(selectedDia.id);

      setShowTareaModal(false);
    } catch (err: any) {
      console.error("Error saving task:", err);
      alert("Error al guardar tarea: " + (err.message || err.toString()));
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete Task
  const handleDeleteTarea = (taskId: string) => {
    setDeleteConfirm({
      id: taskId,
      type: 'tarea',
      title: 'Eliminar Tarea Programada',
      message: '¿Está seguro de que desea eliminar permanentemente esta tarea? No se podrá recuperar.'
    });
  };

  // Get collaborator display name from id
  const getColaboradorName = (id: string | null) => {
    if (!id) return '';
    const colab = colaboradores.find(c => c.id === id);
    return colab ? `${colab.nombre} ${colab.apellido}` : 'Cargando...';
  };

  // Export full day planning to PDF
  const handleExportPDF = () => {
    if (!selectedDia) return;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const formattedDate = formatFullDate(selectedDia.fecha);
    const docTitle = customTitle || `PLANIFICACION DE JORNADA EXTRAORDINARIA`;
    
    // Header banner with deep elegant slate background
    doc.setFillColor(15, 23, 42); // slate 900
    doc.rect(0, 0, 210, 38, 'F');
    
    // Header Title
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(docTitle, 14, 15);
    
    // Metadata lines
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184); // slate 400
    doc.text(`Fecha de la Jornada:`, 14, 21);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(formattedDate, 48, 21);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(`Supervisor:`, 115, 21);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(selectedDia.supervisor || 'Sin asignar', 135, 21);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(`Rango Horario:`, 14, 27);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(`${selectedDia.hora_entrada || '07:30'}hs - ${selectedDia.hora_salida || '14:30'}hs`, 48, 27);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(`Comedor:`, 115, 27);
    doc.setFont('helvetica', 'bold');
    if (selectedDia.comedor) {
      doc.setTextColor(74, 222, 128); // light green
    } else {
      doc.setTextColor(255, 255, 255);
    }
    doc.text(selectedDia.comedor ? 'Comedor de Planta Habilitado' : 'Desactivado', 135, 27);

    // Green indicator strike bar
    doc.setFillColor(34, 197, 94); // Green 500
    doc.rect(0, 38, 210, 1.5, 'F');

    let startY = 48;

    const sectors = Object.keys(groupedTareasBySector);

    if (sectors.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text('No hay tareas planificadas para esta jornada.', 14, startY);
      startY += 10;
    } else {
      sectors.forEach((sectorName) => {
        const tareasInSector = groupedTareasBySector[sectorName];

        // Group Header text and rectangle backdrop
        if (startY > 250) {
          doc.addPage();
          startY = 20;
        }

        doc.setFillColor(248, 250, 252); // slate 50
        doc.rect(14, startY, 182, 7, 'F');
        doc.setDrawColor(226, 232, 240); // slate 200
        doc.rect(14, startY, 182, 7, 'D');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42); // slate 950
        doc.text(`SECTOR: ${sectorName.toUpperCase()}`, 18, startY + 4.8);

        startY += 9;

        const tableBody = tareasInSector.map((tarea) => {
          const assignedColabs = [tarea.id_colab1, tarea.id_colab2, tarea.id_colab3, tarea.id_colab4]
            .filter(Boolean)
            .map((id) => getColaboradorName(id))
            .join(', ');

          return [
            tarea.titulo || 'Sin Titulo',
            tarea.descripcion || '-',
            tarea.equipo || '-',
            tarea.recursos || '-',
            tarea.seguridad || '-',
            assignedColabs || 'Sin colaboradores'
          ];
        });

        autoTable(doc, {
          startY: startY,
          head: [['Titulo Tarea', 'Descripcion de la Tarea', 'Equipo/Maq.', 'Recursos', 'C. Seguridad', 'Colaboradores']],
          body: tableBody,
          theme: 'grid',
          headStyles: {
            fillColor: [51, 65, 85], // slate 700
            textColor: [255, 255, 255],
            fontSize: 7.5,
            fontStyle: 'bold',
            halign: 'left'
          },
          columnStyles: {
            0: { cellWidth: 28 }, // Titulo
            1: { cellWidth: 42 }, // Descripcion
            2: { cellWidth: 18 }, // Equipo
            3: { cellWidth: 26 }, // Recursos
            4: { cellWidth: 34 }, // Seguridad
            5: { cellWidth: 34 }  // Colaboradores
          },
          styles: {
            fontSize: 7.2,
            cellPadding: 2,
            overflow: 'linebreak'
          },
          margin: { left: 14, right: 14 }
        });

        startY = (doc as any).lastAutoTable.finalY + 8;
      });
    }

    // List of affected collaborators (no duplicates)
    const affectedColabsSet = new Set<string>();
    tareas.forEach(tarea => {
      if (tarea.id_colab1) affectedColabsSet.add(tarea.id_colab1);
      if (tarea.id_colab2) affectedColabsSet.add(tarea.id_colab2);
      if (tarea.id_colab3) affectedColabsSet.add(tarea.id_colab3);
      if (tarea.id_colab4) affectedColabsSet.add(tarea.id_colab4);
    });

    const affectedColaboradores = Array.from(affectedColabsSet).map(id => {
      const colab = colaboradores.find(c => c.id === id);
      return colab ? `${colab.nombre} ${colab.apellido}` : '';
    }).filter(Name => Name !== '').sort((a, b) => a.localeCompare(b));

    if (startY > 200) {
      doc.addPage();
      startY = 20;
    } else {
      startY += 4;
    }

    doc.setFillColor(30, 41, 59); // slate 800
    doc.rect(14, startY, 182, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text('CONTROL DE ASISTENCIA Y SEGUIMIENTO (PERSONAL AFECTADO)', 18, startY + 4.8);
    startY += 11;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Planilla de firmas de colaboradores designados a tareas extraordinarias de la jornada para control y seguimiento.', 14, startY);
    startY += 8;

    if (affectedColaboradores.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184);
      doc.text('No se registraron colaboradores afectados para este dia de planificacion.', 18, startY);
      startY += 10;
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text('Nombre & Apellido del Colaborador', 18, startY);
      doc.text('Presente', 95, startY);
      doc.text('Observaciones', 125, startY);
      
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(14, startY + 2.5, 196, startY + 2.5);
      startY += 9;

      affectedColaboradores.forEach((fullname, index) => {
        if (startY > 265) {
          doc.addPage();
          startY = 20;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(15, 23, 42);
          doc.text('Nombre & Apellido del Colaborador', 18, startY);
          doc.text('Presente', 95, startY);
          doc.text('Observaciones', 125, startY);
          doc.line(14, startY + 2.5, 196, startY + 2.5);
          startY += 9;
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);
        doc.text(`${index + 1}. ${fullname}`, 18, startY);

        // Draw 'Presente' checkbox
        doc.setFont('helvetica', 'normal');
        doc.setDrawColor(148, 163, 184);
        doc.rect(98, startY - 2.8, 3.5, 3.5, 'D');

        // Draw placeholder line for custom Observation/Notes
        doc.setTextColor(148, 163, 184);
        doc.text('____________________________________', 125, startY);

        doc.setDrawColor(248, 250, 252);
        doc.line(14, startY + 3.5, 196, startY + 3.5);

        startY += 8;
      });
    }

    if (startY > 230) {
      doc.addPage();
      startY = 20;
    } else {
      startY += 12;
    }

    if (customSugerencia && customSugerencia.trim() !== '') {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59); // slate 800
      doc.text('SUGERENCIA / NOTA DE SEGUIMIENTO:', 14, startY);
      
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105); // slate 600
      
      const splitSugerencia = doc.splitTextToSize(customSugerencia, 182);
      doc.text(splitSugerencia, 14, startY + 3.8);
      startY += 6 + (splitSugerencia.length * 3.2);
    }

    if (startY > 250) {
      doc.addPage();
      startY = 20;
    } else {
      startY += 10;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    
    // Firma del supervisor positioned to the right
    doc.text('_____________________________________', 120, startY);
    doc.text('Firma & Aclaracion del Supervisor', 120, startY + 3.5);
    doc.text(`Supervisor Activo: ${selectedDia.supervisor || '____________'}`, 120, startY + 7);

    const pages = (doc as any).internal.getNumberOfPages();
    for (let j = 1; j <= pages; j++) {
      doc.setPage(j);
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`Documento de Uso Interno - Generado el ${new Date().toLocaleDateString('es-AR')} ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}hs`, 14, doc.internal.pageSize.getHeight() - 8);
      doc.text(`Pagina ${j} de ${pages}`, doc.internal.pageSize.getWidth() - 25, doc.internal.pageSize.getHeight() - 8);
    }

    doc.save(`Planificacion_HorasExtra_${selectedDia.fecha}.pdf`);
  };

  // Filters master overtime days list
  const filteredDias = useMemo(() => {
    if (!diaSearch) return dias;
    const q = diaSearch.toLowerCase().trim();
    return dias.filter(d => 
      (d.fecha && d.fecha.toLowerCase().includes(q)) ||
      (d.supervisor && d.supervisor.toLowerCase().includes(q))
    );
  }, [dias, diaSearch]);

  // Group tasks by sector for the selected day
  const groupedTareasBySector = useMemo(() => {
    const groups: { [key: string]: Tarea[] } = {};
    tareas.forEach(tarea => {
      const sectorKey = tarea.sector ? tarea.sector.trim() : 'Sin Sector Especificado';
      if (!groups[sectorKey]) {
        groups[sectorKey] = [];
      }
      groups[sectorKey].push(tarea);
    });
    return groups;
  }, [tareas]);

  // Calculate distinct/unique collaborators count on the client-side for dynamic real-time precision
  const uniqueColaboradoresCount = useMemo(() => {
    const colabIds = new Set<string>();
    tareas.forEach(t => {
      if (t.id_colab1) colabIds.add(t.id_colab1);
      if (t.id_colab2) colabIds.add(t.id_colab2);
      if (t.id_colab3) colabIds.add(t.id_colab3);
      if (t.id_colab4) colabIds.add(t.id_colab4);
    });
    return colabIds.size;
  }, [tareas]);

  const formatFullDate = (dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      return date.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  };

  // Render Loader if initial loading
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4 animate-pulse">
        <Loader2 className="w-9 h-9 text-green-600 animate-spin" />
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Sincronizando Módulos de Horas Extra...</p>
      </div>
    );
  }

  // --- RENDERING OVERTIME VIEWS & MODALS ---
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {selectedDia ? (
        // --- DETAIL VIEW FOR SELECTED OVERTIME DAY ---
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Detail Header Toolbar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 text-white rounded-3xl p-6 shadow-xl border border-green-905/20">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setSelectedDia(null)}
                className="p-3 bg-slate-800 hover:bg-slate-700 hover:text-green-400 rounded-2xl transition-all border border-slate-700/60 shadow-lg"
                title="Volver a la vista general"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-3">
                  {selectedDia.comedor && (
                    <span className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/20 border border-green-500/30 rounded-full text-[9px] font-black uppercase tracking-wider text-green-300">
                      <Utensils className="w-3 h-3" /> Comedor Activo
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-black uppercase tracking-tighter mt-1 truncate max-w-sm sm:max-w-md md:max-w-lg">
                  {formatFullDate(selectedDia.fecha)}
                </h2>
                <p className="text-xs text-slate-350 font-bold uppercase tracking-wider mt-1 block">
                  Supervisor: <span className="text-white font-black">{selectedDia.supervisor || 'Sin asignar'}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto self-stretch md:self-auto">
              <div className="bg-slate-800 rounded-2xl px-4 py-2.5 border border-slate-700 flex items-center gap-3 shadow-inner flex-1 md:flex-initial">
                <Clock className="w-4 h-4 text-green-400" />
                <div className="text-left">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Rango Horario</p>
                  <p className="text-xs font-black text-white mt-1 leading-none">{selectedDia.hora_entrada} - {selectedDia.hora_salida}</p>
                </div>
              </div>

              <button
                onClick={() => handleOpenEditDia(selectedDia)}
                className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-2xl transition-all border border-slate-705 shadow-md"
                title="Editar parámetros del día"
              >
                <Edit2 className="w-4 h-4" />
              </button>

              <button
                onClick={handleExportPDF}
                className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-green-400 rounded-2xl transition-all border border-slate-705 shadow-md flex items-center justify-center"
                title="Exportar planificación completa en PDF"
              >
                <Printer className="w-4 h-4" />
              </button>
              
              <button
                onClick={() => handleOpenNewTarea()}
                className="flex items-center justify-center gap-2 px-5 py-3.5 bg-green-600 hover:bg-green-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-green-900/10 hover:shadow-green-900/20 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" /> Registrar Tarea
              </button>
            </div>
          </div>

          {/* Informative Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3.5 bg-green-50 rounded-xl text-green-600">
                <ListTodo className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Tareas Coordinadas</p>
                <p className="text-2xl font-black text-slate-800 mt-1">{tareas.length}</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3.5 bg-blue-50 rounded-xl text-blue-600">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Colaboradores Presentes</p>
                <p className="text-2xl font-black text-slate-800 mt-1">{uniqueColaboradoresCount}</p>
              </div>
            </div>
          </div>

          {/* Grouped Tasks Lists by Sector */}
          {Object.keys(groupedTareasBySector).length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-16 text-center shadow-inner flex flex-col items-center max-w-xl mx-auto mt-6">
              <div className="w-16 h-16 bg-slate-50 border border-slate-150 rounded-2xl flex items-center justify-center text-slate-400 mb-5">
                <Wrench className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black uppercase text-slate-800 tracking-tight">No Hay Tareas en este Día</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed mt-2 max-w-sm">
                Registre las tareas puntuales planificadas para este sábado, designando los recursos, equipos y el equipo de colaboradores responsable.
              </p>
              <button
                onClick={() => handleOpenNewTarea()}
                className="mt-6 flex items-center gap-2 px-6 py-3 bg-slate-900 text-white hover:bg-slate-850 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-95"
              >
                <Plus className="w-4 h-4" /> Agregar Primer Tarea
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {Object.keys(groupedTareasBySector).sort().map(sectorName => (
                <div key={sectorName} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in zoom-in-95 duration-200">
                  {/* Sector Header Block */}
                  <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="flex items-center gap-3.5">
                      <div className="w-2.5 h-6 bg-green-600 rounded-full shadow-sm"></div>
                      <div>
                        <h3 className="text-sm font-extrabold uppercase tracking-tight text-slate-800">{sectorName}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                          {groupedTareasBySector[sectorName].length} {groupedTareasBySector[sectorName].length === 1 ? 'Tarea Programada' : 'Tareas Programadas'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleOpenNewTarea(sectorName)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-green-500 hover:text-green-600 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar Tarea a {sectorName}
                    </button>
                  </div>

                  {/* Sector Tasks Grid */}
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {groupedTareasBySector[sectorName].map(tarea => {
                      const colabsCount = [tarea.id_colab1, tarea.id_colab2, tarea.id_colab3, tarea.id_colab4].filter(Boolean).length;
                      return (
                        <div 
                          key={tarea.id} 
                          className="bg-slate-50/50 hover:bg-slate-50 border border-slate-150 rounded-2xl p-5 transition-all hover:shadow-md flex flex-col justify-between group"
                        >
                          <div>
                            {/* Task Top Stats/Badges */}
                            <div className="flex justify-between items-start mb-3">
                              <span className="text-[8px] font-black uppercase tracking-widest bg-slate-200/65 text-slate-600 px-2 py-0.5 rounded-md">
                                {tarea.equipo ? `EQ: ${tarea.equipo}` : 'Sin equipo'}
                              </span>
                              <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleOpenEditTarea(tarea); }}
                                  className="p-1.5 hover:bg-white text-slate-450 hover:text-blue-600 border border-transparent hover:border-slate-200 rounded-lg hover:shadow-sm transition-all"
                                  title="Editar tarea"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteTarea(tarea.id); }}
                                  className="p-1.5 hover:bg-white text-slate-450 hover:text-red-600 border border-transparent hover:border-slate-200 rounded-lg hover:shadow-sm transition-all"
                                  title="Eliminar tarea"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Task Information */}
                            <h4 
                              onClick={() => setSelectedTaskForDetails(tarea)}
                              className="text-xs font-black uppercase text-slate-800 tracking-tight group-hover:text-green-700 cursor-pointer transition-colors line-clamp-2"
                            >
                              {tarea.titulo}
                            </h4>
                            
                            {tarea.descripcion && (
                              <p className="text-[11px] text-slate-500 font-medium leading-normal mt-2 line-clamp-3">
                                {tarea.descripcion}
                              </p>
                            )}

                            {/* Dynamic specifications pills */}
                            <div className="space-y-1.5 mt-4">
                              {tarea.recursos && (
                                <div className="flex items-center gap-2 text-[10px] text-slate-600 font-semibold truncate bg-white/70 px-2.5 py-1 border border-slate-100 rounded-lg">
                                  <HelpCircle className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                                  <span className="truncate">Recursos: {tarea.recursos}</span>
                                </div>
                              )}
                              {tarea.seguridad && (
                                <div className="flex items-center gap-2 text-[10px] text-slate-600 font-semibold truncate bg-white/70 px-2.5 py-1 border border-slate-100 rounded-lg">
                                  <HardHat className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                  <span className="truncate text-amber-800 font-black">SEG: {tarea.seguridad}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Collaborators Section */}
                          <div className="mt-5 border-t border-slate-150 pt-4">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Ejecución ({colabsCount})</p>
                            {colabsCount === 0 ? (
                              <p className="text-[10px] text-slate-400 font-bold italic mt-1.5 uppercase tracking-wide">Sin colaboradores asignados</p>
                            ) : (
                              <div className="space-y-1.5 mt-2">
                                {[tarea.id_colab1, tarea.id_colab2, tarea.id_colab3, tarea.id_colab4].map((id, index) => {
                                  if (!id) return null;
                                  return (
                                    <div key={index} className="flex items-center gap-2 bg-white px-2.5 py-1.5 border border-slate-150 rounded-xl text-[10px] font-semibold text-slate-705 shadow-sm truncate">
                                      <div className="w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center font-black text-[8px] flex-shrink-0 select-none uppercase">
                                        {getColaboradorName(id).charAt(0)}
                                      </div>
                                      <span className="truncate">{getColaboradorName(id)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        // --- MASTER LIST OF OVERTIME DAYS ---
        <div className="space-y-6">
          {/* Title & Toolbar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm leading-none">
            <div>
              <h2 className="text-xl font-black uppercase text-slate-800 tracking-tighter">Horas Extra - Jornadas de Sábados</h2>
              <p className="text-xs text-slate-450 uppercase font-black tracking-wider mt-1.5 leading-normal">
                Coordinación, planificación y asignación de colaboradores y recursos extraordinarios.
              </p>
            </div>
            <button
              onClick={handleOpenNewDia}
              className="flex items-center justify-center gap-2 px-5 py-3.5 bg-slate-900 hover:bg-slate-850 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:shadow-lg active:scale-95 transition-all shadow-md self-stretch md:self-auto"
            >
              <Plus className="w-4 h-4" /> Crear Nueva Jornada
            </button>
          </div>

          {/* Filter and Search Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <input
                type="text"
                className="w-full bg-slate-50 border border-slate-250 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-green-450 focus:border-green-450 transition-all shadow-inner"
                placeholder="Buscar Jornadas (Supervisor o Fecha)..."
                value={diaSearch}
                onChange={(e) => setDiaSearch(e.target.value)}
              />
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="w-4.5 h-4.5 text-slate-400" />
              </div>
            </div>
            {diaSearch && (
              <button
                onClick={() => setDiaSearch('')}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors shadow-sm"
              >
                Limpiar Filtros
              </button>
            )}
          </div>

          {/* Overtime Days Listing Grid */}
          {filteredDias.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center shadow-sm flex flex-col items-center max-w-xl mx-auto">
              <div className="w-16 h-16 bg-slate-50 border border-slate-150 rounded-2xl flex items-center justify-center text-slate-400 mb-5 shadow-inner">
                <Calendar className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black uppercase text-slate-800 tracking-tight">Cero Jornadas Creadas</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed mt-2 max-w-sm">
                Cree un nuevo día de horas extras. Por defecto, se configurará para el próximo sábado con entrada a las 07:30 y salida a las 14:30.
              </p>
              <button
                onClick={handleOpenNewDia}
                className="mt-6 flex items-center gap-2 px-6 py-3 bg-green-600 text-white hover:bg-green-700 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-95"
              >
                <Plus className="w-4 h-4" /> Crear Jornada de Sábado
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDias.map((dia) => {
                const dateObj = new Date(dia.fecha + 'T00:00:00');
                const formattedDate = dateObj.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
                
                return (
                  <div 
                    key={dia.id}
                    className="bg-white hover:bg-slate-50 border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all flex flex-col justify-between group cursor-pointer animate-in zoom-in-95 duration-200"
                    onClick={() => setSelectedDia(dia)}
                  >
                    <div>
                      {/* Card Header & Actions */}
                      <div className="flex justify-between items-start mb-4">
                        <span className="px-3.5 py-1.5 bg-slate-100 border border-slate-200 text-slate-850 rounded-xl text-[10px] font-black uppercase tracking-wider select-none">
                          {formattedDate}
                        </span>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenEditDia(dia); }}
                            className="p-1.5 hover:bg-white text-slate-450 hover:text-blue-600 border border-transparent hover:border-slate-200 rounded-lg transition-all"
                            title="Editar parámetros"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteDia(dia.id); }}
                            className="p-1.5 hover:bg-white text-slate-450 hover:text-red-600 border border-transparent hover:border-slate-200 rounded-lg transition-all"
                            title="Eliminar día completo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Supervisor Name */}
                      <h3 className="text-sm font-black uppercase text-slate-800 tracking-tight group-hover:text-green-700 transition-colors">
                        Supervisor: {dia.supervisor || 'N/A'}
                      </h3>

                      {/* Horario Detail */}
                      <div className="mt-3 flex items-center gap-1.5 text-slate-500 font-semibold text-[11px] uppercase tracking-wide">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>De {dia.hora_entrada || '07:30'}hs a {dia.hora_salida || '14:30'}hs</span>
                      </div>

                      {/* Badge Row Metrics */}
                      <div className="grid grid-cols-2 gap-3.5 mt-5">
                        <div className="bg-slate-50 rounded-2xl p-2.5 border border-slate-100 text-center shadow-inner">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Tareas</p>
                          <p className="text-base font-black text-slate-700 mt-1 leading-none">{dia.cont_tareas || 0}</p>
                        </div>
                        <div className="bg-slate-50 rounded-2xl p-2.5 border border-slate-100 text-center shadow-inner">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Colaboradores</p>
                          <p className="text-base font-black text-slate-700 mt-1 leading-none">{dia.cont_colaborad || 0}</p>
                        </div>
                      </div>
                    </div>

                    {/* Card CTA Footer */}
                    <div className="mt-6 border-t border-slate-100 pt-4 flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-400 group-hover:text-green-600 transition-colors">
                      <span className="flex items-center gap-1">
                        <Utensils className={`w-3.5 h-3.5 ${dia.comedor ? 'text-green-500' : 'text-slate-300'}`} />
                        Comedor: {dia.comedor ? 'Activo' : 'Desactivado'}
                      </span>
                      <span className="flex items-center gap-1 font-extrabold">
                        Planificar <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* --- DIA CREATE / EDIT DIALOG MODAL --- */}
      {showDiaModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <form onSubmit={handleSaveDia}>
              <div className="p-8">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">
                      {editingDia ? 'Editar parámetros' : 'Configurar nueva jornada'}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Horas Extra Sábado</p>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setShowDiaModal(false)}
                    className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Fecha */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Fecha del Sábado</label>
                    <input
                      type="date"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 font-bold outline-none focus:bg-white focus:ring-2 focus:ring-green-400 focus:border-green-400 transition-all shadow-sm"
                      value={diaFecha}
                      onChange={(e) => setDiaFecha(e.target.value)}
                      required
                    />
                  </div>

                  {/* Supervisor */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Supervisor Encargado</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-450 font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-green-400 focus:border-green-400 transition-all shadow-sm"
                      placeholder="Ej. Martín Adrover"
                      value={diaSupervisor}
                      onChange={(e) => setDiaSupervisor(e.target.value)}
                    />
                  </div>

                  {/* Hora Entrada & Salida */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Hora Entrada</label>
                      <input
                        type="time"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold outline-none focus:bg-white focus:ring-2 focus:ring-green-400 focus:border-green-400 transition-all shadow-sm"
                        value={diaHoraEntrada}
                        onChange={(e) => setDiaHoraEntrada(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Hora Salida</label>
                      <input
                        type="time"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold outline-none focus:bg-white focus:ring-2 focus:ring-green-400 focus:border-green-400 transition-all shadow-sm"
                        value={diaHoraSalida}
                        onChange={(e) => setDiaHoraSalida(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {/* Comedor Toggle Option */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-150 rounded-2xl shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-100 rounded-xl text-amber-600">
                        <Utensils className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-800 uppercase tracking-tight">Comedor / Refrigerio</p>
                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">Asistencia de viandas activa</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={diaComedor} 
                        onChange={(e) => setDiaComedor(e.target.checked)}
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:width-5 after:transition-all peer-checked:bg-green-600"></div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-6 border-t border-slate-150 flex justify-end gap-3 rounded-b-3xl">
                <button
                  type="button"
                  onClick={() => setShowDiaModal(false)}
                  className="px-5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-450 hover:text-slate-600 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-850 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:shadow-md transition-all flex items-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Procesando...
                    </>
                  ) : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- TAREA/TASK CREATE / EDIT DIALOG MODAL --- */}
      {showTareaModal && selectedDia && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-8">
            <form onSubmit={handleSaveTarea}>
              <div className="p-8 max-h-[80vh] overflow-y-auto space-y-6">
                <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">
                      {editingTarea ? 'Editar Tarea Programada' : 'Planificar Nueva Tarea'}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mt-1">
                      Vinculado al Sábado: {selectedDia.fecha}
                    </p>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setShowTareaModal(false)}
                    className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Título de la tarea */}
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Título del Trabajo / Tarea</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-green-400 focus:border-green-400 transition-all shadow-sm"
                      placeholder="Ej. Revisión y Cambio de Filtros de Motor"
                      value={tareaTitulo}
                      onChange={(e) => setTareaTitulo(e.target.value)}
                      required
                    />
                  </div>

                  {/* Descripción detallada */}
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Descripción Detallada o Pasos</label>
                    <textarea
                      rows={3}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 font-medium outline-none focus:bg-white focus:ring-2 focus:ring-green-400 focus:border-green-400 transition-all shadow-sm"
                      placeholder="Detalles sobre averías, fallas a subsanar, calibraciones..."
                      value={tareaDescripcion}
                      onChange={(e) => setTareaDescripcion(e.target.value)}
                    ></textarea>
                  </div>

                  {/* Sector (dropdown with search) */}
                  <div>
                    <SearchDropdown<Sector>
                      label="Sector del Taller / Unidad"
                      items={sectores}
                      selectedId={tareaSector}
                      selectedText={tareaSector}
                      onSelect={(item) => setTareaSector(item ? item.sectores : '')}
                      getSearchText={(item) => item.sectores}
                      getDisplayValue={(item) => item.sectores}
                      getId={(item) => item.sectores}
                      placeholder="Buscar o Escribir sector..."
                    />
                  </div>

                  {/* Equipo */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 font-sans">Equipo / Maquinaria (Interno/Opc)</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-green-400 focus:border-green-400 transition-all shadow-sm"
                      placeholder="Ej. E1234, etc."
                      value={tareaEquipo}
                      onChange={(e) => setTareaEquipo(e.target.value)}
                    />
                  </div>

                  {/* Recursos */}
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Recursos Necesarios</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-green-400 focus:border-green-400 transition-all shadow-sm"
                      placeholder="Filtros, aceites, repuestos específicos..."
                      value={tareaRecursos}
                      onChange={(e) => setTareaRecursos(e.target.value)}
                    />
                  </div>

                  {/* Seguridad */}
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-550 uppercase tracking-widest mb-1.5 text-amber-600">Consideraciones de Seguridad</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-2.5 bg-amber-50/30 border border-amber-200 rounded-xl text-xs text-amber-900 placeholder-slate-400 font-bold outline-none focus:bg-white focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all shadow-sm"
                      placeholder="Bloqueo de energia, guantes, arnés...."
                      value={tareaSeguridad}
                      onChange={(e) => setTareaSeguridad(e.target.value)}
                    />
                  </div>

                  {/* Collaborators Dropdown Selectors */}
                  <div className="md:col-span-2 border-t border-slate-100 pt-5 space-y-4">
                    <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">Asignación de Colaboradores (Máx. 4)</h4>
                    
                    <div className="grid grid-cols-1 gap-4">
                      {/* Colab 1 */}
                      <SearchDropdown<Colaborador>
                        label="Colaborador 1"
                        items={colaboradores}
                        selectedId={colab1?.id || null}
                        selectedText={colab1 ? `${colab1.nombre} ${colab1.apellido}` : ''}
                        onSelect={(item) => setColab1(item)}
                        getSearchText={(item) => `${item.nombre} ${item.apellido}`}
                        getDisplayValue={(item) => `${item.nombre} ${item.apellido}`}
                        getId={(item) => item.id}
                        placeholder="Buscar por Nombre/Apellido..."
                      />

                      {/* Colab 2 */}
                      <SearchDropdown<Colaborador>
                        label="Colaborador 2"
                        items={colaboradores}
                        selectedId={colab2?.id || null}
                        selectedText={colab2 ? `${colab2.nombre} ${colab2.apellido}` : ''}
                        onSelect={(item) => setColab2(item)}
                        getSearchText={(item) => `${item.nombre} ${item.apellido}`}
                        getDisplayValue={(item) => `${item.nombre} ${item.apellido}`}
                        getId={(item) => item.id}
                        placeholder="Buscar por Nombre/Apellido..."
                      />

                      {/* Colab 3 */}
                      <SearchDropdown<Colaborador>
                        label="Colaborador 3"
                        items={colaboradores}
                        selectedId={colab3?.id || null}
                        selectedText={colab3 ? `${colab3.nombre} ${colab3.apellido}` : ''}
                        onSelect={(item) => setColab3(item)}
                        getSearchText={(item) => `${item.nombre} ${item.apellido}`}
                        getDisplayValue={(item) => `${item.nombre} ${item.apellido}`}
                        getId={(item) => item.id}
                        placeholder="Buscar por Nombre/Apellido..."
                      />

                      {/* Colab 4 */}
                      <SearchDropdown<Colaborador>
                        label="Colaborador 4"
                        items={colaboradores}
                        selectedId={colab4?.id || null}
                        selectedText={colab4 ? `${colab4.nombre} ${colab4.apellido}` : ''}
                        onSelect={(item) => setColab4(item)}
                        getSearchText={(item) => `${item.nombre} ${item.apellido}`}
                        getDisplayValue={(item) => `${item.nombre} ${item.apellido}`}
                        getId={(item) => item.id}
                        placeholder="Buscar por Nombre/Apellido..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-6 border-t border-slate-150 flex justify-end gap-3 rounded-b-3xl">
                <button
                  type="button"
                  onClick={() => setShowTareaModal(false)}
                  className="px-5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-450 hover:text-slate-600 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-850 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:shadow-md transition-all flex items-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Procesando...
                    </>
                  ) : editingTarea ? 'Guardar Cambios' : 'Ingresar Tarea'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- TASK DETAILS INFO POPUP / DRAWER --- */}
      {selectedTaskForDetails && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest bg-green-50 text-green-700 px-3 py-1 rounded-full border border-green-200">
                    Trabajo Coordinado: {selectedTaskForDetails.sector}
                  </span>
                  <h3 className="text-lg font-black uppercase tracking-tighter text-slate-800 mt-2">
                    {selectedTaskForDetails.titulo}
                  </h3>
                </div>
                <button 
                  onClick={() => setSelectedTaskForDetails(null)}
                  className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                {selectedTaskForDetails.descripcion && (
                  <div>
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Descripción</h5>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed bg-slate-50 p-3 border border-slate-100 rounded-xl">
                      {selectedTaskForDetails.descripcion}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Equipo / Interno</h5>
                    <p className="text-xs font-extrabold text-slate-700 bg-slate-50 px-3 py-2 border border-slate-100 rounded-xl truncate">
                      {selectedTaskForDetails.equipo || 'No especificado'}
                    </p>
                  </div>
                  <div>
                    <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 text-amber-650">Protocolo de Seguridad</h5>
                    <p className="text-xs font-black text-amber-900 bg-amber-50 h-full px-3 py-2 border border-amber-200 rounded-xl truncate">
                      {selectedTaskForDetails.seguridad || 'Básico de Planta'}
                    </p>
                  </div>
                </div>

                {selectedTaskForDetails.recursos && (
                  <div>
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Insumos y Recursos</h5>
                    <p className="text-xs text-slate-600 font-semibold bg-slate-50 px-3 py-2 border border-slate-100 rounded-xl">
                      {selectedTaskForDetails.recursos}
                    </p>
                  </div>
                )}

                <div>
                  <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Equipo de Trabajo Asignado</h5>
                  <div className="space-y-1.5">
                    {[selectedTaskForDetails.id_colab1, selectedTaskForDetails.id_colab2, selectedTaskForDetails.id_colab3, selectedTaskForDetails.id_colab4].filter(Boolean).length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Sin colaboradores coordinados.</p>
                    ) : (
                      [selectedTaskForDetails.id_colab1, selectedTaskForDetails.id_colab2, selectedTaskForDetails.id_colab3, selectedTaskForDetails.id_colab4].map((id, index) => {
                        if (!id) return null;
                        return (
                          <div key={index} className="flex items-center gap-2 bg-slate-50 px-3 py-2 border border-slate-150 rounded-xl text-xs font-bold text-slate-705">
                            <div className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center font-black text-[9px] select-none">
                              {getColaboradorName(id).charAt(0)}
                            </div>
                            <span className="truncate">{getColaboradorName(id)}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedTaskForDetails(null)}
                className="px-6 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-colors"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- CONFIRM SYSTEM OVERLAY MODAL --- */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 shadow-xl">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8">
              <div className="flex items-center gap-4 text-red-600 mb-4">
                <div className="p-3 bg-red-50 rounded-2xl">
                  <Trash2 className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-tighter text-slate-800">
                  {deleteConfirm.title}
                </h3>
              </div>
              
              <p className="text-xs text-slate-500 font-semibold leading-relaxed mb-6">
                {deleteConfirm.message}
              </p>

              <div className="flex gap-3 justify-end border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  className="px-5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-450 hover:text-slate-600 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleExecuteDelete}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:shadow-md transition-all flex items-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Eliminando...
                    </>
                  ) : (
                    'Eliminar'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OvertimeView;
