import React, { useState, useEffect } from 'react';
import { MaintenanceEntry, Equipment, EvaluacionIngresoTaller } from '../types';
import { X, Calculator, Save, AlertCircle, CheckCircle2, TrendingUp, DollarSign, Clock, HelpCircle, ShieldAlert, Sparkles, RefreshCw, FileSpreadsheet, Download, Table, Layers, ArrowRight, BarChart3, Award, ArrowUpRight, Check, FolderDown } from 'lucide-react';
import { supabase } from '../supabase';
import { exportFinancialEvaluationPDF } from '../utils/financialReport';

export interface FlujoFondoRow {
  mes: number;
  fase: 'Inversión' | 'Taller' | 'Operación';
  margenOperativo: number;
  costosFijosTaller: number;
  inversion: number;
  residual: number;
  flujoNeto: number;
  factorDescuento: number;
  valorActual: number;
  vaAcumuladoSinResidual: number;
}

export const getDefaultVidaUtilRem = (year?: number | null) => {
  const currentYear = new Date().getFullYear();
  if (!year || isNaN(Number(year))) {
    return {
      defaultMonths: 36,
      legend: '',
      isAlcanzada: false,
    };
  }
  const numYear = Number(year);
  // Formula: ((año + 10) - año actual) * 12
  const diffYears = (numYear + 10) - currentYear;
  const diffMonths = diffYears * 12;

  if (diffMonths > 0) {
    return {
      defaultMonths: diffMonths,
      legend: 'para alcanzar la vida útil inicial estimada',
      isAlcanzada: false,
    };
  } else {
    return {
      defaultMonths: 0,
      legend: 'vida útil inicial estimada alcanzada',
      isAlcanzada: true,
    };
  }
};

interface EvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: MaintenanceEntry | null;
  equipment: Equipment | null;
}

