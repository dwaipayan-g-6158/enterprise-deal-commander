/**
 * A tap you can feel, where the platform allows it.
 *
 * iOS Safari has never exposed the Vibration API. The only thing that has
 * ever worked from the web is a side effect of the `switch` checkbox Apple
 * shipped in 17.4: flipping one programmatically fires the system's own
 * toggle haptic. Apple closed that in 26.5, so on a current device this is a
 * silent no-op — which is exactly how it has to be treated.
 *
 * Nothing here is load-bearing. Every call site keeps its visual feedback,
 * and this is fired alongside it, never instead of it.
 */

let host: { input: HTMLInputElement; label: HTMLLabelElement } | null = null;
let unsupported = false;

function ensureHost(): typeof host {
  if (host || unsupported) return host;

  // `switch` is a real IDL attribute only where the control exists.
  if (typeof document === "undefined" || !("switch" in document.createElement("input"))) {
    unsupported = true;
    return null;
  }

  const hide = (el: HTMLElement) => {
    el.setAttribute("aria-hidden", "true");
    el.style.cssText =
      "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
  };

  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.id = "edc-haptic-switch";
  input.tabIndex = -1;
  hide(input);

  const label = document.createElement("label");
  label.htmlFor = input.id;
  hide(label);

  document.body.append(input, label);
  host = { input, label };
  return host;
}

/** Fire a light tap. Never throws, never blocks, never matters if it does nothing. */
export function haptic(): void {
  try {
    ensureHost()?.label.click();
  } catch {
    // A blocked or torn-down document. There is nothing to recover.
    unsupported = true;
  }
}
