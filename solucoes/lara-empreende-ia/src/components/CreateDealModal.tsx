import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, User, UserPlus, Phone, Mail, Building } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Button } from './Button';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '../lib/utils';
import { api } from '../services/api';
import {
  PipelineDeal,
  parseDateOnly,
  parseTagsInput,
  toDateOnly,
  updateDealDetails,
} from '../services/pipeline';
import { Contact, TeamMember } from '../types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Schema para contato existente
const existingContactSchema = z.object({
  contact_mode: z.literal('existing'),
  contact_id: z.string().min(1, { message: 'Selecione um contato' }),
  new_contact_name: z.string().optional(),
  new_contact_phone: z.string().optional(),
  new_contact_email: z.string().optional(),
  title: z.string()
    .trim()
    .min(3, { message: 'Título deve ter no mínimo 3 caracteres' })
    .max(100, { message: 'Título deve ter no máximo 100 caracteres' }),
  company: z.string()
    .trim()
    .max(100, { message: 'Empresa deve ter no máximo 100 caracteres' })
    .optional(),
  value: z.coerce.number()
    .min(0, { message: 'Valor deve ser positivo' })
    .max(999999999, { message: 'Valor muito alto' })
    .default(0),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  tags: z.string()
    .max(500, { message: 'Tags muito longas' })
    .optional(),
  due_date: z.date().optional(),
  owner_id: z.string().optional(),
});

// Schema para novo contato
const newContactSchema = z.object({
  contact_mode: z.literal('new'),
  contact_id: z.string().optional(),
  new_contact_name: z.string()
    .trim()
    .min(2, { message: 'Nome deve ter no mínimo 2 caracteres' })
    .max(100, { message: 'Nome deve ter no máximo 100 caracteres' }),
  new_contact_phone: z.string()
    .trim()
    .min(10, { message: 'Telefone inválido' })
    .max(20, { message: 'Telefone muito longo' })
    .regex(/^[\d\s\+\-\(\)]+$/, { message: 'Telefone deve conter apenas números' }),
  new_contact_email: z.string()
    .trim()
    .email({ message: 'Email inválido' })
    .optional()
    .or(z.literal('')),
  title: z.string()
    .trim()
    .min(3, { message: 'Título deve ter no mínimo 3 caracteres' })
    .max(100, { message: 'Título deve ter no máximo 100 caracteres' }),
  company: z.string()
    .trim()
    .max(100, { message: 'Empresa deve ter no máximo 100 caracteres' })
    .optional(),
  value: z.coerce.number()
    .min(0, { message: 'Valor deve ser positivo' })
    .max(999999999, { message: 'Valor muito alto' })
    .default(0),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  tags: z.string()
    .max(500, { message: 'Tags muito longas' })
    .optional(),
  due_date: z.date().optional(),
  owner_id: z.string().optional(),
});

const dealFormSchema = z.discriminatedUnion('contact_mode', [
  existingContactSchema,
  newContactSchema,
]);

type DealFormValues = z.infer<typeof dealFormSchema>;

interface CreateDealModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDealCreated: () => void;
}

