import { MaintenanceAction, ItemCostoIntervencion, CostoRealIntervencion, MaintenanceEntry } from '../types';
import { supabase } from '../supabase';

export const extractRcandSottFromActions = (actions: MaintenanceAction[] = []): ItemCostoIntervencion[] => {
  const items: ItemCostoIntervencion[] = [];

  const validActions = actions.filter((a) => {
    const desc = (a.descripcion || '').trim();
    const resp = (a.responsable || '').trim().toUpperCase();
    return resp !== 'SISTEMA' && desc !== 'Sincronización diaria de estadía';
  });

  validActions.forEach((act, idx) => {
    const text = (act.descripcion || '').trim();
    if (!text) return;

    // 1. Detección de RC (Pedido de repuestos)
    const isRc = /(?:pedido\s+de\s+repuestos|repuestos?|pedido)\s*RC|(?:\bRC\b|\bR\.C\.)/i.test(text);
    
    // 2. Detección de SOTT (Servicios u órdenes a terceros)
    const isSott = /(?:\bSOTT\b|\bSOOT\b|\bO\.T\.\b|\bOT\b\s*\d+)/i.test(text);

    if (isRc) {
      // Extraer número de RC si existe (ej. "RC: 1234", "RC 5521", "RC: -")
      let rcNumber = '';
      let compDesc = text;
      let extractedMonto = 0;

      // Buscar patrones como "RC: 12345" o "RC 12345"
      const rcMatch = text.match(/(?:RC|R\.C\.)[:\s#-]*([0-9A-Za-z\/-]+)/i);
      if (rcMatch && rcMatch[1] && rcMatch[1] !== '-') {
        rcNumber = rcMatch[1].trim();
      }

      // Buscar si ya tiene monto registrado en la acción: (Monto: USD 450)
      const montoMatch = text.match(/\(Monto:\s*USD\s*([0-9.,]+)\)/i);
      if (montoMatch && montoMatch[1]) {
        extractedMonto = parseFloat(montoMatch[1].replace(/\./g, '').replace(/,/g, '.')) || 0;
      }

      // Limpiar prefijo para dejar solo la descripción del componente
      compDesc = text
        .replace(/^pedido\s+de\s+repuestos\s*:?/i, '')
        .replace(/(?:RC|R\.C\.)[:\s#-]*[0-9A-Za-z\/-]*/i, '')
        .replace(/\(Monto:\s*USD\s*[0-9.,]+\)/i, '')
        .replace(/^[:\s-]+/, '')
        .trim();

      if (!compDesc) compDesc = 'Repuestos según pedido';

      items.push({
        id: `rc_${act.id || idx}_${Date.now()}_${idx}`,
        tipo: 'RC',
        numero: rcNumber,
        descripcion: compDesc,
        monto: extractedMonto,
        accion_id: act.id
      });
    } else if (isSott) {
      let sottNumber = '';
      let compDesc = text;
      let extractedMonto = 0;

      // Buscar número en SOTT si existe (ej. "SOTT 4521" o "SOTT: 994")
      const sottMatch = text.match(/(?:SOTT|SOOT)[:\s#-]*([0-9A-Za-z\/-]+)/i);
      if (sottMatch && sottMatch[1] && sottMatch[1] !== '-' && !isNaN(Number(sottMatch[1]))) {
        sottNumber = sottMatch[1].trim();
      }

      // Buscar si ya tiene monto registrado en la acción: (Monto: USD 450)
      const montoMatch = text.match(/\(Monto:\s*USD\s*([0-9.,]+)\)/i);
      if (montoMatch && montoMatch[1]) {
        extractedMonto = parseFloat(montoMatch[1].replace(/\./g, '').replace(/,/g, '.')) || 0;
      }

      compDesc = text
        .replace(/^(?:SOTT|SOOT)[:\s#-]*[0-9A-Za-z\/-]*/i, '')
        .replace(/\(Monto:\s*USD\s*[0-9.,]+\)/i, '')
        .replace(/^[:\s-]+/, '')
        .trim();

      if (!compDesc) compDesc = 'Servicio / Taller de Terceros';

      items.push({
        id: `sott_${act.id || idx}_${Date.now()}_${idx}`,
        tipo: 'SOTT',
        numero: sottNumber,
        descripcion: compDesc,
        monto: extractedMonto,
        accion_id: act.id
      });
    }
  });

  return items;
};

export const getStoredCostoReal = async (entryId: string): Promise<CostoRealIntervencion | null> => {
  if (!entryId) return null;

  // 1. Intentar desde localStorage (fuente inmediata y confiable en cliente)
  try {
    const cached = localStorage.getItem(`costo_real_${entryId}`);
    if (cached) {
      return JSON.parse(cached) as CostoRealIntervencion;
    }
  } catch (e) {
    console.warn('Error al leer costo_real de localStorage:', e);
  }

  // 2. Intentar desde Supabase (en caso de que exista registro)
  try {
    const { data, error } = await supabase
      .from('evaluacion_ingresos_taller')
      .select('*')
      .eq('ingresos_taller_id', entryId)
      .maybeSingle();

    if (!error && data && (data as any).costo_real_data) {
      return (data as any).costo_real_data as CostoRealIntervencion;
    }
  } catch (e) {
    // ignore
  }

  return null;
};

export const syncItemsWithDatabase = async (
  entryId: string,
  items: ItemCostoIntervencion[],
  deletedActionIds: string[] = [],
  actionDate: string
): Promise<ItemCostoIntervencion[]> => {
  const updatedItems = [...items];

  // 1. Si se eliminaron acciones previamente vinculadas, eliminarlas de Supabase
  if (deletedActionIds.length > 0) {
    try {
      await supabase
        .from('acciones_taller')
        .delete()
        .in('id', deletedActionIds);
    } catch (err) {
      console.warn('Error eliminando acciones asociadas en Supabase:', err);
    }
  }

  // 2. Sincronizar cada item (agregar nuevas o actualizar existentes)
  for (let i = 0; i < updatedItems.length; i++) {
    const item = updatedItems[i];
    const numClean = (item.numero || '').trim();
    const descClean = (item.descripcion || '').trim() || (item.tipo === 'RC' ? 'Pedido de repuestos' : 'Servicio tercerizado');
    const montoVal = Math.round(Math.max(0, Number(item.monto) || 0));

    let formattedText = '';
    if (item.tipo === 'RC') {
      formattedText = `Pedido de repuestos RC ${numClean ? numClean : '-'}: ${descClean} (Monto: USD ${montoVal})`;
    } else {
      formattedText = `SOTT ${numClean ? numClean : '-'}: ${descClean} (Monto: USD ${montoVal})`;
    }

    if (!item.accion_id) {
      // Nuevo comprobante agregado en el modal -> Insertar en acciones_taller
      try {
        const { data: newAction, error } = await supabase
          .from('acciones_taller')
          .insert([{
            ingreso_id: entryId,
            descripcion: formattedText,
            fecha_accion: actionDate || new Date().toLocaleDateString('en-CA'),
            responsable: item.tipo === 'RC' ? 'Compras' : 'Taller'
          }])
          .select()
          .maybeSingle();

        if (!error && newAction && newAction.id) {
          updatedItems[i] = {
            ...item,
            accion_id: newAction.id
          };
        }
      } catch (err) {
        console.warn('Error insertando nueva acción de RC/SOTT en Supabase:', err);
      }
    } else {
      // Comprobante existente -> Actualizar descripción con el nuevo número, detalle o monto
      try {
        await supabase
          .from('acciones_taller')
          .update({
            descripcion: formattedText
          })
          .eq('id', item.accion_id);
      } catch (err) {
        console.warn('Error actualizando acción de RC/SOTT existente en Supabase:', err);
      }
    }
  }

  return updatedItems;
};

export const saveStoredCostoReal = async (costo: CostoRealIntervencion): Promise<void> => {
  if (!costo || !costo.ingreso_id) return;

  // 1. Guardar en localStorage
  try {
    localStorage.setItem(`costo_real_${costo.ingreso_id}`, JSON.stringify(costo));
  } catch (e) {
    console.warn('Error al guardar costo_real en localStorage:', e);
  }

  // 2. Guardar en Supabase (evaluacion_ingresos_taller)
  try {
    const { data: existing } = await supabase
      .from('evaluacion_ingresos_taller')
      .select('id')
      .eq('ingresos_taller_id', costo.ingreso_id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('evaluacion_ingresos_taller')
        .update({
          costo_repuesto_real: costo.subtotal_rc,
          costo_sott_real: costo.subtotal_sott,
          costo_total_real: costo.costo_total_real,
          costo_real_data: costo
        })
        .eq('ingresos_taller_id', costo.ingreso_id);
    } else {
      await supabase
        .from('evaluacion_ingresos_taller')
        .insert([{
          ingresos_taller_id: costo.ingreso_id,
          costo_repuesto_real: costo.subtotal_rc,
          costo_sott_real: costo.subtotal_sott,
          costo_total_real: costo.costo_total_real,
          costo_real_data: costo
        }]);
    }
  } catch (e) {
    // Si la tabla o columnas no existen, no bloquear
    console.warn('Aviso al persistir en Supabase costo_real:', e);
  }
};

const getActiveCheckpointDays = (entry: MaintenanceEntry, exitDateStr?: string): number => {
  const actions = entry.acciones_taller || [];
  const sortedActions = [...actions].sort((a, b) =>
    (a.fecha_accion || '').localeCompare(b.fecha_accion || '') || (a.id || '').localeCompare(b.id || '')
  );

  const lastCheckpointAction = [...sortedActions].reverse().find(a =>
    a.descripcion?.startsWith('Cambio de estado a:') ||
    a.descripcion?.includes('Cambio de estado a:') ||
    a.descripcion === 'Sincronización diaria de estadía'
  );

  const lastChangeDate = lastCheckpointAction ? lastCheckpointAction.fecha_accion : entry.fecha_ingreso;
  const effectiveExit = exitDateStr || new Date().toLocaleDateString('en-CA');

  const start = new Date(lastChangeDate + 'T00:00:00');
  const end = new Date(effectiveExit + 'T00:00:00');
  const diffTime = end.getTime() - start.getTime();
  return isNaN(diffTime) ? 0 : Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
};

export const getRepairDays = (entry: MaintenanceEntry, exitDateStr?: string): number => {
  if (!entry) return 0;
  const currentStatus = (entry.estado || 'REPARACION').toUpperCase();
  const baseRepairDays = Math.max(0, Number(entry.estadia_reparacion || 0));

  // Si ya es OPERATIVO, el valor ya quedó consolidado en estadia_reparacion
  if (currentStatus === 'OPERATIVO') {
    if (baseRepairDays === 0 && !entry.estadia_compras && !entry.estadia_prueba) {
      const start = new Date(entry.fecha_ingreso + 'T00:00:00');
      const end = new Date((entry.fecha_salida || exitDateStr || new Date().toLocaleDateString('en-CA')) + 'T00:00:00');
      const diff = Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      return diff;
    }
    return baseRepairDays;
  }

  // Si actualmente está en REPARACION o CONFIRMACION, se suman los días activos desde el último checkpoint
  if (currentStatus === 'REPARACION' || currentStatus === 'CONFIRMACION') {
    const daysDiff = getActiveCheckpointDays(entry, exitDateStr);
    const totalDays = baseRepairDays + daysDiff;
    if (totalDays === 0 && !entry.estadia_compras && !entry.estadia_prueba) {
      const fullStart = new Date(entry.fecha_ingreso + 'T00:00:00');
      const end = new Date((exitDateStr || new Date().toLocaleDateString('en-CA')) + 'T00:00:00');
      return Math.max(0, Math.floor((end.getTime() - fullStart.getTime()) / (1000 * 60 * 60 * 24)));
    }
    return totalDays;
  }

  // Si está en COMPRAS o PRUEBA, los días parciales en reparación acumulados son baseRepairDays
  return baseRepairDays;
};

export const getPartsWaitDays = (entry: MaintenanceEntry, exitDateStr?: string): number => {
  if (!entry) return 0;
  const currentStatus = (entry.estado || 'REPARACION').toUpperCase();
  const basePartsDays = Math.max(0, Number(entry.estadia_compras || 0));

  if (currentStatus === 'OPERATIVO') {
    return basePartsDays;
  }

  if (currentStatus === 'COMPRAS') {
    return basePartsDays + getActiveCheckpointDays(entry, exitDateStr);
  }

  return basePartsDays;
};

export const getTestingDays = (entry: MaintenanceEntry, exitDateStr?: string): number => {
  if (!entry) return 0;
  const currentStatus = (entry.estado || 'REPARACION').toUpperCase();
  const baseTestingDays = Math.max(0, Number(entry.estadia_prueba || 0));

  if (currentStatus === 'OPERATIVO') {
    return baseTestingDays;
  }

  if (currentStatus === 'PRUEBA') {
    return baseTestingDays + getActiveCheckpointDays(entry, exitDateStr);
  }

  return baseTestingDays;
};

export const calculateTotalCostoReal = (
  items: ItemCostoIntervencion[],
  repairDays: number,
  hourlyRate: number
): {
  subtotalRc: number;
  subtotalSott: number;
  horasManoObra: number;
  costoManoObra: number;
  costoTotalReal: number;
} => {
  const safeRepairDays = Math.max(0, Number(repairDays) || 0);
  const safeRate = Math.max(0, Number(hourlyRate) || 0);

  const subtotalRc = items
    .filter((i) => i.tipo === 'RC')
    .reduce((acc, curr) => acc + (Math.max(0, Number(curr.monto) || 0)), 0);

  const subtotalSott = items
    .filter((i) => i.tipo === 'SOTT')
    .reduce((acc, curr) => acc + (Math.max(0, Number(curr.monto) || 0)), 0);

  // La cuenta de horas de mano de obra no debe ser por estadía total,
  // sino el total parcial de horas en estado de REPARACION: (días en reparación) * 2 operarios * 8 hs/día
  const horasManoObra = safeRepairDays * 2 * 8;
  const costoManoObra = horasManoObra * safeRate;
  const costoTotalReal = subtotalRc + subtotalSott + costoManoObra;

  return {
    subtotalRc,
    subtotalSott,
    horasManoObra,
    costoManoObra,
    costoTotalReal
  };
};
