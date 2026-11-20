export const OPTIONAL_SENSITIVE_PERMISSIONS = Object.freeze(["bookmarks", "history"]);

export function assertOptionalSensitivePermission(permission) {
  if (!OPTIONAL_SENSITIVE_PERMISSIONS.includes(permission)) {
    throw Object.assign(new Error(`Unsupported optional permission: ${permission}`), { code: "INVALID_OPTIONAL_PERMISSION" });
  }
  return permission;
}

export function containsOptionalPermission(permissionsApi, permission) {
  return permissionsApi.contains({ permissions: [assertOptionalSensitivePermission(permission)] });
}

export function requestOptionalPermission(permissionsApi, permission) {
  return permissionsApi.request({ permissions: [assertOptionalSensitivePermission(permission)] });
}

export function removeOptionalPermission(permissionsApi, permission) {
  return permissionsApi.remove({ permissions: [assertOptionalSensitivePermission(permission)] });
}
