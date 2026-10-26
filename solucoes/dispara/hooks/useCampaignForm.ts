/**
 * useCampaignForm - Hook com React Hook Form + Zod para o Wizard
 * 
 * Este hook fornece validação em tempo real para cada step do wizard
 */
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { 
  campaignStep1Schema, 
  campaignStep2Schema, 
  campaignStep3Schema,
  campaignFormSchema,
  CampaignStep1Form,
  CampaignStep2Form,
  CampaignStep3Form,
  CampaignForm,
} from '@/lib/validation/schemas';

/**
 * Hook para Step 1: Nome + Template
 */
export const useCampaignStep1Form = (defaultValues?: Partial<CampaignStep1Form>) => {
  return useForm<CampaignStep1Form>({
    resolver: zodResolver(campaignStep1Schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      name: '',
      templateId: '',
      ...defaultValues,
    },
  });
};

/**
 * Hook para Step 2: Destinatários
 */
export const useCampaignStep2Form = (defaultValues?: Partial<CampaignStep2Form>) => {
  return useForm<CampaignStep2Form>({
    resolver: zodResolver(campaignStep2Schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      recipientSource: undefined,
      selectedContactIds: [],
      ...defaultValues,
    },
  });
};

/**
 * Hook para Step 3: Agendamento
 */
export const useCampaignStep3Form = (defaultValues?: Partial<CampaignStep3Form>) => {
  return useForm<CampaignStep3Form>({
    resolver: zodResolver(campaignStep3Schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      scheduleMode: 'now',
      scheduledDate: '',
      scheduledTime: '',
      ...defaultValues,
    },
  });
};

/**
 * Hook para form completo (todos os steps)
 */
export const useCampaignFormComplete = (defaultValues?: Partial<CampaignForm>) => {
  const form = useForm<CampaignForm>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(campaignFormSchema) as any,
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      name: '',
      templateId: '',
      recipientSource: undefined,
      selectedContactIds: [],
      scheduleMode: 'now',
      scheduledDate: '',
      scheduledTime: '',
      ...defaultValues,
    },
  });

  /**
   * Valida apenas os campos do step atual
   */
  const validateStep = async (step: number): Promise<boolean> => {
    const fieldsToValidate = {
      1: ['name', 'templateId'] as const,
      2: ['recipientSource', 'selectedContactIds'] as const,
      3: ['scheduleMode', 'scheduledDate', 'scheduledTime'] as const,
    };

    const fields = fieldsToValidate[step as keyof typeof fieldsToValidate];
    if (!fields) return true;

    const result = await form.trigger(fields);
    return result;
  };

  return {
    form,
    validateStep,
  };
};

export default useCampaignFormComplete;
