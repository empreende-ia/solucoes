import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";

const DEFAULT_INDUSTRIES = [
  "Tecnologia", "SaaS", "Serviços", "E-commerce", "Indústria",
  "Consultoria", "Educação", "Saúde", "Financeiro", "Varejo",
  "Logística", "Agronegócio", "Imobiliário", "Jurídico", "Marketing",
];

export function useIndustries() {
  const { orgId } = useOrg();
  const [industries, setIndustries] = useState<string[]>(DEFAULT_INDUSTRIES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("organizations")
      .select("settings")
      .eq("id", orgId)
      .single()
      .then(({ data }) => {
        const settings = data?.settings as Record<string, unknown> | null;
        if (settings?.industries && Array.isArray(settings.industries) && settings.industries.length > 0) {
          setIndustries(settings.industries as string[]);
        }
        setLoading(false);
      });
  }, [orgId]);

  return { industries, loading };
}

export { DEFAULT_INDUSTRIES };
