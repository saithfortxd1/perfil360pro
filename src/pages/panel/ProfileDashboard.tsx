import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Award,
  BriefcaseBusiness,
  Check,
  CircleUserRound,
  ClipboardList,
  FileText,
  History,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { BrandMark } from '@/components/ui/BrandMark';
import { useAuth } from '@/contexts/AuthContext';
import { paths } from '@/routes/paths';
import { analyzeCvPdf } from '@/services/cvIngestionService';
import { profileService } from '@/services/profileService';
import { loadSimulationHistory, type SimulationHistoryItem } from '@/services/simulationHistory';
import type { ProfileDraft, SessionUser, UserRole } from '@/types/profile';

interface ProfileDashboardProps {
  user: SessionUser;
  role: UserRole;
  initialProfile: Partial<ProfileDraft>;
  onSignOut: () => Promise<boolean>;
}

const STARTER_SKILLS = ['React', 'Vite', 'Tailwind CSS', 'Firebase', 'Python', 'FastAPI', 'Gemini API'];

function makeDraft(user: SessionUser, profile: Partial<ProfileDraft>): ProfileDraft {
  return {
    fullName: profile.fullName || user.displayName || '',
    headline: profile.headline || '',
    bio: profile.bio || '',
    goal: profile.goal || '',
    skills: profile.skills ? [...profile.skills] : [],
    yearsOfExperience: profile.yearsOfExperience ?? 0,
  };
}

function roleName(role: UserRole): string {
  if (role === 'admin') return 'Administrador';
  if (role === 'recruiter') return 'Reclutador';
  return 'Candidato';
}

function Avatar({ user, size = 'size-12' }: { user: SessionUser; size?: string }) {
  const initials = (user.displayName || user.email || 'U')
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return user.photoURL ? (
    <img src={user.photoURL} alt="" className={`${size} rounded-full object-cover ring-2 ring-slate-700`} />
  ) : (
    <span className={`${size} flex items-center justify-center rounded-full bg-cyan-400/15 font-semibold text-cyan-200 ring-2 ring-slate-700`}>
      {initials}
    </span>
  );
}

