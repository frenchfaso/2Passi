export function showToast(text) {
  const host = document.querySelector("#toastHost");
  if (!host) return;
  const toast = document.createElement("article");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.textContent = text;
  host.append(toast);
  setTimeout(() => toast.remove(), 5000);
}
