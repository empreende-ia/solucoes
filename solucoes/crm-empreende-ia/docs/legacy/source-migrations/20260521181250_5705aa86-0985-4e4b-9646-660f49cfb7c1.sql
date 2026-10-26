-- Expande o enum app_role para incluir 'manager' (Líder de equipe no contexto imobiliário).
-- Roles resultantes: 'owner' | 'admin' | 'manager' | 'member'.
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'manager';
