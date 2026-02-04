
export interface Equipment {
  id: string; // Interno
  type: string; // Tipo
  brand: string; // Marca
  model: string; // Modelo
  hours: number; // Hs
  valorNuevo: number; // Valor de reposición (USD)
  demerito: number; // Factor de mérito (0 a 1)
  generalComment?: string; // Comentario permanente del equipo
}

export interface MaintenanceAction {
  id: string;
  description: string;
  date: string;
  performedBy: string; // Realizado por
}

export interface MaintenanceEntry {
  id: string;
  equipmentId: string;
  entryDate: string;
  assignedWork?: string; // Obra Asignada
  preliminaryInfo: string;
  actions: MaintenanceAction[];
  comment?: string; // Observaciones generales del ingreso
}

export type ViewType = 'tracking' | 'equipment' | 'dashboard';
