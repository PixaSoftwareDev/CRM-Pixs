/**
 * Íconos SVG compartidos (inline, sin dependencias). Heredan color con
 * `currentColor`. Tamaño por defecto 16px, ajustable con `size`.
 * Son decorativos: `aria-hidden` para lectores de pantalla.
 */
type IconProps = { size?: number; className?: string }

export function GridIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  )
}

export function ListIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="2.4" rx="1.2" />
      <rect x="3" y="10.8" width="18" height="2.4" rx="1.2" />
      <rect x="3" y="16.6" width="18" height="2.4" rx="1.2" />
    </svg>
  )
}

export function BoardIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="9.5" y="4" width="5" height="11" rx="1.5" />
      <rect x="16" y="4" width="5" height="14" rx="1.5" />
    </svg>
  )
}

export function MailIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

export function PhoneIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2Z" />
    </svg>
  )
}

export function GlobeIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z" />
    </svg>
  )
}

export function MenuIcon({ size = 22, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

export function CloseIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

// ---- Íconos de navegación (trazo 1.8, cuadran a 20px) ----

function nav(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  }
}

export function HomeIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  )
}

export function UsersIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 6M17.5 20a5.5 5.5 0 0 0-3-4.9" />
    </svg>
  )
}

export function TargetIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.8" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function FolderIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5H19.5A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18Z" />
    </svg>
  )
}

export function CheckSquareIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  )
}

export function ServerIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="7" rx="1.6" />
      <rect x="3.5" y="13" width="17" height="7" rx="1.6" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </svg>
  )
}

export function WalletIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5H18a1.5 1.5 0 0 1 1.5 1.5v.5" />
      <rect x="3.5" y="7" width="17" height="12" rx="2" />
      <path d="M16 13h.01" />
    </svg>
  )
}

export function MegaphoneIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <path d="M3 10v4a1 1 0 0 0 1 1h3l7 4V5L7 9H4a1 1 0 0 0-1 1Z" />
      <path d="M17.5 9a4 4 0 0 1 0 6" />
    </svg>
  )
}

export function ChevronLeftIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <path d="m14 7-5 5 5 5" />
    </svg>
  )
}

export function UserIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </svg>
  )
}

export function BuildingIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <rect x="4" y="3" width="12" height="18" rx="1.5" />
      <path d="M16 8h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-3" />
      <path d="M8 7h4M8 11h4M8 15h4" />
    </svg>
  )
}

export function LogoutIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" />
      <path d="M10 8 6 12l4 4M6 12h10" />
    </svg>
  )
}

// ---- Íconos de documentos ----

export function FileIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <path d="M13 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8z" />
      <path d="M13 3v5h5" />
    </svg>
  )
}

export function FilePdfIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <path d="M13 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8z" />
      <path d="M13 3v5h5" />
      <path d="M9 13h1.2a1.2 1.2 0 0 1 0 2.4H9zM9 13v4M14 13v4M14 13h1.8M14 15h1.4" />
    </svg>
  )
}

export function ImageIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 18 5-5 4 3.5 3-2.5 4 4" />
    </svg>
  )
}

export function SheetIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <path d="M13 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8z" />
      <path d="M13 3v5h5" />
      <path d="M9 13h6M9 16h6M12 13v3" />
    </svg>
  )
}

export function UploadIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M5 15v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />
    </svg>
  )
}

export function DownloadIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <path d="M12 4v11M8 11l4 4 4-4" />
      <path d="M5 15v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />
    </svg>
  )
}

export function TrashIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7M10 11v6M14 11v6" />
    </svg>
  )
}

// ---- Íconos de accesos ----

export function KeyIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <circle cx="7.5" cy="15.5" r="4" />
      <path d="m10.5 12.5 7-7M15 8l2 2M18 5l2 2" />
    </svg>
  )
}

export function EyeIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  )
}

export function EyeOffIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <path d="M4 4l16 16" />
      <path d="M9.6 5.6A9.7 9.7 0 0 1 12 5.5c6.5 0 10 6.5 10 6.5a17 17 0 0 1-3 3.7" />
      <path d="M6.3 7.8A16.8 16.8 0 0 0 2 12s3.5 6.5 10 6.5a9.6 9.6 0 0 0 3.7-.7" />
      <path d="M9.9 9.9a2.6 2.6 0 0 0 3.6 3.6" />
    </svg>
  )
}

export function CopyIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M6 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" />
    </svg>
  )
}

export function ExternalLinkIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...nav(size, className)} aria-hidden="true">
      <path d="M14 5h5v5M19 5l-8 8" />
      <path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  )
}
