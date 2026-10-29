import { ActionButton } from "../../components/ActionButton";
import {ThemedText} from "../../theme/ThemedText";
import {useThemedStyles} from "../../theme/ThemeProvider";
import type {Theme} from "../../theme/tokens";
import { usePaginatedResource, useRemoteResource } from "../../hooks/useRemoteResource";
import { Pagination, RemoteListStatus } from "../../components/RemoteListStatus";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FloatingTextInput as TextInput } from "../../components/FloatingTextInput";
import { confirmAction } from "../../components/ConfirmationDialog";
import { api } from "../../api";

type Permission = { id: number; name: string; slug: string };
type Role = { id: number; name: string; slug: string; description?: string | null; permissions: Permission[] };
type User = { id: number; name: string; username?: string | null; email: string; active: boolean; role_id: number; role: Role };

export function UsersScreen({ token, currentUserId }: { token: string; currentUserId: number }) {
  const styles=useThemedStyles(createStyles);
  const directory = usePaginatedResource<User>("/users", token, "los usuarios");
  const rolesResource = useRemoteResource<Role[]>("/roles", token, "los roles");
  const permissionsResource = useRemoteResource<Permission[]>("/permissions", token, "los permisos");
  const roles = rolesResource.data ?? [];
  const permissions = permissionsResource.data ?? [];
  const [selected, setSelected] = useState<User | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (directory.data) setSelected((current) => current ? directory.items.find((item) => item.id === current.id) ?? null : null);
  }, [directory.data]);
  async function load() { directory.reload(); rolesResource.reload(); permissionsResource.reload(); }

  return <View style={styles.container}>
    {!!message && <ThemedText style={styles.notice}>{message}</ThemedText>}
    <RemoteListStatus {...rolesResource} count={roles.length} emptyText="No hay roles registrados." onRetry={rolesResource.reload} />
    {rolesResource.data && !rolesResource.error && !rolesResource.loading && <CreateUser token={token} roles={roles} onSaved={load} setMessage={setMessage} />}
    <View style={styles.card}>
      <ThemedText style={styles.title}>Usuarios de la sucursal</ThemedText>
      <RemoteListStatus {...directory} count={directory.items.length} emptyText="No hay usuarios registrados." onRetry={directory.reload} />
      {directory.items.map((user) => <Pressable accessibilityRole="button" key={user.id} style={[styles.row, selected?.id === user.id && styles.selectedRow]} onPress={() => setSelected(user)}>
        <View style={styles.flex}><ThemedText style={styles.rowTitle}>{user.name}{user.id === currentUserId ? " · Tú" : ""}</ThemedText><ThemedText style={styles.muted}>@{user.username || "sin usuario"} · {user.email} · {user.role?.name}</ThemedText></View><ThemedText style={user.active ? styles.active : styles.inactive}>{user.active ? "Activo" : "Inactivo"}</ThemedText>
      </Pressable>)}
      <Pagination {...directory} onPage={directory.setPage} />
    </View>
    {selected && rolesResource.data && !rolesResource.error && !rolesResource.loading && <EditUser key={`${selected.id}-${selected.active}-${selected.role_id}`} user={selected} roles={roles} token={token} currentUserId={currentUserId} onSaved={load} setMessage={setMessage} />}
    <RemoteListStatus {...permissionsResource} count={permissions.length} emptyText="No hay permisos registrados." onRetry={permissionsResource.reload} />
    {rolesResource.data && permissionsResource.data && !rolesResource.error && !permissionsResource.error && !rolesResource.loading && !permissionsResource.loading && <RolePermissions roles={roles} permissions={permissions} token={token} onSaved={load} setMessage={setMessage} />}
  </View>;
}

