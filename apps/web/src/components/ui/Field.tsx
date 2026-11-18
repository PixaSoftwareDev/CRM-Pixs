import {
  type AriaAttributes,
  cloneElement,
  forwardRef,
  type InputHTMLAttributes,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import { cn } from "./cn";

const control =
  "h-[38px] w-full rounded-[10px] border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 aria-invalid:border-red-500";

/** Flecha propia y texto con "…" si no entra: todos los desplegables se ven igual. */
export const selectArrow =
  "appearance-none truncate bg-[image:var(--select-chevron)] bg-[length:14px] bg-[position:right_0.7rem_center] bg-no-repeat";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(control, className)} {...props} />,
);
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(control, selectArrow, "pr-9", className)} {...props} />,
);
Select.displayName = "Select";

/** Saltos de línea pegados en un campo de una sola línea: pasan a ser espacios. */
const oneLine = (v: string) => v.replace(/\r?\n/g, " ");

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /**
   * Título u otro texto de una línea: crece hacia abajo para que se lea entero,
   * pero no acepta saltos de línea (Enter queda para quien lo atienda, p. ej. el
   * recorrido de useEnterFlow).
   */
  singleLine?: boolean;
};

/**
 * Textarea con el mismo aspecto que Input que crece con el texto (hasta unas
 * 6 líneas; después, scroll). Sirve controlado o con register de react-hook-form.
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className, singleLine, onChange, onKeyDown, rows = 1, ...props }, ref) => {
    const inner = useRef<HTMLTextAreaElement | null>(null);
    const setRef = useCallback(
      (el: HTMLTextAreaElement | null) => {
        inner.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      },
      [ref],
    );
    const fit = useCallback(() => {
      const el = inner.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    }, []);
    // Cada render (valor controlado, reset del formulario) y al cambiar el ancho.
    useLayoutEffect(fit);
    useEffect(() => {
      const el = inner.current;
      if (!el || typeof ResizeObserver === "undefined") return;
      let width = el.clientWidth;
      const ro = new ResizeObserver(() => {
        if (el.clientWidth !== width) {
          width = el.clientWidth;
          fit();
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, [fit]);
    // Una línea: ni Enter ni Shift+Enter (ni el pegado) meten saltos de línea.
    useEffect(() => {
      const el = inner.current;
      if (!el || !singleLine) return;
      const block = (e: InputEvent) => {
        if (e.inputType === "insertLineBreak" || e.inputType === "insertParagraph") e.preventDefault();
      };
      el.addEventListener("beforeinput", block);
      return () => el.removeEventListener("beforeinput", block);
    }, [singleLine]);
    return (
      <textarea
        ref={setRef}
        rows={rows}
        className={cn(control, "h-auto max-h-36 min-h-[38px] resize-none py-2 leading-5 break-words", className)}
        onChange={(e) => {
          if (singleLine && /[\r\n]/.test(e.target.value)) {
            const at = e.target.selectionStart;
            e.target.value = oneLine(e.target.value);
            e.target.setSelectionRange(at, at);
          }
          fit();
          onChange?.(e);
        }}
        onKeyDown={(e) => {
          // Shift/Alt+Enter en una línea: no hace nada (Enter solo lo atiende el formulario).
          if (singleLine && e.key === "Enter" && (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey)) e.preventDefault();
          onKeyDown?.(e);
        }}
        {...props}
      />
    );
  },
);
TextArea.displayName = "TextArea";

/** Controles a los que Field les conecta el error o la ayuda (aria-describedby / aria-invalid). */
type Described = ReactElement<AriaAttributes>;
const isControl = (node: ReactNode): node is Described =>
  isValidElement(node) &&
  (node.type === Input || node.type === Select || node.type === TextArea || node.type === "input" || node.type === "select" || node.type === "textarea");

/**
 * Etiqueta + control + error, accesible (el label envuelve el control). Si el
 * hijo es un Input/Select/TextArea/textarea, el error o la ayuda quedan como su
 * descripción (aria-describedby) y el error lo marca aria-invalid.
 */
export function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  const messageId = useId();
  const message = error ?? hint;
  const wired = isControl(children);
  const control =
    wired && message
      ? cloneElement(children, {
          "aria-describedby": [children.props["aria-describedby"], messageId].filter(Boolean).join(" "),
          ...(error && children.props["aria-invalid"] === undefined && { "aria-invalid": true }),
        })
      : children;
  return (
    <label className={cn("flex flex-col gap-1 text-xs font-medium text-muted", className)}>
      {label}
      {control}
      {/* Conectado como descripción, se saca del nombre del control para no leerlo dos veces. */}
      {error ? (
        <span id={messageId} aria-hidden={wired || undefined} className="text-xs font-normal text-red-600">
          {error}
        </span>
      ) : hint ? (
        <span id={messageId} aria-hidden={wired || undefined} className="text-xs font-normal text-muted">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
