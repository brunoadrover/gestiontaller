import { MaintenanceAction, MaintenanceEntry } from '../types';
import { sanitizePdfText } from './inactivityReport';

const PRESERVED_ACRONYMS = new Set([
  'A/C', 'AA', 'ABS', 'AC', 'CAT', 'CPU', 'DC', 'DPF', 'ECU', 'EGR',
  'GPS', 'HP', 'HVAC', 'JCB', 'KM', 'KW', 'LED', 'MAN', 'NO', 'OK',
  'PLC', 'PSI', 'PTO', 'RPM', 'SCR', 'TDF', 'USD', 'V8', 'V6', 'ZF',
  '12V', '24V', '4X4', '6X4', '6X6', '8X4'
]);

const SPANISH_WORKSHOP_CORRECTIONS: Record<string, string> = {
  // Mecánica y taller (tildes y errores frecuentes)
  hidraulico: 'hidráulico',
  hidraulica: 'hidráulica',
  hidraulicos: 'hidráulicos',
  hidraulicas: 'hidráulicas',
  electrico: 'eléctrico',
  electrica: 'eléctrica',
  electricos: 'eléctricos',
  electricas: 'eléctricas',
  electronico: 'electrónico',
  electronica: 'electrónica',
  electronicos: 'electrónicos',
  electronicas: 'electrónicas',
  mecanico: 'mecánico',
  mecanica: 'mecánica',
  mecanicos: 'mecánicos',
  mecanicas: 'mecánicas',
  neumatico: 'neumático',
  neumatica: 'neumática',
  neumaticos: 'neumáticos',
  neumaticas: 'neumáticas',
  diagnostico: 'diagnóstico',
  diagnosticos: 'diagnósticos',
  tecnico: 'técnico',
  tecnica: 'técnica',
  tecnicos: 'técnicos',
  tecnicas: 'técnicas',
  valvula: 'válvula',
  valvulas: 'válvulas',
  piston: 'pistón',
  camion: 'camión',
  bateria: 'batería',
  baterias: 'baterías',
  caneria: 'cañería',
  canerias: 'cañerías',
  cañeria: 'cañería',
  cañerias: 'cañerías',
  tuberia: 'tubería',
  tuberias: 'tuberías',
  carter: 'cárter',
  deposito: 'depósito',
  depositos: 'depósitos',
  modulo: 'módulo',
  modulos: 'módulos',
  codigo: 'código',
  codigos: 'códigos',
  perdida: 'pérdida',
  perdidas: 'pérdidas',
  arbol: 'árbol',
  ciguenal: 'cigüeñal',
  cigüeñal: 'cigüeñal',
  pinon: 'piñón',
  piñon: 'piñón',
  munon: 'muñón',
  muñon: 'muñón',
  cardan: 'cardán',
  bulon: 'bulón',
  buloneria: 'bulonería',
  esparrago: 'espárrago',
  esparragos: 'espárragos',
  reten: 'retén',
  ruleman: 'rulemán',
  liquido: 'líquido',
  liquidos: 'líquidos',
  vehiculo: 'vehículo',
  vehiculos: 'vehículos',
  maquina: 'máquina',
  maquinas: 'máquinas',
  camara: 'cámara',
  camaras: 'cámaras',
  lampara: 'lámpara',
  lamparas: 'lámparas',
  estadia: 'estadía',
  garantia: 'garantía',
  numero: 'número',
  numeros: 'números',
  dia: 'día',
  dias: 'días',
  sabado: 'sábado',
  miercoles: 'miércoles',
  proximo: 'próximo',
  proxima: 'próxima',
  ultimo: 'último',
  ultima: 'última',
  unico: 'único',
  unica: 'única',
  tambien: 'también',
  despues: 'después',
  ademas: 'además',
  atras: 'atrás',
  aca: 'acá',
  alli: 'allí',
  aqui: 'aquí',
  asi: 'así',
  todavia: 'todavía',
  vacio: 'vacío',
  vacia: 'vacía',
  frio: 'frío',
  fria: 'fría',
  linea: 'línea',
  lineas: 'líneas',
  area: 'área',
  areas: 'áreas',
  rapido: 'rápido',
  rapida: 'rápida',
  basico: 'básico',
  basica: 'básica',
  automatico: 'automático',
  automatica: 'automática',
  termico: 'térmico',
  termica: 'térmica',
  magnetico: 'magnético',
  magnetica: 'magnética',
  elastico: 'elástico',
  elastica: 'elástica',
  plastico: 'plástico',
  plastica: 'plástica',
  metalico: 'metálico',
  metalica: 'metálica',
  conico: 'cónico',
  conica: 'cónica',
  cilindrico: 'cilíndrico',
  cilindrica: 'cilíndrica',
  excentrico: 'excéntrico',
  excentrica: 'excéntrica',
  dinamico: 'dinámico',
  dinamica: 'dinámica',
  estatico: 'estático',
  estatica: 'estática',
  critico: 'crítico',
  critica: 'crítica',
  optimo: 'óptimo',
  optima: 'óptima',
  maximo: 'máximo',
  maxima: 'máxima',
  minimo: 'mínimo',
  minima: 'mínima',
  regimen: 'régimen',
  margen: 'margen',
  poligonos: 'polígonos',
  torneria: 'tornería',
  herreria: 'herrería',
  chapisteria: 'chapistería',
  gomeria: 'gomería',
  rectificadora: 'rectificadora',
  // Palabras terminadas en -sión comunes
  presion: 'presión',
  revision: 'revisión',
  transmision: 'transmisión',
  suspension: 'suspensión',
  tension: 'tensión',
  colision: 'colisión',
  corrosion: 'corrosión',
  erosion: 'erosión',
  explosion: 'explosión',
  emision: 'emisión',
  admision: 'admisión',
  compresion: 'compresión',
  precision: 'precisión',
  decision: 'decisión',
  version: 'versión',
  extension: 'extensión',
  expulsion: 'expulsión',
  inversion: 'inversión',
  conversion: 'conversión',
  dispersion: 'dispersión',
  // Errores ortográficos frecuentes en notas de taller
  prueva: 'prueba',
  pruevas: 'pruebas',
  canbio: 'cambio',
  canbios: 'cambios',
  canbiar: 'cambiar',
  remplazo: 'reemplazo',
  remplazar: 'reemplazar',
  remplazado: 'reemplazado',
  remplazada: 'reemplazada',
  linpieza: 'limpieza',
  linpiar: 'limpiar',
  soladura: 'soldadura',
  soldar: 'soldar',
  mangueras: 'mangueras',
  mangera: 'manguera',
  mangeras: 'mangueras',
  embrage: 'embrague',
  enbrague: 'embrague',
  enbrage: 'embrague',
  frenado: 'frenado',
  aciete: 'aceite',
  aceites: 'aceites',
  conbustible: 'combustible',
  conpresor: 'compresor',
  inyeccion: 'inyección',
  inyecion: 'inyección',
  inyectores: 'inyectores',
  injetor: 'inyector',
  reparasion: 'reparación',
  instalasion: 'instalación',
  calibrasion: 'calibración',
  verificasion: 'verificación',
  inspecsion: 'inspección',
  inspeccion: 'inspección',
  bujes: 'bujes',
  pernos: 'pernos',
  taller: 'taller',
  repuesto: 'repuesto',
  repuestos: 'repuestos',
  respuesto: 'repuesto',
  respuestos: 'repuestos',
  repueto: 'repuesto',
  repuetos: 'repuestos',
  filtro: 'filtro',
  filtros: 'filtros',
  mantenimiento: 'mantenimiento',
  mantemiento: 'mantenimiento',
  mantenimento: 'mantenimiento',
  funcionamiento: 'funcionamiento',
  funsionamiento: 'funcionamiento',
  desarme: 'desarme',
  desarmado: 'desarmado',
  desmontaje: 'desmontaje',
  montaje: 'montaje',
  regulacion: 'regulación',
  alineacion: 'alineación',
  lubricacion: 'lubricación',
  refrigeracion: 'refrigeración',
  soldadura: 'soldadura',
  aberia: 'avería',
  averia: 'avería',
  averias: 'averías',
  faya: 'falla',
  fayas: 'fallas',
  fallando: 'fallando',
  fayando: 'fallando',
  haciendo: 'haciendo',
  aciendo: 'haciendo',
  hecho: 'hecho',
  echo: 'hecho',
  quedo: 'quedó',
  esta: 'está',
  estan: 'están',
  sera: 'será',
  seran: 'serán',
  debera: 'deberá',
  podra: 'podrá',
  tendra: 'tendrá',
  mtto: 'mantenimiento',
  mto: 'mantenimiento',
  q: 'que'
};

