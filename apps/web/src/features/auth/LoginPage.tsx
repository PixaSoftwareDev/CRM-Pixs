import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { signIn } from "./api";
import { quickAccess } from "./dev-credentials";
import { type LoginInput, loginSchema } from "./login-schema";

const inputClass =
  "h-11 rounded-[10px] border border-line bg-white px-3.5 text-[15px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 aria-invalid:border-red-500";

export function LoginPage({ notice = null, onSignedIn }: { notice?: string | null; onSignedIn?: () => void }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    try {
      await signIn(data);
      onSignedIn?.();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    }
  });

  /** Acceso rápido: completa el usuario de prueba y entra con un solo clic. */
  const quickLogin = () => {
    if (!quickAccess) return;
    setValue("email", quickAccess.credentials.email, { shouldValidate: true });
    setValue("password", quickAccess.credentials.password, { shouldValidate: true });
    void onSubmit();
  };

  return (
    <div className="flex min-h-dvh flex-wrap">
      <section className="flex flex-[1_1_420px] flex-col justify-between gap-10 bg-ink p-10 text-white sm:p-14">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-[10px] bg-brand-soft font-bold">
            C
          </span>
          <span className="text-lg font-bold">CRM</span>
        </div>
        <div>
          <h1 className="max-w-[440px] text-4xl leading-tight font-bold tracking-tight sm:text-[40px]">
            Tus clientes, tareas y cobros en un solo lugar.
          </h1>
          <p className="mt-4 max-w-[420px] text-base leading-relaxed text-slate-300">
            Entrá, mirá qué toca hoy y dejá que el sistema se encargue de los recordatorios.
          </p>
        </div>
        <p className="text-[13px] text-slate-400">© {new Date().getFullYear()} CRM</p>
      </section>

      <section className="flex flex-[1_1_420px] items-center justify-center px-6 py-10">
        <form onSubmit={onSubmit} noValidate className="flex w-full max-w-[360px] flex-col gap-4">
          <h2 className="text-2xl font-bold">Iniciá sesión</h2>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Email
            <input
              type="email"
              autoComplete="username"
              aria-invalid={errors.email ? true : undefined}
              className={inputClass}
              {...register("email")}
            />
            {errors.email && <span className="text-xs text-red-600">{errors.email.message}</span>}
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password ? true : undefined}
              className={inputClass}
              {...register("password")}
            />
            {errors.password && (
              <span className="text-xs text-red-600">{errors.password.message}</span>
            )}
          </label>

          {notice && !serverError && (
            <p role="status" className="rounded-[10px] bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {notice}
            </p>
          )}

          {serverError && (
            <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">
              {serverError}
            </p>
          )}

          {/* Envía el formulario (onSubmit): así también entra con Enter. */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1.5 h-[46px] rounded-[10px] bg-brand text-[15px] font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
          >
            {isSubmitting ? "Entrando…" : "Entrar"}
          </button>

          {quickAccess && (
            <div className="flex flex-col gap-1.5 border-t border-dashed border-line pt-4">
              <button
                type="button"
                onClick={quickLogin}
                disabled={isSubmitting}
                className="h-10 rounded-[10px] border border-line bg-white text-sm font-medium transition hover:bg-slate-50 disabled:opacity-60"
              >
                {quickAccess.label}
              </button>
              <p className="text-center text-xs text-muted">
                {quickAccess.hint}
              </p>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
