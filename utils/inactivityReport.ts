import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MaintenanceEntry, Equipment } from '../types';

export const getDiffDays = (d1: string, d2: string) => {
  if (!d1 || !d2) return 0;
  const start = new Date(d1 + 'T00:00:00');
  const end = new Date(d2 + 'T00:00:00');
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  const diffTime = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
};

export const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return 'N/D';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
};

export const calculateLoss = (days: number, eq?: Equipment | null) => {
  if (!eq) return 0;
  return (days / 30) * 0.0325 * (eq.demerito || 0.8) * 0.5 * (eq.valor_nuevo || 0);
};

export const formatCurrency = (val: number) => {
  return `USD ${Math.round(val || 0).toLocaleString('de-DE')}`;
};

export const getWorkshopName = (equipo_id: string, eq?: Equipment | null) => {
  const id = (equipo_id || '').toUpperCase();
  const desc = ((eq?.tipo || '') + ' ' + (eq?.marca || '') + ' ' + (eq?.modelo || '')).toLowerCase();
  
  if (id.startsWith('E')) return 'Taller Pesados';
  if (id.startsWith('V')) {
    if (desc.includes('camión') || desc.includes('camion') || desc.includes('colectivo')) {
      return 'Taller Camiones';
    }
    return 'Taller Livianos';
  }
  return 'Otros';
};

export const getStateLabel = (estado?: string) => {
  const st = (estado || 'REPARACION').toUpperCase();
  if (st === 'REPARACION') return 'En Reparación';
  if (st === 'COMPRAS') return 'Esperando Repuestos';
  if (st === 'PRUEBA') return 'En Prueba';
  return estado || 'En Reparación';
};

export interface InactivityRecord {
  entry: MaintenanceEntry;
  equipment: Equipment | null;
  interno: string;
  marca: string;
  modelo: string;
  horas: string;
  año: string;
  taller: string;
  fechaIngreso: string;
  estadiaTotal: number;
  perdidaFacturacion: number;
  ultimoAvanceDesc: string;
  mecanico: string;
  fechaUltimoAvance: string;
  diasAvance: number;
  estado: string;
}

