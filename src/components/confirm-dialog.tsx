"use client";
import { useId, useRef, useState } from "react";
export function useConfirmDialog() {
  const id = useId(),
    dialog = useRef<HTMLDialogElement>(null),
    resolve = useRef<((value: boolean) => void) | null>(null);
  const [message, setMessage] = useState("");
  function finish(value: boolean) {
    dialog.current?.close();
    resolve.current?.(value);
    resolve.current = null;
  }
  function confirm(text: string) {
    setMessage(text);
    dialog.current?.showModal();
    return new Promise<boolean>((done) => {
      resolve.current = done;
    });
  }
  const confirmation = (
    <dialog
      ref={dialog}
      className="search-dialog"
      aria-labelledby={id}
      onCancel={() => finish(false)}
    >
      <h2 id={id}>Confirm this change</h2>
      <p>{message}</p>
      <div className="header-actions mt-5">
        <button
          autoFocus
          className="action secondary"
          onClick={() => finish(false)}
        >
          Keep unchanged
        </button>
        <button className="action" onClick={() => finish(true)}>
          Confirm change
        </button>
      </div>
    </dialog>
  );
  return { confirm, confirmation };
}