export const CreateDealModal: React.FC<CreateDealModalProps> = ({
  open,
  onOpenChange,
  onDealCreated,
}) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contactMode, setContactMode] = useState<'existing' | 'new'>('existing');

  const form = useForm<DealFormValues>({
    resolver: zodResolver(dealFormSchema),
    defaultValues: {
      contact_mode: 'existing',
      title: '',
      company: '',
      value: 0,
      priority: 'medium',
      tags: '',
      new_contact_name: '',
      new_contact_phone: '',
      new_contact_email: '',
    },
  });

  useEffect(() => {
    if (open) {
      const loadData = async () => {
        try {
          const [contactsData, teamData] = await Promise.all([
            api.fetchContacts(),
            api.fetchTeam(),
          ]);
          setContacts(contactsData);
          setTeamMembers(teamData);
        } catch (error) {
          console.error('Error loading data:', error);
        }
      };
      loadData();
    }
  }, [open]);

  const handleTabChange = (value: string) => {
    const mode = value as 'existing' | 'new';
    setContactMode(mode);
    form.setValue('contact_mode', mode);
  };

  const onSubmit = async (data: DealFormValues) => {
    setIsSubmitting(true);
    try {
      let contactId = data.contact_mode === 'existing' ? data.contact_id : '';

      // Se for novo contato, criar primeiro
      if (data.contact_mode === 'new') {
        // Verificar se telefone já existe
        const { data: existingContact } = await supabase
          .from('contacts')
          .select('id')
          .eq('phone_number', data.new_contact_phone)
          .maybeSingle();

        if (existingContact) {
          toast.error('Já existe um contato com este telefone');
          setIsSubmitting(false);
          return;
        }

        // Criar novo contato (o trigger NÃO será acionado porque inserimos is_blocked = false explicitamente)
        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            name: data.new_contact_name,
            phone_number: data.new_contact_phone,
            email: data.new_contact_email || null,
          })
          .select('id')
          .single();

        if (contactError || !newContact) {
          console.error('Error creating contact:', contactError);
          toast.error('Erro ao criar contato');
          setIsSubmitting(false);
          return;
        }

        contactId = newContact.id;
        toast.success('Contato criado com sucesso.');

        // Deletar deal criado automaticamente pelo trigger (se existir)
        await supabase
          .from('deals')
          .delete()
          .eq('contact_id', contactId);
      }

      // Parse tags
      const tagsArray = data.tags
        ? data.tags.split(',').map(t => t.trim()).filter(t => t.length > 0)
        : [];

      // Criar o deal
      await api.createDeal({
        contact_id: contactId,
        title: data.title,
        company: data.company,
        value: data.value,
        stage: 'new',
        priority: data.priority,
        tags: tagsArray,
        due_date: data.due_date ? format(data.due_date, 'yyyy-MM-dd') : undefined,
        owner_id: data.owner_id,
      });

      toast.success('Deal criado com sucesso.');
      form.reset();
      setContactMode('existing');
      onOpenChange(false);
      onDealCreated();
    } catch (error) {
      console.error('Error creating deal:', error);
      toast.error('Erro ao criar deal');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Criar novo deal
          </DialogTitle>
          <DialogDescription>
            Preencha as informações para criar uma nova oportunidade no pipeline.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Tabs para escolher entre contato existente ou novo */}
            <Tabs value={contactMode} onValueChange={handleTabChange} className="w-full">
              <TabsList className="grid w-full grid-cols-2 p-1">
                <TabsTrigger 
                  value="existing" 
                  className="flex items-center gap-2"
                >
                  <User className="w-4 h-4" />
                  Contato Existente
                </TabsTrigger>
                <TabsTrigger 
                  value="new"
                  className="flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Novo Contato
                </TabsTrigger>
              </TabsList>

              <TabsContent value="existing" className="mt-4 space-y-4">
                <FormField
                  control={form.control}
                  name="contact_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contato *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um contato" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {contacts.map((contact) => (
                            <SelectItem 
                              key={contact.id} 
                              value={contact.id}                            >
                              <div className="flex items-center gap-2">
                                <span>{contact.name || contact.phone || 'Sem nome'}</span>
                                {contact.phone && contact.name && (
                                  <span className="text-muted-foreground text-xs">({contact.phone})</span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Cliente ou lead associado a esta oportunidade
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="new" className="mt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="new_contact_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <User className="w-4 h-4 text-primary" />
                          Nome *
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Nome do contato"                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="new_contact_phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-primary" />
                          Telefone *
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="+55 11 99999-9999"                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Formato WhatsApp com código do país
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="new_contact_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-primary" />
                        Email (opcional)
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="email@exemplo.com"                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>
            </Tabs>

            {/* Campos do Deal */}
            <div className="border-t border-border pt-6 space-y-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Building className="w-5 h-5 text-primary" />
                Informações do deal
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Título *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ex: Venda Premium..."                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Empresa</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Nome da empresa"                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor (R$)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prioridade</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Baixa</SelectItem>
                          <SelectItem value="medium">Média</SelectItem>
                          <SelectItem value="high">Alta</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="due_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Data Prevista</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                'w-full pl-3 text-left font-normal',
                                !field.value && 'text-muted-foreground'
                              )}
                            >
                              {field.value ? (
                                format(field.value, 'dd/MM/yyyy')
                              ) : (
                                <span>Selecione uma data</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date < new Date()}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        Previsão de fechamento
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="owner_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Responsável</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {teamMembers.map((member) => (
                            <SelectItem 
                              key={member.id} 
                              value={member.id}                            >
                              {member.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ex: premium, urgente (separadas por vírgula)"                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Separe múltiplas tags com vírgula
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Criando...' : contactMode === 'new' ? 'Criar contato e deal' : 'Criar deal'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

/* ------------------------------------------------------------------ */
/* Edição de um deal existente                                         */
/* ------------------------------------------------------------------ */

const editDealSchema = z.object({
  title: z.string()
    .trim()
    .min(3, { message: 'Título deve ter no mínimo 3 caracteres' })
    .max(100, { message: 'Título deve ter no máximo 100 caracteres' }),
  company: z.string()
    .trim()
    .max(100, { message: 'Empresa deve ter no máximo 100 caracteres' })
    .optional(),
  value: z.coerce.number()
    .min(0, { message: 'Valor deve ser positivo' })
    .max(999999999, { message: 'Valor muito alto' })
    .default(0),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  tags: z.string()
    .max(500, { message: 'Tags muito longas' })
    .optional(),
  due_date: z.date().optional(),
  owner_id: z.string().optional(),
  notes: z.string()
    .max(2000, { message: 'Observações devem ter no máximo 2000 caracteres' })
    .optional(),
});

type EditDealFormValues = z.infer<typeof editDealSchema>;

const NO_OWNER = 'sem-responsavel';

interface EditDealModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: PipelineDeal | null;
  onDealUpdated: () => void;
}

export const EditDealModal: React.FC<EditDealModalProps> = ({
  open,
  onOpenChange,
  deal,
  onDealUpdated,
}) => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<EditDealFormValues>({
    resolver: zodResolver(editDealSchema),
    defaultValues: {
      title: '',
      company: '',
      value: 0,
      priority: 'medium',
      tags: '',
      notes: '',
      owner_id: NO_OWNER,
    },
  });

  useEffect(() => {
    if (!open) return;

    const loadTeam = async () => {
      try {
        const members = await api.fetchTeam();
        setTeamMembers(members.filter((member) => member.status !== 'disabled'));
      } catch (error) {
        console.error('Erro ao carregar responsáveis:', error);
      }
    };

    loadTeam();
  }, [open]);

  useEffect(() => {
    if (!open || !deal) return;

    form.reset({
      title: deal.title,
      company: deal.rawCompany || '',
      value: deal.value,
      priority: deal.priority,
      tags: (deal.tags || []).join(', '),
      due_date: parseDateOnly(deal.dueDate),
      owner_id: deal.ownerId || NO_OWNER,
      notes: deal.notes || '',
    });
  }, [open, deal?.id]);

  const onSubmit = async (data: EditDealFormValues) => {
    if (!deal) return;

    setIsSubmitting(true);
    try {
      await updateDealDetails(deal.id, {
        title: data.title,
        company: data.company?.trim() ? data.company.trim() : null,
        value: data.value,
        priority: data.priority,
        dueDate: toDateOnly(data.due_date),
        ownerId: data.owner_id && data.owner_id !== NO_OWNER ? data.owner_id : null,
        tags: parseTagsInput(data.tags),
        notes: data.notes?.trim() ? data.notes.trim() : null,
      });

      toast.success('Deal atualizado.');
      onOpenChange(false);
      onDealUpdated();
    } catch (error) {
      console.error('Erro ao atualizar deal:', error);
      toast.error('Não foi possível salvar o deal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar deal</DialogTitle>
          <DialogDescription>
            {deal?.contactName
              ? `Oportunidade de ${deal.contactName}. O contato e o histórico continuam os mesmos.`
              : 'Ajuste os dados da oportunidade. O contato e o histórico continuam os mesmos.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Título *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Implantação premium" {...field} />
                      </FormControl>
                      <FormDescription>
                        Use o que identifica a oportunidade, não o número do telefone.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Empresa</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome da empresa" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor (R$)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="0.00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prioridade</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Baixa</SelectItem>
                          <SelectItem value="medium">Média</SelectItem>
                          <SelectItem value="high">Alta</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="due_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Data prevista</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              type="button"
                              variant="outline"
                              className={cn(
                                'w-full pl-3 text-left font-normal',
                                !field.value && 'text-muted-foreground'
                              )}
                            >
                              {field.value ? (
                                format(field.value, 'dd/MM/yyyy')
                              ) : (
                                <span>Selecione uma data</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                      <div className="flex justify-start">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => field.onChange(undefined)}
                          disabled={!field.value}
                        >
                          Limpar data
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="owner_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Responsável</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || NO_OWNER}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NO_OWNER}>Sem responsável</SelectItem>
                          {teamMembers.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Quem responde por este lead na equipe.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: premium, urgente" {...field} />
                    </FormControl>
                    <FormDescription>
                      Separe múltiplas tags com vírgula. As tags alimentam o filtro do quadro.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={4}
                        className="resize-none"
                        placeholder="Contexto que o time precisa saber antes de falar com este lead."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Salvar deal'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