function SectionHeading({ kicker, title, description }: { kicker: string; title: string; description?: string }) {
  return (
    <div className="mb-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">{kicker}</p>
      <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
      {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  readOnly?: boolean;
}) {
  const common = 'mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-500/70 focus:ring-2 focus:ring-cyan-500/10 read-only:cursor-not-allowed read-only:text-slate-500';
  return (
    <label className="block text-xs font-medium text-slate-300">
      {label}
      {multiline ? (
        <textarea
          rows={4}
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder={placeholder}
          className={`${common} resize-y`}
        />
      ) : (
        <input
          type="text"
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder={placeholder}
          className={common}
        />
      )}
    </label>
  );
}

export function ProfileDashboard({ user, role, initialProfile, onSignOut }: ProfileDashboardProps) {
  const { error: authError } = useAuth();
  const [draft, setDraft] = useState(() => makeDraft(user, initialProfile));
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzingCv, setAnalyzingCv] = useState(false);
  const [addingSkill, setAddingSkill] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [cvError, setCvError] = useState<string | null>(null);
  const [history, setHistory] = useState<SimulationHistoryItem[]>([]);
  const [selectedReport, setSelectedReport] = useState<SimulationHistoryItem | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProfile = useCallback(async () => {
    setLoadingProfile(true);
    setFormError(null);
    try {
      const result = await profileService.load(user.uid);
      if (!result.ok) {
        setFormError(result.error.message);
        return;
      }
      if (result.value) setDraft(makeDraft(user, result.value));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo cargar el perfil.');
    } finally {
      setLoadingProfile(false);
    }
  }, [user]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    setHistory(loadSimulationHistory(user.uid));
  }, [user.uid]);

  const analysis = useMemo(() => profileService.analyze(draft), [draft]);
  const completion = analysis.score.breakdown.completeness;
  const headline = draft.headline.trim() || 'Completa tu titular profesional';

  const updateField = <K extends keyof ProfileDraft>(field: K, value: ProfileDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const saveProfile = async () => {
    setSaving(true);
    setFormError(null);
    setMessage(null);
    try {
      const result = await profileService.save(user.uid, draft);
      if (!result.ok) {
        setFormError(result.error.message);
        return;
      }
      setDraft(makeDraft(user, result.value));
      setMessage('Perfil guardado correctamente.');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo guardar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  const addSkill = (value = addingSkill) => {
    const skill = value.trim().replace(/\s+/g, ' ');
    if (!skill || draft.skills.some((current) => current.toLowerCase() === skill.toLowerCase())) {
      setAddingSkill('');
      return;
    }
    if (draft.skills.length >= 20) {
      setFormError('Puedes guardar hasta 20 habilidades.');
      return;
    }
    updateField('skills', [...draft.skills, skill]);
    setAddingSkill('');
  };

  const handleCv = async (file?: File) => {
    if (!file) return;
    setAnalyzingCv(true);
    setCvError(null);
    setMessage(null);
    try {
      const extracted = await analyzeCvPdf(file);
      setDraft((current) => ({
        fullName: extracted.fullName || current.fullName,
        headline: extracted.headline || current.headline,
        bio: extracted.bio || current.bio,
        goal: extracted.goal || current.goal,
        skills: extracted.skills.length ? extracted.skills : current.skills,
        yearsOfExperience: extracted.yearsOfExperience || current.yearsOfExperience,
      }));
      setMessage('CV analizado. Revisa los campos y guarda los cambios para persistirlos.');
    } catch (error) {
      setCvError(error instanceof Error ? error.message : 'No se pudo analizar el CV.');
    } finally {
      setAnalyzingCv(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    const signedOut = await onSignOut();
    if (signedOut) {
      setSelectedReport(null);
      setDraft(makeDraft(user, {}));
      setHistory([]);
    }
    setSigningOut(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-[1600px]">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950 px-5 py-6 lg:flex">
          <Link to={paths.home} className="flex items-center gap-3">
            <BrandMark className="border-slate-700 bg-slate-900 text-cyan-300" />
            <span>
              <span className="block font-semibold text-white">Perfil 360 AI</span>
              <span className="block text-[11px] text-slate-500">Workspace profesional</span>
            </span>
          </Link>

          <p className="mb-3 mt-10 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Workspace</p>
          <nav className="space-y-1" aria-label="Navegación del panel">
            <a href="#perfil" className="flex items-center gap-3 rounded-xl bg-cyan-400/10 px-3 py-2.5 text-sm font-medium text-cyan-200">
              <LayoutDashboard className="size-4" /> Perfil
            </a>
            <a href="#historial" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-slate-900 hover:text-white">
              <History className="size-4" /> Historial de Simulaciones
            </a>
            <a href="#cargar-cv" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-slate-900 hover:text-white">
              <FileText className="size-4" /> Cargar CV
            </a>
            <Link to={paths.simulador} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-slate-900 hover:text-white">
              <Activity className="size-4" /> Simulador
            </Link>
          </nav>

          <div className="mt-auto border-t border-slate-800 pt-5">
            <div className="mb-4 flex items-center gap-3 px-2">
              <Avatar user={user} size="size-9" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-200">{draft.fullName || user.displayName || 'Usuario'}</span>
                <span className="block truncate text-xs text-slate-500">{roleName(role)}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-60"
            >
              {signingOut ? <LoaderCircle className="size-4 animate-spin" /> : <LogOut className="size-4" />}
              Cerrar Sesión
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
          <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
            <div>
              <Link to={paths.home} className="mb-3 inline-flex items-center gap-2 lg:hidden">
                <BrandMark size="sm" className="border-slate-700 bg-slate-900 text-cyan-300" />
                <span className="text-xs font-semibold text-slate-300">Perfil 360 AI</span>
              </Link>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Panel de usuario</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Tu perfil profesional</h1>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-2 pr-4">
              <Avatar user={user} />
              <span className="min-w-0">
                <span className="block max-w-48 truncate text-sm font-semibold text-white">{draft.fullName || user.displayName || 'Usuario'}</span>
                <span className="block text-xs text-slate-400">{roleName(role)}</span>
              </span>
              <span className="hidden items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 sm:inline-flex">
                <ShieldCheck className="size-3.5" /> {user.emailVerified ? 'Verificado' : 'Perfil Activo'}
              </span>
            </div>
          </header>

          <nav className="mb-6 flex gap-2 overflow-x-auto pb-1 lg:hidden" aria-label="Navegación del panel">
            <a href="#perfil" className="whitespace-nowrap rounded-lg bg-cyan-400/10 px-3 py-2 text-xs text-cyan-200">Perfil</a>
            <a href="#historial" className="whitespace-nowrap rounded-lg px-3 py-2 text-xs text-slate-400">Historial</a>
            <a href="#cargar-cv" className="whitespace-nowrap rounded-lg px-3 py-2 text-xs text-slate-400">Cargar CV</a>
            <Link to={paths.simulador} className="whitespace-nowrap rounded-lg px-3 py-2 text-xs text-slate-400">Simulador</Link>
            <button type="button" onClick={() => void handleSignOut()} className="whitespace-nowrap rounded-lg px-3 py-2 text-xs text-rose-300">Cerrar sesión</button>
          </nav>

          {(authError || formError || message) ? (
            <div
              role={formError || authError ? 'alert' : 'status'}
              className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
                formError || authError
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              }`}
            >
              {formError || authError || message}
              {formError ? (
                <button type="button" onClick={() => setFormError(null)} className="ml-3 underline">Cerrar</button>
              ) : null}
            </div>
          ) : null}

          <section id="perfil" className="mb-6 overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/50 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div className="flex min-w-0 items-center gap-4">
                <Avatar user={user} size="size-16 sm:size-20" />
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.15em] text-cyan-300">Perfil profesional</p>
                  <h2 className="mt-1 truncate text-2xl font-semibold text-white">{draft.fullName || user.displayName || 'Tu nombre'}</h2>
                  <p className="mt-1 max-w-2xl text-sm text-slate-300">{headline}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200"><Award className="size-5" /></span>
                <span><strong className="block text-xl text-white">{draft.skills.length}</strong><span className="text-xs text-slate-400">Habilidades</span></span>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200">
                <Check className="size-3.5" /> Perfil Activo
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-950/30 px-3 py-1.5 text-xs text-slate-300">
                <BriefcaseBusiness className="size-3.5" /> {draft.yearsOfExperience} años de experiencia
              </span>
            </div>
          </section>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(290px,0.85fr)]">
            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-800 bg-slate-900/65 p-5 sm:p-7">
                <SectionHeading kicker="Información personal" title="Datos de tu perfil" description="Mantén tu información profesional actualizada para personalizar las entrevistas." />
                {loadingProfile ? (
                  <div className="flex items-center gap-3 py-8 text-sm text-slate-400"><LoaderCircle className="size-4 animate-spin" /> Cargando perfil…</div>
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Nombre completo" value={draft.fullName} onChange={(value) => updateField('fullName', value)} placeholder="Nombre y apellidos" />
                      <Field label="Correo electrónico" value={user.email} readOnly />
                      <Field label="Título profesional" value={draft.headline} onChange={(value) => updateField('headline', value)} placeholder="Desarrollador Full Stack y Arquitecto de Soluciones Web" />
                      <Field label="Años de experiencia" value={String(draft.yearsOfExperience)} onChange={(value) => updateField('yearsOfExperience', Math.max(0, Math.min(60, Number.parseInt(value, 10) || 0)))} placeholder="0" />
                      <Field label="Biografía técnica" value={draft.bio} onChange={(value) => updateField('bio', value)} placeholder="Resume tu experiencia, fortalezas y logros..." multiline />
                      <Field label="Objetivo profesional" value={draft.goal} onChange={(value) => updateField('goal', value)} placeholder="¿Qué oportunidades buscas?" multiline />
                    </div>

                    <div className="mt-6 border-t border-slate-800 pt-5">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-white">Skills clave</h3>
                          <p className="mt-1 text-xs text-slate-500">Agrega habilidades y elimina las que ya no representen tu perfil.</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {draft.skills.map((skill) => (
                          <span key={skill} className="inline-flex items-center gap-1 rounded-full border border-cyan-400/20 bg-cyan-400/10 py-1 pl-3 pr-1.5 text-xs text-cyan-100">
                            {skill}
                            <button type="button" onClick={() => updateField('skills', draft.skills.filter((item) => item !== skill))} className="rounded-full p-1 text-cyan-200/60 hover:bg-rose-400/10 hover:text-rose-200" aria-label={`Eliminar ${skill}`}>
                              <X className="size-3" />
                            </button>
                          </span>
                        ))}
                        {draft.skills.length === 0 ? <p className="text-xs text-slate-500">Todavía no agregas habilidades.</p> : null}
                      </div>
                      <form
                        className="mt-3 flex gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          addSkill();
                        }}
                      >
                        <input value={addingSkill} onChange={(event) => setAddingSkill(event.target.value)} placeholder="Añadir una habilidad" className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/60" />
                        <button type="submit" className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-500/50 hover:text-cyan-200"><Plus className="size-4" /> Añadir</button>
                      </form>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {STARTER_SKILLS.filter((skill) => !draft.skills.some((current) => current.toLowerCase() === skill.toLowerCase())).map((skill) => (
                          <button key={skill} type="button" onClick={() => addSkill(skill)} className="rounded-full border border-slate-800 px-2.5 py-1 text-[11px] text-slate-500 transition hover:border-slate-600 hover:text-slate-300">
                            + {skill}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-5">
                      <p className="text-xs text-slate-500">Los cambios se guardan en tu perfil de Perfil 360.</p>
                      <button type="button" onClick={() => void saveProfile()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60">
                        {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
                        {saving ? 'Guardando…' : 'Guardar perfil'}
                      </button>
                    </div>
                  </>
                )}
              </section>

              <section id="cargar-cv" className="rounded-2xl border border-slate-800 bg-slate-900/65 p-5 sm:p-7">
                <SectionHeading kicker="Ingesta inteligente" title="Carga tu hoja de vida" description="Sube un PDF con texto seleccionable para extraer habilidades y experiencia." />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    void handleCv(event.dataTransfer.files[0]);
                  }}
                  disabled={analyzingCv}
                  className="flex min-h-40 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 px-5 py-7 text-center transition hover:border-cyan-500/60 hover:bg-cyan-500/[0.03] disabled:opacity-70"
                >
                  {analyzingCv ? <LoaderCircle className="size-8 animate-spin text-cyan-300" /> : <span className="flex size-12 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-200"><Upload className="size-5" /></span>}
                  <span className="mt-3 text-sm font-medium text-white">{analyzingCv ? 'IA analizando CV...' : 'Arrastra tu PDF aquí o haz clic para buscarlo'}</span>
                  <span className="mt-1 text-xs text-slate-500">PDF · Hasta 10 MB y 25 páginas</span>
                </button>
                <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => void handleCv(event.target.files?.[0])} />
                {cvError ? <p role="alert" className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{cvError}</p> : null}
                <p className="mt-3 text-[11px] leading-relaxed text-slate-500">El texto se procesa mediante el servicio Gemini autenticado. El resultado se carga como borrador para que lo revises; se guarda en Firestore al pulsar “Guardar perfil”. Los PDF escaneados requieren OCR previo.</p>
              </section>
            </div>

            <aside className="space-y-6">
              <section className="rounded-2xl border border-slate-800 bg-slate-900/65 p-5">
                <SectionHeading kicker="Análisis IA" title="Estado de tu perfil" description="Recomendaciones locales basadas en los campos completados." />
                <div className="flex items-center gap-4">
                  <div className="relative flex size-24 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(#67e8f9 ${completion}%, #1e293b ${completion}% 100%)` }}>
                    <div className="flex size-[76px] items-center justify-center rounded-full bg-slate-900 text-xl font-semibold text-white">{completion}%</div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{completion >= 80 ? 'Perfil sólido' : completion >= 45 ? 'Buen avance' : 'Puedes mejorar'}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">{analysis.recommendations[0] || 'Tu perfil está completo. Manténlo actualizado.'}</p>
                  </div>
                </div>
                <div className="mt-5 space-y-3 border-t border-slate-800 pt-4">
                  {analysis.recommendations.slice(0, 3).map((recommendation) => (
                    <p key={recommendation} className="flex gap-2 text-xs leading-relaxed text-slate-400"><Sparkles className="mt-0.5 size-3.5 shrink-0 text-cyan-300" />{recommendation}</p>
                  ))}
                  {analysis.recommendations.length === 0 ? <p className="text-xs text-slate-400">No hay recomendaciones pendientes.</p> : null}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-800 bg-slate-900/65 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Skills clave</p>
                    <h2 className="mt-1 text-lg font-semibold text-white">Tus fortalezas</h2>
                  </div>
                  <Target className="size-5 text-slate-500" />
                </div>
                {draft.skills.length ? (
                  <div className="flex flex-wrap gap-2">
                    {draft.skills.map((skill) => <span key={skill} className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200">{skill}</span>)}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Añade tus habilidades en el formulario del perfil.</p>
                )}
              </section>
            </aside>
          </div>

          <section id="historial" className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/65 p-5 sm:p-7">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Progreso</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Historial de Simulaciones</h2>
                <p className="mt-1 text-sm text-slate-400">Evaluaciones guardadas en este navegador para tu cuenta.</p>
              </div>
              <Link to={paths.simulador} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3.5 py-2 text-sm text-slate-200 transition hover:border-cyan-500/50 hover:text-cyan-200">
                Ir al simulador <ArrowRight className="size-4" />
              </Link>
            </div>

            {history.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {history.map((item) => (
                  <article key={item.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-white">{item.title}</h3>
                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">Completada</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(item.completedAt)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-cyan-200">{item.score}<span className="text-xs text-slate-500">/100</span></span>
                      <button type="button" onClick={() => setSelectedReport(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200">
                        <ClipboardList className="size-3.5" /> Ver Reporte 360°
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-800 px-5 py-9 text-center">
                <CircleUserRound className="mx-auto size-8 text-slate-600" />
                <p className="mt-3 text-sm font-medium text-slate-300">Aún no hay simulaciones evaluadas</p>
                <p className="mt-1 text-xs text-slate-500">Cuando completes una entrevista, su reporte aparecerá aquí.</p>
              </div>
            )}
          </section>

          <div className="mt-5 flex justify-end lg:hidden">
            <button type="button" onClick={() => void handleSignOut()} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-300"><LogOut className="size-4" /> Cerrar Sesión</button>
          </div>
        </main>
      </div>

      {selectedReport ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation" onClick={() => setSelectedReport(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="report-title" onClick={(event) => event.stopPropagation()} className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Reporte 360° · {selectedReport.score}/100</p>
                <h2 id="report-title" className="mt-1 text-xl font-semibold text-white">{selectedReport.title}</h2>
              </div>
              <button type="button" onClick={() => setSelectedReport(null)} aria-label="Cerrar reporte" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="size-4" /></button>
            </div>
            <p className="mt-5 text-sm leading-relaxed text-slate-300">{selectedReport.summary}</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div><h3 className="text-sm font-semibold text-emerald-200">Fortalezas</h3><ul className="mt-2 space-y-2 text-xs text-slate-400">{selectedReport.strengths.map((value) => <li key={value}>• {value}</li>)}</ul></div>
              <div><h3 className="text-sm font-semibold text-amber-200">Por mejorar</h3><ul className="mt-2 space-y-2 text-xs text-slate-400">{selectedReport.improvements.map((value) => <li key={value}>• {value}</li>)}</ul></div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
