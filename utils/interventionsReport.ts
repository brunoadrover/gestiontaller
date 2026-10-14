import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MaintenanceEntry, Equipment, TechnicalReport } from '../types';
import { 
  getDiffDays, 
  formatDateDisplay, 
  calculateLoss, 
  formatCurrency, 
  getWorkshopName, 
  getStateLabel 
} from './inactivityReport';

export const exportEquipmentInterventionsPDF = (
  entry: MaintenanceEntry,
  equipmentList: Equipment[]
) => {
  if (!entry) return;

  const eq = equipmentList.find((e) => e.id.toLowerCase() === entry.equipo_id?.toLowerCase()) || null;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  
  const todayRaw = new Date();
  const todayStr = todayRaw.toLocaleDateString('en-CA');
  const todayFormatted = todayRaw.toLocaleDateString('es-AR');
  const fechaEmisionForFile = todayFormatted.replace(/\//g, '-');

  const isOperative = entry.estado === 'OPERATIVO' || !!entry.fecha_salida;
  const endDate = entry.fecha_salida || todayStr;
  const totalStayDays = getDiffDays(entry.fecha_ingreso, endDate);
  const loss = calculateLoss(totalStayDays, eq);

  // Cant Pedidos y SOTT (acciones donde responsable NO sea COMPRAS ni SISTEMA)
  const nonComprasActions = (entry.acciones_taller || []).filter((a) => {
    const resp = (a.responsable || '').trim().toUpperCase();
    return resp !== 'COMPRAS' && resp !== 'SISTEMA';
  });

  const cantPedidos = nonComprasActions.filter((a) => {
    const desc = (a.descripcion || '').trim().toLowerCase();
    return /^pedidos?\s+de\s+repuestos?/i.test(desc);
  }).length;

  const cantSOTT = nonComprasActions.filter((a) => {
    const desc = (a.descripcion || '').trim();
    return /(SOTT|SOOT|\bOT\b|O\.T\.?)/i.test(desc);
  }).length;

  // --- HEADER SUPERIOR ---
  doc.setFillColor(30, 41, 59); // Slate 800
  doc.rect(0, 0, 210, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.text('GEyT', 14, 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('CARPETA DE ARRASTRE', 200, 12, { align: 'right' });
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(`Informe de Intervenciones | Emisión: ${todayFormatted}`, 200, 18, { align: 'right' });

  // --- RECTÁNGULO DE DATOS DEL EQUIPO Y SERVICIO ---
  let startY = 32;

  doc.setFillColor(248, 250, 252); // Slate 50
  doc.rect(14, startY, 182, 36, 'F');
  doc.setDrawColor(203, 213, 225); // Slate 300
  doc.rect(14, startY, 182, 36, 'S');

  // Badge Interno
  doc.setFillColor(21, 128, 61); // Green 700
  doc.roundedRect(18, startY + 5, 28, 10, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(entry.equipo_id, 32, startY + 11.5, { align: 'center' });

  // Datos principales
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  // Columna 1
  doc.text('Tipo:', 52, startY + 9);
  doc.setFont('helvetica', 'bold');
  doc.text(`${eq?.tipo || 'N/D'}`, 63, startY + 9);

  doc.setFont('helvetica', 'normal');
  doc.text('Marca / Modelo:', 52, startY + 15);
  doc.setFont('helvetica', 'bold');
  doc.text(`${eq?.marca || ''} ${eq?.modelo || ''}`.trim() || 'N/D', 78, startY + 15);

  doc.setFont('helvetica', 'normal');
  doc.text('Propietario:', 52, startY + 21);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(3, 105, 161); // Sky 700
  doc.text(`${eq?.propietario || 'N/D'}`, 71, startY + 21);

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  doc.text('Taller Asignado:', 52, startY + 27);
  doc.setFont('helvetica', 'bold');
  doc.text(`${getWorkshopName(entry.equipo_id, eq)}`, 76, startY + 27);

  // Columna 2
  doc.setFont('helvetica', 'normal');
  doc.text('Hs Arrastre:', 130, startY + 9);
  doc.setFont('helvetica', 'bold');
  doc.text(`${eq?.horas?.toLocaleString('es-AR') || '-'}`, 152, startY + 9);

  doc.setFont('helvetica', 'normal');
  doc.text('Año:', 130, startY + 15);
  doc.setFont('helvetica', 'bold');
  doc.text(`${eq?.year || 'N/D'}`, 139, startY + 15);

  doc.setFont('helvetica', 'normal');
  doc.text('Obra Asignada:', 130, startY + 21);
  doc.setFont('helvetica', 'bold');
  doc.text(`${entry.obra_asignada || 'Sin asignar'}`, 155, startY + 21);

  doc.setFont('helvetica', 'normal');
  doc.text('Estado:', 130, startY + 27);
  doc.setFont('helvetica', 'bold');
  const estadoLabel = isOperative ? 'OPERATIVO' : getStateLabel(entry.estado).toUpperCase();
  doc.setTextColor(isOperative ? 22 : 180, isOperative ? 101 : 83, isOperative ? 52 : 9);
  doc.text(estadoLabel, 143, startY + 27);

  // Subbarra con fechas y estadísticas
  startY += 40;
  doc.setFillColor(241, 245, 249); // Slate 100
  doc.rect(14, startY, 182, 14, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(14, startY, 182, 14, 'S');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);

  doc.text(`Fecha Ingreso: `, 18, startY + 6);
  doc.setFont('helvetica', 'bold');
  doc.text(`${formatDateDisplay(entry.fecha_ingreso)}`, 39, startY + 6);

  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha Salida: `, 72, startY + 6);
  doc.setFont('helvetica', 'bold');
  doc.text(`${entry.fecha_salida ? formatDateDisplay(entry.fecha_salida) : 'En Taller (Activo)'}`, 91, startY + 6);

  doc.setFont('helvetica', 'normal');
  doc.text(`Estadía Total: `, 140, startY + 6);
  doc.setFont('helvetica', 'bold');
  doc.text(`${totalStayDays} días`, 160, startY + 6);

  // Segunda sublínea de la barra: Pérdida, Pedidos, SOTT
  doc.setFont('helvetica', 'normal');
  doc.text(`Pérdida Estimada: `, 18, startY + 11.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(153, 27, 27);
  doc.text(`${formatCurrency(loss)}`, 43, startY + 11.5);

  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'normal');
  doc.text(`Cant. Pedidos: `, 95, startY + 11.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`${cantPedidos}`, 115, startY + 11.5);

  doc.setFont('helvetica', 'normal');
  doc.text(`Cantidad de SOTT: `, 145, startY + 11.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`${cantSOTT}`, 172, startY + 11.5);

  // --- MOTIVO DE INGRESO / FALLAS ---
  startY += 19;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('MOTIVO DE INGRESO / INFORME PRELIMINAR DE FALLAS:', 14, startY);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  const fallasText = entry.informe_fallas || 'Sin informe inicial registrado.';
  const splitFallas = doc.splitTextToSize(fallasText, 182);
  doc.text(splitFallas, 14, startY + 4.5);

  startY += (splitFallas.length * 4.5) + 6;

  // --- TABLA DE AVANCES E INTERVENCIONES ---
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(21, 128, 61);
  doc.text('HISTORIAL DE AVANCES E INTERVENCIONES DE TALLER', 14, startY);

  const rawActions = (entry.acciones_taller || []).filter(
    (a) => a.responsable !== 'Sistema' && a.descripcion !== 'Sincronización diaria de estadía'
  );

  // Ordenar cronológicamente (antiguos primero para leer el historial de intervenciones)
  const sortedActions = [...rawActions].sort((a, b) => {
    return (a.fecha_accion || '').localeCompare(b.fecha_accion || '');
  });

  const tableRows: any[] = sortedActions.map((action, idx) => {
    const curDate = action.fecha_accion || entry.fecha_ingreso;
    const daysFromIngreso = getDiffDays(entry.fecha_ingreso, curDate);

    return [
      idx + 1,
      formatDateDisplay(action.fecha_accion),
      action.responsable || 'Sin especificar',
      action.descripcion || 'Sin descripción',
      `+${daysFromIngreso} d.`
    ];
  });

  if (entry.observaciones && entry.observaciones.trim() !== '') {
    tableRows.push([
      {
        content: `OBSERVACIONES DE SALIDA / FINAL: ${entry.observaciones}`,
        colSpan: 5,
        styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [30, 41, 59] }
      }
    ]);
  }

  if (tableRows.length === 0) {
    tableRows.push([
      {
        content: 'No se registran avances o intervenciones adicionales para este ingreso.',
        colSpan: 5,
        styles: { halign: 'center', fontStyle: 'italic', textColor: [148, 163, 184] }
      }
    ]);
  }

  autoTable(doc, {
    startY: startY + 2,
    head: [['#', 'Fecha', 'Responsable / Mecánico', 'Acción Realizada / Avance', 'Desde Ingreso']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [21, 128, 61],
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold',
      halign: 'left'
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 24, halign: 'center' },
      2: { cellWidth: 38, fontStyle: 'bold' },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 24, halign: 'center', fontStyle: 'bold' }
    },
    styles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
      overflow: 'linebreak'
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    }
  });

  // Si tiene informe técnico previo registrado (informe_taller), incluir una tabla resumen de sistemas
  let existingReport: TechnicalReport | null = null;
  if (entry.informe_taller) {
    if (Array.isArray(entry.informe_taller) && entry.informe_taller.length > 0) {
      existingReport = entry.informe_taller[0];
    } else if (!Array.isArray(entry.informe_taller)) {
      existingReport = entry.informe_taller as TechnicalReport;
    }
  }

  if (existingReport) {
    const techItems = [
      ['Motor', existingReport.motor],
      ['Sistema Hidráulico', existingReport.sistema_hidraulico],
      ['Sistema Eléctrico', existingReport.sistema_electrico],
      ['Sistema Neumático', existingReport.sistema_neumatico],
      ['Estructura / Chasis', existingReport.estructura],
      ['Cabina / Operador', existingReport.cabina],
      ['Tren Rodante / Neumáticos', existingReport.tren_rodante],
      ['Elementos de Desgaste', existingReport.elementos_desgaste],
      ['Componentes Específicos', existingReport.componentes_especificos],
      ['Observaciones Técnicas', existingReport.observaciones]
    ].filter(([_, val]) => val && val.trim() !== '' && val !== '-');

    if (techItems.length > 0) {
      const finalY = (doc as any).lastAutoTable?.finalY || 180;
      let nextStartY = finalY + 8;
      
      // Si queda poco espacio en la página, crear una nueva página
      if (nextStartY > 240) {
        doc.addPage();
        nextStartY = 20;
      }

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('EVALUACIÓN TÉCNICA DE COMPONENTES (REGISTRO TÉCNICO)', 14, nextStartY);

      autoTable(doc, {
        startY: nextStartY + 2,
        head: [['Sistema / Componente', 'Estado y Observaciones Técnicas']],
        body: techItems,
        theme: 'grid',
        headStyles: {
          fillColor: [51, 65, 85],
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: 'bold'
        },
        columnStyles: {
          0: { cellWidth: 50, fontStyle: 'bold', fillColor: [248, 250, 252] },
          1: { cellWidth: 'auto' }
        },
        styles: {
          fontSize: 8,
          cellPadding: 2.5,
          overflow: 'linebreak'
        }
      });
    }
  }

  // --- FOOTER CON PAGINACIÓN ---
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // Slate 400
    doc.text(`GEyT - Carpeta de Arrastre | Equipo: ${entry.equipo_id}`, 14, 290);
    doc.text(`Página ${i} de ${pageCount}`, 105, 290, { align: 'center' });
    doc.text(`Emisión: ${todayFormatted}`, 196, 290, { align: 'right' });
  }

  // Titulo del archivo: <Interno>_InformeIntervenciones_<fecha de emisión>.pdf
  const safeInterno = (entry.equipo_id || 'Equipo').trim().replace(/[\/\\:*?"<>|]/g, '_');
  const fileName = `${safeInterno}_InformeIntervenciones_${fechaEmisionForFile}.pdf`;
  doc.save(fileName);
};
