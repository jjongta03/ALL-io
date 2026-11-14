"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/actions";
import type { Project } from "./types";
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`aio-card ${className}`}>{children}</section>;
}
export function ButtonLink({
  href,
  children,
  primary = false,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
  className?: string;
}) {
  return (
    <Link className={`aio-button ${primary ? "is-primary" : ""} ${className}`} href={href}>
      {children}
    </Link>
  );
}
export function Heading({
  title,
  description,
  back,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <>
      {back && (
        <Link className="aio-back" href={back.href}>
          ‹ {back.label}
        </Link>
      )}
      <div className="aio-heading">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
    </>
  );
}
export function Empty({
  title,
  children,
  href,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  href?: string;
  action?: string;
}) {
  return (
    <Card>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {href && action && (
        <ButtonLink href={href} primary>
          {action}
        </ButtonLink>
      )}
    </Card>
  );
}
export function Progress({ project }: { project: Project }) {
  return (
    <div className="aio-progress">
      <strong>
        {project.progress}%{" "}
        <span>
          ({project.completed}/{project.total})
        </span>
      </strong>
      <div
        role="progressbar"
        aria-label="프로젝트 진행률"
        aria-valuenow={project.progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i style={{ width: `${project.progress}%` }} />
      </div>
    </div>
  );
}
export function MutationButton({
  path,
  method = "POST",
  body,
  children,
  href,
  primary = false,
  onDone,
}: {
  path: string;
  method?: string;
  body?: unknown;
  children: React.ReactNode;
  href?: string;
  primary?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="aio-action">
      <button
        className={`aio-button ${primary ? "is-primary" : ""}`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await api(path, method, body);
            onDone?.();
            if (href) router.push(href);
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "처리 중…" : children}
      </button>
      {error && (
        <p className="aio-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function ExternalLink({
  href,
  children,
}: {
  href?: string | null;
  children: React.ReactNode;
}) {
  if (!href || !/^https:\/\//i.test(href)) return null;
  return (
    <a className="aio-button" href={href} target="_blank" rel="noopener noreferrer">
      {children} ↗
    </a>
  );
}
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const focused = document.activeElement as HTMLElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      focused?.focus();
    };
  }, []);
  return (
    <dialog className="aio-dialog aio-card" ref={ref} onCancel={onClose} aria-label={title}>
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="aio-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function ErrorText({ error }: { error: string }) {
  return error ? (
    <p role="alert" className="aio-error">
      {error}
    </p>
  ) : null;
}
