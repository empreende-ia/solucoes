
-- Custom types
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE public.contact_status AS ENUM ('lead', 'prospect', 'customer', 'churned');
CREATE TYPE public.deal_status AS ENUM ('open', 'won', 'lost');
CREATE TYPE public.activity_type AS ENUM ('call', 'email', 'meeting', 'note', 'task');

-- Organizations
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT DEFAULT 'free',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  title TEXT,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'member',
  UNIQUE(user_id, org_id)
);

-- Contacts
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  title TEXT,
  linkedin_url TEXT,
  avatar_url TEXT,
  status contact_status DEFAULT 'lead',
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Companies
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT,
  industry TEXT,
  size TEXT,
  revenue NUMERIC,
  website TEXT,
  linkedin_url TEXT,
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Pipelines
CREATE TABLE public.pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  currency TEXT DEFAULT 'BRL',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pipeline Stages
CREATE TABLE public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  win_probability NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Deals
CREATE TABLE public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  value NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  stage_id UUID REFERENCES public.pipeline_stages(id),
  contact_id UUID REFERENCES public.contacts(id),
  company_id UUID REFERENCES public.companies(id),
  owner_id UUID REFERENCES auth.users(id),
  close_date DATE,
  probability NUMERIC DEFAULT 0,
  status deal_status DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Activities
CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type activity_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  contact_id UUID REFERENCES public.contacts(id),
  deal_id UUID REFERENCES public.deals(id),
  company_id UUID REFERENCES public.companies(id),
  user_id UUID REFERENCES auth.users(id),
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tags
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  UNIQUE(org_id, name)
);

-- Junction tables
CREATE TABLE public.contact_tags (
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);

CREATE TABLE public.deal_tags (
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (deal_id, tag_id)
);

-- Invitations
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role app_role DEFAULT 'member',
  invited_by UUID REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Security definer functions
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT org_id FROM public.profiles WHERE id = _user_id $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _org_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND org_id = _org_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND org_id = _org_id) $$;

-- RLS Policies
CREATE POLICY "Users can view own org" ON public.organizations FOR SELECT USING (public.user_belongs_to_org(auth.uid(), id));
CREATE POLICY "Owners can update org" ON public.organizations FOR UPDATE USING (public.has_role(auth.uid(), id, 'owner'));
CREATE POLICY "Authenticated can create org" ON public.organizations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view profiles in own org" ON public.profiles FOR SELECT USING (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id) OR id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "Users can view roles in own org" ON public.user_roles FOR SELECT USING (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Owners can insert roles" ON public.user_roles FOR INSERT WITH CHECK (public.has_role(auth.uid(), org_id, 'owner'));
CREATE POLICY "Owners can update roles" ON public.user_roles FOR UPDATE USING (public.has_role(auth.uid(), org_id, 'owner'));
CREATE POLICY "Owners can delete roles" ON public.user_roles FOR DELETE USING (public.has_role(auth.uid(), org_id, 'owner'));

CREATE POLICY "Org members can view contacts" ON public.contacts FOR SELECT USING (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert contacts" ON public.contacts FOR INSERT WITH CHECK (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update contacts" ON public.contacts FOR UPDATE USING (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete contacts" ON public.contacts FOR DELETE USING (public.user_belongs_to_org(auth.uid(), org_id));

CREATE POLICY "Org members can view companies" ON public.companies FOR SELECT USING (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert companies" ON public.companies FOR INSERT WITH CHECK (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update companies" ON public.companies FOR UPDATE USING (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete companies" ON public.companies FOR DELETE USING (public.user_belongs_to_org(auth.uid(), org_id));

CREATE POLICY "Org members can view pipelines" ON public.pipelines FOR SELECT USING (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert pipelines" ON public.pipelines FOR INSERT WITH CHECK (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update pipelines" ON public.pipelines FOR UPDATE USING (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete pipelines" ON public.pipelines FOR DELETE USING (public.user_belongs_to_org(auth.uid(), org_id));

CREATE POLICY "Org members can view stages" ON public.pipeline_stages FOR SELECT USING (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert stages" ON public.pipeline_stages FOR INSERT WITH CHECK (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update stages" ON public.pipeline_stages FOR UPDATE USING (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete stages" ON public.pipeline_stages FOR DELETE USING (public.user_belongs_to_org(auth.uid(), org_id));

CREATE POLICY "Org members can view deals" ON public.deals FOR SELECT USING (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert deals" ON public.deals FOR INSERT WITH CHECK (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update deals" ON public.deals FOR UPDATE USING (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete deals" ON public.deals FOR DELETE USING (public.user_belongs_to_org(auth.uid(), org_id));

CREATE POLICY "Org members can view activities" ON public.activities FOR SELECT USING (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert activities" ON public.activities FOR INSERT WITH CHECK (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update activities" ON public.activities FOR UPDATE USING (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete activities" ON public.activities FOR DELETE USING (public.user_belongs_to_org(auth.uid(), org_id));

CREATE POLICY "Org members can view tags" ON public.tags FOR SELECT USING (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert tags" ON public.tags FOR INSERT WITH CHECK (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update tags" ON public.tags FOR UPDATE USING (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete tags" ON public.tags FOR DELETE USING (public.user_belongs_to_org(auth.uid(), org_id));

CREATE POLICY "Org members can view contact tags" ON public.contact_tags FOR SELECT USING (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_id AND public.user_belongs_to_org(auth.uid(), c.org_id)));
CREATE POLICY "Org members can insert contact tags" ON public.contact_tags FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_id AND public.user_belongs_to_org(auth.uid(), c.org_id)));
CREATE POLICY "Org members can delete contact tags" ON public.contact_tags FOR DELETE USING (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_id AND public.user_belongs_to_org(auth.uid(), c.org_id)));

CREATE POLICY "Org members can view deal tags" ON public.deal_tags FOR SELECT USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND public.user_belongs_to_org(auth.uid(), d.org_id)));
CREATE POLICY "Org members can insert deal tags" ON public.deal_tags FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND public.user_belongs_to_org(auth.uid(), d.org_id)));
CREATE POLICY "Org members can delete deal tags" ON public.deal_tags FOR DELETE USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND public.user_belongs_to_org(auth.uid(), d.org_id)));

CREATE POLICY "Org members can view invitations" ON public.invitations FOR SELECT USING (public.user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Admins can insert invitations" ON public.invitations FOR INSERT WITH CHECK (public.has_role(auth.uid(), org_id, 'owner') OR public.has_role(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins can delete invitations" ON public.invitations FOR DELETE USING (public.has_role(auth.uid(), org_id, 'owner') OR public.has_role(auth.uid(), org_id, 'admin'));

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, avatar_url)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_profiles_org_id ON public.profiles(org_id);
CREATE INDEX idx_contacts_org_id ON public.contacts(org_id);
CREATE INDEX idx_contacts_status ON public.contacts(status);
CREATE INDEX idx_contacts_owner_id ON public.contacts(owner_id);
CREATE INDEX idx_companies_org_id ON public.companies(org_id);
CREATE INDEX idx_deals_org_id ON public.deals(org_id);
CREATE INDEX idx_deals_stage_id ON public.deals(stage_id);
CREATE INDEX idx_deals_status ON public.deals(status);
CREATE INDEX idx_activities_org_id ON public.activities(org_id);
CREATE INDEX idx_activities_contact_id ON public.activities(contact_id);
CREATE INDEX idx_activities_deal_id ON public.activities(deal_id);
CREATE INDEX idx_pipeline_stages_pipeline_id ON public.pipeline_stages(pipeline_id);
