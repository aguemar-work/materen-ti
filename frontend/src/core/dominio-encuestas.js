// Catálogo fijo de tipos de pregunta para el módulo de Encuestas — vive en
// código, no en BD, porque agregar un tipo nuevo es un cambio de código
// controlado, no algo que deba pedir migración por cada encuesta. Lo usan
// tanto el builder (EncuestaForm.vue) como el formulario público
// (PreguntaCampo.vue). La validación real y autoritativa vive en el
// servidor (functions/encuestas.ts); `respuestaValida` es solo el mismo
// criterio espejado en el cliente para dar feedback antes de enviar.
export const TIPOS_PREGUNTA = {
  texto_corto: { label: 'Texto corto', maxLen: 200 },
  texto_largo: { label: 'Texto largo', maxLen: 2000 },
  opcion_unica: { label: 'Opción única' },
  escala_1_5: { label: 'Escala 1 a 5' },
  si_no: { label: 'Sí / No' },
};

export function tipoPreguntaInfo(tipo) {
  return TIPOS_PREGUNTA[tipo] || { label: tipo };
}

export function nuevaPregunta(tipo = 'texto_corto') {
  return {
    id: crypto.randomUUID(),
    tipo,
    etiqueta: '',
    requerido: false,
    ...(tipo === 'opcion_unica' ? { opciones: [] } : {}),
  };
}

// valor === undefined/null/'' y no requerido: válido (pregunta opcional sin responder).
// Resumen de una pregunta sobre el set de respuestas crudas de una ronda
// (cada respuesta es { [preguntaId]: valor }, una fila por persona).
// Usado por EncuestaDetalleView.vue para no mostrar solo la tabla cruda.
export function resumenPregunta(pregunta, respuestas) {
  const valores = respuestas
    .map((r) => r[pregunta.id])
    .filter((v) => v !== undefined && v !== null && v !== '');
  const total = valores.length;

  if (pregunta.tipo === 'opcion_unica') {
    const conteos = Object.fromEntries((pregunta.opciones || []).map((o) => [o, 0]));
    for (const v of valores) if (v in conteos) conteos[v] += 1;
    return { tipo: pregunta.tipo, total, conteos };
  }
  if (pregunta.tipo === 'si_no') {
    const si = valores.filter((v) => v === true).length;
    return { tipo: pregunta.tipo, total, si, no: total - si };
  }
  if (pregunta.tipo === 'escala_1_5') {
    const promedio = total ? valores.reduce((a, b) => a + b, 0) / total : 0;
    const conteos = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const v of valores) if (conteos[v] !== undefined) conteos[v] += 1;
    return { tipo: pregunta.tipo, total, promedio, conteos };
  }
  // texto_corto / texto_largo
  return { tipo: pregunta.tipo, total, textos: valores };
}

export function respuestaValida(pregunta, valor) {
  const vacio = valor === undefined || valor === null || valor === '';
  if (pregunta.requerido && vacio) return false;
  if (vacio) return true;
  switch (pregunta.tipo) {
    case 'texto_corto':
      return typeof valor === 'string' && valor.length <= TIPOS_PREGUNTA.texto_corto.maxLen;
    case 'texto_largo':
      return typeof valor === 'string' && valor.length <= TIPOS_PREGUNTA.texto_largo.maxLen;
    case 'opcion_unica':
      return Array.isArray(pregunta.opciones) && pregunta.opciones.includes(valor);
    case 'escala_1_5':
      return Number.isInteger(valor) && valor >= 1 && valor <= 5;
    case 'si_no':
      return typeof valor === 'boolean';
    default:
      return false;
  }
}
