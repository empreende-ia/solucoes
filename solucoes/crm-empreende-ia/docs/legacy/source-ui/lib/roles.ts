import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const ROLE_LABELS: Record<string, string> = {
  owner:    "Dono",
  admin:    "Administrador",
  director: "Diretor",
  manager:  "Gerente de Equipe",
  member:   "Profissional",
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner:    "Acesso total à organização",
  admin:    "Acesso total à organização",
  director: "Vê dados de todas as equipes da sua diretoria",
  manager:  "Vê dados dos profissionais da sua equipe",
  member:   "Vê apenas os próprios dados",
};

export type Scope = "org" | "directorate" | "team" | "own";

export const getVisibilityScope = (role?: string | null): Scope => {
  switch (role) {
    case "owner":
    case "admin":
      return "org";
    case "director":
      return "directorate";
    case "manager":
      return "team";
    default:
      return "own";
  }
};

export const canViewAllData    = (role: string) => ["owner", "admin"].includes(role);
export const canViewTeamData   = (role: string) => ["owner", "admin", "director", "manager"].includes(role);
export const canManagePacientes = (role: string) => ["owner", "admin", "director", "manager"].includes(role);
export const canAccessSettings = (role: string) => ["owner", "admin"].includes(role);
export const canViewReports    = (role: string) => ["owner", "admin", "director", "manager"].includes(role);
export const canManageTeam     = (role: string) => ["owner", "admin"].includes(role);
