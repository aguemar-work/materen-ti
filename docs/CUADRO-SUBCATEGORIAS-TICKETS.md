# Cuadro de subcategorías de tickets y procedimiento de TI

> Cuadro del procedimiento de TI (naturaleza, nivel, destino y condición de cierre
> por subcategoría), actualizado el 2026-10-21 al catálogo vigente del sistema
> (migración 116: 7 categorías y 31 subcategorías). El cuadro anterior estaba
> armado sobre el catálogo previo a la 116 (5 categorías y 18 subcategorías) e
> incluía una categoría «Gestión interna TI» que nunca existió en el sistema.
>
> Ante conflicto, gana el sistema: `migrations/116_catalogo_tickets_v2.sql` y lo
> que el dueño haya editado después desde Configuración.

## Cómo leer las columnas

- **Naturaleza** y **Prioridad sugerida**: valores del sistema
  (`subcategorias_ticket.tipo_sugerido` y `prioridad_sugerida`). La prioridad
  «Crítica» se guarda como `urgente`.
- **Nivel**, **Destino** y **Condición adicional de cierre**: el sistema no los
  guarda; se trasladaron del cuadro original a la subcategoría equivalente.
- **\*** = valor propuesto para una subcategoría que no estaba en el cuadro
  original: pendiente de confirmar.
- ⚠️ = el sistema difiere del cuadro original; aquí se registra el valor del sistema.

## Cuadro

| Subcategoría | Naturaleza | Prioridad sugerida | Nivel | Destino | Condición adicional de cierre |
| --- | --- | --- | --- | --- | --- |
| **Accesos y Cuentas** | | | | | |
| Restablecer contraseña | Solicitud ⚠️ | Media | N1 | PR-TI-001 | — |
| Desbloquear cuenta | Solicitud ⚠️ | Alta | N1 | PR-TI-001 | — |
| No puedo ingresar al sistema | Incidente | Alta | N1 \* | PR-TI-001 \* | — \* |
| Solicitar permisos o accesos (sistemas / carpetas) | Solicitud | Media | N1 | PR-TI-001 | Autorización de la Jefatura del usuario registrada en el ticket. |
| Crear cuenta de usuario (alta) | Solicitud | Media | N1 | PR-TI-002 (6.4) | Autorización de Capital Humano o de la Jefatura registrada en el ticket. |
| Desactivar cuenta de usuario (baja) | Solicitud | Alta | N1 \* | PR-TI-002 (6.4) \* | Correo de Capital Humano adjunto; hora de bloqueo registrada. \* |
| **Hardware y Periféricos** | | | | | |
| Equipo no enciende | Incidente | Alta | N1 / N2 | PR-TI-001; PR-TI-003 si cambia de estado o se reemplaza | Código del activo en el ticket; si cambió de estado, KAPO Almacén actualizado. |
| Equipo lento o con fallas | Incidente | Media | N1 / N2 | PR-TI-001 | Código del activo registrado en el ticket. |
| Impresora o escáner no funciona | Incidente | Media | N1 | PR-TI-001 | — |
| Accesorio dañado o faltante | Incidente | Baja | N1 | PR-TI-003 si se entrega un accesorio | Entrega registrada en KAPO Almacén. |
| Solicitar tóner o insumos | Solicitud | Baja | N1 \* | PR-TI-003 \* | Entrega registrada en KAPO Almacén. \* |
| Solicitar equipo o accesorio nuevo | Solicitud | Baja | N1 | PR-TI-003 | Aprobación de la Jefatura; entrega registrada en KAPO Almacén. |
| **Redes y Conectividad** | | | | | |
| Sin internet o WiFi | Incidente | Alta | N2 | PR-TI-002 (6.1) | — |
| VPN no conecta | Incidente | Alta | N2 | PR-TI-002 (6.1) | — |
| Red lenta o intermitente | Incidente | Media | N2 \* | PR-TI-002 (6.1) \* | — \* |
| Solicitar punto de red, WiFi o VPN | Solicitud | Baja | N2 | PR-TI-002 (6.1) | Autorización de la Jefatura del usuario registrada en el ticket. |
| **Software y Aplicaciones** | | | | | |
| Error o falla en aplicación | Incidente | Media | N1 | PR-TI-001 | — |
| Correo electrónico / Office 365 | Incidente | Alta | N1 \* | PR-TI-001 \* | — \* |
| Licencia vencida o no se activa | Incidente | Media | N1 | PR-TI-001 | — |
| Instalar o actualizar software | Solicitud | Baja | N1 | PR-TI-001 | Software licenciado o autorizado por TI. |
| Solicitar licencia nueva | Solicitud | Baja | N1 | PR-TI-003 | Aprobación de la Jefatura; licencia registrada en KAPO Almacén. |
| **Seguridad de la Información** | | | | | |
| Virus o malware sospechoso | Incidente | Crítica | N1 / N2 | PR-TI-002 (6.2) | — |
| Correo sospechoso / phishing | Incidente | Alta | N1 / N2 \* | PR-TI-002 (6.2) \* | — \* |
| Pérdida o robo de equipo | Incidente | Crítica | N2 \* | PR-TI-002 (6.2); PR-TI-003 \* | Código del activo en el ticket; KAPO Almacén actualizado. \* |
| Respaldo o recuperación de archivos | Solicitud | Media | N1 / N2 | PR-TI-002 (6.2) | — |
| **Videovigilancia (CCTV)** | | | | | |
| Cámara sin imagen o con falla | Incidente | Alta | N2 \* | PR-TI-002 (6.5) \* | — \* |
| Solicitar acceso para visualizar cámaras | Solicitud | Media | N2 \* | PR-TI-002 (6.5) \* | Autorización de Gerencia o de la Jefatura de Capital Humano adjunta. \* |
| Solicitar revisión o extracción de grabación | Solicitud | Media | N2 | PR-TI-002 (6.5) | Autorización de Gerencia o de la Jefatura de Capital Humano adjunta. |
| **Consultas y Capacitación** | | | | | |
| Consulta o asesoría | Solicitud | Baja | N1 | PR-TI-001 | — |
| Solicitar capacitación | Solicitud | Baja | N1 | PR-TI-001 | — |
| Otro (no clasificado) | Solicitud ⚠️ (por defecto; TI la corrige) | Baja | N1 | TI reclasifica | Categoría corregida antes del cierre. |

