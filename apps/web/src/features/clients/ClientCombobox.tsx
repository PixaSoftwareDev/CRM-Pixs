import { ChevronDown } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../components/ui/cn";
import { useDebounced } from "../../hooks/useDebounced";
import { useClientSearch } from "./api";

const control =
  "h-[38px] w-full rounded-[10px] border border-line bg-white pr-9 pl-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 aria-invalid:border-red-500";

interface Item {
  id: string;
  name: string;
  hint: string | null;
}

/** Ancho mínimo de la lista: los nombres largos no se cortan aunque el input sea angosto. */
const MIN_LIST_WIDTH = 320;
const GUTTER = 16;

/**
 * Posición fija de la lista respecto del input. Al ser `fixed` no la recorta el
 * scroll del modal (el <dialog> no tiene transform). Se abre hacia arriba si
 * abajo no hay lugar.
 */
function listPosition(input: HTMLElement): CSSProperties {
  const r = input.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(Math.max(r.width, MIN_LIST_WIDTH), vw - GUTTER * 2);
  const left = Math.min(Math.max(r.left, GUTTER), vw - GUTTER - width);
  const below = vh - r.bottom - GUTTER;
  const above = r.top - GUTTER;
  const up = below < 200 && above > below;
  const maxHeight = Math.min(320, (up ? above : below) - 4);
  return up
    ? { left, width, maxHeight, bottom: vh - r.top + 4 }
    : { left, width, maxHeight, top: r.bottom + 4 };
}

const NONE: Item = { id: "", name: "Sin cliente", hint: null };

/**
 * Selector de cliente con buscador (patrón combobox de WAI-ARIA). Encuentra al
 * cliente por nombre, razón social, CUIT, teléfono, email o por el nombre,
 * teléfono o email de cualquiera de sus contactos; debajo de cada opción dice
 * por qué apareció. "Sin cliente" siempre está primera.
 *
 * Va dentro de un `<Field>` (el label envuelve el input).
 */
export function ClientCombobox({
  value,
  selectedName,
  onChange,
  invalid,
  inputProps,
}: {
  /** Id del cliente elegido ("" = sin cliente). */
  value: string;
  /** Nombre del cliente elegido, para mostrarlo cerrado. */
  selectedName: string | undefined;
  onChange: (id: string, name: string) => void;
  invalid?: boolean;
  /** Atributos extra para el input (p. ej. `data-*` de useEnterFlow). */
  inputProps?: Record<`data-${string}`, string>;
}) {
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  /** Texto escrito mientras se busca; null = no está buscando (muestra el elegido). */
  const [typed, setTyped] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  // El nombre del último elegido acá, por si el catálogo todavía no lo trae.
  const [pos, setPos] = useState<CSSProperties>({});
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);

  const query = useDebounced((typed ?? "").trim(), 250);
  const search = useClientSearch(query, open);
  const items: Item[] = [NONE, ...(search.data ?? [])];
  const searching = open && (search.isFetching || query !== (typed ?? "").trim());

  const shownName = value ? (picked?.id === value ? picked.name : (selectedName ?? "")) : "";

  // Cada búsqueda nueva arranca desde el primer resultado.
  useEffect(() => setActive(query ? Math.min(1, items.length - 1) : 0), [query, search.data]);

  // Acompaña al input si se scrollea el modal o cambia el tamaño de la ventana.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => inputRef.current && setPos(listPosition(inputRef.current));
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // La opción activa siempre a la vista al moverse con el teclado.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId(active))}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const close = () => {
    setOpen(false);
    setTyped(null);
  };

  const choose = (item: Item) => {
    setPicked(item.id ? { id: item.id, name: item.name } : null);
    onChange(item.id, item.id ? item.name : "");
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) setOpen(true);
        else setActive((i) => Math.min(i + 1, items.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) setOpen(true);
        else setActive((i) => Math.max(i - 1, 0));
        break;
      case "Home":
      case "End":
        if (!open) return;
        e.preventDefault();
        setActive(e.key === "Home" ? 0 : items.length - 1);
        break;
      case "Enter": {
        // Abierto, Enter elige (y no manda el formulario).
        if (!open) return;
        e.preventDefault();
        const item = items[active];
        if (item && !searching) choose(item);
        break;
      }
      case "Escape":
        // Abierto, Esc cierra la lista y no el modal.
        if (!open) return;
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case "Tab":
        if (open) close();
        break;
    }
  };

  return (
    <div className="relative">
      <input
        {...inputProps}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && items[active] ? optionId(active) : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder="Sin cliente — buscá por nombre, CUIT, contacto, teléfono…"
        className={cn(control, "truncate")}
        value={typed ?? shownName}
        onChange={(e) => {
          setTyped(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => e.target.select()}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Borrar todo el texto y salir = sin cliente; si no, vuelve al elegido.
          if (typed !== null && typed.trim() === "" && value) choose(NONE);
          else close();
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        // Sin robarle el foco al input: así el teclado y el lector siguen ahí.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          inputRef.current?.focus();
          setOpen((o) => !o);
        }}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400"
      >
        <ChevronDown size={14} className={cn("transition", open && "rotate-180")} />
      </button>
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Clientes"
        hidden={!open}
        // Está dentro del <label> del Field: sin esto, el clic vuelve a abrir la lista.
        onClick={(e) => e.preventDefault()}
        style={pos}
        className="fixed z-30 overflow-y-auto overscroll-contain rounded-xl border border-line bg-white p-1 shadow-lg"
      >
        {items.map((item, i) => (
          <li
            key={item.id || "none"}
            id={optionId(i)}
            role="option"
            aria-selected={item.id === value}
            // mousedown en vez de click: elige antes de que el input pierda el foco.
            onMouseDown={(e) => {
              e.preventDefault();
              choose(item);
            }}
            onMouseMove={() => active !== i && setActive(i)}
            className={cn(
              "flex cursor-pointer flex-col rounded-lg px-2.5 py-2 text-sm font-normal text-ink",
              i === active && "bg-slate-100",
              item.id === value && "font-semibold text-brand",
              !item.id && "text-muted",
            )}
          >
            <span className="line-clamp-2 break-words">{item.name}</span>
            {item.hint && <span className="line-clamp-2 break-words text-xs font-normal text-slate-500">{item.hint}</span>}
          </li>
        ))}
        {searching && search.data === undefined && (
          <li role="presentation" className="px-2.5 py-2 text-xs text-slate-400">
            Buscando…
          </li>
        )}
        {!searching && query && search.data?.length === 0 && (
          <li role="presentation" className="px-2.5 py-2 text-xs text-slate-400">
            Ningún cliente coincide con «{query}»
          </li>
        )}
        {search.error && (
          <li role="presentation" className="px-2.5 py-2 text-xs text-red-600">
            No se pudo buscar. Probá de nuevo.
          </li>
        )}
      </ul>
      <span className="sr-only" aria-live="polite">
        {open && !searching && query ? `${search.data?.length ?? 0} clientes encontrados` : ""}
      </span>
    </div>
  );
}
