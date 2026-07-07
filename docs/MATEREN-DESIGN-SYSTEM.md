# Materen — Design System de producto

**Versión 0.3 · documento vivo**

Este documento cubre cómo se ve y se comporta el **software** de Materen. No
sustituye al Manual de Identidad Visual ni al Documento Maestro (logo,
papelería, redes). Este manda para la **interfaz del producto**.

**Implementación en Sistema TI:** tokens `--mat-*` en
[`frontend/src/styles/main.css`](../frontend/src/styles/main.css) · guía de
implementación en [`GUIA-UX-UI.md`](GUIA-UX-UI.md).

---

## 1. Fundamento de marca (heredado)

| Elemento | Valor |
|---|---|
| Verde petróleo | `#072E2A` — ink de marca, títulos |
| Verde acento | `#34D399` — resaltados (no texto sobre blanco: 1.9:1) |
| Acento interactivo | `#157955` — botones, links, foco (5.4:1 AA) |
| Tipografía títulos | Sora temporal (Axiforma pendiente) |
| Tipografía cuerpo | Inter |

---

## 2. Tokens

### Color

| Token | Hex | Rol |
|---|---|---|
| `--mat-color-brand` | `#072E2A` | Ink — títulos, sidebar oscuro |
| `--mat-color-accent` | `#157955` | Interacción — primario, foco |
| `--mat-color-accent-alt` | `#34D399` | Acento bruto, gradientes |
| `--mat-color-accent-subtle` | `#E6F7F1` | Tintas, badges |
| `--mat-color-bg` | `#F8F6F1` | Fondo de página |
| `--mat-color-text-primary` | `#3A372E` | Cuerpo (no petróleo en todo) |
| `--mat-color-text-secondary` | `#6B7280` | Metadatos |
| `--mat-color-border` | `#EAE6DC` | Separación — **sin sombra** |

**Semánticos** (alejados de rojo/verde/azul plantilla):

| Estado | Fondo | Texto |
|---|---|---|
| Éxito | `#E6F7F1` | `#157955` |
| Alerta | `#FBF0DC` | `#845A0E` * |
| Error | `#FAEAE3` | `#963D28` * |
| Información | `#EDEBF7` | `#5B58A0` |
| Neutral | `#F1EFE8` | `#525862` * |

\* Ajuste mínimo de contraste WCAA en implementación; familia de color intacta.

### Tipografía

| Rol | Familia | Tamaño |
|---|---|---|
| H1 / stats | Sora | 26–28px |
| H2 / toolbar | Sora | 15–20px |
| Cuerpo | Inter | 14px |
| Caption | Inter | 11–12px |

### Radio

- **8px** controles (botón, input, badge)
- **14px** contenedores (card, modal, tabla)

---

## 3. Decisiones clave

1. **Un acento interactivo por vista** (modelo shadcn) — solo `.btn-primary`.
2. **Ink de marca ≠ color de cuerpo** — petróleo solo en títulos.
3. **Separación por borde, no sombra** en contenedores.
4. **Fondo claro** como decisión explícita (legibilidad para usuarios no técnicos).
5. **CSS custom**, no shadcn/Tailwind — misma filosofía visual, control total de marca.

---

## 4. Componentes (inventario)

Implementados en `main.css` de Sistema TI:

- Botones (primary / secondary / danger)
- Inputs, selects, textareas + focus ring
- Badges, status, pills
- Cards, tablas, modales, toast
- Timeline, capacity bar, confirmación destructiva, form-error, empty state

Pendientes de portar desde prototipo HTML cuando hagan falta: tabs, toggle,
alert banner, accordion, tooltip, skeleton, stepper.

---

## 5. Historial

| Versión | Cambio |
|---|---|
| v0.3 | Paleta del logo real (petróleo + acento); fondo claro confirmado |
| v0.2 | Navy no es color de cuerpo; semánticos recoloreados |
| v0.1 | Primera propuesta Navy/Turquesa del manual |

---

## 6. Pendientes

- [ ] Licencia Axiforma → reemplazar Sora en `--mat-font-display`
- [ ] Lockup oficial del wordmark
- [ ] Prototipo interactivo `materen-design-system.html` en repo compartido
