
import { Equipment, MaintenanceEntry } from './types';

export const INITIAL_EQUIPMENT: Equipment[] = [
  // Serie A (Acoplados y Tanques)
  { id: 'A0001', tipo: 'ACOPLADO TANQUE AGUA/REGADOR DE TIRO 10 ≥ 25 m3', marca: 'NICAR', modelo: '-', horas: 0, valor_nuevo: 45000, demerito: 0.8 },
  { id: 'A0007', tipo: 'ACOPLADO PLAYO DE TIRO 15 ≥ 35 Ton', marca: 'PRATTI FRUENHAUF', modelo: 'TC-SP6011', horas: 0, valor_nuevo: 55000, demerito: 0.75 },
  { id: 'A0021', tipo: 'ACOPLADO PLAYO DE TIRO 15 ≥ 35 Ton', marca: 'v0704', modelo: 'SA 16/20', horas: 0, valor_nuevo: 55000, demerito: 0.7 },
  { id: 'A0053', tipo: 'ACOPLADO PLAYO DE TIRO 15 ≥ 35 Ton', marca: 'HELVETICA - FERRONI', modelo: 'SA 20/25 TT', horas: 0, valor_nuevo: 60000, demerito: 0.65 },
  
  // Serie E (Equipos Pesados y Plantas)
  { id: 'E0206', tipo: 'DISTRIBUIDOR DE AGR. PETREOS ARR.', marca: 'MICHELINI', modelo: 'FM/375', horas: 98, valor_nuevo: 85000, demerito: 0.9 },
  { id: 'E0306', tipo: 'PLANTA CLASIFICADORA DE ARIDOS < 200 Tn/h', marca: 'FERRONI', modelo: 'PC-200', horas: 18243, valor_nuevo: 450000, demerito: 0.85 },
  { id: 'E0307', tipo: 'PLANTA MEZCLADORA P/SUELO ESTAB. < 200 Tn/h', marca: 'FERRONI', modelo: 'PMS-200', horas: 50000, valor_nuevo: 520000, demerito: 0.8 },
  { id: 'E0354', tipo: 'AUTOELEVADOR 3 ≤ Tn < 6', marca: 'HYSTER', modelo: 'H-110F', horas: 12399, valor_nuevo: 75000, demerito: 0.7 },
  { id: 'E0404', tipo: 'RODILLO P. CABRA ESTATICO AUTOP. ≥ 25 Tn', marca: 'CATERPILLAR', modelo: '825 STD', horas: 16731, valor_nuevo: 650000, demerito: 0.95 },
  { id: 'E1014', tipo: 'MOTONIVELADORA 14\'', marca: 'CATERPILLAR', modelo: '140H', horas: 23882, valor_nuevo: 380000, demerito: 0.82 },
  { id: 'E1070', tipo: 'EXCAVADORA S/ORUGAS ≥ 40 Tn', marca: 'KOMATSU', modelo: 'PC450-7', horas: 15827, valor_nuevo: 550000, demerito: 0.88 },
  { id: 'E1402', tipo: 'EXCAVADORA S/ORUGAS 30 ≤ Tn < 40', marca: 'VOLVO', modelo: 'EC290 BLC PRIME', horas: 11882, valor_nuevo: 320000, demerito: 0.75 },
  { id: 'E1403', tipo: 'EXCAVADORA S/ORUGAS 30 ≤ Tn < 40', marca: 'VOLVO', modelo: 'EC290 BLC PRIME', horas: 6633, valor_nuevo: 320000, demerito: 0.85 },
  { id: 'E1464', tipo: 'EXCAVADORA S/ORUGAS 20 ≤ Tn < 30', marca: 'KOMATSU', modelo: 'PC240LC-8', horas: 5744, valor_nuevo: 240000, demerito: 0.9 },

  // Serie V (Vehículos de Servicio y Camiones)
  { id: 'V0704', tipo: 'CAMION REGADOR DE AGUA < 10 m3', marca: 'IVECO', modelo: '170E 21 EUROCARGO', horas: 3134, valor_nuevo: 120000, demerito: 0.7 },
  { id: 'V0748', tipo: 'CAMION TRACTOR 6X4', marca: 'IVECO', modelo: 'EUROTRAKKER 380 E37H', horas: 14085, valor_nuevo: 180000, demerito: 0.65 },
  { id: 'V0771', tipo: 'CAMION SERVICIO DE TALLER', marca: 'IVECO', modelo: 'EUROCARGO 170 E22 TECTOR', horas: 57591, valor_nuevo: 140000, demerito: 0.6 },
  { id: 'V1169', tipo: 'CAMION VOLCADOR ≥ 15 m3 6x4', marca: 'IVECO', modelo: 'TRAKKER HI LAND 410T44', horas: 3041, valor_nuevo: 210000, demerito: 0.95 },
  
  // Serie Q (Equipos Nuevos)
  { id: 'Q0352', tipo: 'CAMION C/MOTOHORMIGONERO', marca: 'CARMIX', modelo: '45FX', horas: 867, valor_nuevo: 160000, demerito: 0.98 },
];

export const INITIAL_ENTRIES: MaintenanceEntry[] = [
  {
    id: '1',
    equipo_id: 'E1402',
    fecha_ingreso: '2025-05-12',
    informe_fallas: 'Ruidos anormales en el motor',
    acciones_taller: [
      { id: 'a1', ingreso_id: '1', descripcion: 'Ingreso a taller - Diagnóstico inicial', fecha_accion: '2025-05-12', responsable: 'Juan Pérez' },
      { id: 'a7', ingreso_id: '1', descripcion: 'Operativo', fecha_accion: '2025-06-15', responsable: 'Taller Central' },
    ]
  },
  {
    id: '2',
    equipo_id: 'E1464',
    fecha_ingreso: '2025-10-10',
    informe_fallas: 'Pérdida de fluido hidráulico en mandos finales',
    acciones_taller: [
      { id: 'b1', ingreso_id: '2', descripcion: 'Revisión de sellos y retenes', fecha_accion: '2025-10-11', responsable: 'S. Técnico' },
      { id: 'b2', ingreso_id: '2', descripcion: 'Desarme de mando final izquierdo', fecha_accion: '2025-10-14', responsable: 'Mecánica 2' },
    ]
  },
  {
    id: '3',
    equipo_id: 'V1169',
    fecha_ingreso: '2025-11-20',
    informe_fallas: 'Service preventivo - Cambio de aceites y filtros',
    acciones_taller: [
      { id: 'c1', ingreso_id: '3', descripcion: 'Cambio de aceite motor y filtros de aire', fecha_accion: '2025-11-21', responsable: 'Lubricentro' },
      { id: 'c2', ingreso_id: '3', descripcion: 'Operativo', fecha_accion: '2025-11-22', responsable: 'Lubricentro' },
    ]
  }
];
