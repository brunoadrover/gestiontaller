
export interface Equipment {
  id: string; // Interno
  tipo: string;
  marca: string;
  modelo: string;
  horas: number;
  valor_nuevo: number;
  demerito: number;
  comentario_general?: string;
}

export interface MaintenanceAction {
  id: string;
  ingreso_id: string;
  descripcion: string;
  fecha_accion: string;
  responsable: string;
}

export interface MaintenanceEntry {
  id: string;
  equipo_id: string;
  fecha_ingreso: string;
  obra_asignada?: string;
  informe_fallas: string;
  observaciones?: string;
  acciones_taller: MaintenanceAction[]; // Relación con acciones
  fecha_salida?: string; // Nuevo campo
}

export type ViewType = 'tracking' | 'equipment' | 'dashboard';