## Lo que era «Gestión interna TI»

No es una categoría de tickets: el sistema no tiene subcategorías ocultas al
portal del empleado. Cada fila del cuadro original vive en otro lugar o no tiene
lugar propio.

| Fila del cuadro original | Dónde vive en el sistema |
| --- | --- |
| Alta o baja de personal | Módulo **Solicitudes** (migración 108, trámite con pasos) y las subcategorías «Crear cuenta de usuario (alta)» y «Desactivar cuenta de usuario (baja)». PR-TI-002 (6.4). |
| Acceso a grabaciones | Subcategoría «Solicitar revisión o extracción de grabación» (CCTV), visible en el portal, con aviso que pide la autorización de Gerencia. |
| Cambio mayor | Módulo **Cambios** (migración 107): aprobación del JEFE antes de ejecutar; una emergencia sin aprobar no se cierra (48 h). PR-TI-002 (6.6). |
| Falla de infraestructura | Sin lugar propio. |
| Control periódico | Sin lugar propio. |

## Notas

1. **Naturaleza (⚠️)**: el sistema clasifica «Restablecer contraseña» y
   «Desbloquear cuenta» como Solicitud (decisión de la 116); «Otro» entra como
   Solicitud y el técnico corrige el tipo si hace falta (reclasificar nunca cambia
   el tipo).
2. **Nivel**: el sistema no lo sugiere por subcategoría. El técnico lo fija al
   iniciar el ticket (`tickets.nivel_atencion`), que admite también N3.
3. **Destino y condición de cierre**: el sistema no los guarda ni los valida. Con
   la migración 120 (sin aplicar), al resolver el técnico escribe la solución, que
   ve el solicitante, y en ella cita la condición cumplida (p. ej. el registro en
   KAPO Almacén, que es un sistema externo).
4. Los nombres son los de la migración 116. Un renombre hecho después desde
   Configuración no se refleja aquí: confirmar contra el catálogo antes de
   publicar el procedimiento.