// Verbos en pretérito comúnmente escritos sin tilde tras "se" en partes de taller
const PAST_VERBS_AFTER_SE: Record<string, string> = {
  realizo: 'realizó',
  cambio: 'cambió',
  reparo: 'reparó',
  desarmo: 'desarmó',
  armo: 'armó',
  limpio: 'limpió',
  ajusto: 'ajustó',
  reviso: 'revisó',
  verifico: 'verificó',
  coloco: 'colocó',
  instalo: 'instaló',
  retiro: 'retiró',
  reemplazo: 'reemplazó',
  remplazo: 'reemplazó',
  mando: 'mandó',
  envio: 'envió',
  pidio: 'pidió',
  solicito: 'solicitó',
  detecto: 'detectó',
  encontro: 'encontró',
  controlo: 'controló',
  probo: 'probó',
  soldo: 'soldó',
  saco: 'sacó',
  cargo: 'cargó',
  purgo: 'purgó',
  calibro: 'calibró',
  regulo: 'reguló',
  completo: 'completó',
  continuo: 'continuó',
  termino: 'terminó',
  finalizo: 'finalizó',
  paso: 'pasó',
  dejo: 'dejó',
  llevo: 'llevó',
  recibio: 'recibió',
  entrego: 'entregó',
  diagnostico: 'diagnosticó',
  desmonto: 'desmontó',
  monto: 'montó',
  rectifico: 'rectificó',
  fabrico: 'fabricó',
  pulio: 'pulió',
  escaneo: 'escaneó',
  reseteo: 'reseteó',
  conecto: 'conectó',
  desconecto: 'desconectó',
  sello: 'selló',
  lubrico: 'lubricó',
  engraso: 'engrasó',
  lavo: 'lavó',
  pinto: 'pintó',
  corto: 'cortó',
  repaso: 'repasó',
  reacondiciono: 'reacondicionó',
  inspecciono: 'inspeccionó',
  comprobo: 'comprobó',
  chequeo: 'chequeó',
  evaluo: 'evaluó',
  cotizo: 'cotizó',
  compro: 'compró',
  espero: 'esperó',
  ingreso: 'ingresó',
  egreso: 'egresó',
  adapto: 'adaptó',
  modifico: 'modificó',
  sujeto: 'sujetó',
  fijo: 'fijó',
  apreto: 'apretó',
  aflojo: 'aflojó',
  vacio: 'vació',
  lleno: 'llenó',
  dreno: 'drenó',
  filtro: 'filtró',
  torneo: 'torneó',
  freso: 'fresó',
  balanceo: 'balanceó',
  alineo: 'alineó',
  relevo: 'relevó',
  anulo: 'anuló',
  tapo: 'tapó',
  destapo: 'destapó',
  reconstruyo: 'reconstruyó',
  sustituyo: 'sustituyó',
  extrajo: 'extrajo',
  corrigio: 'corrigió',
  soluciono: 'solucionó'
};

