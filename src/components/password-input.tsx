"use client";
import { useState, type InputHTMLAttributes } from "react";
export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="password-field">
      <input {...props} aria-label={props["aria-label"] || props.placeholder || "Password"} type={visible ? "text" : "password"} />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </span>
  );
}
