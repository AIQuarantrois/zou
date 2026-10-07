"use client";
import { useCallback, useRef, useState } from "react";

type ToastItem = { id: number; message: string; undoLabel?: string; onUndo?: () => void };

// Remplace confirm()/alert() natifs, jamais stylables et incohérents avec le reste de l'interface. Reprend le
// couple toast()/undoable() de src/artifact.html : un message disparaît après 3,4 s ; une action réversible
// s'affiche tout de suite (optimiste) mais n'est réellement exécutée qu'après 6 s, le temps de cliquer « Annuler ».
export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const show = useCallback((message: string) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message }]);
    timers.current[id] = setTimeout(() => dismiss(id), 3400);
  }, [dismiss]);

  // commit() s'exécute si on laisse les 6 s s'écouler ; restore() si on clique « Annuler » avant (remet l'état
  // optimiste local tel qu'avant l'action — rien n'a encore été envoyé au serveur à ce stade).
  const runUndoable = useCallback((message: string, commit: () => void, restore: () => void, undoLabel = "Annuler") => {
    const id = ++idRef.current;
    let settled = false;
    const onUndo = () => { if (settled) return; settled = true; restore(); dismiss(id); };
    setToasts((t) => [...t, { id, message, undoLabel, onUndo }]);
    timers.current[id] = setTimeout(() => { if (!settled) { settled = true; commit(); } dismiss(id); }, 6000);
  }, [dismiss]);

  return { toasts, show, runUndoable };
}

export function ToastHost({ toasts }: { toasts: ToastItem[] }) {
  if (!toasts.length) return null;
  return (
    <div className="ad-toast-wrap">
      {toasts.map((t) => (
        <div className="ad-toast" key={t.id} role="status">
          <span>{t.message}</span>
          {t.onUndo && <button type="button" className="ad-toast-act" onClick={t.onUndo}>{t.undoLabel}</button>}
        </div>
      ))}
    </div>
  );
}
