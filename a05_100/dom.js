// Small helpers for building the interface, shared by the main script and the watching rooms.

export function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function button(label, onClick, className = "small") {
  const element = el("button", className, label);
  element.type = "button";
  element.addEventListener("click", onClick);
  return element;
}