function CreateUser({ token, roles, onSaved, setMessage }: { token: string; roles: Role[]; onSaved: () => Promise<void>; setMessage: (message: string) => void }) {
  const styles=useThemedStyles(createStyles);
  const [name, setName] = useState(""); const [username, setUsername] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [roleId, setRoleId] = useState<number | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!roleId && roles[0]) setRoleId(roles[0].id); }, [roles, roleId]);
  const passwordLength = password.length;
  const canSave = !busy && !!name.trim() && !!email.trim() && passwordLength >= 8 && !!roleId;
  async function save() {
    if (!canSave) {
      setMessage(passwordLength < 8 ? `La contraseña debe tener al menos 8 caracteres. Faltan ${8 - passwordLength}.` : "Completa nombre, correo, contraseña y rol antes de registrar el usuario.");
      return;
    }
    setBusy(true); setMessage("");
    try { await api("/users", token, { method: "POST", body: JSON.stringify({ name: name.trim(), username: username.trim() || null, email: email.trim().toLowerCase(), password, role_id: roleId }) }); setName(""); setUsername(""); setEmail(""); setPassword(""); setMessage("Usuario registrado."); await onSaved(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <View style={styles.card}><ThemedText style={styles.title}>Registrar usuario</ThemedText><View style={styles.inline}><TextInput style={[styles.input, styles.flex]} value={name} onChangeText={setName} placeholder="Nombre" /><TextInput style={[styles.input, styles.flex]} value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="Usuario opcional" /></View><TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Correo" /><TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" placeholder="Contraseña (mínimo 8 caracteres)" /><ThemedText style={passwordLength >= 8 ? styles.passwordValid : styles.passwordHint}>{passwordLength >= 8 ? "✓ Contraseña válida" : `Contraseña: ${passwordLength}/8 caracteres${passwordLength ? ` · faltan ${8 - passwordLength}` : ""}`}</ThemedText><RoleChoices roles={roles} selectedId={roleId} setSelectedId={setRoleId} /><ActionButton label={busy ? "Guardando..." : "Registrar usuario"} disabled={!canSave} onPress={save} /></View>;
}

function EditUser({ user, roles, token, currentUserId, onSaved, setMessage }: { user: User; roles: Role[]; token: string; currentUserId: number; onSaved: () => Promise<void>; setMessage: (message: string) => void }) {
  const styles=useThemedStyles(createStyles);
  const [name, setName] = useState(user.name); const [username, setUsername] = useState(user.username ?? ""); const [email, setEmail] = useState(user.email); const [password, setPassword] = useState(""); const [roleId, setRoleId] = useState<number | null>(user.role_id); const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setMessage("");
    try { await api(`/users/${user.id}`, token, { method: "PUT", body: JSON.stringify({ name: name.trim(), username: username.trim() || null, email: email.trim().toLowerCase(), role_id: roleId, ...(password ? { password } : {}) }) }); setPassword(""); setMessage("Usuario actualizado."); await onSaved(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function toggle() {
    if (!await confirmAction(`${user.active ? "Desactivar" : "Reactivar"} la cuenta de ${user.name}?`)) return;
    setBusy(true); setMessage("");
    try { if (user.active) await api(`/users/${user.id}`, token, { method: "DELETE" }); else await api(`/users/${user.id}`, token, { method: "PUT", body: JSON.stringify({ active: true }) }); setMessage("Estado del usuario actualizado."); await onSaved(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <View style={styles.card}><View style={styles.headingRow}><ThemedText style={styles.title}>Editar {user.name}</ThemedText>{user.id !== currentUserId && <ActionButton label={user.active ? "Desactivar" : "Reactivar"} variant="destructive" onPress={toggle} />}</View><View style={styles.inline}><TextInput style={[styles.input, styles.flex]} value={name} onChangeText={setName} placeholder="Nombre" /><TextInput style={[styles.input, styles.flex]} value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="Usuario" /></View><TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" placeholder="Correo" /><TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Nueva contraseña (vacío conserva la actual)" />{user.id !== currentUserId ? <RoleChoices roles={roles} selectedId={roleId} setSelectedId={setRoleId} /> : <ThemedText style={styles.muted}>Por seguridad no puedes cambiar tu propio rol ni desactivar tu cuenta.</ThemedText>}<ActionButton label="Guardar cambios" disabled={busy || !name.trim() || !email.trim() || (password.length > 0 && password.length < 8) || !roleId} onPress={save} /></View>;
}

function RoleChoices({ roles, selectedId, setSelectedId }: { roles: Role[]; selectedId: number | null; setSelectedId: (id: number) => void }) {
  const styles=useThemedStyles(createStyles);
  return <View style={styles.actions}>{roles.map((role) => <Pressable accessibilityRole="radio" aria-checked={selectedId === role.id} key={role.id} style={[styles.choice, selectedId === role.id && styles.choiceActive]} onPress={() => setSelectedId(role.id)}><ThemedText>{role.name}</ThemedText></Pressable>)}</View>;
}

function RolePermissions({ roles, permissions, token, onSaved, setMessage }: { roles: Role[]; permissions: Permission[]; token: string; onSaved: () => Promise<void>; setMessage: (message: string) => void }) {
  const styles=useThemedStyles(createStyles);
  const configurableRoles = roles.filter((role) => role.slug !== "administrador");
  const [roleId, setRoleId] = useState<number | null>(null); const [selectedIds, setSelectedIds] = useState<number[]>([]); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!roleId && configurableRoles[0]) setRoleId(configurableRoles[0].id); }, [roles, roleId]);
  useEffect(() => { const role = roles.find((item) => item.id === roleId); setSelectedIds(role?.permissions.map((permission) => permission.id) ?? []); }, [roleId, roles]);
  function toggle(id: number) { setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]); }
  async function save() {
    if (!roleId) return; setBusy(true); setMessage("");
    try { await api(`/roles/${roleId}`, token, { method: "PUT", body: JSON.stringify({ permission_ids: selectedIds }) }); setMessage("Permisos del rol actualizados. Los usuarios verán el cambio al renovar su sesión."); await onSaved(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <View style={styles.card}><ThemedText style={styles.title}>Permisos por rol</ThemedText><ThemedText style={styles.muted}>El administrador conserva acceso total. Configura aquí las capacidades operativas de los demás roles.</ThemedText><RoleChoices roles={configurableRoles} selectedId={roleId} setSelectedId={setRoleId} /><View style={styles.permissionGrid}>{permissions.map((permission) => { const checked = selectedIds.includes(permission.id); return <Pressable accessibilityRole="checkbox" aria-checked={checked} key={permission.id} style={[styles.permission, checked && styles.permissionActive]} onPress={() => toggle(permission.id)}><ThemedText style={styles.permissionName}>{permission.name}</ThemedText><ThemedText style={styles.muted}>{permission.slug}</ThemedText></Pressable>; })}</View><ActionButton label="Guardar permisos" disabled={busy || !roleId} onPress={save} /></View>;
}

const createStyles=(theme:Theme)=>StyleSheet.create({
  container: { gap: 14, minWidth: 0 }, card: { ...theme.shadows.surface, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.section, borderWidth: 1, gap: 14, padding: 20 }, loader: { margin: 40 }, title: { color: theme.colors.text, fontSize: 18 * theme.fontScale, fontWeight: "900" }, muted: { color: theme.colors.textMuted, flexShrink: 1 }, notice: { backgroundColor: theme.colors.warningSurface, borderRadius: 10, color: theme.colors.warningText, padding: 12 }, input: { color:theme.colors.text, backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border, borderRadius: theme.radius.control, borderWidth: 1, minHeight: theme.control.minTouch, paddingHorizontal: 14 }, passwordHint: { color: theme.colors.danger, fontSize: 11 * theme.fontScale, fontWeight: "700", marginTop: -7 }, passwordValid: { color: theme.colors.successText, fontSize: 11 * theme.fontScale, fontWeight: "700", marginTop: -7 }, inline: { alignItems: "stretch", flexDirection: "row", flexWrap: "wrap", gap: 10 }, flex: { flexBasis: 240, flexGrow: 1, minWidth: 0 }, headingRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10 }, row: { alignItems: "center", borderTopColor: theme.colors.border, borderTopWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between", paddingVertical: 12 }, selectedRow: { backgroundColor: theme.colors.warningSurface, borderRadius: 10, paddingHorizontal: 10 }, rowTitle: { color: theme.colors.text, fontWeight: "800" }, active: { color: theme.colors.successText, fontWeight: "900" }, inactive: { color: theme.colors.danger, fontWeight: "900" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, choice: { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.pill, justifyContent: "center", minHeight: theme.control.minTouch, padding: 11 }, choiceActive: { backgroundColor: theme.colors.primarySurface }, primary: { ...theme.shadows.surface, alignItems: "center", backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, justifyContent: "center", minHeight: theme.control.minTouch, padding: 12 }, primaryText: { color: theme.colors.primaryText, fontWeight: "800" }, dangerButton: { backgroundColor: theme.colors.dangerSurface, borderColor: theme.colors.dangerSurface, borderRadius: theme.radius.pill, borderWidth: 1, minHeight: theme.control.minTouch, padding: 10 }, dangerText: { color: theme.colors.danger, fontWeight: "800" }, disabled: { opacity: theme.control.disabledOpacity }, permissionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, permission: { backgroundColor: theme.colors.surfaceMuted, borderColor: "transparent", borderRadius: theme.radius.card, borderWidth: 2, flexBasis: 250, flexGrow: 1, minHeight: 72, minWidth: 0, padding: 12 }, permissionActive: { backgroundColor: theme.colors.warningSurface, borderColor: theme.colors.primary }, permissionName: { color: theme.colors.text, fontWeight: "900" },
});