const stripAccents = (str: string): string =>
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const preserveCase = (original: string, replacement: string): string => {
  if (!original) return replacement;
  if (original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
};

const normalizeAllCapsIfNeeded = (text: string): string => {
  const letters = text.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/g, '');
  if (letters.length < 4) return text;
  const upperCount = (letters.match(/[A-ZÁÉÍÓÚÑÜ]/g) || []).length;
  if (upperCount / letters.length <= 0.65) return text;

  // Convertir texto en mayúsculas sostenidas preservando siglas conocidas
  return text
    .split(/(\s+)/)
    .map((token) => {
      const bare = token.replace(/^[^A-Za-z0-9/]+|[^A-Za-z0-9/]+$/g, '');
      if (PRESERVED_ACRONYMS.has(bare.toUpperCase())) {
        return token.toUpperCase();
      }
      return token.toLowerCase();
    })
    .join('');
};

const polishSpanishWorkshopText = (text: string): string => {
  let out = normalizeAllCapsIfNeeded(text);

  // Abreviaturas comunes de taller con barra
  out = out
    .replace(/\bc\/\s*/gi, 'con ')
    .replace(/\bs\/\s*/gi, 'sin ')
    .replace(/\bp\/\s*/gi, 'para ')
    .replace(/\bhs\./gi, 'hs')
    .replace(/\bhid\.\s*/gi, 'hidráulico ')
    .replace(/\bobs\.\s*/gi, 'observaciones ')
    .replace(/\bse\s+sigue\b/gi, 'se continúa')
    .replace(/\b([a-zA-ZáéíóúñÑ]+)\s+x\s+([a-zA-ZáéíóúñÑ]+)\b/gi, '$1 por $2');

  // Corregir verbos en pretérito tras "se" (ej. "se realizo" -> "se realizó")
  out = out.replace(/\b(se)\s+([a-zA-ZáéíóúñÑ]+)\b/gi, (match, seWord, verb) => {
    const key = verb.toLowerCase();
    const fixed = PAST_VERBS_AFTER_SE[key];
    if (fixed) {
      return `${seWord} ${preserveCase(verb, fixed)}`;
    }
    return match;
  });

  // Corregir palabras mediante diccionario y regla de terminación -ción
  out = out.replace(/\b([a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]+)\b/g, (word) => {
    const upper = word.toUpperCase();
    if (PRESERVED_ACRONYMS.has(upper)) return upper;

    const lower = word.toLowerCase();
    if (SPANISH_WORKSHOP_CORRECTIONS[lower]) {
      return preserveCase(word, SPANISH_WORKSHOP_CORRECTIONS[lower]);
    }

    // Regla ortográfica del español: palabras terminadas en "cion" llevan tilde en "ción"
    if (lower.length >= 5 && lower.endsWith('cion') && !lower.endsWith('ción')) {
      const fixed = lower.slice(0, -4) + 'ción';
      return preserveCase(word, fixed);
    }

    return word;
  });

  // Limpiar espaciado y puntuación redundante
  out = out
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:])([^\s0-9])/g, '$1 $2')
    .replace(/\.{2,}/g, '.')
    .replace(/,{2,}/g, ',')
    .replace(/:{2,}/g, ':')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Quitar puntuación sobrante al inicio o final de la cláusula
  out = out
    .replace(/^[\s:;,\-–—./]+/, '')
    .replace(/[\s:;,\-–—.]+$/, '')
    .trim();

  // Minúscula inicial para integrarse fluidamente dentro del párrafo (salvo siglas)
  if (out.length > 1) {
    const firstToken = out.split(/\s+/)[0].replace(/[^A-Za-z0-9/]/g, '');
    if (!PRESERVED_ACRONYMS.has(firstToken.toUpperCase())) {
      out = out.charAt(0).toLowerCase() + out.slice(1);
    }
  }

  return out;
};

