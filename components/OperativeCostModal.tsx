import React, { useState, useEffect, useMemo } from 'react';
import { MaintenanceEntry, Equipment, ItemCostoIntervencion, CostoRealIntervencion, EvaluacionIngresoTaller } from '../types';
import { 
  extractRcandSottFromActions, 
  getStoredCostoReal, 
  saveStoredCostoReal, 
  calculateTotalCostoReal,
  getRepairDays,
  syncItemsWithDatabase
} from '../utils/realCostHelper';
import { 
  X, 
  CheckCircle2, 
  Plus, 
  Trash2, 
  Calculator, 
  Wrench, 
  DollarSign, 
  Calendar, 
  Clock, 
  Package, 
  Truck, 
  AlertCircle,
  HelpCircle,
  Check,
  Save,
  TrendingDown,
  TrendingUp
} from 'lucide-react';

interface OperativeCostModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: MaintenanceEntry;
  equipment: Equipment | null;
  onConfirm: (costoReal: CostoRealIntervencion, exitDate: string) => Promise<void>;
  allowOperativeDateEdit?: boolean;
  isHistoryMode?: boolean;
}

export const OperativeCostModal: React.FC<OperativeCostModalProps> = ({
  isOpen,
  onClose,
  entry,
  equipment,
  onConfirm,
  allowOperativeDateEdit = false,
  isHistoryMode = false
}) => {
  const isHistory = Boolean(isHistoryMode || entry?.estado === 'OPERATIVO');
  const today = new Date().toLocaleDateString('en-CA');
  
  const [exitDate, setExitDate] = useState<string>(entry.fecha_salida || today);
  const [items, setItems] = useState<ItemCostoIntervencion[]>([]);
  const [deletedActionIds, setDeletedActionIds] = useState<string[]>([]);
  // El precio de mano de obra, por defecto, debe ser 11
  const [hourlyRate, setHourlyRate] = useState<string>('11');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [evalData, setEvalData] = useState<EvaluacionIngresoTaller | null>(null);
  const [authKey, setAuthKey] = useState<string>('');
  const [isDateUnlocked, setIsDateUnlocked] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  // Helper para días de estadía total
  const calculateStayDays = (d1: string, d2: string) => {
    if (!d1 || !d2) return 0;
    const start = new Date(d1 + 'T00:00:00');
    const end = new Date(d2 + 'T00:00:00');
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    const diff = end.getTime() - start.getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  };

  const stayDays = useMemo(() => {
    return calculateStayDays(entry.fecha_ingreso, exitDate);
  }, [entry.fecha_ingreso, exitDate]);

  // Cálculo automático del total parcial de días en estado de REPARACIÓN
  const computedRepairDays = useMemo(() => {
    return getRepairDays(entry, exitDate);
  }, [entry, exitDate]);

  // Estado editable para días en estado de REPARACIÓN (permite ajuste si fuera necesario)
  const [repairDays, setRepairDays] = useState<number>(computedRepairDays);

  useEffect(() => {
    setRepairDays(computedRepairDays);
  }, [computedRepairDays]);

  // Cargar datos previos y/o extraer de acciones
  useEffect(() => {
    if (!isOpen || !entry) return;

    let isMounted = true;

    const loadData = async () => {
      // 1. Intentar cargar evaluación previa para estimaciones de presupuesto
      try {
        const cachedEval = localStorage.getItem(`eval_intervencion_${entry.id}`);
        if (cachedEval) {
          const parsed = JSON.parse(cachedEval);
          if (isMounted) setEvalData(parsed);
        }
      } catch (e) {
        // ignore
      }

      // 2. Intentar cargar costo real guardado previamente
      const stored = await getStoredCostoReal(entry.id);
      if (stored) {
        if (isMounted) {
          if (stored.items && stored.items.length > 0) {
            setItems(stored.items);
          }
          if (stored.precio_mano_obra_hr > 0) {
            setHourlyRate(String(stored.precio_mano_obra_hr));
          } else {
            setHourlyRate('11');
          }
          if (stored.dias_reparacion !== undefined && stored.dias_reparacion !== null) {
            setRepairDays(stored.dias_reparacion);
          }
        }
        return;
      } else {
        if (isMounted) {
          setHourlyRate('11');
        }
      }

      // 3. Si no existe costo guardado, extraer automáticamente de los avances (acciones_taller)
      const extracted = extractRcandSottFromActions(entry.acciones_taller || []);
      if (isMounted) {
        setItems(extracted);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, entry]);

  // Cálculos en tiempo real basados en los días de REPARACIÓN
  const calculations = useMemo(() => {
    return calculateTotalCostoReal(items, repairDays, Number(hourlyRate) || 0);
  }, [items, repairDays, hourlyRate]);

  if (!isOpen) return null;

  const handleAddItem = (type: 'RC' | 'SOTT') => {
    const newItem: ItemCostoIntervencion = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tipo: type,
      numero: '',
      descripcion: type === 'RC' ? 'Pedido de repuestos' : 'Servicio tercerizado',
      monto: 0
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleUpdateItem = (id: string, field: keyof ItemCostoIntervencion, value: any) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return { ...item, [field]: value };
        }
        return item;
      })
    );
  };

  const handleDeleteItem = (id: string) => {
    const itemToDelete = items.find((item) => item.id === id);
    if (itemToDelete?.accion_id) {
      setDeletedActionIds((prev) => [...prev, itemToDelete.accion_id!]);
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const formatUSD = (val: number) => {
    return `USD ${Math.round(val || 0).toLocaleString('de-DE')}`;
  };

  const handleSubmit = async () => {
    if (!isHistory) {
      setDateError(null);

      const isDateModified = exitDate !== today;
      const isAuthorized = isDateUnlocked || authKey.trim() === '124';

      if (allowOperativeDateEdit && isDateModified && !isAuthorized) {
        setDateError('Para modificar la fecha de salida debe ingresar la clave de autorización.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // 1. Sincronizar comprobantes (RC y SOTT) con la base de datos (acciones_taller)
      const syncedItems = await syncItemsWithDatabase(
        entry.id,
        items,
        deletedActionIds,
        exitDate || today
      );

      const costoReal: CostoRealIntervencion = {
        ingreso_id: entry.id,
        items: syncedItems,
        precio_mano_obra_hr: Math.max(0, Number(hourlyRate) || 0),
        estadia_total_dias: stayDays,
        dias_reparacion: repairDays,
        horas_mano_obra: calculations.horasManoObra,
        costo_mano_obra: calculations.costoManoObra,
        subtotal_rc: calculations.subtotalRc,
        subtotal_sott: calculations.subtotalSott,
        costo_total_real: calculations.costoTotalReal,
        fecha_computo: new Date().toISOString()
      };

      // 2. Guardar en almacenamiento persistente (localStorage y Supabase)
      await saveStoredCostoReal(costoReal);

      // 3. Confirmar hacia el componente padre
      await onConfirm(costoReal, exitDate);
      onClose();
    } catch (e: any) {
      alert('Error guardando el costo real de la intervención: ' + (e.message || 'Error desconocido'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header Principal */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 px-6 py-4.5 text-white flex items-center justify-between shrink-0 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shadow-inner">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black uppercase tracking-wider ${
                  isHistory ? 'bg-slate-700 text-emerald-300' : 'bg-emerald-500 text-slate-950'
                } px-2 py-0.5 rounded-full`}>
                  {isHistory ? 'Historial / Operativo' : 'Pase a Operativo'}
                </span>
                <span className="text-xs text-slate-300 font-mono font-bold">
                  Interno: {entry.equipo_id}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white mt-0.5">
                Cálculo de Costo Real de la Intervención
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido con Scroll */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50/50">
          
          {/* Banner Superior: Datos del Equipo y Estadía */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-3.5">
            <div>
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Equipo</span>
              <p className="text-xs font-black text-slate-800 mt-0.5">
                {equipment?.marca || 'N/D'} {equipment?.modelo || ''}
              </p>
              <p className="text-[10px] text-slate-500 uppercase">{equipment?.tipo || 'Desconocido'}</p>
            </div>

            <div>
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Fecha Ingreso</span>
              <p className="text-xs font-mono font-bold text-slate-700 mt-0.5">
                {entry.fecha_ingreso ? entry.fecha_ingreso.split('-').reverse().join('/') : 'N/D'}
              </p>
              <span className="text-[10px] text-slate-500">Inicio de reparación</span>
            </div>

            <div>
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">
                Fecha Salida (Operativo)
              </span>
              {isHistory ? (
                <div className="mt-0.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-slate-800">
                    {exitDate ? exitDate.split('-').reverse().join('/') : 'N/D'}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-slate-200/90 px-1.5 py-0.5 rounded">
                    Consolidada
                  </span>
                </div>
              ) : (
                <>
                  <input
                    type="date"
                    value={exitDate}
                    onChange={(e) => {
                      setExitDate(e.target.value);
                      setDateError(null);
                    }}
                    disabled={!allowOperativeDateEdit}
                    className={`mt-0.5 text-xs font-mono font-bold px-2.5 py-1 rounded-lg border w-full ${
                      allowOperativeDateEdit
                        ? 'bg-white border-emerald-300 text-slate-900 focus:ring-2 focus:ring-emerald-400'
                        : 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                    }`}
                  />
                  {allowOperativeDateEdit && exitDate !== today && !isDateUnlocked && (
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        type="password"
                        placeholder="Clave (124)"
                        value={authKey}
                        onChange={(e) => setAuthKey(e.target.value)}
                        className="w-20 px-1.5 py-0.5 text-[10px] font-mono border border-amber-300 rounded bg-amber-50 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (authKey.trim() === '124') {
                            setIsDateUnlocked(true);
                            setDateError(null);
                          } else {
                            setDateError('Clave incorrecta');
                          }
                        }}
                        className="px-1.5 py-0.5 bg-amber-600 text-white rounded text-[10px] font-bold"
                      >
                        OK
                      </button>
                    </div>
                  )}
                  {dateError && (
                    <span className="text-[9px] text-red-600 font-bold block mt-0.5">{dateError}</span>
                  )}
                </>
              )}
            </div>

            <div className="bg-slate-100/90 rounded-xl p-2.5 border border-slate-200 flex flex-col justify-center">
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Estadía Total</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-lg font-black text-slate-800">{stayDays}</span>
                <span className="text-xs font-bold text-slate-500">días en taller</span>
              </div>
            </div>

            <div className="bg-emerald-50/90 rounded-xl p-2.5 border border-emerald-300 flex flex-col justify-center">
              <span className="text-[9px] font-black uppercase text-emerald-800 tracking-wider">En Reparación</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black text-emerald-900">{repairDays}</span>
                <span className="text-xs font-bold text-emerald-700">días reparación</span>
              </div>
            </div>
          </div>

          {/* Bloque: Precio de Mano de Obra (se ingresa antes) y Horas en REPARACIÓN */}
          <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-slate-50 p-4.5 rounded-2xl border-2 border-indigo-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-600 text-white rounded-lg">
                  <Wrench className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-indigo-950">
                    Cálculo de Mano de Obra en Estado de REPARACIÓN
                  </h3>
                  <p className="text-[11px] text-slate-600">
                    Fórmula oficial: <strong className="text-indigo-900 font-bold">(Días en REPARACIÓN: {repairDays} d) × 2 operarios × 8 hs/día × (Precio Mano de Obra en USD)</strong>
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    * Nota: Se computan únicamente las horas en reparación efectiva (se excluyen demoras por repuestos en compras o pruebas).
                  </p>
                </div>
              </div>

              {/* Inputs de Control: Días en Reparación y Precio Mano de Obra */}
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-indigo-200 shadow-sm">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 whitespace-nowrap">
                    Días Rep.:
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={repairDays}
                    onChange={(e) => setRepairDays(Math.max(0, Number(e.target.value) || 0))}
                    className="w-12 text-xs font-black text-indigo-700 outline-none text-right border-b border-indigo-300 focus:border-indigo-600"
                  />
                  <span className="text-[10px] font-bold text-slate-500">d</span>
                </div>

                <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-indigo-300 shadow-sm">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-600 whitespace-nowrap">
                    Precio M.O.:
                  </label>
                  <div className="flex items-center">
                    <span className="text-xs font-bold text-slate-500 mr-1">USD</span>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value)}
                      placeholder="11"
                      className="w-14 text-xs font-black text-slate-900 outline-none text-right border-b border-indigo-400 focus:border-indigo-600"
                    />
                    <span className="text-[10px] font-bold text-slate-500 ml-1">/hr</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Subtotales en vivo de Mano de Obra */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-indigo-100 text-xs">
              <div className="bg-white/80 p-2 rounded-lg border border-indigo-100">
                <span className="text-[9px] uppercase text-slate-400 font-bold block">Tiempo en Reparación</span>
                <span className="font-mono font-bold text-indigo-800">{repairDays} días <span className="text-[9px] text-slate-400 font-normal">({stayDays} d total)</span></span>
              </div>
              <div className="bg-white/80 p-2 rounded-lg border border-indigo-100">
                <span className="text-[9px] uppercase text-slate-400 font-bold block">Jornada (2 operarios x 8h)</span>
                <span className="font-mono font-bold text-slate-800">16 hs / día</span>
              </div>
              <div className="bg-white/80 p-2 rounded-lg border border-indigo-100">
                <span className="text-[9px] uppercase text-slate-400 font-bold block">Total Horas en Reparación</span>
                <span className="font-mono font-black text-indigo-700">{calculations.horasManoObra} hs</span>
              </div>
              <div className="bg-indigo-600 text-white p-2 rounded-lg shadow-sm">
                <span className="text-[9px] uppercase text-indigo-200 font-bold block">Mano de Obra Total</span>
                <span className="font-black text-sm">{formatUSD(calculations.costoManoObra)}</span>
              </div>
            </div>
          </div>

          {/* Bloque: Comprobantes RC y SOTT registrados en los avances */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Comprobantes de Repuestos (RC) y Terceros (SOTT)
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-200 text-slate-700">
                    {items.length} {items.length === 1 ? 'ítem' : 'ítems'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Detectados en los avances del equipo. Puede editar cualquier valor, ingresar montos o agregar nuevos comprobantes.
                </p>
              </div>

              {/* Botones para agregar RC / SOTT */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddItem('RC')}
                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 shadow-sm"
                >
                  <Plus className="w-3 h-3" /> + Agregar RC
                </button>
                <button
                  type="button"
                  onClick={() => handleAddItem('SOTT')}
                  className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 shadow-sm"
                >
                  <Plus className="w-3 h-3" /> + Agregar SOTT
                </button>
              </div>
            </div>

            {/* Listado de Ítems */}
            <div className="p-4">
              {items.length === 0 ? (
                <div className="text-center py-8 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-600">No se encontraron RC ni SOTT automáticas en los avances.</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 mb-3">
                    Haga click en los botones superiores para registrar los comprobantes de repuestos o servicios aplicados.
                  </p>
                  <div className="flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAddItem('RC')}
                      className="px-3.5 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition-colors shadow-sm"
                    >
                      + Agregar RC
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddItem('SOTT')}
                      className="px-3.5 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-bold hover:bg-purple-700 transition-colors shadow-sm"
                    >
                      + Agregar SOTT
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {items.map((item, idx) => {
                    const isRc = item.tipo === 'RC';
                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-xl border transition-all flex flex-col md:flex-row items-stretch md:items-center gap-2.5 ${
                          isRc ? 'bg-amber-50/40 border-amber-200' : 'bg-purple-50/40 border-purple-200'
                        }`}
                      >
                        {/* Selector Tipo */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleUpdateItem(item.id, 'tipo', isRc ? 'SOTT' : 'RC')}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm transition-all ${
                              isRc
                                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                                : 'bg-purple-600 hover:bg-purple-700 text-white'
                            }`}
                            title="Click para cambiar tipo (RC / SOTT)"
                          >
                            {item.tipo}
                          </button>
                          <span className="text-[10px] font-mono text-slate-400 w-5 text-center">#{idx + 1}</span>
                        </div>

                        {/* Número de RC / SOTT */}
                        <div className="w-full md:w-36 shrink-0">
                          <label className="block text-[8.5px] font-black uppercase text-slate-400 mb-0.5">
                            {isRc ? 'N° de RC' : 'N° de SOTT'}
                          </label>
                          <input
                            type="text"
                            value={item.numero}
                            onChange={(e) => handleUpdateItem(item.id, 'numero', e.target.value)}
                            placeholder={isRc ? 'Ej. 10452' : 'Ej. 342'}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-400"
                          />
                        </div>

                        {/* Descripción del Componente */}
                        <div className="flex-1 min-w-[200px]">
                          <label className="block text-[8.5px] font-black uppercase text-slate-400 mb-0.5">
                            Descripción del Componente / Servicio
                          </label>
                          <input
                            type="text"
                            value={item.descripcion}
                            onChange={(e) => handleUpdateItem(item.id, 'descripcion', e.target.value)}
                            placeholder="Detalle del componente, repuesto o taller"
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-emerald-400"
                          />
                        </div>

                        {/* Monto en Dólares */}
                        <div className="w-full md:w-36 shrink-0">
                          <label className="block text-[8.5px] font-black uppercase text-slate-400 mb-0.5">
                            Monto (USD)
                          </label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1.5 text-xs font-bold text-slate-400">$</span>
                            <input
                              type="number"
                              min="0"
                              step="10"
                              value={item.monto === 0 ? '' : item.monto}
                              onChange={(e) => handleUpdateItem(item.id, 'monto', Number(e.target.value) || 0)}
                              placeholder="0"
                              className="w-full pl-6 pr-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-black text-slate-900 outline-none text-right focus:ring-2 focus:ring-emerald-400"
                            />
                          </div>
                        </div>

                        {/* Botón Eliminar */}
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-white rounded-lg transition-colors self-end md:self-center shrink-0"
                          title="Eliminar este ítem"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Subtotales de la lista */}
              {items.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-end gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                      Subtotal RC ({items.filter((i) => i.tipo === 'RC').length}):
                    </span>
                    <span className="font-mono font-bold text-slate-800">{formatUSD(calculations.subtotalRc)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black uppercase text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                      Subtotal SOTT ({items.filter((i) => i.tipo === 'SOTT').length}):
                    </span>
                    <span className="font-mono font-bold text-slate-800">{formatUSD(calculations.subtotalSott)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Cuadro de Resumen Final del Costo Real */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-5 rounded-3xl text-white shadow-xl border border-slate-700">
            <div className="flex items-center justify-between mb-3 border-b border-slate-700 pb-2.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                Resumen Económico de la Reparación
              </span>
              <span className="text-xs text-slate-300 font-bold">
                Equipo: {entry.equipo_id} ({stayDays} días)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-white/10 p-2.5 rounded-xl border border-white/5">
                <span className="text-[9px] uppercase font-bold text-amber-300 block">1. Repuestos (RC)</span>
                <span className="text-sm font-black text-white">{formatUSD(calculations.subtotalRc)}</span>
              </div>
              <div className="bg-white/10 p-2.5 rounded-xl border border-white/5">
                <span className="text-[9px] uppercase font-bold text-purple-300 block">2. Terceros (SOTT)</span>
                <span className="text-sm font-black text-white">{formatUSD(calculations.subtotalSott)}</span>
              </div>
              <div className="bg-white/10 p-2.5 rounded-xl border border-white/5">
                <span className="text-[9px] uppercase font-bold text-blue-300 block">3. Mano de Obra</span>
                <span className="text-sm font-black text-white">{formatUSD(calculations.costoManoObra)}</span>
              </div>
              <div className="bg-emerald-500/20 p-2.5 rounded-xl border border-emerald-400/40">
                <span className="text-[9px] uppercase font-bold text-emerald-300 block">Costo Total Real</span>
                <span className="text-base font-black text-emerald-300">{formatUSD(calculations.costoTotalReal)}</span>
              </div>
            </div>

            {/* Comparativa con la Inversión Estimada si existía */}
            {evalData && (evalData.costo_repuesto_est || evalData.costo_sott_est) && (
              <div className="bg-white/5 p-3 rounded-xl border border-white/10 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1 bg-white/10 rounded-lg">
                    {calculations.costoTotalReal <= (evalData.inversion || 0) ? (
                      <TrendingDown className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <TrendingUp className="w-4 h-4 text-amber-400" />
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-300 font-bold block">
                      Inversión Inicial Estimada: {formatUSD(evalData.inversion || (Number(evalData.costo_repuesto_est || 0) + Number(evalData.costo_sott_est || 0)))}
                    </span>
                    <span className="text-[11px] text-slate-200">
                      Desvío vs Costo Real:{' '}
                      <strong className={calculations.costoTotalReal <= (evalData.inversion || 0) ? 'text-emerald-400' : 'text-amber-400'}>
                        {formatUSD(calculations.costoTotalReal - (evalData.inversion || 0))}
                      </strong>
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded bg-white/10 text-slate-200 self-start sm:self-center">
                  {calculations.costoTotalReal <= (evalData.inversion || 0) ? 'En Presupuesto' : 'Con Desvío'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer con Acciones */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            {isHistory ? (
              <span>Al guardar, se actualizarán los costos reales y se registrarán los comprobantes (RC / SOTT) en la base de datos.</span>
            ) : (
              <span>Al confirmar, el equipo cambiará a estado <strong>OPERATIVO</strong> y el costo figurará en su Carpeta de Arrastre.</span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 sm:flex-none px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-950/20 flex items-center justify-center gap-2 transition-all disabled:bg-slate-300"
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin">⏳</span>
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  {isHistory ? (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Guardar</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirmar y Pasar a OPERATIVO</span>
                    </>
                  )}
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
