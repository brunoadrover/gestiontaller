import { MaintenanceAction, ItemCostoIntervencion, CostoRealIntervencion } from '../types';
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

      // Buscar patrones como "RC: 12345" o "RC 12345"
      const rcMatch = text.match(/(?:RC|R\.C\.)[:\s#-]*([0-9A-Za-z\/-]+)/i);
      if (rcMatch && rcMatch[1] && rcMatch[1] !== '-') {
        rcNumber = rcMatch[1].trim();
      }

      // Limpiar prefijo para dejar solo la descripción del componente
      compDesc = text
        .replace(/^pedido\s+de\s+repuestos\s*:?/i, '')
        .replace(/(?:RC|R\.C\.)[:\s#-]*[0-9A-Za-z\/-]*/i, '')
        .replace(/^[:\s-]+/, '')
        .trim();

      if (!compDesc) compDesc = 'Repuestos según pedido';

      items.push({
        id: `rc_${act.id || idx}_${Date.now()}_${idx}`,
        tipo: 'RC',
        numero: rcNumber,
        descripcion: compDesc,
        monto: 0,
        accion_id: act.id
      });
    } else if (isSott) {
      let sottNumber = '';
      let compDesc = text;

      // Buscar número en SOTT si existe (ej. "SOTT 4521" o "SOTT: 994")
      const sottMatch = text.match(/(?:SOTT|SOOT)[:\s#-]*([0-9A-Za-z\/-]+)/i);
      if (sottMatch && sottMatch[1] && sottMatch[1] !== '-' && !isNaN(Number(sottMatch[1]))) {
        sottNumber = sottMatch[1].trim();
      }

      compDesc = text
        .replace(/^(?:SOTT|SOOT)[:\s#-]*[0-9A-Za-z\/-]*/i, '')
        .replace(/^[:\s-]+/, '')
        .trim();

      if (!compDesc) compDesc = 'Servicio / Taller de Terceros';

      items.push({
        id: `sott_${act.id || idx}_${Date.now()}_${idx}`,
        tipo: 'SOTT',
        numero: sottNumber,
        descripcion: compDesc,
        monto: 0,
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

export const saveStoredCostoReal = async (costo: CostoRealIntervencion): Promise<void> => {
  if (!costo || !costo.ingreso_id) return;

  // 1. Guardar en localStorage
  try {
    localStorage.setItem(`costo_real_${costo.ingreso_id}`, JSON.stringify(costo));
  } catch (e) {
    console.warn('Error al guardar costo_real en localStorage:', e);
  }

  // 2. Intentar guardar en Supabase como respaldo (no bloqueante si la columna no existe)
  try {
    const { error } = await supabase
      .from('evaluacion_ingresos_taller')
      .update({
        costo_repuesto_real: costo.subtotal_rc,
        costo_sott_real: costo.subtotal_sott,
        costo_total_real: costo.costo_total_real,
        costo_real_data: costo
      })
      .eq('ingresos_taller_id', costo.ingreso_id);

    if (error) {
      // Si las columnas no existen en Supabase, no interrumpe el flujo del usuario
      console.warn('Aviso al persistir en Supabase costo_real:', error.message);
    }
  } catch (e) {
    // ignore
  }
};

export const calculateTotalCostoReal = (
  items: ItemCostoIntervencion[],
  stayDays: number,
  hourlyRate: number
): {
  subtotalRc: number;
  subtotalSott: number;
  horasManoObra: number;
  costoManoObra: number;
  costoTotalReal: number;
} => {
  const safeStayDays = Math.max(0, Math.round(stayDays));
  const safeRate = Math.max(0, Number(hourlyRate) || 0);

  const subtotalRc = items
    .filter((i) => i.tipo === 'RC')
    .reduce((acc, curr) => acc + (Math.max(0, Number(curr.monto) || 0)), 0);

  const subtotalSott = items
    .filter((i) => i.tipo === 'SOTT')
    .reduce((acc, curr) => acc + (Math.max(0, Number(curr.monto) || 0)), 0);

  // Fórmula exigida: (estadía total) * 2 * 8 * (precio mano de obra en dólares)
  const horasManoObra = safeStayDays * 2 * 8;
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
