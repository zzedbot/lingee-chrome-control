import {
  OPTIONAL_SENSITIVE_PERMISSIONS,
  containsOptionalPermission,
  removeOptionalPermission,
  requestOptionalPermission
} from "./optional-permissions.js";

const enabled = document.querySelector("#enabled");
const blocked = document.querySelector("#blocked");
const message = document.querySelector("#message");
const permissionMessage = document.querySelector("#permission-message");
const permissionStates = new Map();

async function load() {
  const settings = await chrome.storage.local.get({ enabled: true, blockedHosts: [] });
  enabled.checked = settings.enabled;
  blocked.value = settings.blockedHosts.join("\n");
  await refreshOptionalPermissions();
}

async function refreshOptionalPermissions() {
  for (const permission of OPTIONAL_SENSITIVE_PERMISSIONS) {
    const granted = await containsOptionalPermission(chrome.permissions, permission);
    permissionStates.set(permission, granted);
    const button = document.querySelector(`[data-permission="${permission}"]`);
    button.textContent = granted ? "Revoke" : "Grant access";
    button.dataset.granted = String(granted);
    button.setAttribute("aria-pressed", String(granted));
  }
}

for (const permission of OPTIONAL_SENSITIVE_PERMISSIONS) {
  document.querySelector(`[data-permission="${permission}"]`).addEventListener("click", async () => {
    const wasGranted = permissionStates.get(permission) === true;
    try {
      // request() is invoked directly from this click handler so Chrome can show its user-gesture permission prompt.
      const changed = wasGranted
        ? await removeOptionalPermission(chrome.permissions, permission)
        : await requestOptionalPermission(chrome.permissions, permission);
      await refreshOptionalPermissions();
      const isGranted = permissionStates.get(permission) === true;
      permissionMessage.textContent = changed
        ? `${permission} access ${isGranted ? "granted" : "revoked"}.`
        : `${permission} access was not changed.`;
    } catch (error) {
      permissionMessage.textContent = `Unable to change ${permission} access: ${error.message || String(error)}`;
    }
  });
}

chrome.permissions.onAdded.addListener(refreshOptionalPermissions);
chrome.permissions.onRemoved.addListener(refreshOptionalPermissions);

document.querySelector("#save").addEventListener("click", async () => {
  const blockedHosts = blocked.value.split(/\r?\n/).map((value) => value.trim().toLowerCase()).filter(Boolean);
  await chrome.storage.local.set({ enabled: enabled.checked, blockedHosts });
  message.textContent = "Saved.";
  setTimeout(() => { message.textContent = ""; }, 1200);
});

load();