export const generateInactivityReportPDF = (
  entries: MaintenanceEntry[],
  equipmentList: Equipment[]
) => {
  const today = new Date().toLocaleDateString('en-CA');
  const todayFormatted = new Date().toLocaleDateString('es-AR');

  // Filter inactive entries (state !== OPERATIVO and last progress >= 7 days)
  const inactiveRecords: InactivityRecord[] = [];

  entries.forEach((entry) => {
    // Only active workshop entries (not operative)
    if (entry.estado === 'OPERATIVO' || entry.fecha_salida) return;

    const eq = equipmentList.find((e) => e.id === entry.equipo_id) || null;

    // Filter non-system actions
    const actions = (entry.acciones_taller || []).filter(
      (a) => a.responsable !== 'Sistema' && a.descripcion !== 'Sincronización diaria de estadía'
    );

    let lastActionDate = entry.fecha_ingreso;
    let lastActionDesc = entry.informe_fallas || 'Ingreso inicial a taller';
    let lastActionResp = 'Sin especificar';

    if (actions.length > 0) {
      const sorted = [...actions].sort((a, b) => a.fecha_accion.localeCompare(b.fecha_accion));
      const lastAction = sorted[sorted.length - 1];
      lastActionDate = lastAction.fecha_accion;
      lastActionDesc = lastAction.descripcion || 'Sin descripción';
      lastActionResp = lastAction.responsable || 'Sin especificar';
    }

    const diasAvance = getDiffDays(lastActionDate, today);

    // Criteria: Inactivity age >= 7 days
    if (diasAvance >= 7) {
      const estadiaTotal = getDiffDays(entry.fecha_ingreso, today);
      const perdidaFacturacion = calculateLoss(estadiaTotal, eq);
      const taller = getWorkshopName(entry.equipo_id, eq);
      const estado = getStateLabel(entry.estado);

      inactiveRecords.push({
        entry,
        equipment: eq,
        interno: entry.equipo_id,
        marca: eq?.marca || 'N/D',
        modelo: eq?.modelo || 'N/D',
        horas: eq?.horas !== undefined && eq?.horas !== null ? `${eq.horas.toLocaleString('es-AR')}` : 'N/D',
        año: eq?.year ? String(eq.year) : 'N/D',
        taller,
        fechaIngreso: formatDateDisplay(entry.fecha_ingreso),
        estadiaTotal,
        perdidaFacturacion,
        ultimoAvanceDesc: lastActionDesc,
        mecanico: lastActionResp,
        fechaUltimoAvance: formatDateDisplay(lastActionDate),
        diasAvance,
        estado
      });
    }
  });

  if (inactiveRecords.length === 0) {
    alert('No se encontraron equipos con inactividad de avances mayor o igual a 7 días.');
    return;
  }

  // Group by Estado
  const groupedByEstado: { [key: string]: InactivityRecord[] } = {};

  inactiveRecords.forEach((record) => {
    if (!groupedByEstado[record.estado]) {
      groupedByEstado[record.estado] = [];
    }
    groupedByEstado[record.estado].push(record);
  });

  // Predefined state order
  const stateOrder = ['En Reparación', 'Esperando Repuestos', 'En Prueba'];
  const allStates = Object.keys(groupedByEstado).sort((a, b) => {
    const idxA = stateOrder.indexOf(a);
    const idxB = stateOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  // Sort each group: first by Taller, then by diasAvance DESC (de mayor a menor antigüedad)
  allStates.forEach((state) => {
    groupedByEstado[state].sort((a, b) => {
      const workshopComp = a.taller.localeCompare(b.taller);
      if (workshopComp !== 0) return workshopComp;
      return b.diasAvance - a.diasAvance; // Mayor a menor días de avance
    });
  });

  // Generate PDF Landscape
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Header Banner
  doc.setFillColor(30, 41, 59); // Dark slate bg
  doc.rect(0, 0, 297, 24, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('INFORME DE INACTIVIDAD DE AVANCES DE TALLER', 14, 11);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text('Equipos en taller sin registros de avance en los últimos 7 días o más', 14, 18);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(`EMISIÓN: ${todayFormatted}`, 283, 11, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`REGISTROS INACTIVOS: ${inactiveRecords.length}`, 283, 18, { align: 'right' });

  let startY = 28;

  // Render each state section
  allStates.forEach((state, stateIndex) => {
    const groupRecords = groupedByEstado[state];
    const groupLoss = groupRecords.reduce((sum, r) => sum + r.perdidaFacturacion, 0);

    // Section Header
    if (startY > 175) {
      doc.addPage();
      startY = 20;
    }

    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(14, startY, 269, 8, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.rect(14, startY, 269, 8, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(`ESTADO: ${state.toUpperCase()} (${groupRecords.length} ${groupRecords.length === 1 ? 'equipo' : 'equipos'})`, 18, startY + 5.5);

    doc.setFontSize(8);
    doc.setTextColor(185, 28, 28); // Red text
    doc.text(`Pérdida Facturación Grupo: ${formatCurrency(groupLoss)}`, 280, startY + 5.5, { align: 'right' });

    startY += 11;

    // Table Columns
    const tableColumns = [
      { header: 'Interno', dataKey: 'interno' },
      { header: 'Marca', dataKey: 'marca' },
      { header: 'Modelo', dataKey: 'modelo' },
      { header: 'Hs/Km', dataKey: 'horas' },
      { header: 'Año', dataKey: 'año' },
      { header: 'Taller', dataKey: 'taller' },
      { header: 'Ingreso', dataKey: 'fechaIngreso' },
      { header: 'Estadía', dataKey: 'estadiaTotal' },
      { header: 'Pérdida Fact.', dataKey: 'perdidaFacturacion' },
      { header: 'Último Avance Registrado', dataKey: 'ultimoAvanceDesc' },
      { header: 'Mecánico', dataKey: 'mecanico' },
      { header: 'Fecha Av.', dataKey: 'fechaUltimoAvance' },
      { header: 'Días Av.', dataKey: 'diasAvance' },
    ];

    const tableRows = groupRecords.map((r) => ({
      interno: r.interno,
      marca: r.marca,
      modelo: r.modelo,
      horas: r.horas,
      año: r.año,
      taller: r.taller,
      fechaIngreso: r.fechaIngreso,
      estadiaTotal: `${r.estadiaTotal} d.`,
      perdidaFacturacion: formatCurrency(r.perdidaFacturacion),
      ultimoAvanceDesc: r.ultimoAvanceDesc,
      mecanico: r.mecanico,
      fechaUltimoAvance: r.fechaUltimoAvance,
      diasAvance: `${r.diasAvance} d.`
    }));

    autoTable(doc, {
      startY,
      columns: tableColumns,
      body: tableRows,
      theme: 'grid',
      styles: {
        fontSize: 7,
        cellPadding: 2,
        textColor: [30, 41, 59],
        valign: 'middle'
      },
      headStyles: {
        fillColor: [0, 128, 0], // Green header
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
        halign: 'center'
      },
      columnStyles: {
        interno: { cellWidth: 16, fontStyle: 'bold', halign: 'center' },
        marca: { cellWidth: 18 },
        modelo: { cellWidth: 18 },
        horas: { cellWidth: 15, halign: 'right' },
        año: { cellWidth: 12, halign: 'center' },
        taller: { cellWidth: 22 },
        fechaIngreso: { cellWidth: 16, halign: 'center' },
        estadiaTotal: { cellWidth: 14, halign: 'center' },
        perdidaFacturacion: { cellWidth: 22, halign: 'right', fontStyle: 'bold', textColor: [185, 28, 28] },
        ultimoAvanceDesc: { cellWidth: 52 },
        mecanico: { cellWidth: 22 },
        fechaUltimoAvance: { cellWidth: 16, halign: 'center' },
        diasAvance: { cellWidth: 15, halign: 'center', fontStyle: 'bold', textColor: [220, 38, 38] }
      },
      margin: { left: 14, right: 14 },
      didDrawPage: (data) => {
        // Footer
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Gestor de Taller de Maquinaria - Página ${data.pageNumber}`,
          14,
          205
        );
      }
    });

    startY = (doc as any).lastAutoTable.finalY + 8;
  });

  // Overall Total Loss Footer
  const totalGlobalLoss = inactiveRecords.reduce((sum, r) => sum + r.perdidaFacturacion, 0);

  if (startY > 185) {
    doc.addPage();
    startY = 20;
  }

  doc.setFillColor(254, 242, 242); // Light red
  doc.rect(14, startY, 269, 10, 'F');
  doc.setDrawColor(252, 165, 165);
  doc.rect(14, startY, 269, 10, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(153, 27, 27);
  doc.text(`TOTAL GENERAL EQUIPOS INACTIVOS (≥ 7 DÍAS): ${inactiveRecords.length}`, 18, startY + 6.5);
  doc.text(`PÉRDIDA DE FACTURACIÓN ACUMULADA TOTAL: ${formatCurrency(totalGlobalLoss)}`, 280, startY + 6.5, { align: 'right' });

  // Save PDF
  const filename = `Informe_Inactividad_Taller_${today}.pdf`;
  doc.save(filename);
};
