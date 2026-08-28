import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../api";

type Permission = { id: number; name: string; slug: string };
type Role = { id: number; name: string; slug: string; description?: string | null; permissions: Permission[] };
type User = { id: number; name: string; username?: string | null; email: string; active: boolean; role_id: number; role: Role };
type UsersPage = { data: User[]; current_page: number; last_page: number };

function confirmAction(message: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(globalThis.confirm(message));
  return new Promise((resolve) => Alert.alert("Confirmar", message, [
    { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
    { text: "Aceptar", onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}

export function UsersScreen({ token, currentUserId }: { token: string; currentUserId: number }) {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selected, setSelected] = useState<User | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setMessage("");
    try {
      const [userPage, nextRoles, nextPermissions] = await Promise.all([
        api<UsersPage>("/users", token), api<Role[]>("/roles", token), api<Permission[]>("/permissions", token),
      ]);
      setUsers(userPage.data); setRoles(nextRoles); setPermissions(nextPermissions);
      setSelected((current) => current ? userPage.data.find((item) => item.id === current.id) ?? null : null);
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  return <View style={styles.container}>
    {!!message && <Text style={styles.notice}>{message}</Text>}
    <CreateUser token={token} roles={roles} onSaved={load} setMessage={setMessage} />
    {busy && !users.length ? <ActivityIndicator color="#cf4b32" style={styles.loader} /> : <View style={styles.card}>
      <Text style={styles.title}>Usuarios de la sucursal</Text>
      {users.map((user) => <Pressable key={user.id} style={[styles.row, selected?.id === user.id && styles.selectedRow]} onPress={() => setSelected(user)}>
        <View style={styles.flex}><Text style={styles.rowTitle}>{user.name}{user.id === currentUserId ? " · Tú" : ""}</Text><Text style={styles.muted}>@{user.username || "sin usuario"} · {user.email} · {user.role?.name}</Text></View><Text style={user.active ? styles.active : styles.inactive}>{user.active ? "Activo" : "Inactivo"}</Text>
      </Pressable>)}
    </View>}
    {selected && <EditUser key={`${selected.id}-${selected.active}-${selected.role_id}`} user={selected} roles={roles} token={token} currentUserId={currentUserId} onSaved={load} setMessage={setMessage} />}
    <RolePermissions roles={roles} permissions={permissions} token={token} onSaved={load} setMessage={setMessage} />
  </View>;
}

function CreateUser({ token, roles, onSaved, setMessage }: { token: string; roles: Role[]; onSaved: () => Promise<void>; setMessage: (message: string) => void }) {
  const [name, setName] = useState(""); const [username, setUsername] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [roleId, setRoleId] = useState<number | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!roleId && roles[0]) setRoleId(roles[0].id); }, [roles, roleId]);
  async function save() {
    setBusy(true); setMessage("");
    try { await api("/users", token, { method: "POST", body: JSON.stringify({ name: name.trim(), username: username.trim() || null, email: email.trim().toLowerCase(), password, role_id: roleId }) }); setName(""); setUsername(""); setEmail(""); setPassword(""); setMessage("Usuario registrado."); await onSaved(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <View style={styles.card}><Text style={styles.title}>Registrar usuario</Text><View style={styles.inline}><TextInput style={[styles.input, styles.flex]} value={name} onChangeText={setName} placeholder="Nombre" /><TextInput style={[styles.input, styles.flex]} value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="Usuario opcional" /></View><TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Correo" /><TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Contraseña (mínimo 8 caracteres)" /><RoleChoices roles={roles} selectedId={roleId} setSelectedId={setRoleId} /><Pressable disabled={busy || !name.trim() || !email.trim() || password.length < 8 || !roleId} style={[styles.primary, (busy || !name.trim() || !email.trim() || password.length < 8 || !roleId) && styles.disabled]} onPress={save}><Text style={styles.primaryText}>{busy ? "Guardando..." : "Registrar usuario"}</Text></Pressable></View>;
}

function EditUser({ user, roles, token, currentUserId, onSaved, setMessage }: { user: User; roles: Role[]; token: string; currentUserId: number; onSaved: () => Promise<void>; setMessage: (message: string) => void }) {
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
  return <View style={styles.card}><View style={styles.headingRow}><Text style={styles.title}>Editar {user.name}</Text>{user.id !== currentUserId && <Pressable style={styles.dangerButton} onPress={toggle}><Text style={styles.dangerText}>{user.active ? "Desactivar" : "Reactivar"}</Text></Pressable>}</View><View style={styles.inline}><TextInput style={[styles.input, styles.flex]} value={name} onChangeText={setName} placeholder="Nombre" /><TextInput style={[styles.input, styles.flex]} value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="Usuario" /></View><TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" placeholder="Correo" /><TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Nueva contraseña (vacío conserva la actual)" />{user.id !== currentUserId ? <RoleChoices roles={roles} selectedId={roleId} setSelectedId={setRoleId} /> : <Text style={styles.muted}>Por seguridad no puedes cambiar tu propio rol ni desactivar tu cuenta.</Text>}<Pressable disabled={busy || !name.trim() || !email.trim() || (password.length > 0 && password.length < 8) || !roleId} style={[styles.primary, busy && styles.disabled]} onPress={save}><Text style={styles.primaryText}>Guardar cambios</Text></Pressable></View>;
}

function RoleChoices({ roles, selectedId, setSelectedId }: { roles: Role[]; selectedId: number | null; setSelectedId: (id: number) => void }) {
  return <View style={styles.actions}>{roles.map((role) => <Pressable key={role.id} style={[styles.choice, selectedId === role.id && styles.choiceActive]} onPress={() => setSelectedId(role.id)}><Text>{role.name}</Text></Pressable>)}</View>;
}

function RolePermissions({ roles, permissions, token, onSaved, setMessage }: { roles: Role[]; permissions: Permission[]; token: string; onSaved: () => Promise<void>; setMessage: (message: string) => void }) {
  const configurableRoles = roles.filter((role) => role.slug !== "administrador");
  const [roleId, setRoleId] = useState<number | null>(null); const [selectedIds, setSelectedIds] = useState<number[]>([]); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!roleId && configurableRoles[0]) setRoleId(configurableRoles[0].id); }, [roles, roleId]);
  useEffect(() => { const role = roles.find((item) => item.id === roleId); setSelectedIds(role?.permissions.map((permission) => permission.id) ?? []); }, [roleId, roles]);
  function toggle(id: number) { setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]); }
  async function save() {
    if (!roleId) return; setBusy(true); setMessage("");
    try { await api(`/roles/${roleId}`, token, { method: "PUT", body: JSON.stringify({ permission_ids: selectedIds }) }); setMessage("Permisos del rol actualizados. Los usuarios verán el cambio al renovar su sesión."); await onSaved(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <View style={styles.card}><Text style={styles.title}>Permisos por rol</Text><Text style={styles.muted}>El administrador conserva acceso total. Configura aquí las capacidades operativas de los demás roles.</Text><RoleChoices roles={configurableRoles} selectedId={roleId} setSelectedId={setRoleId} /><View style={styles.permissionGrid}>{permissions.map((permission) => <Pressable key={permission.id} style={[styles.permission, selectedIds.includes(permission.id) && styles.permissionActive]} onPress={() => toggle(permission.id)}><Text style={styles.permissionName}>{permission.slug}</Text><Text style={styles.muted}>{permission.name}</Text></Pressable>)}</View><Pressable disabled={busy || !roleId} style={[styles.primary, busy && styles.disabled]} onPress={save}><Text style={styles.primaryText}>Guardar permisos</Text></Pressable></View>;
}

const styles = StyleSheet.create({
  container: { gap: 14 }, card: { backgroundColor: "#fffdfa", borderRadius: 16, gap: 12, padding: 18 }, loader: { margin: 40 }, title: { color: "#29231f", fontSize: 18, fontWeight: "900" }, muted: { color: "#796b61" }, notice: { backgroundColor: "#fff1cc", borderRadius: 10, color: "#5f4918", padding: 12 }, input: { backgroundColor: "white", borderColor: "#ddd1c5", borderRadius: 11, borderWidth: 1, minHeight: 50, paddingHorizontal: 14 }, inline: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, flex: { flex: 1, minWidth: 170 }, headingRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10 }, row: { alignItems: "center", borderTopColor: "#eee4da", borderTopWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between", paddingVertical: 12 }, selectedRow: { backgroundColor: "#fff1cc", borderRadius: 10, paddingHorizontal: 10 }, rowTitle: { color: "#29231f", fontWeight: "800" }, active: { color: "#287347", fontWeight: "900" }, inactive: { color: "#a82e20", fontWeight: "900" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, choice: { backgroundColor: "#eee4da", borderRadius: 9, padding: 11 }, choiceActive: { backgroundColor: "#f3b19f" }, primary: { alignItems: "center", backgroundColor: "#cf4b32", borderRadius: 11, justifyContent: "center", minHeight: 50, padding: 12 }, primaryText: { color: "white", fontWeight: "800" }, dangerButton: { borderColor: "#a82e20", borderRadius: 10, borderWidth: 1, padding: 10 }, dangerText: { color: "#a82e20", fontWeight: "800" }, disabled: { opacity: 0.45 }, permissionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, permission: { backgroundColor: "#f7f2e9", borderColor: "transparent", borderRadius: 10, borderWidth: 2, minWidth: 185, padding: 12 }, permissionActive: { backgroundColor: "#fff1cc", borderColor: "#cf4b32" }, permissionName: { color: "#29231f", fontWeight: "900" },
});
