
export interface Equipment {
  id: string; // Interno
  tipo: string;
  marca: string;
  modelo: string;
  horas: number;
  year?: number | null;
  valor_nuevo: number;
  demerito: number;
  comentario_general?: string;
  propietario?: string | null;
}

export interface MaintenanceAction {
  id: string;
  ingreso_id: string;
  descripcion: string;
  fecha_accion: string;
  responsable: string;
}

export interface ItemCostoIntervencion {
  id: string;
  tipo: 'RC' | 'SOTT';
  numero: string;
  descripcion: string;
  monto: number;
  accion_id?: string;
}

export interface CostoRealIntervencion {
  ingreso_id: string;
  items: ItemCostoIntervencion[];
  precio_mano_obra_hr: number;
  estadia_total_dias: number;
  dias_reparacion?: number;
  horas_mano_obra: number;
  costo_mano_obra: number;
  subtotal_rc: number;
  subtotal_sott: number;
  costo_total_real: number;
  fecha_computo: string;
  actualizado_por?: string;
}

export interface MaintenanceEntry {
  id: string;
  equipo_id: string;
  fecha_ingreso: string;
  obra_asignada?: string;
  informe_fallas: string;
  observaciones?: string;
  acciones_taller: MaintenanceAction[]; 
  fecha_salida?: string; 
  estado?: string;
  estadia_reparacion?: number;
  estadia_compras?: number;
  estadia_prueba?: number;
  costo_real?: CostoRealIntervencion;
}

export type ViewType = 'tracking' | 'equipment' | 'dashboard' | 'history' | 'overtime';

export interface Configuracion {
  id?: any;
  visible: boolean;
  titulo: string;
  sugerencia: string;
  permitir_edicion_fecha_operativo?: boolean;
}

export interface EvaluacionIngresoTaller {
  id?: string;
  ingresos_taller_id: string;
  // 1 - Datos Proporcionados por Taller
  costo_repuesto_est: number | null;
  costo_sott_est: number | null;
  plazo_est_meses: number | null;
  vida_util_rem_meses: number | null;
  // 2 - Datos Proporcionados por Finanzas
  vida_util_inicial: number | null;
  valor_venta_como_esta: number | null;
  valor_venta_final: number | null;
  costos_fijos_mes: number | null;
  mano_obra_hr: number | null;
  valor_alquiler: number | null;
  tna: number | null;
  // 3 - Datos Proporcionados por Gerencia
  hs_trab_mes_esp: number | null;
  // Resultados Calculados
  inversion?: number | null;
  crc_exigido?: number | null;
  margen_mensual?: number | null;
  cobertura?: number | null;
  mes_repago?: number | null;
  VAN?: number | null;
  van?: number | null;
  repago_descontado?: number | null;
  decision_final?: string | null;
  comentarios?: string | null;
  created_at?: string;
  updated_at?: string;
}