export const EvaluationModal: React.FC<EvaluationModalProps> = ({
  isOpen,
  onClose,
  entry,
  equipment,
}) => {
  // Loading & notification states
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rlsNotice, setRlsNotice] = useState(false);

  // Existing DB record id if exists
  const [recordId, setRecordId] = useState<string | null>(null);

  // Form Fields - 1. Taller
  const [costoRepuestoEst, setCostoRepuestoEst] = useState<string>('');
  const [costoSottEst, setCostoSottEst] = useState<string>('');
  const [plazoEstMeses, setPlazoEstMeses] = useState<string>('');
  const [vidaUtilRemMeses, setVidaUtilRemMeses] = useState<string>('');

  // Form Fields - 2. Finanzas (Porcentajes sobre valor_nuevo por defecto 30% y 20%)
  const [vidaUtilInicial, setVidaUtilInicial] = useState<string>('120'); // Default 120
  const [porcentajeVentaComoEsta, setPorcentajeVentaComoEsta] = useState<string>('30'); // Default 30%
  const [porcentajeVentaFinal, setPorcentajeVentaFinal] = useState<string>('20'); // Default 20%
  const [costosFijosMes, setCostosFijosMes] = useState<string>('');
  const [manoObraHr, setManoObraHr] = useState<string>('');
  const [valorAlquiler, setValorAlquiler] = useState<string>('');
  const [tna, setTna] = useState<string>('');

  // Form Fields - 3. Gerencia
  const [hsTrabMesEsp, setHsTrabMesEsp] = useState<string>('140'); // Default 140

  // Form Fields - 4. Decisión Final & Comentarios
  const [decisionFinal, setDecisionFinal] = useState<string>('');
  const [comentarios, setComentarios] = useState<string>('');

  // Computed results
  const [evaluationDone, setEvaluationDone] = useState(false);
  const [inversion, setInversion] = useState<number | null>(null);
  const [crcExigido, setCrcExigido] = useState<number | null>(null);
  const [margenMensual, setMargenMensual] = useState<number | null>(null);
  const [cobertura, setCobertura] = useState<number | null>(null);
  const [tarifaCalculada, setTarifaCalculada] = useState<number | null>(null);
  const [van, setVan] = useState<number | null>(null);
  const [mesRepago, setMesRepago] = useState<number | null>(null);
  const [flujoRows, setFlujoRows] = useState<FlujoFondoRow[]>([]);

  // Derived values for valor_venta_como_esta, valor_venta_final and vuRemInfo
  const vNuevoRef = equipment?.valor_nuevo || 0;
  const valorVentaComoEsta = ((Number(porcentajeVentaComoEsta) || 0) / 100) * vNuevoRef;
  const valorVentaFinal = ((Number(porcentajeVentaFinal) || 0) / 100) * vNuevoRef;
  const vuRemInfo = getDefaultVidaUtilRem(equipment?.year);

  // Format currency display
  const formatMoney = (val: number | null | undefined) => {
    if (val === null || val === undefined || isNaN(val)) return 'USD 0';
    return `USD ${Math.round(val).toLocaleString('de-DE')}`;
  };

  const formatDecimals = (val: number | null | undefined, digits = 2) => {
    if (val === null || val === undefined || isNaN(val)) return '0.00';
    return val.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  };

  // Helper to get local cache
  const getLocalStorageKey = (entryId: string) => `eval_intervencion_${entryId}`;

  // Helper function to build cash flow table and calculate VAN & Repago
  const buildCashFlow = (
    plazoMeses: number,
    vuRemMeses: number,
    invCalc: number,
    cFijos: number,
    margenMes: number,
    vVentaFin: number,
    tnaVal: number
  ): { rows: FlujoFondoRow[]; vanCalc: number; mesRepagoCalc: number } => {
    const nPlazo = Math.max(0, Math.round(plazoMeses));
    const nVuRem = Math.max(1, Math.round(vuRemMeses));
    const totalMeses = nPlazo + nVuRem;
    const im = (tnaVal / 100) / 12;

    const rows: FlujoFondoRow[] = [];
    let vaAcum = 0;
    let detectedRepago: number | null = null;
    let totalVan = 0;

    for (let m = 0; m <= totalMeses; m++) {
      let fase: 'Inversión' | 'Taller' | 'Operación' = 'Operación';
      let margenOperativo = 0;
      let costosFijosTaller = 0;
      let inversionVal = 0;
      let residualVal = 0;
      let flujoNeto = 0;

      if (m === 0) {
        fase = 'Inversión';
        inversionVal = invCalc;
        flujoNeto = -invCalc;
      } else if (m <= nPlazo) {
        fase = 'Taller';
        costosFijosTaller = cFijos;
        flujoNeto = -cFijos;
      } else {
        fase = 'Operación';
        margenOperativo = margenMes;
        if (m === totalMeses) {
          residualVal = vVentaFin;
          flujoNeto = margenMes + vVentaFin;
        } else {
          flujoNeto = margenMes;
        }
      }

      // Factor de descuento: 1 / ((1 + im)^mes)
      const factorDescuento = im > 0 ? 1 / Math.pow(1 + im, m) : 1;
      const valorActual = flujoNeto * factorDescuento;
      totalVan += valorActual;

      // VA acumulado sin residual:
      // En el último mes, el flujo sin residual es sólo margenOperativo
      const flujoSinResidual = (m === totalMeses && residualVal > 0) ? margenOperativo : flujoNeto;
      const vaSinResidual = flujoSinResidual * factorDescuento;
      vaAcum += vaSinResidual;

      if (vaAcum >= 0 && detectedRepago === null) {
        detectedRepago = m;
      }

      rows.push({
        mes: m,
        fase,
        margenOperativo,
        costosFijosTaller,
        inversion: inversionVal,
        residual: residualVal,
        flujoNeto,
        factorDescuento,
        valorActual,
        vaAcumuladoSinResidual: vaAcum,
      });
    }

    return {
      rows,
      vanCalc: totalVan,
      mesRepagoCalc: detectedRepago !== null ? detectedRepago : 0,
    };
  };

  // Load existing evaluation data on open or entry change
  useEffect(() => {
    if (!isOpen || !entry) return;

    let isMounted = true;
    setLoading(true);
    setErrorMessage(null);
    setRlsNotice(false);
    setSaveSuccess(false);

    const loadData = async () => {
      let loadedData: EvaluacionIngresoTaller | null = null;

      try {
        // Query Supabase by foreign key ingresos_taller_id
        const { data, error } = await supabase
          .from('evaluacion_ingresos_taller')
          .select('*')
          .eq('ingresos_taller_id', entry.id)
          .maybeSingle();

        if (error) {
          console.warn('Error fetching evaluacion_ingresos_taller from Supabase:', error);
          if (error.code === '42501') {
            setRlsNotice(true);
          }
        } else if (data) {
          loadedData = data as EvaluacionIngresoTaller;
        }
      } catch (err) {
        console.warn('Network or schema exception fetching evaluacion_ingresos_taller:', err);
      }

      // Check localStorage fallback if not found in DB
      if (!loadedData) {
        try {
          const cached = localStorage.getItem(getLocalStorageKey(entry.id));
          if (cached) {
            loadedData = JSON.parse(cached);
          }
        } catch (e) {
          console.warn('Error reading localStorage for evaluation:', e);
        }
      }

      if (isMounted) {
        if (loadedData) {
          setRecordId(loadedData.id || null);
          setCostoRepuestoEst(loadedData.costo_repuesto_est !== null && loadedData.costo_repuesto_est !== undefined ? String(loadedData.costo_repuesto_est) : '');
          setCostoSottEst(loadedData.costo_sott_est !== null && loadedData.costo_sott_est !== undefined ? String(loadedData.costo_sott_est) : '');
          setPlazoEstMeses(loadedData.plazo_est_meses !== null && loadedData.plazo_est_meses !== undefined ? String(loadedData.plazo_est_meses) : '');
          
          if (loadedData.vida_util_rem_meses !== null && loadedData.vida_util_rem_meses !== undefined) {
            setVidaUtilRemMeses(String(loadedData.vida_util_rem_meses));
          } else {
            setVidaUtilRemMeses(String(vuRemInfo.defaultMonths));
          }

          setVidaUtilInicial(loadedData.vida_util_inicial !== null && loadedData.vida_util_inicial !== undefined ? String(loadedData.vida_util_inicial) : '120');

          if (loadedData.valor_venta_como_esta !== null && loadedData.valor_venta_como_esta !== undefined && vNuevoRef > 0) {
            const pct = (Number(loadedData.valor_venta_como_esta) / vNuevoRef) * 100;
            setPorcentajeVentaComoEsta(pct % 1 === 0 ? String(pct) : pct.toFixed(1));
          } else {
            setPorcentajeVentaComoEsta('30');
          }

          if (loadedData.valor_venta_final !== null && loadedData.valor_venta_final !== undefined && vNuevoRef > 0) {
            const pct = (Number(loadedData.valor_venta_final) / vNuevoRef) * 100;
            setPorcentajeVentaFinal(pct % 1 === 0 ? String(pct) : pct.toFixed(1));
          } else {
            setPorcentajeVentaFinal('20');
          }

          setCostosFijosMes(loadedData.costos_fijos_mes !== null && loadedData.costos_fijos_mes !== undefined ? String(loadedData.costos_fijos_mes) : '');
          setManoObraHr(loadedData.mano_obra_hr !== null && loadedData.mano_obra_hr !== undefined ? String(loadedData.mano_obra_hr) : '');
          setValorAlquiler(loadedData.valor_alquiler !== null && loadedData.valor_alquiler !== undefined ? String(loadedData.valor_alquiler) : '');
          setTna(loadedData.tna !== null && loadedData.tna !== undefined ? String(loadedData.tna) : '');

          setHsTrabMesEsp(loadedData.hs_trab_mes_esp !== null && loadedData.hs_trab_mes_esp !== undefined ? String(loadedData.hs_trab_mes_esp) : '140');
          setDecisionFinal(loadedData.decision_final || '');
          setComentarios(loadedData.comentarios || '');

          if (loadedData.inversion !== null && loadedData.inversion !== undefined) {
            const invVal = Number(loadedData.inversion);
            const crcVal = loadedData.crc_exigido !== null ? Number(loadedData.crc_exigido) : null;
            const margVal = loadedData.margen_mensual !== null ? Number(loadedData.margen_mensual) : null;
            const cobVal = loadedData.cobertura !== null ? Number(loadedData.cobertura) : null;

            setInversion(invVal);
            setCrcExigido(crcVal);
            setMargenMensual(margVal);
            setCobertura(cobVal);
            
            // Recalculate reference tarifa
            const vNuevo = equipment?.valor_nuevo || 0;
            const dem = equipment?.demerito ?? 0.8;
            setTarifaCalculada((vNuevo * 0.0325 * dem) / 200);

            // Reconstruct cash flow projection
            const nPlazo = Number(loadedData.plazo_est_meses || 0);
            const nVuRem = Number(loadedData.vida_util_rem_meses || 0);
            const cFijos = Number(loadedData.costos_fijos_mes || 0);
            const vFin = Number(loadedData.valor_venta_final || 0);
            const tnaV = Number(loadedData.tna || 0);

            if (nPlazo > 0 || nVuRem > 0) {
              const cf = buildCashFlow(nPlazo, nVuRem, invVal, cFijos, margVal || 0, vFin, tnaV);
              setFlujoRows(cf.rows);
              setVan(loadedData.VAN !== null && loadedData.VAN !== undefined ? Number(loadedData.VAN) : (loadedData.van !== null ? Number(loadedData.van) : cf.vanCalc));
              setMesRepago(loadedData.mes_repago !== null && loadedData.mes_repago !== undefined ? Number(loadedData.mes_repago) : cf.mesRepagoCalc);
            }

            setEvaluationDone(true);
          } else {
            setEvaluationDone(false);
            setInversion(null);
            setCrcExigido(null);
            setMargenMensual(null);
            setCobertura(null);
            setVan(null);
            setMesRepago(null);
            setFlujoRows([]);
          }
        } else {
          // Reset to defaults
          setRecordId(null);
          setCostoRepuestoEst('');
          setCostoSottEst('');
          setPlazoEstMeses('');
          setVidaUtilRemMeses(String(vuRemInfo.defaultMonths));

          setVidaUtilInicial('120');
          setPorcentajeVentaComoEsta('30');
          setPorcentajeVentaFinal('20');
          setCostosFijosMes('');
          setManoObraHr('');
          setValorAlquiler('');
          setTna('');

          setHsTrabMesEsp('140');
          setDecisionFinal('');
          setComentarios('');

          setEvaluationDone(false);
          setInversion(null);
          setCrcExigido(null);
          setMargenMensual(null);
          setCobertura(null);
          setTarifaCalculada(null);
          setVan(null);
          setMesRepago(null);
          setFlujoRows([]);
        }
        setLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, entry?.id, equipment]);

  // Validation: All required inputs must have non-empty numeric values
  const isInputValidNumber = (val: string) => {
    if (val.trim() === '') return false;
    const num = Number(val);
    return !isNaN(num) && num >= 0;
  };

  const isPositiveIntegerOrDecimal = (val: string) => {
    if (val.trim() === '') return false;
    const num = Number(val);
    return !isNaN(num) && num > 0;
  };

  const areAllInputsProvided = () => {
    return (
      isInputValidNumber(costoRepuestoEst) &&
      isInputValidNumber(costoSottEst) &&
      isPositiveIntegerOrDecimal(plazoEstMeses) &&
      isPositiveIntegerOrDecimal(vidaUtilRemMeses) &&
      isPositiveIntegerOrDecimal(vidaUtilInicial) &&
      isInputValidNumber(porcentajeVentaComoEsta) &&
      isInputValidNumber(porcentajeVentaFinal) &&
      isInputValidNumber(costosFijosMes) &&
      isInputValidNumber(manoObraHr) &&
      isInputValidNumber(valorAlquiler) &&
      isInputValidNumber(tna) &&
      isPositiveIntegerOrDecimal(hsTrabMesEsp)
    );
  };

  // Perform the calculations as per the user formula requirements
  const handleRealizarEvaluacion = () => {
    if (!areAllInputsProvided()) {
      if (Number(vidaUtilRemMeses) <= 0) {
        setErrorMessage('La vida útil remanente debe ser mayor a 0 meses para realizar la evaluación de la intervención.');
      } else {
        setErrorMessage('Por favor complete todos los campos de Taller, Finanzas y Gerencia para realizar la evaluación.');
      }
      return;
    }

    setErrorMessage(null);

    // Convert inputs to numbers
    const cRepuesto = Number(costoRepuestoEst);
    const cSott = Number(costoSottEst);
    const nPlazo = Number(plazoEstMeses);
    const nVuRem = Number(vidaUtilRemMeses);
    const vVentaActual = valorVentaComoEsta;
    const vVentaFin = valorVentaFinal;
    const cFijos = Number(costosFijosMes);
    const cManoObra = Number(manoObraHr);
    const tnaVal = Number(tna);
    const hsMes = Number(hsTrabMesEsp);

    // Equipment properties
    const vNuevo = equipment?.valor_nuevo || 0;
    const dem = equipment?.demerito ?? 0.8;

    // 1. Inversión de la intervención (Campo: "inversion")
    // im = (tna / 100) / 12
    const im = (tnaVal / 100) / 12;

    // Base = valor_venta_como_esta + costo_repuesto_est + costo_sott_est + (16/30) * mano_obra_hr * plazo_est_meses
    const base = vVentaActual + cRepuesto + cSott + (16 / 30) * cManoObra * nPlazo;

    // Compounded base: base * (1 + im)^plazo_est_meses
    const compBase = base * Math.pow(1 + im, nPlazo);

    // Fixed cost compounding during the repair period:
    // costos_fijos_mes * ((1+im)^plazo_est_meses - 1) / im
    const fixedComp = im > 0 
      ? (cFijos * (Math.pow(1 + im, nPlazo) - 1)) / im 
      : cFijos * nPlazo;

    const calcInversion = compBase + fixedComp;

    // 2. Costo de recupero del capital exigido (campo: "crc_exigido")
    // FRC = im / (1 - (1+im)^(-vida_util_rem_meses))
    const frc = im > 0 
      ? im / (1 - Math.pow(1 + im, -nVuRem))
      : (nVuRem > 0 ? 1 / nVuRem : 0);

    // crc_exigido = (inversion - valor_venta_final / ((1+im)^vida_util_rem_meses)) * FRC
    const calcCrcExigido = (calcInversion - (vVentaFin / Math.pow(1 + im, nVuRem))) * frc;

    // 3. Margen mensual disponible (campo: "margen_mensual")
    // Tarifa = (valor_nuevo * 0.0325 * demerito) / 200
    const calcTarifa = (vNuevo * 0.0325 * dem) / 200;
    // margen_mensual = Tarifa * hs_trab_mes_esp - costos_fijos_mes
    const calcMargen = calcTarifa * hsMes - cFijos;

    // 4. Indice de Cobertura (campo: "cobertura")
    // cobertura = margen_mensual / crc_exigido
    const calcCobertura = calcCrcExigido !== 0 ? calcMargen / calcCrcExigido : 0;

    // 5. Flujo de Fondo Descontado, VAN y Repago Descontado sin Residual
    const cf = buildCashFlow(nPlazo, nVuRem, calcInversion, cFijos, calcMargen, vVentaFin, tnaVal);

    // Set state
    setInversion(calcInversion);
    setCrcExigido(calcCrcExigido);
    setMargenMensual(calcMargen);
    setCobertura(calcCobertura);
    setTarifaCalculada(calcTarifa);
    setVan(cf.vanCalc);
    setMesRepago(cf.mesRepagoCalc);
    setFlujoRows(cf.rows);
    setEvaluationDone(true);
  };

  // Save current values to database & localStorage
  const handleGuardar = async () => {
    if (!entry) return;

    setSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    const payload: Partial<EvaluacionIngresoTaller> = {
      ingresos_taller_id: entry.id,
      costo_repuesto_est: costoRepuestoEst !== '' ? Number(costoRepuestoEst) : null,
      costo_sott_est: costoSottEst !== '' ? Number(costoSottEst) : null,
      plazo_est_meses: plazoEstMeses !== '' ? Number(plazoEstMeses) : null,
      vida_util_rem_meses: vidaUtilRemMeses !== '' ? Number(vidaUtilRemMeses) : null,
      vida_util_inicial: vidaUtilInicial !== '' ? Number(vidaUtilInicial) : 120,
      valor_venta_como_esta: !isNaN(valorVentaComoEsta) ? valorVentaComoEsta : null,
      valor_venta_final: !isNaN(valorVentaFinal) ? valorVentaFinal : null,
      costos_fijos_mes: costosFijosMes !== '' ? Number(costosFijosMes) : null,
      mano_obra_hr: manoObraHr !== '' ? Number(manoObraHr) : null,
      valor_alquiler: valorAlquiler !== '' ? Number(valorAlquiler) : null,
      tna: tna !== '' ? Number(tna) : null,
      hs_trab_mes_esp: hsTrabMesEsp !== '' ? Number(hsTrabMesEsp) : 140,
      decision_final: decisionFinal || null,
      comentarios: comentarios || null,
      inversion: inversion !== null ? inversion : null,
      crc_exigido: crcExigido !== null ? crcExigido : null,
      margen_mensual: margenMensual !== null ? margenMensual : null,
      cobertura: cobertura !== null ? cobertura : null,
      mes_repago: mesRepago !== null ? mesRepago : 0,
      VAN: van !== null ? van : null,
      van: van !== null ? van : null,
      repago_descontado: mesRepago !== null ? mesRepago : 0,
    };

    // Always cache in localStorage as safe immediate fallback
    try {
      localStorage.setItem(getLocalStorageKey(entry.id), JSON.stringify({ ...payload, id: recordId }));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }

    try {
      if (recordId) {
        // Update existing record
        let { error } = await supabase
          .from('evaluacion_ingresos_taller')
          .update(payload)
          .eq('id', recordId);

        // Fallback if decision_final column does not exist on Supabase table yet
        if (error && error.message && error.message.toLowerCase().includes('decision_final')) {
          const { decision_final: _, ...fallbackPayload } = payload;
          const retry = await supabase
            .from('evaluacion_ingresos_taller')
            .update(fallbackPayload)
            .eq('id', recordId);
          error = retry.error;
        }

        if (error) {
          console.warn('Supabase update error:', error);
          if (error.code === '42501') {
            setRlsNotice(true);
          } else {
            setErrorMessage(`Aviso de guardado: ${error.message}`);
          }
        } else {
          setSaveSuccess(true);
        }
      } else {
        // Check if a record was created meanwhile
        const { data: existingCheck } = await supabase
          .from('evaluacion_ingresos_taller')
          .select('id')
          .eq('ingresos_taller_id', entry.id)
          .maybeSingle();

        if (existingCheck?.id) {
          let { error } = await supabase
            .from('evaluacion_ingresos_taller')
            .update(payload)
            .eq('id', existingCheck.id);

          if (error && error.message && error.message.toLowerCase().includes('decision_final')) {
            const { decision_final: _, ...fallbackPayload } = payload;
            const retry = await supabase
              .from('evaluacion_ingresos_taller')
              .update(fallbackPayload)
              .eq('id', existingCheck.id);
            error = retry.error;
          }

          if (!error) {
            setRecordId(existingCheck.id);
            setSaveSuccess(true);
          } else if (error.code === '42501') {
            setRlsNotice(true);
          }
        } else {
          // Insert new record
          const newId = crypto.randomUUID();
          let { error } = await supabase
            .from('evaluacion_ingresos_taller')
            .insert([{ ...payload, id: newId }]);

          if (error && error.message && error.message.toLowerCase().includes('decision_final')) {
            const { decision_final: _, ...fallbackPayload } = payload;
            const retry = await supabase
              .from('evaluacion_ingresos_taller')
              .insert([{ ...fallbackPayload, id: newId }]);
            error = retry.error;
          }

          if (error) {
            console.warn('Supabase insert error:', error);
            if (error.code === '42501') {
              setRlsNotice(true);
            } else {
              setErrorMessage(`Aviso: ${error.message}`);
            }
          } else {
            setRecordId(newId);
            setSaveSuccess(true);
          }
        }
      }
    } catch (err: any) {
      console.warn('Failed to save to Supabase:', err);
    } finally {
      setSaving(false);
      // Auto-hide success message after 4s
      setTimeout(() => {
        setSaveSuccess(false);
      }, 4000);
    }
  };

  // Export cash flow as CSV
  const handleExportCSV = () => {
    if (!flujoRows || flujoRows.length === 0) return;
    const headers = [
      'Meses',
      'Fase',
      'Margen Operativo',
      'Costos Fijos Taller',
      'Inversión',
      'Residual',
      'Flujo neto',
      'Factor de descuento',
      'Valor Actual',
      'VA acumulado sin residual'
    ];
    const csvLines = flujoRows.map(r => [
      r.mes,
      `"${r.fase}"`,
      r.margenOperativo.toFixed(2),
      r.costosFijosTaller.toFixed(2),
      r.inversion.toFixed(2),
      r.residual.toFixed(2),
      r.flujoNeto.toFixed(2),
      r.factorDescuento.toFixed(6),
      r.valorActual.toFixed(2),
      r.vaAcumuladoSinResidual.toFixed(2)
    ].join(';'));

    const csvContent = '\uFEFF' + [headers.join(';'), ...csvLines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${entry?.equipo_id || 'Equipo'}_FlujoFondos_${new Date().toLocaleDateString('en-CA')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen || !entry) return null;

  const allReady = areAllInputsProvided();

  // 3-way cost comparison: Reparación vs Equipo Nuevo vs Alquiler
  const valorNuevo = equipment?.valor_nuevo || 0;
  const tnaVal = Number(tna) || 0;
  const imnuevo = (tnaVal / 100) / 12;
  const vuInicial = Number(vidaUtilInicial) || 120;
  const cFijosNum = Number(costosFijosMes) || 0;
  const valorAlquilerNum = Number(valorAlquiler) || 0;

  // 1. Costo mensual de reparación = crc_exigido + costos_fijos_mes
  const costoMensualReparacion = crcExigido !== null ? crcExigido + cFijosNum : 0;

  // 2. Costo mensual alquiler = valor_alquiler
  const costoMensualAlquiler = valorAlquilerNum;

  // 3. Costo mensual equipo nuevo:
  // a. valorResidual = valor_nuevo * 0.25
  const valorResidualNuevo = valorNuevo * 0.25;
  // b. imnuevo = (tna / 100) / 12
  // c. FRCnuevo = imnuevo / (1 - (1+imnuevo)^(-vida_util_inicial))
  const frcNuevo = imnuevo > 0 
    ? imnuevo / (1 - Math.pow(1 + imnuevo, -vuInicial)) 
    : (vuInicial > 0 ? 1 / vuInicial : 0);
  // d. CRCnuevo = (valor_nuevo - valorResidual / ((1+imnuevo)^vida_util_inicial)) * FRCnuevo
  const crcNuevo = (valorNuevo - (valorResidualNuevo / Math.pow(1 + imnuevo, vuInicial))) * frcNuevo;
  // e. Costo mensual equipo nuevo = CRCnuevo + costos_fijos_mes
  const costoMensualNuevo = crcNuevo + cFijosNum;

  const maxCostoComparacion = Math.max(costoMensualReparacion, costoMensualNuevo, costoMensualAlquiler, 1);
  const minCostoComparacion = Math.min(costoMensualReparacion, costoMensualNuevo, costoMensualAlquiler);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl xl:max-w-7xl 2xl:max-w-[94rem] my-auto flex flex-col max-h-[95vh] overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0 shadow-sm border-b border-indigo-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-400/30">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight text-white whitespace-nowrap">
                  Evaluación Económico/Financiera de la Intervención
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 uppercase whitespace-nowrap">
                  {entry.equipo_id}
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                {equipment?.marca || ''} {equipment?.modelo || ''} • Hs de arrastre: {equipment?.horas !== undefined && equipment?.horas !== null ? equipment.horas.toLocaleString('de-DE') : '0'} hs • Año: {equipment?.year || 'N/D'} • Ingreso: {entry.fecha_ingreso}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">
          {/* Informative banners */}
          {rlsNotice && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-2.5 shadow-sm">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">Aviso de Almacenamiento:</strong> Los datos se guardan y mantienen seguros en el almacenamiento local de tu navegador. Para sincronizar la tabla <code className="font-mono bg-amber-100 px-1 rounded">evaluacion_ingresos_taller</code> en la nube, asegúrate de configurar políticas públicas en Supabase.
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2 shadow-sm">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="p-3.5 bg-green-50 border border-green-200 rounded-xl text-green-800 text-xs flex items-center gap-2 shadow-sm animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <span className="font-bold">¡Datos guardados correctamente!</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
              <p className="text-xs font-semibold uppercase tracking-wider">Cargando datos de evaluación...</p>
            </div>
          ) : (
            <>
              {/* Section 1: Datos Proporcionados por Taller */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-600"></div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide whitespace-nowrap">
                    1 - Datos Proporcionados por Taller
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label 
                      title="Costo estimado de repuestos (USD)"
                      className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis"
                    >
                      Costo estimado de repuestos (USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">$</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={costoRepuestoEst}
                        onChange={(e) => setCostoRepuestoEst(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label 
                      title="Costo estimado de SOTT (USD)"
                      className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis"
                    >
                      Costo estimado de SOTT (USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">$</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={costoSottEst}
                        onChange={(e) => setCostoSottEst(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label 
                      title="Plazo estimado de la intervención (Meses)"
                      className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis"
                    >
                      Plazo estimado de la intervención (Meses)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.1"
                      value={plazoEstMeses}
                      onChange={(e) => setPlazoEstMeses(e.target.value)}
                      placeholder="Ej: 2.5"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    />
                  </div>

                  <div>
                    <label 
                      title="Vida útil remanente (Meses)"
                      className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis"
                    >
                      Vida útil remanente (Meses)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={vidaUtilRemMeses}
                      onChange={(e) => setVidaUtilRemMeses(e.target.value)}
                      placeholder={String(vuRemInfo.defaultMonths)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    />
                    <span className={`text-[10px] block mt-1 ${vuRemInfo.isAlcanzada ? 'text-amber-700 font-bold' : 'text-slate-500 font-medium'}`}>
                      {vuRemInfo.legend ? (
                        <>
                          {vuRemInfo.isAlcanzada ? (
                            <span>⚠️ {vuRemInfo.legend} (por defecto: 0)</span>
                          ) : (
                            <span>Por defecto: {vuRemInfo.defaultMonths} meses ({vuRemInfo.legend})</span>
                          )}
                        </>
                      ) : (
                        'Meses de operación esperada post-intervención'
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 2: Datos Proporcionados por Finanzas */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-600"></div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide whitespace-nowrap">
                    2 - Datos Proporcionados por Finanzas
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label 
                      title="Vida útil inicial (Meses)"
                      className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis"
                    >
                      Vida útil inicial (Meses)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      value={vidaUtilInicial}
                      onChange={(e) => setVidaUtilInicial(e.target.value)}
                      placeholder="120"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                    />
                    <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap block mt-1">Por defecto: 120 meses</span>
                  </div>

                  <div>
                    <label 
                      title="Valor de venta como está (% sobre valor nuevo del equipo)"
                      className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis"
                    >
                      Valor de venta como está (%)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        max="100"
                        value={porcentajeVentaComoEsta}
                        onChange={(e) => setPorcentajeVentaComoEsta(e.target.value)}
                        placeholder="30"
                        className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                      />
                      <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">%</span>
                    </div>
                    <span className="text-[10px] text-emerald-800 font-bold block mt-1 whitespace-nowrap overflow-hidden text-ellipsis">
                      = {formatMoney(valorVentaComoEsta)} <span className="text-slate-400 font-normal">({porcentajeVentaComoEsta || 0}% de {formatMoney(vNuevoRef)})</span>
                    </span>
                  </div>

                  <div>
                    <label 
                      title="Valor de venta al final de la V.U. remanente (% sobre valor nuevo del equipo)"
                      className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis"
                    >
                      Valor venta final V.U. remanente (%)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        max="100"
                        value={porcentajeVentaFinal}
                        onChange={(e) => setPorcentajeVentaFinal(e.target.value)}
                        placeholder="20"
                        className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                      />
                      <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">%</span>
                    </div>
                    <span className="text-[10px] text-emerald-800 font-bold block mt-1 whitespace-nowrap overflow-hidden text-ellipsis">
                      = {formatMoney(valorVentaFinal)} <span className="text-slate-400 font-normal">({porcentajeVentaFinal || 0}% de {formatMoney(vNuevoRef)})</span>
                    </span>
                  </div>

                  <div>
                    <label 
                      title="Costos fijos mensuales (USD)"
                      className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis"
                    >
                      Costos fijos mensuales (USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">$</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={costosFijosMes}
                        onChange={(e) => setCostosFijosMes(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label 
                      title="Costo mano de obra por hora (USD)"
                      className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis"
                    >
                      Costo mano de obra por hora (USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">$</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={manoObraHr}
                        onChange={(e) => setManoObraHr(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label 
                      title="Costo de alquiler (USD)"
                      className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis"
                    >
                      Costo de alquiler (USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">$</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={valorAlquiler}
                        onChange={(e) => setValorAlquiler(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label 
                      title="TNA (financiación) (%)"
                      className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis"
                    >
                      TNA (financiación) (%)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={tna}
                        onChange={(e) => setTna(e.target.value)}
                        placeholder="Ej: 5"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                      />
                      <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Datos Proporcionados por Gerencia */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100">
                  <div className="w-2.5 h-2.5 rounded-full bg-purple-600"></div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide whitespace-nowrap">
                    3 - Datos Proporcionados por Gerencia
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  <div>
                    <label 
                      title="Horas trabajadas esperadas por mes"
                      className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis"
                    >
                      Horas trabajadas esperadas por mes
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      value={hsTrabMesEsp}
                      onChange={(e) => setHsTrabMesEsp(e.target.value)}
                      placeholder="140"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all"
                    />
                    <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap block mt-1">Por defecto: 140 hs</span>
                  </div>
                </div>
              </div>

              {/* Section 4: Decisión Final de la Intervención */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-600"></div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide whitespace-nowrap">
                      4 - Decisión Final sobre la Intervención
                    </h3>
                  </div>
                  {decisionFinal && (
                    <span className="px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-black rounded-lg uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                      Decisión: {decisionFinal}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Selector de decisión final */}
                  <div className="space-y-2">
                    <label 
                      title="Decisión final a tomar sobre la intervención (campo: decision_final)"
                      className="block text-[11px] font-bold text-slate-700 uppercase whitespace-nowrap overflow-hidden text-ellipsis"
                    >
                      Resolución / Decisión a Tomar (campo: "decision_final")
                    </label>
                    <select
                      value={decisionFinal}
                      onChange={(e) => setDecisionFinal(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all cursor-pointer shadow-sm"
                    >
                      <option value="">-- Seleccionar decisión a tomar --</option>
                      <option value="Realizar Intervención">Realizar Intervención</option>
                      <option value="Vender el equipo como está">Vender el equipo como está</option>
                      <option value="Realizar una reparación parcial">Realizar una reparación parcial</option>
                      <option value="Buscar alternativas">Buscar alternativas</option>
                      <option value="Comentarios">Comentarios</option>
                    </select>

                    {/* Botones de selección rápida */}
                    <div className="pt-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                        Selección rápida:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: 'Realizar Intervención', color: 'emerald' },
                          { label: 'Vender el equipo como está', color: 'purple' },
                          { label: 'Realizar una reparación parcial', color: 'amber' },
                          { label: 'Buscar alternativas', color: 'blue' },
                          { label: 'Comentarios', color: 'slate' },
                        ].map((opt) => {
                          const isSelected = decisionFinal === opt.label;
                          return (
                            <button
                              key={opt.label}
                              type="button"
                              onClick={() => setDecisionFinal(opt.label)}
                              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                                isSelected
                                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm ring-2 ring-indigo-400/40'
                                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Comentarios y Fundamento */}
                  <div className="space-y-1.5">
                    <label 
                      title="Comentarios u Observaciones de la Evaluación"
                      className="block text-[11px] font-bold text-slate-700 uppercase whitespace-nowrap overflow-hidden text-ellipsis"
                    >
                      Comentarios y Fundamento de la Decisión
                    </label>
                    <textarea
                      rows={4}
                      value={comentarios}
                      onChange={(e) => setComentarios(e.target.value)}
                      placeholder="Fundamente la decisión tomada, detalle condiciones particulares de la reparación, opciones de venta o alternativas evaluadas..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all resize-none shadow-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Calculated Results Panel with 6 Key Indicators */}
              {evaluationDone && inversion !== null && crcExigido !== null && margenMensual !== null && cobertura !== null && (
                <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white rounded-2xl p-6 border-2 border-indigo-500/40 shadow-xl animate-in zoom-in-95 duration-200">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-indigo-800/60 mb-5">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-500/30 rounded-xl">
                        <TrendingUp className="w-6 h-6 text-indigo-300" />
                      </div>
                      <div>
                        <h4 className="text-base font-black uppercase tracking-tight text-white whitespace-nowrap">
                          Resultados de la Evaluación Económico/Financiera de la Intervención
                        </h4>
                        <p className="text-xs text-indigo-200/80 whitespace-nowrap overflow-hidden text-ellipsis">
                          Cálculo de rentabilidad, retorno de capital exigido, VAN y repago para {entry.equipo_id}
                        </p>
                      </div>
                    </div>

                    {/* Coverage Status Badge */}
                    <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 shadow-lg shrink-0 ${
                      cobertura >= 1.0 
                        ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300' 
                        : cobertura >= 0 
                        ? 'bg-amber-500/20 border-amber-400/50 text-amber-300' 
                        : 'bg-rose-500/20 border-rose-400/50 text-rose-300'
                    }`}>
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        cobertura >= 1.0 ? 'bg-emerald-400 animate-pulse' : cobertura >= 0 ? 'bg-amber-400' : 'bg-rose-400'
                      }`} />
                      <div className="text-right">
                        <div className="text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
                          {cobertura >= 1.0 ? 'Intervención Viable' : cobertura >= 0 ? 'Riesgo / Parcial' : 'No Viable'}
                        </div>
                        <div className="text-xs font-black whitespace-nowrap">
                          Índice Cobertura: {formatDecimals(cobertura, 2)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 6 Key Indicators Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
                    {/* 1. Inversión */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 backdrop-blur-sm">
                      <span 
                        title="1. Inversión de la Intervención"
                        className="text-[10px] font-black text-indigo-300 uppercase tracking-wider block mb-1 whitespace-nowrap overflow-hidden text-ellipsis"
                      >
                        1. Inversión Intervención
                      </span>
                      <div className="text-lg font-black text-white whitespace-nowrap">
                        {formatMoney(inversion)}
                      </div>
                      <span className="text-[9px] text-slate-300 mt-0.5 block whitespace-nowrap">
                        Capital + SOTT + MO + CF
                      </span>
                    </div>

                    {/* 2. CRC Exigido */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 backdrop-blur-sm">
                      <span 
                        title="2. Costo de Recupero del Capital Exigido"
                        className="text-[10px] font-black text-indigo-300 uppercase tracking-wider block mb-1 whitespace-nowrap overflow-hidden text-ellipsis"
                      >
                        2. CRC Exigido Mensual
                      </span>
                      <div className="text-lg font-black text-amber-300 whitespace-nowrap">
                        {formatMoney(crcExigido)}
                      </div>
                      <span className="text-[9px] text-slate-300 mt-0.5 block whitespace-nowrap">
                        Recupero capital / mes
                      </span>
                    </div>

                    {/* 3. Margen Mensual */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 backdrop-blur-sm">
                      <span 
                        title="3. Margen Mensual Disponible"
                        className="text-[10px] font-black text-indigo-300 uppercase tracking-wider block mb-1 whitespace-nowrap overflow-hidden text-ellipsis"
                      >
                        3. Margen Mensual Disp.
                      </span>
                      <div className={`text-lg font-black whitespace-nowrap ${margenMensual >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                        {formatMoney(margenMensual)}
                      </div>
                      <span className="text-[9px] text-slate-300 mt-0.5 block whitespace-nowrap">
                        Tarifa: {formatMoney(tarifaCalculada)}/hr
                      </span>
                    </div>

                    {/* 4. Cobertura */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 backdrop-blur-sm">
                      <span 
                        title="4. Índice de Cobertura"
                        className="text-[10px] font-black text-indigo-300 uppercase tracking-wider block mb-1 whitespace-nowrap overflow-hidden text-ellipsis"
                      >
                        4. Índice de Cobertura
                      </span>
                      <div className={`text-xl font-black whitespace-nowrap ${
                        cobertura >= 1.0 ? 'text-emerald-400' : cobertura >= 0 ? 'text-amber-400' : 'text-rose-400'
                      }`}>
                        {formatDecimals(cobertura, 2)}
                      </div>
                      <span className="text-[9px] text-slate-300 mt-0.5 block whitespace-nowrap">
                        Margen / CRC Exigido
                      </span>
                    </div>

                    {/* 5. VAN */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 backdrop-blur-sm">
                      <span 
                        title="Valor Actual Neto (VAN)"
                        className="text-[10px] font-black text-indigo-300 uppercase tracking-wider block mb-1 whitespace-nowrap overflow-hidden text-ellipsis"
                      >
                        5. VAN (Valor Actual Neto)
                      </span>
                      <div className={`text-lg font-black whitespace-nowrap ${van !== null && van >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                        {formatMoney(van)}
                      </div>
                      <span className="text-[9px] text-slate-300 mt-0.5 block whitespace-nowrap">
                        {van !== null && van >= 0 ? 'VAN Positivo (Rentable)' : 'VAN Negativo'}
                      </span>
                    </div>

                    {/* 6. Repago Descontado sin Residual */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 backdrop-blur-sm">
                      <span 
                        title="Repago descontado sin residual (mes)"
                        className="text-[10px] font-black text-indigo-300 uppercase tracking-wider block mb-1 whitespace-nowrap overflow-hidden text-ellipsis"
                      >
                        6. Repago sin Residual
                      </span>
                      <div className={`text-lg font-black whitespace-nowrap ${mesRepago && mesRepago > 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {mesRepago && mesRepago > 0 ? `Mes ${mesRepago}` : 'No alcanzado'}
                      </div>
                      <span className="text-[9px] text-slate-300 mt-0.5 block whitespace-nowrap">
                        {mesRepago && mesRepago > 0 ? 'Recupero con flujo op.' : 'No cubre s/ residual'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Comparación de Alternativas de Costo Mensual: Reparación vs Equipo Nuevo vs Alquiler */}
              {evaluationDone && crcExigido !== null && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 animate-in fade-in duration-300">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-indigo-700 text-white rounded-xl shadow-md">
                        <BarChart3 className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                          Comparación de Alternativas de Costo Mensual
                        </h4>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                          Evaluación comparativa: Reparación de la intervención vs. Inversión en equipo nuevo vs. Alquiler de mercado.
                        </p>
                      </div>
                    </div>

                    {/* Best Alternative Badge */}
                    <div className="px-4 py-2 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-2.5 shadow-sm">
                      <Award className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div className="text-xs">
                        <span className="text-[10px] uppercase font-black text-emerald-800 tracking-wider block">
                          Alternativa más económica
                        </span>
                        <span className="font-black text-emerald-900">
                          {costoMensualReparacion <= costoMensualNuevo && costoMensualReparacion <= costoMensualAlquiler
                            ? 'Reparación de la Intervención'
                            : costoMensualNuevo <= costoMensualReparacion && costoMensualNuevo <= costoMensualAlquiler
                            ? 'Invertir en Equipo Nuevo'
                            : 'Alquiler de Mercado'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 3 Option Detail Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
                    {/* 1. Reparación */}
                    <div className={`rounded-2xl p-5 border-2 transition-all relative ${
                      costoMensualReparacion === minCostoComparacion
                        ? 'bg-gradient-to-b from-emerald-50/60 to-white border-emerald-400 shadow-md ring-2 ring-emerald-400/30'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}>
                      {costoMensualReparacion === minCostoComparacion && (
                        <div className="absolute -top-3 right-4 px-2.5 py-0.5 bg-emerald-600 text-white rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                          <Check className="w-3 h-3" />
                          Más económica
                        </div>
                      )}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-800 border border-indigo-200">
                          1. Reparación
                        </span>
                        <span className="text-[11px] font-mono font-bold text-slate-400">
                          Intervención
                        </span>
                      </div>
                      <div className="mb-4">
                        <div className="text-xs text-slate-500 font-bold uppercase tracking-tight">Costo Mensual</div>
                        <div className="text-2xl font-black text-indigo-950 mt-0.5">
                          {formatMoney(costoMensualReparacion)}
                          <span className="text-xs font-semibold text-slate-500 lowercase ml-1">/ mes</span>
                        </div>
                      </div>
                      <div className="space-y-1.5 pt-3 border-t border-slate-100 text-xs">
                        <div className="flex justify-between text-slate-600">
                          <span>CRC Exigido:</span>
                          <span className="font-mono font-bold text-slate-900">{formatMoney(crcExigido)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Costos Fijos:</span>
                          <span className="font-mono font-bold text-slate-900">{formatMoney(cFijosNum)}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 italic pt-1">
                          Fórmula: CRC Exigido + Costos Fijos Mes
                        </div>
                      </div>
                    </div>

                    {/* 2. Equipo Nuevo */}
                    <div className={`rounded-2xl p-5 border-2 transition-all relative ${
                      costoMensualNuevo === minCostoComparacion
                        ? 'bg-gradient-to-b from-emerald-50/60 to-white border-emerald-400 shadow-md ring-2 ring-emerald-400/30'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}>
                      {costoMensualNuevo === minCostoComparacion && (
                        <div className="absolute -top-3 right-4 px-2.5 py-0.5 bg-emerald-600 text-white rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                          <Check className="w-3 h-3" />
                          Más económica
                        </div>
                      )}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 border border-blue-200">
                          2. Equipo Nuevo
                        </span>
                        <span className="text-[11px] font-mono font-bold text-slate-400">
                          Adquisición
                        </span>
                      </div>
                      <div className="mb-4">
                        <div className="text-xs text-slate-500 font-bold uppercase tracking-tight">Costo Mensual</div>
                        <div className="text-2xl font-black text-blue-950 mt-0.5">
                          {formatMoney(costoMensualNuevo)}
                          <span className="text-xs font-semibold text-slate-500 lowercase ml-1">/ mes</span>
                        </div>
                      </div>
                      <div className="space-y-1.5 pt-3 border-t border-slate-100 text-xs">
                        <div className="flex justify-between text-slate-600">
                          <span>CRC Nuevo:</span>
                          <span className="font-mono font-bold text-slate-900">{formatMoney(crcNuevo)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Costos Fijos:</span>
                          <span className="font-mono font-bold text-slate-900">{formatMoney(cFijosNum)}</span>
                        </div>
                        <div className="flex justify-between text-slate-500 text-[11px]">
                          <span>Valor Nuevo:</span>
                          <span className="font-mono">{formatMoney(valorNuevo)}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 italic pt-1">
                          Fórmula: CRC Nuevo (con residual 25%) + Costos Fijos Mes
                        </div>
                      </div>
                    </div>

                    {/* 3. Alquiler */}
                    <div className={`rounded-2xl p-5 border-2 transition-all relative ${
                      costoMensualAlquiler === minCostoComparacion
                        ? 'bg-gradient-to-b from-emerald-50/60 to-white border-emerald-400 shadow-md ring-2 ring-emerald-400/30'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}>
                      {costoMensualAlquiler === minCostoComparacion && (
                        <div className="absolute -top-3 right-4 px-2.5 py-0.5 bg-emerald-600 text-white rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                          <Check className="w-3 h-3" />
                          Más económica
                        </div>
                      )}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 border border-amber-200">
                          3. Alquiler
                        </span>
                        <span className="text-[11px] font-mono font-bold text-slate-400">
                          Mercado
                        </span>
                      </div>
                      <div className="mb-4">
                        <div className="text-xs text-slate-500 font-bold uppercase tracking-tight">Costo Mensual</div>
                        <div className="text-2xl font-black text-amber-950 mt-0.5">
                          {formatMoney(costoMensualAlquiler)}
                          <span className="text-xs font-semibold text-slate-500 lowercase ml-1">/ mes</span>
                        </div>
                      </div>
                      <div className="space-y-1.5 pt-3 border-t border-slate-100 text-xs">
                        <div className="flex justify-between text-slate-600">
                          <span>Canon Alquiler:</span>
                          <span className="font-mono font-bold text-slate-900">{formatMoney(valorAlquilerNum)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Inversión Inicial:</span>
                          <span className="font-mono font-bold text-slate-500">USD 0</span>
                        </div>
                        <div className="text-[10px] text-slate-400 italic pt-1">
                          Fórmula: Valor Alquiler mensual directo
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Visual Bar Chart Comparison */}
                  <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-indigo-600" />
                        Gráfico Comparativo de Costo Mensual (USD / mes)
                      </span>
                      <span className="text-[11px] font-bold text-slate-500">
                        100% = {formatMoney(maxCostoComparacion)}
                      </span>
                    </div>

                    <div className="space-y-4">
                      {/* Bar 1: Reparación */}
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
                          <span className="flex items-center gap-2 text-slate-800">
                            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                            1. Costo mensual de reparación
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-indigo-900">{formatMoney(costoMensualReparacion)}/mes</span>
                            <span className="text-[10px] text-slate-400 font-mono">({Math.round((costoMensualReparacion / maxCostoComparacion) * 100)}%)</span>
                          </div>
                        </div>
                        <div className="w-full bg-slate-200/80 rounded-full h-4 overflow-hidden p-0.5">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              costoMensualReparacion === minCostoComparacion
                                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                                : 'bg-gradient-to-r from-indigo-500 to-indigo-600'
                            }`}
                            style={{ width: `${Math.max(4, Math.round((costoMensualReparacion / maxCostoComparacion) * 100))}%` }}
                          />
                        </div>
                      </div>

                      {/* Bar 2: Equipo Nuevo */}
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
                          <span className="flex items-center gap-2 text-slate-800">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                            2. Costo mensual equipo nuevo
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-blue-900">{formatMoney(costoMensualNuevo)}/mes</span>
                            <span className="text-[10px] text-slate-400 font-mono">({Math.round((costoMensualNuevo / maxCostoComparacion) * 100)}%)</span>
                          </div>
                        </div>
                        <div className="w-full bg-slate-200/80 rounded-full h-4 overflow-hidden p-0.5">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              costoMensualNuevo === minCostoComparacion
                                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                                : 'bg-gradient-to-r from-blue-500 to-cyan-600'
                            }`}
                            style={{ width: `${Math.max(4, Math.round((costoMensualNuevo / maxCostoComparacion) * 100))}%` }}
                          />
                        </div>
                      </div>

                      {/* Bar 3: Alquiler */}
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
                          <span className="flex items-center gap-2 text-slate-800">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                            3. Costo mensual alquiler
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-amber-900">{formatMoney(costoMensualAlquiler)}/mes</span>
                            <span className="text-[10px] text-slate-400 font-mono">({Math.round((costoMensualAlquiler / maxCostoComparacion) * 100)}%)</span>
                          </div>
                        </div>
                        <div className="w-full bg-slate-200/80 rounded-full h-4 overflow-hidden p-0.5">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              costoMensualAlquiler === minCostoComparacion
                                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                                : 'bg-gradient-to-r from-amber-500 to-orange-500'
                            }`}
                            style={{ width: `${Math.max(4, Math.round((costoMensualAlquiler / maxCostoComparacion) * 100))}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Summary Savings Insight */}
                    {costoMensualReparacion < Math.min(costoMensualNuevo, costoMensualAlquiler) && (
                      <div className="mt-4 pt-3 border-t border-slate-200 text-xs text-emerald-800 font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span>
                          💡 La reparación genera un ahorro mensual de <strong className="text-emerald-950 font-black">{formatMoney(costoMensualNuevo - costoMensualReparacion)}/mes</strong> respecto a comprar nuevo, y de <strong className="text-emerald-950 font-black">{formatMoney(costoMensualAlquiler - costoMensualReparacion)}/mes</strong> respecto al alquiler.
                        </span>
                        <span className="text-[11px] font-black uppercase text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg shrink-0">
                          Ahorro Anual: {formatMoney((Math.min(costoMensualNuevo, costoMensualAlquiler) - costoMensualReparacion) * 12)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Flujo de Fondos Proyectado Table */}
              {evaluationDone && flujoRows.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
                  <div className="p-5 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
                        <Table className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                          Proyección del Flujo de Fondos Descontado
                          <span className="text-[11px] font-bold text-slate-500 normal-case">
                            ({flujoRows.length} períodos: Mes 0 a Mes {flujoRows.length - 1})
                          </span>
                        </h4>
                        <p className="text-xs text-slate-500">
                          Desglose mensual de egresos de taller, ingresos operativos, residual, factor de descuento e índice acumulado.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleExportCSV}
                      className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
                      title="Descargar tabla en formato CSV / Excel"
                    >
                      <Download className="w-4 h-4 text-indigo-600" />
                      Exportar CSV / Excel
                    </button>
                  </div>

                  {/* Scrollable Cash Flow Table */}
                  <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 bg-slate-100/95 backdrop-blur-sm z-10 border-b border-slate-300 text-slate-700 font-black text-[10px] uppercase tracking-wider">
                        <tr>
                          <th className="px-3 py-3 text-center border-r border-slate-200 whitespace-nowrap">Meses</th>
                          <th className="px-3 py-3 text-center border-r border-slate-200 whitespace-nowrap">Fase</th>
                          <th className="px-3 py-3 text-right border-r border-slate-200 whitespace-nowrap">Margen Operativo</th>
                          <th className="px-3 py-3 text-right border-r border-slate-200 whitespace-nowrap">Costos Fijos Taller</th>
                          <th className="px-3 py-3 text-right border-r border-slate-200 whitespace-nowrap">Inversión</th>
                          <th className="px-3 py-3 text-right border-r border-slate-200 whitespace-nowrap">Residual</th>
                          <th className="px-3 py-3 text-right border-r border-slate-200 whitespace-nowrap">Flujo neto</th>
                          <th className="px-3 py-3 text-right border-r border-slate-200 whitespace-nowrap">Factor de descuento</th>
                          <th className="px-3 py-3 text-right border-r border-slate-200 whitespace-nowrap">Valor Actual</th>
                          <th className="px-3 py-3 text-right whitespace-nowrap">VA acumulado sin residual</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {flujoRows.map((r) => {
                          const isRepagoMonth = mesRepago !== null && mesRepago > 0 && r.mes === mesRepago;
                          const isLast = r.mes === flujoRows.length - 1;

                          return (
                            <tr
                              key={r.mes}
                              className={`transition-colors hover:bg-slate-50/80 ${
                                isRepagoMonth 
                                  ? 'bg-emerald-50/70 font-bold border-y-2 border-emerald-400' 
                                  : r.fase === 'Inversión' 
                                  ? 'bg-rose-50/30' 
                                  : r.fase === 'Taller' 
                                  ? 'bg-amber-50/30' 
                                  : isLast 
                                  ? 'bg-indigo-50/40 font-bold' 
                                  : 'bg-white'
                              }`}
                            >
                              {/* Meses */}
                              <td className="px-3 py-2 text-center border-r border-slate-200 font-bold text-slate-800 whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5">
                                  <span>{r.mes}</span>
                                  {isRepagoMonth && (
                                    <span 
                                      className="px-1.5 py-0.5 bg-emerald-600 text-white text-[8px] font-black rounded uppercase tracking-tighter"
                                      title="Mes de repago descontado sin residual alcanzado"
                                    >
                                      Repago
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Fase */}
                              <td className="px-3 py-2 text-center border-r border-slate-200 whitespace-nowrap font-sans font-bold">
                                {r.fase === 'Inversión' && (
                                  <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] rounded-full border border-rose-200 uppercase">
                                    Inversión
                                  </span>
                                )}
                                {r.fase === 'Taller' && (
                                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] rounded-full border border-amber-200 uppercase">
                                    Taller
                                  </span>
                                )}
                                {r.fase === 'Operación' && (
                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] rounded-full border border-emerald-200 uppercase">
                                    Operación
                                  </span>
                                )}
                              </td>

                              {/* Margen Operativo */}
                              <td className="px-3 py-2 text-right border-r border-slate-200 whitespace-nowrap text-slate-700">
                                {r.margenOperativo > 0 ? formatMoney(r.margenOperativo) : '-'}
                              </td>

                              {/* Costos Fijos Taller */}
                              <td className="px-3 py-2 text-right border-r border-slate-200 whitespace-nowrap text-amber-800">
                                {r.costosFijosTaller > 0 ? formatMoney(r.costosFijosTaller) : '-'}
                              </td>

                              {/* Inversión */}
                              <td className="px-3 py-2 text-right border-r border-slate-200 whitespace-nowrap text-rose-700 font-bold">
                                {r.inversion > 0 ? formatMoney(r.inversion) : '-'}
                              </td>

                              {/* Residual */}
                              <td className="px-3 py-2 text-right border-r border-slate-200 whitespace-nowrap text-indigo-700 font-bold">
                                {r.residual > 0 ? formatMoney(r.residual) : '-'}
                              </td>

                              {/* Flujo neto */}
                              <td className={`px-3 py-2 text-right border-r border-slate-200 whitespace-nowrap font-bold ${
                                r.flujoNeto > 0 ? 'text-emerald-700' : r.flujoNeto < 0 ? 'text-rose-600' : 'text-slate-600'
                              }`}>
                                {formatMoney(r.flujoNeto)}
                              </td>

                              {/* Factor de descuento */}
                              <td className="px-3 py-2 text-right border-r border-slate-200 whitespace-nowrap text-slate-600">
                                {r.factorDescuento.toFixed(6)}
                              </td>

                              {/* Valor Actual */}
                              <td className={`px-3 py-2 text-right border-r border-slate-200 whitespace-nowrap font-bold ${
                                r.valorActual > 0 ? 'text-emerald-700' : r.valorActual < 0 ? 'text-rose-600' : 'text-slate-600'
                              }`}>
                                {formatMoney(r.valorActual)}
                              </td>

                              {/* VA acumulado sin residual */}
                              <td className={`px-3 py-2 text-right whitespace-nowrap font-black ${
                                r.vaAcumuladoSinResidual >= 0 ? 'text-emerald-700' : 'text-rose-600'
                              }`}>
                                {formatMoney(r.vaAcumuladoSinResidual)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Action Footer */}
        <div className="bg-slate-100 px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            {!allReady ? (
              <span className="text-amber-700 flex items-center gap-1.5 font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {Number(vidaUtilRemMeses) <= 0
                  ? 'Ingrese los meses de vida útil remanente que aportará la intervención (> 0) para habilitar "Realizar Evaluación".'
                  : 'Complete todos los campos para habilitar "Realizar Evaluación".'}
              </span>
            ) : (
              <span className="text-emerald-700 flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Todos los parámetros cargados. Puede evaluar y guardar.
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              onClick={handleRealizarEvaluacion}
              disabled={!allReady}
              className={`px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all ${
                allReady
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer active:scale-95'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Realizar Evaluación
            </button>

            <button
              onClick={handleGuardar}
              disabled={saving}
              className="px-5 py-2.5 bg-green-700 hover:bg-green-800 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Guardando...' : 'Guardar'}
            </button>

            <button
              onClick={() => {
                if (!entry) return;
                const liveEval: EvaluacionIngresoTaller = {
                  ingresos_taller_id: entry.id,
                  costo_repuesto_est: costoRepuestoEst !== '' ? Number(costoRepuestoEst) : null,
                  costo_sott_est: costoSottEst !== '' ? Number(costoSottEst) : null,
                  plazo_est_meses: plazoEstMeses !== '' ? Number(plazoEstMeses) : null,
                  vida_util_rem_meses: vidaUtilRemMeses !== '' ? Number(vidaUtilRemMeses) : null,
                  vida_util_inicial: vidaUtilInicial !== '' ? Number(vidaUtilInicial) : 120,
                  valor_venta_como_esta: !isNaN(valorVentaComoEsta) ? valorVentaComoEsta : null,
                  valor_venta_final: !isNaN(valorVentaFinal) ? valorVentaFinal : null,
                  costos_fijos_mes: costosFijosMes !== '' ? Number(costosFijosMes) : null,
                  mano_obra_hr: manoObraHr !== '' ? Number(manoObraHr) : null,
                  valor_alquiler: valorAlquiler !== '' ? Number(valorAlquiler) : null,
                  tna: tna !== '' ? Number(tna) : null,
                  hs_trab_mes_esp: hsTrabMesEsp !== '' ? Number(hsTrabMesEsp) : 140,
                  decision_final: decisionFinal || null,
                  comentarios: comentarios || null,
                  inversion,
                  crc_exigido: crcExigido,
                  margen_mensual: margenMensual,
                  cobertura,
                  mes_repago: mesRepago,
                  VAN: van,
                  van,
                  repago_descontado: mesRepago,
                };
                exportFinancialEvaluationPDF(entry, equipment, liveEval);
              }}
              className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all active:scale-95"
              title="Descargar Reporte Detallado de Evaluación Financiera en PDF"
            >
              <Download className="w-4 h-4 text-white" />
              <span>Descargar</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl font-bold text-xs uppercase transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
