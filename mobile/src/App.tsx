import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Redirect, Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  api,
  ApiError,
  Entry,
  Kind,
  Member,
  Patient,
  PatientAccess,
  Role,
  User,
} from "./api";
import { C, s } from "./styles";

const kinds: Kind[] = [
  "CONDITION",
  "ALLERGY",
  "MEDICATION",
  "VISIT",
  "APPOINTMENT",
  "COVERAGE",
  "NOTE",
];
const labels: Record<Kind, string> = {
  CONDITION: "โรคประจำตัว",
  ALLERGY: "การแพ้ยา",
  MEDICATION: "ยาและการรักษา",
  VISIT: "พบแพทย์",
  APPOINTMENT: "นัดหมาย",
  COVERAGE: "สิทธิ์รักษา",
  NOTE: "บันทึกทั่วไป",
};
const symbols: Record<Kind, string> = {
  CONDITION: "♡",
  ALLERGY: "!",
  MEDICATION: "+",
  VISIT: "✚",
  APPOINTMENT: "▦",
  COVERAGE: "◇",
  NOTE: "≡",
};
const roleLabel: Record<Role, string> = {
  OWNER: "เจ้าของ",
  EDITOR: "แก้ไขได้",
  VIEWER: "ดูได้อย่างเดียว",
};
const dateText = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "ยังไม่ระบุวันที่";
function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409)
      return "ข้อมูลเปลี่ยนไปหรือซ้ำกับข้อมูลเดิม กรุณารีเฟรชและตรวจข้อมูลก่อนบันทึกอีกครั้ง";
    if (error.status === 401)
      return "อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือเซสชันหมดอายุ";
    if (error.status === 403) return "บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้";
    if (error.status === 404) return "ไม่พบข้อมูล หรือสิทธิ์เข้าถึงถูกยกเลิก";
  }
  return error instanceof Error
    ? error.message
    : "ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง";
}
function Button({
  title,
  onPress,
  secondary,
  danger,
  disabled,
  testID,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        danger && s.danger,
        (pressed || disabled) && { opacity: 0.55 },
      ]}
    >
      <Text
        style={[
          s.buttonText,
          secondary && { color: C.teal },
          danger && { color: C.red },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}
function Field({
  label,
  value,
  onChange,
  placeholder,
  secure,
  multiline,
  testID,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  multiline?: boolean;
  testID?: string;
}) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        testID={testID}
        value={value}
        onChangeText={onChange}
        style={[
          s.input,
          multiline && { minHeight: 100, textAlignVertical: "top" },
        ]}
        placeholder={placeholder}
        placeholderTextColor="#90A4A6"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secure}
        multiline={multiline}
        maxLength={multiline ? 4000 : secure ? 72 : 254}
      />
    </View>
  );
}
function Chips<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: T[];
  value: T;
  onChange: (v: T) => void;
  label: (v: T) => string;
}) {
  return (
    <View style={s.chips}>
      {items.map((v) => (
        <Pressable
          key={v}
          accessibilityRole="button"
          accessibilityState={{ selected: v === value }}
          onPress={() => onChange(v)}
          style={[s.chip, v === value && s.chipActive]}
        >
          <Text
            style={[
              s.chipText,
              v === value && { color: C.teal, fontWeight: "700" },
            ]}
          >
            {label(v)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
function Brand({ light = false }: { light?: boolean }) {
  return (
    <View style={s.row}>
      <View style={[s.logo, light && { backgroundColor: "#FFFFFF25" }]}>
        <Text style={s.logoText}>+</Text>
      </View>
      <Text style={[s.brand, light && { color: C.white }]}>HealthKeep</Text>
    </View>
  );
}

function Auth({ onLogin }: { onLogin: (u: User) => void }) {
  const wide = useWindowDimensions().width >= 850;
  const [register, setRegister] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit() {
    if (!email.trim() || !password || (register && !name.trim())) {
      setError("กรุณากรอกข้อมูลให้ครบ");
      return;
    }
    if (register && password.length < 12) {
      setError("รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร");
      return;
    }
    setBusy(true);
    setError("");
    try {
      onLogin(
        await api.signIn(
          email.trim(),
          password,
          register ? name.trim() : undefined,
        ),
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[s.authShell, !wide && { flexDirection: "column" }]}>
            <View
              style={[
                s.authHero,
                wide ? { flex: 1 } : { minHeight: 250, padding: 24, flexShrink: 0 },
              ]}
            >
              <Brand light />
              <View
                style={{ gap: wide ? 18 : 10, marginVertical: wide ? 90 : 20 }}
              >
                <Text style={s.eyebrowLight}>PERSONAL HEALTH RECORD</Text>
                <Text
                  style={[
                    s.heroTitle,
                    !wide && { fontSize: 28, lineHeight: 36 },
                  ]}
                >
                  สุขภาพของคุณ{"\n"}เก็บไว้ใกล้ตัว
                </Text>
                {wide && (
                  <Text style={s.heroBody}>
                    รวมประวัติ นัดหมาย และสิทธิ์รักษา{"\n"}
                    ไว้ในพื้นที่เดียวที่คุณดูแลได้
                  </Text>
                )}
              </View>
              {wide && (
                <Text style={s.heroFoot}>PRIVATE BY DESIGN · CLOUD SYNC</Text>
              )}
            </View>
            <View style={s.authForm}>
              <View style={{ width: "100%", maxWidth: 390, gap: 20 }}>
                <Text style={s.eyebrow}>ยินดีต้อนรับสู่ HEALTHKEEP</Text>
                <Text style={s.title}>
                  {register ? "เริ่มดูแลข้อมูลสุขภาพ" : "กลับมาดูแลตัวเอง"}
                </Text>
                <Text style={s.subtle}>
                  {register
                    ? "สร้างบัญชีเพื่อทดลองใช้งานด้วยข้อมูลสมมติ"
                    : "เข้าสู่ระบบเพื่อเปิดสมุดสุขภาพของคุณ"}
                </Text>
                {register && (
                  <Field
                    label="ชื่อที่แสดง"
                    value={name}
                    onChange={setName}
                    testID="register-name"
                    placeholder="ผู้ใช้งานตัวอย่าง"
                  />
                )}
                <Field
                  label="อีเมล"
                  value={email}
                  onChange={setEmail}
                  testID="auth-email"
                  placeholder="demo@example.test"
                />
                <Field
                  label="รหัสผ่าน"
                  value={password}
                  onChange={setPassword}
                  testID="auth-password"
                  secure
                  placeholder={
                    register ? "อย่างน้อย 12 ตัวอักษร" : "รหัสผ่านของคุณ"
                  }
                />
                {!!error && (
                  <Text accessibilityRole="alert" style={s.error}>
                    {error}
                  </Text>
                )}
                <Button
                  title={
                    busy
                      ? "กำลังดำเนินการ…"
                      : register
                        ? "สร้างบัญชี"
                        : "เข้าสู่ระบบ"
                  }
                  onPress={submit}
                  disabled={busy}
                  testID="auth-submit"
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    setRegister(!register);
                    setError("");
                  }}
                >
                  <Text style={s.link}>
                    {register
                      ? "มีบัญชีแล้ว? เข้าสู่ระบบ"
                      : "ยังไม่มีบัญชี? สร้างบัญชีทดลอง"}
                  </Text>
                </Pressable>
                <View style={s.notice}>
                  <Text style={s.small}>
                    เวอร์ชันทดลองพัฒนา • ใช้ข้อมูลสมมติเท่านั้น{"\n"}
                    กรุณาอย่าใส่ข้อมูลผู้ป่วยจริง
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type Tab = "overview" | "records" | "appointments" | "coverage" | "access";
type Editor =
  | { type: "patient"; item?: Patient }
  | { type: "entry"; kind: Kind; item?: Entry };
type Cache = { cursor: number; entries: Map<string, Entry>; patient?: Patient };
function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const wide = useWindowDimensions().width >= 900;
  const [patients, setPatients] = useState<PatientAccess[]>([]),
    [selected, setSelected] = useState(""),
    [entries, setEntries] = useState<Entry[]>([]);
  const selectedRef = useRef("");
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const tab: Tab = (
    ["overview", "records", "appointments", "coverage", "access"].includes(
      section || "",
    )
      ? section
      : "overview"
  ) as Tab;
  const setTab = (value: Tab) => router.setParams({ section: value });
  const [filter, setFilter] = useState<Kind | "ALL">("ALL"),
    [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [lastSync, setLastSync] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [members, setMembers] = useState<Member[]>([]),
    [shareEmail, setShareEmail] = useState(""),
    [shareRole, setShareRole] = useState<Role>("VIEWER");
  const cache = useRef(new Map<string, Cache>()),
    syncing = useRef(false),
    alive = useRef(true),
    pendingRefresh = useRef(false);
  const refreshAgain = useRef<() => void>(() => {});
  const active = patients.find((p) => p.patient.id === selected),
    canWrite = !!active && active.role !== "VIEWER";
  useEffect(() => {
    alive.current = true;
    const localCache = cache.current;
    return () => {
      alive.current = false;
      localCache.clear();
    };
  }, []);
  const refresh = useCallback(async () => {
    if (syncing.current) {
      pendingRefresh.current = true;
      return;
    }
    syncing.current = true;
    let syncId = selectedRef.current;
    try {
      const list = await api.patients();
      if (!alive.current) return;
      setRefreshing(true);
      setNow(Date.now());
      const allowed = new Set(list.map((p) => p.patient.id));
      for (const id of cache.current.keys())
        if (!allowed.has(id)) cache.current.delete(id);
      setPatients(list);
      const id = allowed.has(selectedRef.current)
        ? selectedRef.current
        : list[0]?.patient.id || "";
      syncId = id;
      if (id !== selectedRef.current) {
        selectedRef.current = id;
        setSelected(id);
        setEntries([]);
        setMembers([]);
      }
      if (id) {
        const local: Cache = cache.current.get(id) || {
          cursor: 0,
          entries: new Map(),
        };
        let more = true;
        while (more) {
          const page = await api.sync(id, local.cursor);
          if (!alive.current) return;
          for (const event of page.events) {
            if (event.type.startsWith("record.")) {
              const entry = event.payload as Entry;
              if (entry.deletedAt) local.entries.delete(entry.id);
              else local.entries.set(entry.id, entry);
            } else if (event.type.startsWith("patient."))
              local.patient = event.payload as Patient;
          }
          local.cursor = page.cursor;
          more = page.hasMore;
        }
        cache.current.set(id, local);
        if (id === selectedRef.current) {
          setEntries(
            Array.from(local.entries.values()).sort((a, b) =>
              b.updatedAt.localeCompare(a.updatedAt),
            ),
          );
          if (local.patient)
            setPatients((items) =>
              items.map((p) =>
                p.patient.id === id ? { ...p, patient: local.patient! } : p,
              ),
            );
        }
      } else setEntries([]);
      setLastSync(
        new Date().toLocaleTimeString("th-TH", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      setError("");
    } catch (e) {
      if (alive.current) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 403)) {
          cache.current.delete(selectedRef.current);
          setEntries([]);
          setMembers([]);
          setPatients([]);
          setSelected("");
          selectedRef.current = "";
        }
        setError(message(e));
      }
    } finally {
      syncing.current = false;
      if (alive.current) {
        setRefreshing(false);
        setLoading(false);
        if (pendingRefresh.current || syncId !== selectedRef.current) {
          pendingRefresh.current = false;
          setTimeout(() => refreshAgain.current(), 0);
        }
      }
    }
  }, []);
  useEffect(() => {
    refreshAgain.current = () => void refresh();
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => void refresh(), 20000);
    const listener = AppState.addEventListener("change", (v) => {
      if (v === "active") void refresh();
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [refresh]);
  useEffect(() => {
    const initialSync = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(initialSync);
  }, [selected, refresh]);
  useEffect(() => {
    let cancelled = false;
    if (tab === "access" && active?.role === "OWNER")
      api
        .members(selected)
        .then((v) => {
          if (!cancelled) setMembers(v);
        })
        .catch((e) => {
          if (!cancelled) setError(message(e));
        });
    return () => {
      cancelled = true;
    };
  }, [tab, selected, active?.role]);
  function select(id: string) {
    selectedRef.current = id;
    setSelected(id);
    setEntries([]);
    setMembers([]);
    setTab("overview");
    setError("");
    setEditor(null);
  }
  async function demo() {
    setBusy(true);
    setError("");
    try {
      const result = await api.savePatient({
        displayName: "ผู้ป่วยสาธิต",
        birthDate: "2000-01-01",
        bloodGroup: "O+",
      });
      const id = result.patient.id;
      await api.saveEntry(id, {
        kind: "ALLERGY",
        title: "ยาตัวอย่าง A (สมมติ)",
        details: "ข้อมูลสาธิตสำหรับทดสอบการบันทึกเท่านั้น",
        provider: "",
        occurredAt: null,
      });
      await api.saveEntry(id, {
        kind: "APPOINTMENT",
        title: "นัดตรวจสุขภาพตัวอย่าง",
        details: "นัดสมมติ ไม่ใช่การนัดหมายจริง",
        provider: "โรงพยาบาลตัวอย่าง (สมมติ)",
        occurredAt: new Date(now + 7 * 86400000).toISOString(),
      });
      await api.saveEntry(id, {
        kind: "COVERAGE",
        title: "ประกันสุขภาพตัวอย่าง",
        details: "กรมธรรม์ DEMO-0000 • ข้อมูลสมมติ",
        provider: "โรงพยาบาลตัวอย่าง (สมมติ)",
        occurredAt: null,
      });
      select(id);
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    setBusy(true);
    try {
      await api.grant(selected, shareEmail.trim(), shareRole);
      setMembers(await api.members(selected));
      setShareEmail("");
      setError("");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const upcoming = entries
    .filter(
      (e) =>
        e.kind === "APPOINTMENT" &&
        e.occurredAt &&
        new Date(e.occurredAt).getTime() >= now,
    )
    .sort((a, b) => a.occurredAt!.localeCompare(b.occurredAt!));
  const shown =
    tab === "appointments"
      ? entries
          .filter((e) => e.kind === "APPOINTMENT")
          .sort((a, b) =>
            (a.occurredAt || "").localeCompare(b.occurredAt || ""),
          )
      : tab === "coverage"
        ? entries.filter((e) => e.kind === "COVERAGE")
        : entries.filter((e) => filter === "ALL" || e.kind === filter);
  const tabs: { key: Tab; label: string; symbol: string }[] = [
    { key: "overview", label: "ภาพรวม", symbol: "▦" },
    { key: "records", label: "ประวัติสุขภาพ", symbol: "≡" },
    { key: "appointments", label: "นัดหมาย", symbol: "◷" },
    { key: "coverage", label: "สิทธิ์รักษา", symbol: "◇" },
    { key: "access", label: "การเข้าถึง", symbol: "♧" },
  ];
  function card(e: Entry) {
    return (
      <Pressable
        key={e.id}
        accessibilityRole="button"
        accessibilityLabel={`เปิด ${e.title}`}
        onPress={() => setEditor({ type: "entry", kind: e.kind, item: e })}
        style={s.record}
      >
        <View
          style={[
            s.recordSymbol,
            e.kind === "ALLERGY" && { backgroundColor: "#FDEDEE" },
          ]}
        >
          <Text
            style={[
              s.recordSymbolText,
              e.kind === "ALLERGY" && { color: C.red },
            ]}
          >
            {symbols[e.kind]}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={s.recordKind}>{labels[e.kind]}</Text>
          <Text style={s.recordTitle}>{e.title}</Text>
          {!!e.provider && <Text style={s.subtle}>{e.provider}</Text>}
          <Text style={s.recordDetail} numberOfLines={2}>
            {e.details || "ไม่มีรายละเอียดเพิ่มเติม"}
          </Text>
          {e.occurredAt && (
            <Text style={s.small}>{dateText(e.occurredAt)}</Text>
          )}
        </View>
        <Text style={{ color: C.muted, fontSize: 24 }}>›</Text>
      </Pressable>
    );
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.topbar}>
        <Brand />
        <View style={s.row}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>
              {user.displayName.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          {wide && <Text style={s.label}>{user.displayName}</Text>}
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              try {
                await api.logout();
              } catch {
                /* Local tokens already cleared. */
              }
              onLogout();
            }}
          >
            <Text style={s.link}>ออกจากระบบ</Text>
          </Pressable>
        </View>
      </View>
      <View style={{ flex: 1, flexDirection: wide ? "row" : "column" }}>
        {wide && (
          <View style={s.sidebar}>
            <Text style={s.navCaption}>พื้นที่สุขภาพของคุณ</Text>
            {tabs.map((t) => (
              <Pressable
                key={t.key}
                accessibilityRole="button"
                onPress={() => setTab(t.key)}
                style={[s.nav, tab === t.key && s.navActive]}
              >
                <Text style={s.navSymbol}>{t.symbol}</Text>
                <Text style={[s.navText, tab === t.key && { color: C.teal }]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
            <View style={{ flex: 1 }} />
            <View style={s.sidebarNote}>
              <Text style={s.eyebrow}>DEVELOPMENT PREVIEW</Text>
              <Text style={s.small}>
                ใช้เฉพาะข้อมูลสมมติ{"\n"}เพื่อทดสอบระบบ
              </Text>
            </View>
          </View>
        )}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[s.content, !wide && { padding: 18 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          }
        >
          <View
            style={{
              width: "100%",
              maxWidth: 1100,
              alignSelf: "center",
              gap: 24,
            }}
          >
            <View style={s.between}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={s.eyebrow}>YOUR HEALTH, TOGETHER</Text>
                <Text style={s.title}>สมุดสุขภาพ</Text>
                <Text style={s.subtle}>
                  รายละเอียดเล็ก ๆ เพื่อการดูแลที่ต่อเนื่อง
                </Text>
              </View>
              <Pressable accessibilityRole="button" onPress={refresh}>
                <Text style={s.sync}>
                  {refreshing
                    ? "◌ กำลังซิงก์"
                    : lastSync
                      ? `↻ ซิงก์ ${lastSync}`
                      : "↻ รีเฟรช"}
                </Text>
              </Pressable>
            </View>
            {!!error && (
              <View style={s.errorBox}>
                <Text accessibilityRole="alert" style={s.error}>
                  {error}
                </Text>
                <Button title="ลองอีกครั้ง" secondary onPress={refresh} />
              </View>
            )}
            <View style={s.patientBar}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, alignItems: "center" }}
              >
                {patients.map((p) => (
                  <Pressable
                    key={p.patient.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: p.patient.id === selected }}
                    onPress={() => select(p.patient.id)}
                    style={[
                      s.patientChip,
                      p.patient.id === selected && s.patientChipActive,
                    ]}
                  >
                    <View style={s.patientDot}>
                      <Text style={{ color: C.teal, fontWeight: "700" }}>
                        {p.patient.displayName.slice(0, 1)}
                      </Text>
                    </View>
                    <Text style={s.label}>{p.patient.displayName}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Button
                title="+ เพิ่มผู้ป่วย"
                secondary
                onPress={() => setEditor({ type: "patient" })}
                testID="add-patient"
              />
            </View>
            {!wide && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {tabs.map((t) => (
                  <Pressable
                    key={t.key}
                    accessibilityRole="button"
                    onPress={() => setTab(t.key)}
                    style={[s.chip, tab === t.key && s.chipActive]}
                  >
                    <Text style={s.chipText}>{t.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {loading ? (
              <ActivityIndicator color={C.teal} size="large" />
            ) : !active ? (
              <View style={s.empty}>
                <View style={s.emptyIcon}>
                  <Text style={{ fontSize: 40, color: C.teal }}>+</Text>
                </View>
                <Text style={s.sectionTitle}>เริ่มต้นสมุดสุขภาพเล่มแรก</Text>
                <Text style={[s.subtle, { textAlign: "center" }]}>
                  เพิ่มโปรไฟล์ผู้ป่วย หรือสร้างข้อมูลสาธิต{"\n"}
                  เพื่อทดลองประวัติ นัดหมาย และสิทธิ์รักษา
                </Text>
                <Button
                  title={busy ? "กำลังสร้าง…" : "ลองด้วยข้อมูลสาธิต"}
                  onPress={demo}
                  disabled={busy}
                  testID="create-demo"
                />
              </View>
            ) : (
              <>
                {tab === "overview" ? (
                  <>
                    <View
                      style={[
                        s.patientHero,
                        !wide && {
                          flexDirection: "column",
                          alignItems: "stretch",
                        },
                      ]}
                    >
                      <View style={{ gap: 9, flex: 1 }}>
                        <Text style={s.eyebrow}>HEALTH PROFILE</Text>
                        <Text style={s.profileName}>
                          {active.patient.displayName}
                        </Text>
                        <Text style={s.subtle}>
                          {active.patient.birthDate
                            ? `เกิด ${active.patient.birthDate}`
                            : "ยังไม่ระบุวันเกิด"}{" "}
                          · {roleLabel[active.role]}
                        </Text>
                        {canWrite && (
                          <Pressable
                            accessibilityRole="button"
                            onPress={() =>
                              setEditor({
                                type: "patient",
                                item: active.patient,
                              })
                            }
                          >
                            <Text style={s.link}>แก้ไขโปรไฟล์ →</Text>
                          </Pressable>
                        )}
                      </View>
                      <View style={s.bloodCard}>
                        <Text style={s.small}>กรุ๊ปเลือด</Text>
                        <Text style={s.blood}>
                          {active.patient.bloodGroup === "UNKNOWN"
                            ? "—"
                            : active.patient.bloodGroup}
                        </Text>
                        <Text style={s.small}>ข้อมูลที่ผู้ใช้บันทึก</Text>
                      </View>
                    </View>
                    <View style={s.stats}>
                      {[
                        {
                          title: "นัดหมายข้างหน้า",
                          count: upcoming.length,
                          symbol: "◷",
                          target: "appointments" as Tab,
                          kind: "ALL" as Kind | "ALL",
                        },
                        {
                          title: "โรคประจำตัว",
                          count: entries.filter((e) => e.kind === "CONDITION")
                            .length,
                          symbol: "♡",
                          target: "records" as Tab,
                          kind: "CONDITION" as Kind,
                        },
                        {
                          title: "รายการแพ้ยา",
                          count: entries.filter((e) => e.kind === "ALLERGY")
                            .length,
                          symbol: "!",
                          target: "records" as Tab,
                          kind: "ALLERGY" as Kind,
                        },
                      ].map((v) => (
                        <Pressable
                          key={v.title}
                          accessibilityRole="button"
                          onPress={() => {
                            setTab(v.target);
                            setFilter(v.kind);
                          }}
                          style={s.stat}
                        >
                          <Text style={s.statSymbol}>{v.symbol}</Text>
                          <Text style={s.statCount}>{v.count}</Text>
                          <Text style={s.small}>{v.title}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={s.between}>
                      <Text style={s.sectionTitle}>นัดหมายถัดไป</Text>
                      {canWrite && (
                        <Button
                          title="+ เพิ่มนัดหมาย"
                          secondary
                          onPress={() =>
                            setEditor({ type: "entry", kind: "APPOINTMENT" })
                          }
                        />
                      )}
                    </View>
                    {upcoming[0] ? (
                      card(upcoming[0])
                    ) : (
                      <View style={s.card}>
                        <Text style={s.subtle}>ยังไม่มีนัดหมายข้างหน้า</Text>
                      </View>
                    )}
                    <View style={s.between}>
                      <Text style={s.sectionTitle}>บันทึกล่าสุด</Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setTab("records");
                          setFilter("ALL");
                        }}
                      >
                        <Text style={s.link}>ดูทั้งหมด →</Text>
                      </Pressable>
                    </View>
                    <View style={s.recordList}>
                      {entries.slice(0, 3).map(card)}
                      {!entries.length && (
                        <Text style={[s.subtle, { padding: 24 }]}>
                          ยังไม่มีประวัติ เริ่มเพิ่มบันทึกแรกได้เลย
                        </Text>
                      )}
                    </View>
                  </>
                ) : tab === "access" ? (
                  <View style={s.card}>
                    <Text style={s.sectionTitle}>ผู้ที่เข้าถึงโปรไฟล์นี้</Text>
                    <Text style={s.subtle}>
                      สิทธิ์ของคุณ: {roleLabel[active.role]}
                    </Text>
                    {active.role === "OWNER" ? (
                      <>
                        <Text style={s.small}>
                          ให้สิทธิ์เฉพาะบัญชีที่สมัครแล้ว ผู้ดูอ่านได้
                          ผู้แก้ไขเพิ่มและแก้ประวัติได้
                        </Text>
                        {members.map((m) => (
                          <View key={m.userId} style={s.member}>
                            <View style={{ flex: 1, gap: 4 }}>
                              <Text style={s.label}>{m.displayName}</Text>
                              <Text style={s.small}>
                                {m.email} · {roleLabel[m.role]}
                              </Text>
                            </View>
                            {m.role !== "OWNER" && (
                              <Button
                                title="ถอนสิทธิ์"
                                danger
                                disabled={busy}
                                onPress={async () => {
                                  setBusy(true);
                                  try {
                                    await api.revoke(selected, m.userId);
                                    setMembers(await api.members(selected));
                                  } catch (e) {
                                    setError(message(e));
                                  } finally {
                                    setBusy(false);
                                  }
                                }}
                              />
                            )}
                          </View>
                        ))}
                        <Field
                          label="อีเมลบัญชีที่ต้องการแชร์"
                          value={shareEmail}
                          onChange={setShareEmail}
                          placeholder="caregiver@example.test"
                        />
                        <Chips
                          items={["VIEWER", "EDITOR"] as Role[]}
                          value={shareRole}
                          onChange={setShareRole}
                          label={(v) => roleLabel[v]}
                        />
                        <Button
                          title="บันทึกสิทธิ์"
                          onPress={share}
                          disabled={busy || !shareEmail.trim()}
                        />
                      </>
                    ) : (
                      <Text style={s.small}>
                        เจ้าของโปรไฟล์เป็นผู้จัดการสิทธิ์การเข้าถึง
                      </Text>
                    )}
                  </View>
                ) : (
                  <>
                    <View style={s.between}>
                      <Text style={s.sectionTitle}>
                        {tab === "appointments"
                          ? "นัดหมายทั้งหมด"
                          : tab === "coverage"
                            ? "สิทธิ์รักษาและโรงพยาบาล"
                            : "ประวัติสุขภาพ"}
                      </Text>
                      {canWrite && (
                        <Button
                          title="+ เพิ่มบันทึก"
                          onPress={() =>
                            setEditor({
                              type: "entry",
                              kind:
                                tab === "appointments"
                                  ? "APPOINTMENT"
                                  : tab === "coverage"
                                    ? "COVERAGE"
                                    : "NOTE",
                            })
                          }
                          testID="add-record"
                        />
                      )}
                    </View>
                    {tab === "records" && (
                      <Chips
                        items={["ALL", ...kinds]}
                        value={filter}
                        onChange={setFilter}
                        label={(v) => (v === "ALL" ? "ทั้งหมด" : labels[v])}
                      />
                    )}
                    <View style={s.recordList}>
                      {shown.map(card)}
                      {!shown.length && (
                        <View style={s.empty}>
                          <Text style={s.sectionTitle}>ยังไม่มีรายการ</Text>
                          <Text style={s.subtle}>
                            รายการที่เพิ่มจะซิงก์ไปยังบัญชีที่มีสิทธิ์เข้าถึง
                          </Text>
                        </View>
                      )}
                    </View>
                  </>
                )}
              </>
            )}
            <View style={s.footer}>
              <Text style={s.small}>
                HealthKeep · ข้อมูลสมมติสำหรับการพัฒนา
              </Text>
              <Text style={s.small}>Cloud Sync · รีเฟรชทุก 20 วินาที</Text>
            </View>
          </View>
        </ScrollView>
      </View>
      {editor && (
        <EditorModal
          key={`${editor.type}-${editor.item?.id || "new"}`}
          editor={editor}
          patient={active}
          canWrite={
            editor.type === "patient" ? !editor.item || canWrite : canWrite
          }
          onClose={() => setEditor(null)}
          onSaved={async (id) => {
            setEditor(null);
            if (id) select(id);
            await refresh();
          }}
        />
      )}
    </SafeAreaView>
  );
}

function EditorModal({
  editor,
  patient,
  canWrite,
  onClose,
  onSaved,
}: {
  editor: Editor;
  patient?: PatientAccess;
  canWrite: boolean;
  onClose: () => void;
  onSaved: (id?: string) => Promise<void>;
}) {
  const isPatient = editor.type === "patient",
    p = editor.type === "patient" ? editor.item : undefined,
    e = editor.type === "entry" ? editor.item : undefined;
  const [name, setName] = useState(p?.displayName || e?.title || ""),
    [birth, setBirth] = useState(p?.birthDate || ""),
    [blood, setBlood] = useState(p?.bloodGroup || "UNKNOWN");
  const [kind, setKind] = useState<Kind>(
      editor.type === "entry" ? editor.kind : "NOTE",
    ),
    [details, setDetails] = useState(e?.details || ""),
    [provider, setProvider] = useState(e?.provider || "");
  function localDate(value: string) {
    const d = new Date(value);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  const [date, setDate] = useState(
      e?.occurredAt ? localDate(e.occurredAt) : "",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  async function save() {
    setError("");
    if (!name.trim()) {
      setError("กรุณาระบุชื่อ");
      return;
    }
    if (
      isPatient &&
      birth &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(birth) ||
        Number.isNaN(Date.parse(birth)) ||
        new Date(birth).toISOString().slice(0, 10) !== birth ||
        birth > new Date().toISOString().slice(0, 10))
    ) {
      setError("วันเกิดต้องเป็น YYYY-MM-DD ที่ถูกต้อง และไม่อยู่ในอนาคต");
      return;
    }
    if (
      !isPatient &&
      ((kind === "APPOINTMENT" && !date) ||
        (date &&
          (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(date) ||
            Number.isNaN(new Date(date).getTime()) ||
            localDate(new Date(date).toISOString()) !== date)))
    ) {
      setError("ระบุวันเวลาเป็น YYYY-MM-DDTHH:mm เช่น 2026-12-01T09:30");
      return;
    }
    setBusy(true);
    try {
      if (isPatient) {
        const result = await api.savePatient(
          {
            displayName: name.trim(),
            birthDate: birth || null,
            bloodGroup: blood,
            ...(p ? { version: p.version } : {}),
          },
          p?.id,
        );
        await onSaved(result.patient.id);
      } else if (patient) {
        await api.saveEntry(
          patient.patient.id,
          {
            kind,
            title: name.trim(),
            details,
            provider,
            occurredAt: date ? new Date(date).toISOString() : null,
            ...(e ? { version: e.version } : {}),
          },
          e?.id,
        );
        await onSaved();
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (!e || !patient) return;
    setBusy(true);
    try {
      await api.deleteEntry(patient.patient.id, e);
      await onSaved();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <KeyboardAvoidingView
        style={s.modalShade}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={s.modal}>
          <View style={s.between}>
            <Text style={s.sectionTitle}>
              {isPatient
                ? p
                  ? "แก้ไขโปรไฟล์"
                  : "เพิ่มผู้ป่วย"
                : e
                  ? "รายละเอียดบันทึก"
                  : "เพิ่มบันทึกสุขภาพ"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ปิดหน้าต่าง"
              onPress={onClose}
              disabled={busy}
            >
              <Text style={s.close}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{ gap: 18, paddingVertical: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            <Field
              label={isPatient ? "ชื่อผู้ป่วย (ข้อมูลสมมติ)" : "ชื่อรายการ"}
              value={name}
              onChange={setName}
              testID="editor-title"
            />
            {isPatient ? (
              <>
                <Field
                  label="วันเกิด (YYYY-MM-DD)"
                  value={birth}
                  onChange={setBirth}
                  placeholder="2000-01-01"
                />
                <Text style={s.label}>กรุ๊ปเลือด</Text>
                <Chips
                  items={[
                    "UNKNOWN",
                    "A+",
                    "A-",
                    "B+",
                    "B-",
                    "AB+",
                    "AB-",
                    "O+",
                    "O-",
                  ]}
                  value={blood}
                  onChange={setBlood}
                  label={(v) => (v === "UNKNOWN" ? "ไม่ทราบ" : v)}
                />
              </>
            ) : (
              <>
                <Text style={s.label}>ประเภทบันทึก</Text>
                <Chips
                  items={kinds}
                  value={kind}
                  onChange={setKind}
                  label={(v) => labels[v]}
                />
                <Field
                  label="รายละเอียด"
                  value={details}
                  onChange={setDetails}
                  multiline
                  placeholder="บันทึกรายละเอียดด้วยข้อมูลสมมติ"
                />
                <Field
                  label={
                    kind === "COVERAGE"
                      ? "โรงพยาบาลในสิทธิ์ / เครือข่าย"
                      : "โรงพยาบาล / ผู้ให้บริการ"
                  }
                  value={provider}
                  onChange={setProvider}
                />
                <Field
                  label={
                    kind === "APPOINTMENT"
                      ? "วันเวลานัดหมาย (จำเป็น)"
                      : "วันเวลาที่เกี่ยวข้อง (ไม่บังคับ)"
                  }
                  value={date}
                  onChange={setDate}
                  placeholder="2026-12-01T09:30"
                />
                <Text style={s.small}>
                  YYYY-MM-DDTHH:mm · ใช้เขตเวลาของอุปกรณ์
                </Text>
              </>
            )}
            {!!error && (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            )}
            {!canWrite && (
              <Text style={s.small}>คุณมีสิทธิ์ดูข้อมูลอย่างเดียว</Text>
            )}
          </ScrollView>
          <View style={s.modalActions}>
            {e && canWrite && (
              <Button
                title={confirmDelete ? "ยืนยันลบรายการ" : "ลบรายการ"}
                danger
                onPress={remove}
                disabled={busy}
              />
            )}
            <View style={{ flex: 1 }} />
            <Button title="ปิด" secondary onPress={onClose} disabled={busy} />
            {canWrite && (
              <Button
                title={busy ? "กำลังบันทึก…" : "บันทึก"}
                onPress={save}
                disabled={busy}
                testID="editor-save"
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const SessionContext = createContext<{
  user: User | null;
  setUser: (u: User | null) => void;
}>({ user: null, setUser: () => {} });
export function SignInRoute() {
  const { user, setUser } = useContext(SessionContext);
  return user ? <Redirect href="/health" /> : <Auth onLogin={setUser} />;
}
export function HealthRoute() {
  const { user, setUser } = useContext(SessionContext);
  return user ? (
    <Dashboard key={user.id} user={user} onLogout={() => setUser(null)} />
  ) : (
    <Redirect href="/sign-in" />
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false);
  useEffect(() => {
    api.onSessionExpired(() => setUser(null));
    api
      .restore()
      .then(setUser)
      .finally(() => setReady(true));
    return () => api.onSessionExpired(() => {});
  }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {!ready ? (
        <View style={s.loading}>
          <ActivityIndicator size="large" color={C.teal} />
        </View>
      ) : (
        <SessionContext.Provider value={{ user, setUser }}>
          <Stack screenOptions={{ headerShown: false, animation: "none" }} />
        </SessionContext.Provider>
      )}
    </SafeAreaProvider>
  );
}