export const cleanWorkshopActionText = (rawText: string | null | undefined): string => {
  const sanitized = sanitizePdfText(rawText);
  if (!sanitized) return '';

  // Excluir mensajes automáticos de cambio de estado o sincronización
  if (
    /^cambio\s+de\s+estado\s+a\s*:/i.test(sanitized) ||
    /^sincronizaci[oó]n\s+diaria\s+de\s+estad[ií]a$/i.test(sanitized)
  ) {
    return '';
  }

  let text = sanitized;

  // Quitar metadatos de monto agregados al sincronizar costos
  text = text.replace(/\(\s*monto\s*:\s*(?:USD|\$)?\s*[0-9.,]+\s*\)/gi, ' ');

  // Detectar si era un pedido de repuestos o entrega de repuestos
  const isPedidoRepuestos = /^\s*pedidos?\s+de\s+repuestos?\b/i.test(text);
  const isRepuestosEntregados = /^\s*repuestos?\s+entregados?\s*:?/i.test(text);

  // Quitar prefijo predefinido "Avance:" / "Avances:" / "Avance -"
  text = text.replace(/^\s*avances?\s*[:\-–—.]*\s*/i, '');

  // Quitar prefijo "Pedido de repuestos" temporalmente para limpiar RC y número con precisión
  if (isPedidoRepuestos) {
    text = text.replace(/^\s*pedidos?\s+de\s+repuestos?\s*[:\-–—]?\s*/i, '');
  } else if (isRepuestosEntregados) {
    text = text.replace(/^\s*repuestos?\s+entregados?\s*[:\-–—]?\s*/i, '');
  }

  // Eliminar "RC", "R.C.", "SOTT", "SOOT", "O.T." y los números/códigos asociados a ellos
  text = text
    // "por RC 1234", "con SOTT N° 456", "según R.C.: 123/25"
    .replace(/\b(?:por|con|seg[uú]n|de|en)?\s*(?:R\.\s*C\.|R\.C\.|RC|SOTT|SOOT|O\.\s*T\.|O\.T\.)(?=\s|[:#\-.,;()/]|$)(?:\s*(?:N[°ºo.]?|nro\.?|#|:|-))*\s*(?:\d+[0-9A-Za-z\/-]*|-)?/gi, ' ')
    // "OT 1234" o "OT: 1234" (solo cuando tiene separador o número para evitar falsos positivos)
    .replace(/\b(?:por|con|seg[uú]n|de|en)?\s*OT\b\s*(?:(?:N[°ºo.]?|nro\.?|#|:|-)\s*)?\d+[0-9A-Za-z\/-]*/gi, ' ')
    // Palabra "Avance" suelta seguida de dos puntos en el medio del texto
    .replace(/\bavances?\s*:/gi, ' ');

  // Limpiar conectores colgantes que quedaron tras quitar RC/SOTT
  text = text
    .replace(/^[\s:;,\-–—./]+/, '')
    .replace(/[\s:;,\-–—]+$/, '')
    .replace(/\s+(?:a|de|en|por|con|seg[uú]n|n[°º]|nro\.?)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (isPedidoRepuestos) {
    text = text ? `solicitud de repuestos (${text})` : 'solicitud de repuestos';
  } else if (isRepuestosEntregados) {
    text = text ? `recepción de repuestos (${text})` : 'recepción de repuestos';
  }

  if (!text) return '';

  return polishSpanishWorkshopText(text);
};

const canonicalizeForDedup = (text: string): string =>
  stripAccents(text.toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const STOP_WORDS = new Set([
  'se', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'en', 'a', 'al', 'y', 'e', 'o', 'u', 'por', 'para', 'con', 'sin', 'sobre', 'que'
]);

const getSignificantTokens = (canonical: string): Set<string> => {
  const words = canonical.split(' ').filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return new Set(words.length > 0 ? words : canonical.split(' ').filter(Boolean));
};

const tokenJaccardSimilarity = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  a.forEach((tok) => {
    if (b.has(tok)) intersection++;
  });
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

export const deduplicateInterventionActions = (actions: string[]): string[] => {
  const kept: Array<{ text: string; canonical: string; tokens: Set<string> }> = [];

  for (const raw of actions) {
    const canonical = canonicalizeForDedup(raw);
    if (!canonical || canonical.length < 3) continue;

    const tokens = getSignificantTokens(canonical);
    let duplicateIdx = -1;

    for (let i = 0; i < kept.length; i++) {
      const existing = kept[i];
      if (
        existing.canonical === canonical ||
        existing.canonical.includes(canonical) ||
        canonical.includes(existing.canonical) ||
        tokenJaccardSimilarity(existing.tokens, tokens) >= 0.78
      ) {
        duplicateIdx = i;
        break;
      }
    }

    if (duplicateIdx === -1) {
      kept.push({ text: raw, canonical, tokens });
    } else if (raw.length > kept[duplicateIdx].text.length) {
      // Conservar la redacción más completa/descriptiva
      kept[duplicateIdx] = { text: raw, canonical, tokens };
    }
  }

  return kept.map((item) => item.text);
};

const formatCollaboratorName = (name: string): string => {
  const clean = sanitizePdfText(name).replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  const normalizedKey = stripAccents(clean.toLowerCase());
  if (normalizedKey === 'taller') return 'personal de taller';
  if (normalizedKey === 'compras') return 'personal de compras';

  const letters = clean.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/g, '');
  const upperCount = (letters.match(/[A-ZÁÉÍÓÚÑÜ]/g) || []).length;
  const lowerCount = (letters.match(/[a-záéíóúñü]/g) || []).length;

  // Si está todo en mayúsculas o todo en minúsculas, aplicar formato Título
  if (letters.length > 0 && (upperCount === letters.length || lowerCount === letters.length)) {
    const connectors = new Set(['de', 'del', 'la', 'las', 'los', 'y']);
    return clean
      .toLowerCase()
      .split(' ')
      .map((part, idx) => {
        if (idx > 0 && connectors.has(part)) return part;
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(' ');
  }

  return clean;
};

export const extractUniqueCollaborators = (actions: MaintenanceAction[]): string[] => {
  const map = new Map<string, string>();

  for (const act of actions) {
    const rawResp = sanitizePdfText(act.responsable);
    if (!rawResp) continue;
    const upper = rawResp.toUpperCase();
    if (upper === 'SISTEMA' || upper === 'SIN ESPECIFICAR' || upper === '-') continue;

    const formatted = formatCollaboratorName(rawResp);
    const key = stripAccents(formatted.toLowerCase()).replace(/\s+/g, ' ').trim();
    if (!key) continue;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, formatted);
    } else {
      // Preferir versión con tildes si la existente no tenía
      const hasAccentNew = /[áéíóúÁÉÍÓÚñÑ]/.test(formatted);
      const hasAccentOld = /[áéíóúÁÉÍÓÚñÑ]/.test(existing);
      if (hasAccentNew && !hasAccentOld) {
        map.set(key, formatted);
      }
    }
  }

  return Array.from(map.values());
};

export const formatSpanishList = (items: string[]): string => {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  const last = items[items.length - 1];
  const startsWithISound = /^(?:h?[ií])(?![eé])/i.test(last.trim());
  const conjunction = startsWithISound ? ' e ' : ' y ';
  return `${items.slice(0, -1).join(', ')}${conjunction}${last}`;
};

export interface InterventionSummaryParams {
  entry: MaintenanceEntry;
  workshopName: string;
  sortedActions: MaintenanceAction[];
  fechaIngresoFormatted: string;
  fechaFinFormatted: string;
  partsWaitDays: number;
  repairDays: number;
  testingDays?: number;
}

export const buildInterventionSummaryParagraph = ({
  entry,
  workshopName,
  sortedActions,
  fechaIngresoFormatted,
  fechaFinFormatted,
  partsWaitDays,
  repairDays,
  testingDays = 0
}: InterventionSummaryParams): string => {
  const cleanWorkshop = sanitizePdfText(workshopName) || 'Taller';
  const workshopPhrase = /^taller\b/i.test(cleanWorkshop)
    ? `el ${cleanWorkshop}`
    : `el taller ${cleanWorkshop}`;

  // 1. Limpiar y deduplicar los avances técnicos
  const cleanedActions = sortedActions
    .map((a) => cleanWorkshopActionText(a.descripcion))
    .filter(Boolean);
  const uniqueActions = deduplicateInterventionActions(cleanedActions);

  let interventionsSentence = '';
  if (uniqueActions.length > 0) {
    interventionsSentence = `Entre los días ${fechaIngresoFormatted} y ${fechaFinFormatted}, para el equipo ${entry.equipo_id}, se registraron las siguientes intervenciones en ${workshopPhrase}: ${uniqueActions.join('; ')}.`;
  } else {
    interventionsSentence = `Entre los días ${fechaIngresoFormatted} y ${fechaFinFormatted}, para el equipo ${entry.equipo_id}, no se registraron intervenciones específicas detalladas en ${workshopPhrase}.`;
  }

  // 2. Colaboradores únicos
  const collaborators = extractUniqueCollaborators(sortedActions);
  let collaboratorsSentence = '';
  if (collaborators.length > 0) {
    const label = collaborators.length === 1 ? 'el colaborador' : 'los colaboradores';
    collaboratorsSentence = ` Los avances fueron registrados por ${label}: ${formatSpanishList(collaborators)}.`;
  }

  // 3. Distribución de la estadía
  const safeParts = Math.max(0, Math.round(partsWaitDays || 0));
  const safeRepair = Math.max(0, Math.round(repairDays || 0));
  const safeTesting = Math.max(0, Math.round(testingDays || 0));

  const partsLabel = `${safeParts} ${safeParts === 1 ? 'día' : 'días'}`;
  const repairLabel = `${safeRepair} ${safeRepair === 1 ? 'día' : 'días'}`;
  const testingExtra =
    safeTesting > 0
      ? `, además de ${safeTesting} ${safeTesting === 1 ? 'día' : 'días'} en prueba`
      : '';

  const staySentence = ` La estadía en taller estuvo dividida en: ${partsLabel} esperando repuestos, y ${repairLabel} en reparación${testingExtra}.`;

  return sanitizePdfText(`${interventionsSentence}${collaboratorsSentence}${staySentence}`);
};

const stripMarkdownFormatting = (text: string): string => {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,;:!?]|$)/g, '$1$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const polishInterventionSummaryWithAI = async (
  params: InterventionSummaryParams
): Promise<string> => {
  const draftSummary = buildInterventionSummaryParagraph(params);

  const response = await fetch('/api/gemini/polish-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      draftSummary,
      context: {
        equipoId: params.entry.equipo_id,
        taller: params.workshopName,
        fechaIngreso: params.fechaIngresoFormatted,
        fechaFin: params.fechaFinFormatted,
        diasRepuestos: Math.max(0, Math.round(params.partsWaitDays || 0)),
        diasReparacion: Math.max(0, Math.round(params.repairDays || 0)),
        diasPrueba: Math.max(0, Math.round(params.testingDays || 0)),
        fallaInicial: params.entry.informe_fallas || '',
        observaciones: params.entry.observaciones || '',
        avances: params.sortedActions.map((a) => ({
          fecha: a.fecha_accion || '',
          responsable: a.responsable || '',
          descripcion: a.descripcion || '',
        })),
      },
    }),
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.summary || typeof payload.summary !== 'string') {
    const serverMsg = payload?.error || `Error del servidor (${response.status})`;
    throw new Error(`No se pudo corregir el resumen con IA: ${serverMsg}`);
  }

  const cleanedParagraphs = stripMarkdownFormatting(payload.summary)
    .split(/\n+/)
    .map((p) => sanitizePdfText(p))
    .filter(Boolean);

  return cleanedParagraphs.join('\n\n');
};
