import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export type Role = "OWNER" | "EDITOR" | "VIEWER";
export type Kind =
  | "CONDITION"
  | "ALLERGY"
  | "MEDICATION"
  | "VISIT"
  | "APPOINTMENT"
  | "COVERAGE"
  | "NOTE";
export type User = { id: string; email: string; displayName: string };
export type Patient = {
  id: string;
  displayName: string;
  birthDate: string | null;
  bloodGroup: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type PatientAccess = { patient: Patient; role: Role };
export type Entry = {
  id: string;
  patientId: string;
  kind: Kind;
  title: string;
  details: string;
  provider: string;
  occurredAt: string | null;
  version: number;
  deletedAt: string | null;
  updatedAt: string;
};
export type Member = {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
};
export type Sync = {
  cursor: number;
  hasMore: boolean;
  events: {
    seq: number;
    type: string;
    payload: Patient | Entry;
    createdAt: string;
  }[];
};
type Tokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
};
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "android" ? "http://10.0.2.2:8080" : "http://localhost:8080")
).replace(/\/$/, "");
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
let tokens: Tokens | null = null;
let epoch = 0;
let refreshing: Promise<void> | null = null;
let onExpired = () => {};
const storageKey = "healthkeep.refresh.v1";
// Browsers keep credentials in memory only; native uses Keychain/Keystore.
async function persist(value: string | null) {
  if (Platform.OS === "web") return;
  if (value)
    await SecureStore.setItemAsync(storageKey, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  else await SecureStore.deleteItemAsync(storageKey);
}
async function fetchJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_URL}/api/v1${path}`, {
      ...options,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        body.detail || `Request failed (${response.status})`,
      );
    }
    return response.status === 204 ? (undefined as T) : await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      0,
      "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจเครือข่ายและ API URL",
    );
  } finally {
    clearTimeout(timer);
  }
}
async function clear() {
  tokens = null;
  epoch++;
  try {
    await persist(null);
  } finally {
    onExpired();
  }
}
async function refresh() {
  const currentEpoch = epoch;
  const refreshToken =
    tokens?.refreshToken ||
    (Platform.OS !== "web" ? await SecureStore.getItemAsync(storageKey) : null);
  if (!refreshToken) {
    await clear();
    throw new ApiError(401, "กรุณาเข้าสู่ระบบอีกครั้ง");
  }
  try {
    const next = await fetchJson<Tokens>("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (currentEpoch !== epoch) throw new ApiError(401, "Session changed");
    await persist(next.refreshToken);
    tokens = next;
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 401 &&
      currentEpoch === epoch
    )
      await clear();
    throw error;
  }
}
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const currentEpoch = epoch;
  const send = () =>
    fetchJson<T>(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokens?.accessToken || ""}`,
        ...extraHeaders,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  let result: T;
  try {
    result = await send();
  } catch (error) {
    if (
      !(error instanceof ApiError) ||
      error.status !== 401 ||
      currentEpoch !== epoch
    )
      throw error;
    if (!refreshing)
      refreshing = refresh().finally(() => {
        refreshing = null;
      });
    await refreshing;
    if (currentEpoch !== epoch) throw new ApiError(401, "Session changed");
    result = await send();
  }
  if (currentEpoch !== epoch) throw new ApiError(401, "Session changed");
  return result;
}
export const api = {
  onSessionExpired(handler: () => void) {
    onExpired = handler;
  },
  async restore(): Promise<User | null> {
    if (Platform.OS === "web") return null;
    try {
      await refresh();
      return tokens?.user || null;
    } catch {
      return null;
    }
  },
  async signIn(email: string, password: string, displayName?: string) {
    const value = await fetchJson<Tokens>(
      displayName === undefined ? "/auth/login" : "/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(displayName === undefined ? {} : { displayName }),
        }),
      },
    );
    await persist(value.refreshToken);
    tokens = value;
    epoch++;
    return value.user;
  },
  async logout() {
    try {
      await request("/auth/logout", "POST");
    } finally {
      await clear();
    }
  },
  patients: () => request<PatientAccess[]>("/patients"),
  savePatient: (
    data: {
      displayName: string;
      birthDate: string | null;
      bloodGroup: string;
      version?: number;
    },
    id?: string,
  ) =>
    request<PatientAccess>(
      `/patients${id ? `/${id}` : ""}`,
      id ? "PUT" : "POST",
      data,
    ),
  sync: (id: string, cursor: number) =>
    request<Sync>(`/patients/${id}/sync?cursor=${cursor}`),
  saveEntry: (
    patient: string,
    data: {
      kind: Kind;
      title: string;
      details: string;
      provider: string;
      occurredAt: string | null;
      version?: number;
    },
    id?: string,
  ) =>
    request<Entry>(
      `/patients/${patient}/records${id ? `/${id}` : ""}`,
      id ? "PUT" : "POST",
      data,
    ),
  deleteEntry: (patient: string, entry: Entry) =>
    request<void>(
      `/patients/${patient}/records/${entry.id}`,
      "DELETE",
      undefined,
      { "If-Match": String(entry.version) },
    ),
  members: (patient: string) =>
    request<Member[]>(`/patients/${patient}/members`),
  grant: (patient: string, email: string, role: Role) =>
    request<void>(`/patients/${patient}/members`, "POST", { email, role }),
  revoke: (patient: string, user: string) =>
    request<void>(`/patients/${patient}/members/${user}`, "DELETE"),
};
